import { InternalizeActionArgs, AuthFetch } from '@bsv/sdk'

const API_BASE = process.env.REACT_APP_API_BASE || '/api';

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
 */
export async function depositPayment(
  paymentToken: PaymentToken,
  auth: AuthFetch
): Promise<{
  success: boolean
  txid: string
  amount: number
  newBalance: number
  message: string
}> {
  const response = await auth.fetch(`${API_BASE}/deposit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(paymentToken),
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
