import { InternalizeActionArgs } from '@bsv/sdk'

const API_BASE = '/api'

/**
 * Payment token format matching PeerPayClient
 */
export interface PaymentToken {
  customInstructions: {
    derivationPrefix: string
    derivationSuffix: string
  }
  transaction: string // AtomicBEEF
  amount: number
}

/**
 * Deposit a payment to the backend
 */
export async function depositPayment(
  paymentToken: PaymentToken,
  senderIdentityKey: string
): Promise<{
  success: boolean
  txid: string
  amount: number
  newBalance: number
  message: string
}> {
  const response = await fetch(`${API_BASE}/deposit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...paymentToken,
      sender: senderIdentityKey,
    }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Deposit failed')
  }

  return response.json()
}

/**
 * Get user balance from backend
 */
export async function getBalance(identityKey: string): Promise<{
  identityKey: string
  balance: number
}> {
  const response = await fetch(`${API_BASE}/balance/${identityKey}`)

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
  authHeaders?: Record<string, string>
): Promise<{
  success: boolean
  payment: InternalizeActionArgs
  amount: number
  newBalance: number
  txid: string
}> {
  const response = await fetch(`${API_BASE}/withdraw/${amount}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
    },
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
export async function checkHealth(): Promise<{
  status: string
  wallet: string
}> {
  const response = await fetch(`${API_BASE}/health`)
  return response.json()
}
