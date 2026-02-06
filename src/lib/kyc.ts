/**
 * KYC utilities for client-side authorization signing and certificate storage
 */

import { WalletClient, Utils } from '@bsv/sdk'

// localStorage key for certificate storage
const CERTIFICATE_STORAGE_KEY = 'kyc_certificate'

/**
 * KYC Certificate structure (matches server-side type)
 */
export interface KycCertificateFields {
  officialName: string
  validationMethod: string
  serialNumber: string
  sanctionsStatus: 'clear' | 'matched'
  issuedAt: string
  expiresAt: string
}

export interface KycCertificate {
  type: string
  subject: string
  certifier: string
  fields: KycCertificateFields
  revocationOutpoint: string | null
  signature?: string
}

/**
 * Save a certificate to localStorage
 */
export function saveCertificateToLocalStorage(certificate: KycCertificate): void {
  try {
    localStorage.setItem(CERTIFICATE_STORAGE_KEY, JSON.stringify(certificate))
    console.log('[KYC] Certificate saved to localStorage:', certificate.fields.serialNumber)
  } catch (error) {
    console.error('[KYC] Failed to save certificate to localStorage:', error)
    throw error
  }
}

/**
 * Load certificate from localStorage
 * Returns null if no certificate exists or if it's invalid
 */
export function loadCertificateFromLocalStorage(): KycCertificate | null {
  try {
    const stored = localStorage.getItem(CERTIFICATE_STORAGE_KEY)
    if (!stored) {
      return null
    }
    const certificate = JSON.parse(stored) as KycCertificate
    // Basic validation
    if (!certificate.fields?.serialNumber || !certificate.subject) {
      console.warn('[KYC] Invalid certificate in localStorage, clearing')
      clearCertificateFromLocalStorage()
      return null
    }
    return certificate
  } catch (error) {
    console.error('[KYC] Failed to load certificate from localStorage:', error)
    return null
  }
}

/**
 * Clear certificate from localStorage
 */
export function clearCertificateFromLocalStorage(): void {
  localStorage.removeItem(CERTIFICATE_STORAGE_KEY)
  console.log('[KYC] Certificate cleared from localStorage')
}

/**
 * Check if a certificate is expired (client-side check)
 */
export function isCertificateExpiredClient(certificate: KycCertificate): boolean {
  const expiresAt = new Date(certificate.fields.expiresAt)
  return new Date() > expiresAt
}

export interface KycAuthorizationMessage {
  type: 'kyc-check-authorization'
  subject: string  // User's identityKey
  verifier: string  // Exchange's identityKey
  verifierName: string  // Exchange display name
  officialName: string  // User's declared name
  timestamp: number  // Unix timestamp
}

export interface SignedKycAuthorization {
  authorization: KycAuthorizationMessage
  signature: string
}

/**
 * Create and sign a KYC authorization message
 * @param officialName - The user's declared official name
 * @param verifierIdentityKey - The exchange's identity key
 * @param verifierName - The exchange's display name
 * @returns Signed authorization ready to send to TrustFlow
 */
export async function createSignedKycAuthorization(
  officialName: string,
  verifierIdentityKey: string,
  verifierName: string
): Promise<SignedKycAuthorization> {
  const wallet = new WalletClient()

  // Get the user's identity key
  const { publicKey: subjectIdentityKey } = await wallet.getPublicKey({
    identityKey: true,
  })

  // Create the authorization message
  const authorization: KycAuthorizationMessage = {
    type: 'kyc-check-authorization',
    subject: subjectIdentityKey,
    verifier: verifierIdentityKey,
    verifierName,
    officialName,
    timestamp: Math.floor(Date.now() / 1000),
  }

  // Sign the authorization message
  const messageToSign = JSON.stringify(authorization)
  const messageBytes = Utils.toArray(messageToSign, 'utf8')

  const signResult = await wallet.createSignature({
    data: messageBytes,
    protocolID: [2, 'KYC Authorization'],
    keyID: 'KYC Authorization Signing',
  })

  // Convert signature to base64 string
  const signature = Utils.toBase64(signResult.signature)

  return {
    authorization,
    signature,
  }
}

/**
 * KYC status types for UI display
 */
export type KycStatus =
  | 'not_verified'
  | 'pending'
  | 'verified'
  | 'sanctioned'
  | 'expired'
  | 'revoked'
  | 'error'

/**
 * KYC status info for display
 */
export interface KycStatusInfo {
  status: KycStatus
  message: string
  canDeposit: boolean
  certificate?: {
    officialName: string
    serialNumber: string
    issuedAt: string
    expiresAt: string
    sanctionsStatus: 'clear' | 'matched'
  }
}

/**
 * Get display info for a KYC status
 */
export function getKycStatusDisplay(status: KycStatus): {
  label: string
  color: string
  icon: string
} {
  switch (status) {
    case 'not_verified':
      return {
        label: 'Not Verified',
        color: 'text-yellow-600',
        icon: 'AlertTriangle',
      }
    case 'pending':
      return {
        label: 'Verification Pending',
        color: 'text-blue-600',
        icon: 'Loader2',
      }
    case 'verified':
      return {
        label: 'Verified',
        color: 'text-green-600',
        icon: 'CheckCircle',
      }
    case 'sanctioned':
      return {
        label: 'Sanctioned - Deposits Blocked',
        color: 'text-red-600',
        icon: 'XCircle',
      }
    case 'expired':
      return {
        label: 'Verification Expired',
        color: 'text-orange-600',
        icon: 'Clock',
      }
    case 'revoked':
      return {
        label: 'Verification Revoked',
        color: 'text-red-600',
        icon: 'Ban',
      }
    case 'error':
      return {
        label: 'Verification Error',
        color: 'text-red-600',
        icon: 'AlertCircle',
      }
    default:
      return {
        label: 'Unknown',
        color: 'text-gray-600',
        icon: 'HelpCircle',
      }
  }
}
