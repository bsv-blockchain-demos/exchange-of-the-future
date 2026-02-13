/**
 * KYC utilities for wallet-based certificate management
 * Certificates are stored in the user's wallet via WalletClient, not localStorage
 */

import { WalletClient, Utils } from '@bsv/sdk'
import type { WalletCertificate } from '@bsv/sdk'

export const KYC_CERTIFICATE_TYPE = Utils.toBase64(Utils.toArray('kyc-identity', 'utf8'))

/**
 * Retrieve a valid KYC certificate from the user's wallet
 * @param certifierPubKey - The trusted certifier's public key
 * @returns The certificate or null if none found
 */
export async function getCertificateFromWallet(
  certifierPubKey: string
): Promise<WalletCertificate | null> {
  try {
    const wallet = new WalletClient()
    const result = await wallet.listCertificates({
      certifiers: [certifierPubKey],
      types: [KYC_CERTIFICATE_TYPE],
      limit: 10,
    })

    if (!result.certificates || result.certificates.length === 0) {
      return null
    }

    // Return the most recent valid certificate
    return result.certificates[0]
  } catch (error) {
    console.error('[KYC] Failed to get certificate from wallet:', error)
    return null
  }
}

/**
 * Prove a certificate to the exchange (create a verifier keyring)
 * @param cert - The certificate to prove
 * @param exchangePubKey - The exchange's identity key (verifier)
 * @returns The certificate and keyring for the verifier
 */
export async function proveCertificateToExchange(
  cert: WalletCertificate,
  exchangePubKey: string
): Promise<{
  certificate: WalletCertificate
  keyringForVerifier: Record<string, string>
}> {
  const wallet = new WalletClient()
  const result = await wallet.proveCertificate({
    certificate: cert,
    fieldsToReveal: ['officialName'],
    verifier: exchangePubKey,
  })

  return {
    certificate: result.certificate || cert,
    keyringForVerifier: result.keyringForVerifier,
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
  certificate?: WalletCertificate
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
