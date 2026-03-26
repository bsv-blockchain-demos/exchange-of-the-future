import express, { Request, Response } from 'express'
import dotenv from 'dotenv'
import { createAuthMiddleware, AuthRequest } from '@bsv/auth-express-middleware'
import {
  WalletInterface,
  Utils,
  MasterCertificate,
} from '@bsv/sdk'
import { makeWallet } from './wallet.js'

dotenv.config({ path: '../.env' })

// Validate required startup configuration
const chainEnv = process.env.CHAIN || 'main'
if (chainEnv !== 'main' && chainEnv !== 'test') {
  throw new Error(`Invalid CHAIN value "${chainEnv}". Must be "main" or "test".`)
}
const chain: 'main' | 'test' = chainEnv

if (!process.env.STORAGE_URL) {
  throw new Error('Missing required environment variable: STORAGE_URL')
}
const storageURL: string = process.env.STORAGE_URL

if (!process.env.CERTIFIER_PRIVATE_KEY) {
  throw new Error('Missing required environment variable: CERTIFIER_PRIVATE_KEY')
}
const certifierPrivateKey: string = process.env.CERTIFIER_PRIVATE_KEY

const yenteUrl = process.env.YENTE_URL || 'http://localhost:8000'
const PORT = parseInt(process.env.CERTIFIER_PORT || '3001', 10)

const KYC_CERTIFICATE_TYPE = Utils.toBase64(Utils.toArray('kyc-identity', 'utf8'))
const MATCH_SCORE_THRESHOLD = 0.7

const app = express()

let _wallet: WalletInterface
let _certifierIdentityKey: string

// In-memory review cache: identityKey -> { approved, officialName, checkedAt }
const reviewCache = new Map<string, {
  approved: boolean
  officialName: string
  sanctionsResult: SanctionsCheckResult
  checkedAt: number
}>()

// Review cache TTL: 10 minutes
const REVIEW_TTL_MS = 10 * 60 * 1000

interface SanctionsCheckResult {
  sanctioned: boolean
  matchedEntity: string | null
  checkedAt: string
  source: string
  score?: number
}

// --- Sanctions check via yente ---

function buildMatchPayload(name: string): object {
  const parts = name.trim().split(/\s+/)
  const firstName = parts[0] || name
  const lastName = parts.length > 1 ? parts.slice(1).join(' ') : undefined

  const properties: Record<string, string[]> = {
    name: [name],
    firstName: [firstName],
  }
  if (lastName) {
    properties.lastName = [lastName]
  }

  return { schema: 'Person', properties }
}

const SANCTIONS_TIMEOUT_MS = 5000

async function checkSanctions(name: string): Promise<SanctionsCheckResult> {
  const payload = buildMatchPayload(name)
  console.log(`[Certifier] Sanctions check via ${yenteUrl}/match/default`)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), SANCTIONS_TIMEOUT_MS)

  try {
    const body = { queries: { q1: payload } }
    const response = await fetch(`${yenteUrl}/match/default`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    clearTimeout(timer)

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`yente API returned ${response.status}: ${text}`)
    }

    const data = await response.json() as {
      responses: Record<string, {
        results: Array<{ id: string; caption: string; score: number }>
      }>
    }

    const topMatch = data.responses?.q1?.results?.[0]
    const sanctioned = !!topMatch && topMatch.score >= MATCH_SCORE_THRESHOLD

    return {
      sanctioned,
      matchedEntity: sanctioned ? topMatch.caption : null,
      checkedAt: new Date().toISOString(),
      source: 'opensanctions-yente',
      score: topMatch?.score,
    }
  } catch (error: any) {
    clearTimeout(timer)
    const reason = error.name === 'AbortError'
      ? 'Yente request timed out'
      : error.message
    console.error(`[Certifier] Sanctions API error:`, reason)
    // Fail closed: do not treat API failure as "not sanctioned"
    throw new Error(`Sanctions screening unavailable: ${reason}`)
  }
}

// --- Server setup ---

// CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Headers', '*')
  res.header('Access-Control-Allow-Methods', '*')
  res.header('Access-Control-Expose-Headers', '*')
  res.header('Access-Control-Allow-Private-Network', 'true')
  if (req.method === 'OPTIONS') {
    res.sendStatus(200)
  } else {
    next()
  }
})
app.use(express.json({ limit: '10mb' }))

// Health check (unauthenticated)
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'CertifyMe Identity Services',
    certifierIdentityKey: _certifierIdentityKey,
  })
})

// Info endpoint (unauthenticated) - returns certifier's identity key
app.get('/api/info', (_req: Request, res: Response) => {
  res.json({
    identityKey: _certifierIdentityKey,
    name: 'CertifyMe Identity Services',
    certificateType: KYC_CERTIFICATE_TYPE,
  })
})

