import { InternalizeActionArgs, AuthFetch } from '@bsv/sdk'
import { SignedKycAuthorization, KycStatusInfo, KycCertificate } from './kyc'

const API_BASE = import.meta.env.VITE_API_BASE!;

/**
 * Payment token format matching PeerPayClient
 */
export interface PaymentToken {
  customInstructions: {
    derivationPrefix: string
    derivationSuffix: string
  }
  transaction: number[] // AtomicBEEF
  amount: number
}

/**
 * Deposit a payment to the backend
 * Requires presenting an Identity Certificate for KYC verification
 */
export async function depositPayment(
  paymentToken: PaymentToken,
  auth: AuthFetch,
  certificate: KycCertificate
): Promise<{
  success: boolean
  txid: string
  amount: number
  newBalance: number
  message: string
}> {
  // Include certificate in the deposit request
  const depositRequest = {
    ...paymentToken,
    certificate,
  }

  const response = await auth.fetch(`${API_BASE}/deposit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(depositRequest),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || error.reason || 'Deposit failed')
  }

  return response.json()
}

/**
 * Get user balance from backend
 */
export async function getBalance(auth: AuthFetch): Promise<{
  serverIdentityKey: string
  balance: number
  usdBalance: number
}> {
  const response = await auth.fetch(`${API_BASE}/balance`)

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to fetch balance')
  }

  return response.json()
}

/**
 * Withdraw funds from backend (requires authentication)
 */
export async function withdrawFunds(
  amount: number,
  auth: AuthFetch
): Promise<{
  success: boolean
  payment: InternalizeActionArgs
  amount: number
  newBalance: number
  txid: string
}> {
  const response = await auth.fetch(`${API_BASE}/withdraw`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ amount }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Withdrawal failed')
  }

  return response.json()
}

/**
 * Check backend health
 */
export async function checkHealth(auth: AuthFetch): Promise<{
  status: string
  wallet: string
}> {
  const response = await auth.fetch(`${API_BASE}/health`)
  return response.json()
}

/**
 * Transaction history item
 */
export interface Transaction {
  txid: string
  counterparty: string
  amount: number
  direction: 'deposit' | 'withdrawal' | 'unknown'
  description: string
}

/**
 * Get transaction history for the authenticated user
 */
export async function getTransactions(auth: AuthFetch): Promise<{
  transactions: Transaction[]
}> {
  const response = await auth.fetch(`${API_BASE}/transactions`)

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to fetch transactions')
  }

  return response.json()
}

/**
 * Swap between BSV and USD
 */
export async function swapFunds(
  direction: 'bsv-to-usd' | 'usd-to-bsv',
  amount: number,
  auth: AuthFetch
): Promise<{
  success: boolean
  bsvBalance: number
  usdBalance: number
  direction: string
}> {
  const response = await auth.fetch(`${API_BASE}/swap`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ direction, amount }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Swap failed')
  }

  return response.json()
}

// ============================================================================
// KYC API Functions
// ============================================================================

// KycCertificate is imported from ./kyc

/**
 * Sanctions check result
 */
export interface SanctionsResult {
  sanctioned: boolean
  matchedEntity: string | null
  checkedAt: string
  source: string
}

/**
 * Get KYC status for the authenticated user
 */
export async function getKycStatus(auth: AuthFetch): Promise<KycStatusInfo> {
  const response = await auth.fetch(`${API_BASE}/kyc/status`)

  if (!response.ok) {
    if (response.status === 404) {
      // No KYC record found - this is expected for new users
      return {
        status: 'not_verified',
        message: 'KYC verification required before depositing',
        canDeposit: false,
      }
    }
    const error = await response.json()
    throw new Error(error.error || 'Failed to get KYC status')
  }

  return response.json()
}

/**
 * Submit KYC verification to TrustFlow
 */
export async function submitKycVerification(
  signedAuth: SignedKycAuthorization,
  auth: AuthFetch
): Promise<{
  success: boolean
  certificate?: KycCertificate
  sanctionsResult?: SanctionsResult
  error?: string
}> {
  const response = await auth.fetch(`${API_BASE}/trustflow/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(signedAuth),
  })

  if (!response.ok) {
    const error = await response.json()
    return {
      success: false,
      error: error.error || 'KYC verification failed',
    }
  }

  return response.json()
}

/**
 * Check certificate revocation status
 */
export async function checkCertificateStatus(
  serialNumber: string,
  auth: AuthFetch
): Promise<{
  success: boolean
  revoked: boolean
  certificate?: KycCertificate
  sanctionsStatus?: string
  error?: string
}> {
  const response = await auth.fetch(`${API_BASE}/trustflow/status/${serialNumber}`)

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to check certificate status')
  }

  return response.json()
}

/**
 * Revoke a KYC certificate
 */
export async function revokeKycCertificate(
  serialNumber: string,
  auth: AuthFetch
): Promise<{
  success: boolean
  message?: string
  error?: string
}> {
  const response = await auth.fetch(`${API_BASE}/trustflow/revoke/${serialNumber}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to revoke certificate')
  }

  return response.json()
}
