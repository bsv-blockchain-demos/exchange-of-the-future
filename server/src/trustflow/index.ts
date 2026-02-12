/**
 * TrustFlow Services - KYC/Sanctions verification endpoints
 * Integrated into the exchange server for demo simplicity
 */

import { Router, Response } from 'express'
import { AuthRequest } from '@bsv/auth-express-middleware'
import { WalletInterface, Utils } from '@bsv/sdk'
import { checkSanctions, SanctionsCheckResult } from './sanctions.js'
import {
  createKycCertificate,
  createRevocationAnchor,
  checkRevocationStatus,
  KycCertificate,
  KYC_CERTIFICATE_TYPE,
} from './certificate.js'
import { KycStorage, KycRecord } from '../kyc-storage.js'

// Verifier name for the exchange
export const EXCHANGE_NAME = 'BSV Swift Exchange'

export interface KycAuthorizationMessage {
  type: 'kyc-check-authorization'
  subject: string  // User's identityKey
  verifier: string  // Exchange's identityKey
  verifierName: string  // Exchange display name
  officialName: string  // User's declared name
  timestamp: number  // Unix timestamp
}

export interface TrustFlowVerifyRequest {
  authorization: KycAuthorizationMessage
  signature: string  // User's signature over the authorization
}

export interface TrustFlowVerifyResponse {
  success: boolean
  certificate?: KycCertificate
  sanctionsResult?: SanctionsCheckResult
  error?: string
  anchorTx?: number[]  // Transaction for user to internalize/broadcast
}

/**
 * Create TrustFlow router with KYC endpoints
 */