async function initializeWallet(): Promise<void> {
  console.log('[Certifier] Initializing wallet...')
  _wallet = await makeWallet(chain, storageURL, certifierPrivateKey)
  const { publicKey } = await _wallet.getPublicKey({ identityKey: true })
  _certifierIdentityKey = publicKey
  console.log(`[Certifier] Identity key: ${_certifierIdentityKey}`)

  // Auth middleware applied globally so it handles /.well-known/auth handshake.
  // Routes defined before this (health, info) are matched first and skip auth.
  const authMiddleware = createAuthMiddleware({
    wallet: _wallet,
    allowUnauthenticated: false,
  })
  app.use(authMiddleware)

  // --- Authenticated endpoints ---

  /**
   * POST /api/review
   * Runs sanctions check and caches the approval result.
   * Called by the certifier frontend during the visual review process.
   */
  app.post('/api/review', async (req: AuthRequest, res: Response) => {
    try {
      const { officialName } = req.body
      const identityKey = req.auth!.identityKey

      if (!officialName || typeof officialName !== 'string' || officialName.trim().length < 2) {
        return res.status(400).json({ error: 'Valid official name required' })
      }

      const name = officialName.trim()

      // Run sanctions check
      let sanctionsResult: SanctionsCheckResult
      try {
        sanctionsResult = await checkSanctions(name)
      } catch (sanctionsError: any) {
        console.error(`[Certifier] Sanctions screening unavailable for ${identityKey.slice(0, 16)}...`)
        return res.status(503).json({
          error: 'Sanctions screening unavailable',
          reason: sanctionsError.message,
        })
      }

      const approved = !sanctionsResult.sanctioned

      // Cache the result
      reviewCache.set(identityKey, {
        approved,
        officialName: name,
        sanctionsResult,
        checkedAt: Date.now(),
      })

      console.log(`[Certifier] Review for ${identityKey.slice(0, 16)}...: ${approved ? 'APPROVED' : 'REJECTED'}`)

      return res.json({
        approved,
        sanctionsResult,
        officialName: name,
      })
    } catch (error: any) {
      console.error('[Certifier] Review error:', error)
      return res.status(500).json({ error: 'Review failed', details: error.message })
    }
  })

  /**
   * POST /api/certify
   * Issues a signed certificate for a pre-approved identity.
   * Called by the certifier frontend after review is complete.
   */
  app.post('/api/certify', async (req: AuthRequest, res: Response) => {
    try {
      const identityKey = req.auth!.identityKey

      // Check for pre-approved review
      const review = reviewCache.get(identityKey)
      if (!review) {
        return res.status(400).json({ error: 'No review found. Please complete the review process first.' })
      }

      // Check review hasn't expired
      if (Date.now() - review.checkedAt > REVIEW_TTL_MS) {
        reviewCache.delete(identityKey)
        return res.status(400).json({ error: 'Review has expired. Please start over.' })
      }

      // Check if review was approved
      if (!review.approved) {
        return res.status(403).json({
          error: 'Certification denied due to sanctions match.',
          sanctionsResult: review.sanctionsResult,
        })
      }

      console.log(`[Certifier] Issuing certificate for ${identityKey.slice(0, 16)}...`)

      // Issue the certificate using MasterCertificate
      // In production, fund the certifier wallet and provide a real revocation anchor.
      // For demo, use a placeholder outpoint that passes format validation.
      const getRevocationOutpoint = async (_serial: string): Promise<string> => {
        return '0000000000000000000000000000000000000000000000000000000000000000.0'
      }

      const masterCert = await MasterCertificate.issueCertificateForSubject(
        _wallet as any, // WalletInterface is compatible with ProtoWallet
        identityKey,
        { officialName: review.officialName },
        KYC_CERTIFICATE_TYPE,
        getRevocationOutpoint,
      )

      // Clear the review from cache (one-time use)
      reviewCache.delete(identityKey)

      console.log(`[Certifier] Certificate issued: serial=${masterCert.serialNumber.slice(0, 16)}...`)

      return res.json({
        certificate: {
          type: masterCert.type,
          serialNumber: masterCert.serialNumber,
          subject: masterCert.subject,
          certifier: masterCert.certifier,
          revocationOutpoint: masterCert.revocationOutpoint,
          fields: masterCert.fields,
          signature: masterCert.signature,
        },
        masterKeyring: masterCert.masterKeyring,
      })
    } catch (error: any) {
      console.error('[Certifier] Certify error:', error)
      return res.status(500).json({ error: 'Certificate issuance failed', details: error.message })
    }
  })
}

// Start server
async function start() {
  await initializeWallet()

  app.listen(PORT, () => {
    console.log(`\n🏛️  CertifyMe Identity Services running on http://localhost:${PORT}`)
    console.log(`   Identity Key: ${_certifierIdentityKey}`)
    console.log(`\n   Endpoints:`)
    console.log(`   GET  /health       - Health check`)
    console.log(`   GET  /api/info     - Certifier info (public key, cert type)`)
    console.log(`   POST /api/review   - Submit name for sanctions review (authenticated)`)
    console.log(`   POST /api/certify  - Issue certificate (authenticated, requires review)\n`)
  })
}

process.on('SIGINT', () => {
  console.log('\n[Certifier] Shutting down...')
  process.exit(0)
})

start().catch(console.error)
