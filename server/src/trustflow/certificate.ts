/**
 * Certificate creation and management for TrustFlow KYC service
 */

import { randomUUID } from 'crypto'
import { WalletInterface, Script, Transaction, Utils } from '@bsv/sdk'

export interface KycCertificateFields {
  officialName: string
  validationMethod: string
  serialNumber: string
  sanctionsStatus: 'clear' | 'matched'
  issuedAt: string
  expiresAt: string
}

export interface KycCertificate {
  type: string  // Base64 encoded 'kyc-identity'
  subject: string  // User's identityKey
  certifier: string  // TrustFlow's public key
  fields: KycCertificateFields
  revocationOutpoint: string | null  // txid:vout of anchor UTXO
  signature?: string
}

// Certificate type as base64
export const KYC_CERTIFICATE_TYPE = Buffer.from('kyc-identity').toString('base64')

// Certificate validity duration (24 hours in milliseconds)
export const CERTIFICATE_VALIDITY_MS = 24 * 60 * 60 * 1000

/**
 * Create a new KYC certificate
 */
export function createKycCertificate(
  subjectIdentityKey: string,
  certifierIdentityKey: string,
  officialName: string,
  sanctionsStatus: 'clear' | 'matched'
): KycCertificate {
  const now = new Date()
  const expiresAt = new Date(now.getTime() + CERTIFICATE_VALIDITY_MS)

  const certificate: KycCertificate = {
    type: KYC_CERTIFICATE_TYPE,
    subject: subjectIdentityKey,
    certifier: certifierIdentityKey,
    fields: {
      officialName,
      validationMethod: 'self_declared_sanctions_check',
      serialNumber: randomUUID(),
      sanctionsStatus,
      issuedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    },
    revocationOutpoint: null,
  }

  return certificate
}

/**
 * Check if a certificate is expired
 */
export function isCertificateExpired(certificate: KycCertificate): boolean {
  const expiresAt = new Date(certificate.fields.expiresAt)
  return new Date() > expiresAt
}

/**
 * Create a 1-of-2 multisig locking script for revocation anchor
 * Either the subject OR the certifier can spend this to revoke
 */
export function createRevocationLockingScript(
  subjectPubKey: string,
  certifierPubKey: string
): Script {
  // OP_1 <subjectPubKey> <certifierPubKey> OP_2 OP_CHECKMULTISIG
  // Convert hex public keys to byte arrays
  const subjectKeyBytes = Utils.toArray(subjectPubKey, 'hex')
  const certifierKeyBytes = Utils.toArray(certifierPubKey, 'hex')

  // Build 1-of-2 multisig script manually
  const script = new Script()
  script.writeOpCode(81) // OP_1
  script.writeBin(subjectKeyBytes)
  script.writeBin(certifierKeyBytes)
  script.writeOpCode(82) // OP_2
  script.writeOpCode(174) // OP_CHECKMULTISIG

  return script
}

/**
 * Create an OP_RETURN script with the certificate serial number
 * Format: OP_FALSE OP_RETURN "KYC:<serialNumber>"
 */
export function createSerialNumberOpReturn(serialNumber: string): Script {
  const data = `KYC:${serialNumber}`
  const dataBytes = Utils.toArray(data, 'utf8')

  const script = new Script()
  script.writeOpCode(0)   // OP_FALSE
  script.writeOpCode(106) // OP_RETURN
  script.writeBin(dataBytes)

  return script
}

/**
 * Create the revocation anchor transaction
 * This creates:
 * - Output 0: 1-sat locked with 1-of-2 multisig (revocation anchor)
 * - Output 1: OP_RETURN with "KYC:<serialNumber>" (on-chain commitment)
 * The user pays for this transaction
 */
export async function createRevocationAnchor(
  wallet: WalletInterface,
  subjectIdentityKey: string,
  certifierIdentityKey: string,
  serialNumber: string
): Promise<{ txid: string; vout: number; tx: number[] }> {
  // Create the 1-of-2 multisig locking script using provided keys
  const lockingScript = createRevocationLockingScript(subjectIdentityKey, certifierIdentityKey)

  // Create the OP_RETURN script with serial number
  const opReturnScript = createSerialNumberOpReturn(serialNumber)

  // Create the anchor transaction with both outputs
  const action = await wallet.createAction({
    description: `KYC Certificate Revocation Anchor - ${serialNumber}`,
    outputs: [
      {
        satoshis: 1,
        lockingScript: lockingScript.toHex(),
        outputDescription: `Revocation anchor for certificate ${serialNumber}`,
      },
      {
        satoshis: 0,
        lockingScript: opReturnScript.toHex(),
        outputDescription: `On-chain serial number commitment: KYC:${serialNumber}`,
      },
    ],
    labels: ['kyc-revocation-anchor', serialNumber],
    options: {
      randomizeOutputs: false,
    },
  })

  const transaction = Transaction.fromBEEF(action.tx)
  const txid = transaction.id('hex')

  console.log(`[TrustFlow] Created revocation anchor: ${txid}:0 for certificate ${serialNumber}`)

  return {
    txid,
    vout: 0,
    tx: Array.from(action.tx),
  }
}

/**
 * Check if a revocation anchor UTXO is still unspent (certificate not revoked)
 * Uses WhatsOnChain API
 */
export async function checkRevocationStatus(
  outpoint: string
): Promise<{ revoked: boolean; error?: string }> {
  if (!outpoint) {
    return { revoked: false, error: 'No revocation outpoint' }
  }

  const [txid, voutStr] = outpoint.split(':')
  const vout = parseInt(voutStr, 10)

  if (!txid || isNaN(vout)) {
    return { revoked: false, error: 'Invalid outpoint format' }
  }

  try {
    // Check if the UTXO is unspent using WhatsOnChain API (mainnet)
    const response = await fetch(
      `https://api.whatsonchain.com/v1/bsv/main/tx/${txid}/out/${vout}/spent`
    )

    if (!response.ok) {
      // If 404, the transaction might not be confirmed yet - treat as unspent
      if (response.status === 404) {
        console.log(`[TrustFlow] Revocation anchor ${outpoint} not found (may be unconfirmed)`)
        return { revoked: false }
      }
      throw new Error(`WhatsOnChain API error: ${response.status}`)
    }

    const spentInfo = await response.json() as { txid?: string } | null

    // If spentInfo is null or empty, the UTXO is unspent
    const isSpent = !!(spentInfo && spentInfo.txid)

    console.log(`[TrustFlow] Revocation check for ${outpoint}: ${isSpent ? 'REVOKED' : 'VALID'}`)

    return { revoked: isSpent }
  } catch (error: any) {
    console.error(`[TrustFlow] Error checking revocation status:`, error)
    // On error, assume not revoked to avoid false positives
    return { revoked: false, error: error.message }
  }
}