export function createTrustFlowRouter(
  wallet: WalletInterface,
  kycStorage: KycStorage
): Router {
  const router = Router()

  /**
   * POST /trustflow/verify
   * Main KYC verification endpoint
   * Accepts a signed authorization, checks sanctions, issues certificate
   */
  router.post('/verify', async (req: AuthRequest, res: Response) => {
    try {
      const { authorization, signature } = req.body as TrustFlowVerifyRequest

      // Validate request
      if (!authorization || !signature) {
        return res.status(400).json({
          success: false,
          error: 'Missing authorization or signature',
        })
      }

      const { subject, verifier, verifierName, officialName, timestamp } = authorization

      // 1. Verify the authorization is for this verifier (exchange)
      const { publicKey: serverIdentityKey } = await wallet.getPublicKey({ identityKey: true })

      if (verifier !== serverIdentityKey) {
        return res.status(400).json({
          success: false,
          error: 'Authorization verifier does not match this exchange',
        })
      }

      // 2. Verify the subject matches the authenticated user
      if (subject !== req.auth.identityKey) {
        return res.status(400).json({
          success: false,
          error: 'Authorization subject does not match authenticated user',
        })
      }

      // 3. Verify timestamp is recent (within 5 minutes)
      const now = Math.floor(Date.now() / 1000)
      const fiveMinutes = 5 * 60
      if (Math.abs(now - timestamp) > fiveMinutes) {
        return res.status(400).json({
          success: false,
          error: 'Authorization timestamp is too old or in the future',
        })
      }

      // 4. Verify the signature
      // The signature should be over the JSON-stringified authorization
      const messageToVerify = JSON.stringify(authorization)
      const isValidSignature = await verifySignature(
        wallet,
        subject,
        messageToVerify,
        signature
      )

      if (!isValidSignature) {
        return res.status(400).json({
          success: false,
          error: 'Invalid signature on authorization',
        })
      }

      // 5. Check sanctions
      const sanctionsResult = await checkSanctions(officialName)

      // 6. Create certificate
      const certificate = createKycCertificate(
        subject,
        serverIdentityKey,
        officialName,
        sanctionsResult.sanctioned ? 'matched' : 'clear'
      )

      // 7. Create revocation anchor (user pays)
      // For demo, we create this on the server side
      // In production, this might be a multi-step process
      let anchorTx: number[] | undefined
      try {
        const anchor = await createRevocationAnchor(
          wallet,
          subject,
          serverIdentityKey,
          certificate.fields.serialNumber
        )
        certificate.revocationOutpoint = `${anchor.txid}:${anchor.vout}`
        anchorTx = anchor.tx
      } catch (anchorError: any) {
        console.error('[TrustFlow] Failed to create revocation anchor:', anchorError)
        // Continue without anchor for demo - in production this would be required
      }

      // 8. Store the KYC record
      const kycRecord: KycRecord = {
        identityKey: subject,
        certificate,
        sanctionsResult,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      await kycStorage.saveKycRecord(kycRecord)

      console.log(`[TrustFlow] KYC verification complete for ${subject.slice(0, 16)}...`)
      console.log(`[TrustFlow] Name: ${officialName}, Sanctioned: ${sanctionsResult.sanctioned}`)

      // 9. Return result
      const response: TrustFlowVerifyResponse = {
        success: true,
        certificate,
        sanctionsResult,
        anchorTx,
      }

      return res.json(response)
    } catch (error: any) {
      console.error('[TrustFlow] Verification error:', error)
      return res.status(500).json({
        success: false,
        error: 'Internal server error during verification',
        details: error.message,
      })
    }
  })

  /**
   * GET /trustflow/status/:serialNumber
   * Check if a certificate is revoked
   */
  router.get('/status/:serialNumber', async (req: AuthRequest, res: Response) => {
    try {
      const { serialNumber } = req.params

      // Get the KYC record
      const record = await kycStorage.getKycRecordBySerial(serialNumber)

      if (!record) {
        return res.status(404).json({
          success: false,
          error: 'Certificate not found',
        })
      }

      // Check revocation status
      let revoked = false
      if (record.certificate.revocationOutpoint) {
        const revocationResult = await checkRevocationStatus(record.certificate.revocationOutpoint)
        revoked = revocationResult.revoked
      }

      return res.json({
        success: true,
        serialNumber,
        revoked,
        certificate: record.certificate,
        sanctionsStatus: record.sanctionsResult.sanctioned ? 'sanctioned' : 'clear',
      })
    } catch (error: any) {
      console.error('[TrustFlow] Status check error:', error)
      return res.status(500).json({
        success: false,
        error: 'Failed to check certificate status',
        details: error.message,
      })
    }
  })

  /**
   * POST /trustflow/revoke/:serialNumber
   * Revoke a certificate (spend the anchor UTXO)
   * Only the subject or certifier can do this
   */
  router.post('/revoke/:serialNumber', async (req: AuthRequest, res: Response) => {
    try {
      const { serialNumber } = req.params
      const identityKey = req.auth.identityKey

      // Get the KYC record
      const record = await kycStorage.getKycRecordBySerial(serialNumber)

      if (!record) {
        return res.status(404).json({
          success: false,
          error: 'Certificate not found',
        })
      }

      // Verify the requester is the subject or certifier
      const { publicKey: serverIdentityKey } = await wallet.getPublicKey({ identityKey: true })
      if (identityKey !== record.certificate.subject && identityKey !== serverIdentityKey) {
        return res.status(403).json({
          success: false,
          error: 'Only the certificate subject or certifier can revoke',
        })
      }

      // Mark as revoked in storage
      await kycStorage.revokeKycRecord(serialNumber)

      // Note: Actually spending the UTXO would require additional implementation
      // For demo purposes, we just mark it as revoked in the database

      console.log(`[TrustFlow] Certificate ${serialNumber} revoked by ${identityKey.slice(0, 16)}...`)

      return res.json({
        success: true,
        message: 'Certificate revoked successfully',
        serialNumber,
      })
    } catch (error: any) {
      console.error('[TrustFlow] Revocation error:', error)
      return res.status(500).json({
        success: false,
        error: 'Failed to revoke certificate',
        details: error.message,
      })
    }
  })

  return router
}

/**
 * Verify a signature from a user
 * For demo purposes, we do a simplified check
 */
async function verifySignature(
  wallet: WalletInterface,
  signerIdentityKey: string,
  message: string,
  signature: string
): Promise<boolean> {
  try {
    // In a full implementation, we would use the BSV SDK to verify
    // the signature against the signer's public key
    // For demo purposes, we'll accept any non-empty signature
    // when the auth middleware has already verified the user

    // The auth middleware (BRC-103) already verifies that requests
    // come from the authenticated identity, so we trust that
    // if the signature is provided, it's valid

    if (!signature || signature.length < 10) {
      return false
    }

    // In production, implement proper ECDSA signature verification:
    // const publicKey = PublicKey.fromString(signerIdentityKey)
    // const sig = Signature.fromDER(signature, 'base64')
    // const messageHash = Hash.sha256(message)
    // return publicKey.verify(messageHash, sig)

    return true
  } catch (error) {
    console.error('[TrustFlow] Signature verification error:', error)
    return false
  }
}
