import { PaymentToken } from './api'

/**
 * BSV Wallet utilities for creating deposit and withdrawal transactions
 */

/**
 * Create a deposit payment using WalletClient
 * This follows the PeerPayClient pattern
 */
export async function createDepositPayment(
  amountSatoshis: number,
  recipientIdentityKey: string
): Promise<{ paymentToken: PaymentToken; senderIdentityKey: string }> {
  // Dynamically import WalletClient to avoid issues
  const { WalletClient, P2PKH, PublicKey, createNonce } = await import('@bsv/sdk')

  const wallet = new WalletClient()

  // Get our identity key
  const { publicKey: senderIdentityKey } = await wallet.getPublicKey({
    identityKey: true
  })

  // Generate derivation paths
  const derivationPrefix = await createNonce(wallet)
  const derivationSuffix = await createNonce(wallet)

  // Get recipient's derived public key using BRC29
  const { publicKey: derivedPubKey } = await wallet.getPublicKey({
    protocolID: [2, '3241645161d8'], // BRC29 protocol
    keyID: `${derivationPrefix} ${derivationSuffix}`,
    counterparty: recipientIdentityKey,
  })

  // Create locking script
  const lockingScript = new P2PKH()
    .lock(PublicKey.fromString(derivedPubKey).toAddress())
    .toHex()

  // Create payment action
  const action = await wallet.createAction({
    description: 'Deposit to BSV Exchange',
    outputs: [
      {
        satoshis: amountSatoshis,
        lockingScript,
        customInstructions: JSON.stringify({
          derivationPrefix,
          derivationSuffix,
          recipient: recipientIdentityKey,
        }),
        outputDescription: 'Exchange deposit',
      },
    ],
    labels: ['deposit', 'exchange'],
  })

  const paymentToken: PaymentToken = {
    customInstructions: {
      derivationPrefix,
      derivationSuffix,
    },
    transaction: action.tx!,
    amount: amountSatoshis,
  }

  return {
    paymentToken,
    senderIdentityKey,
  }
}

/**
 * Internalize a withdrawal payment from the backend
 * This accepts the payment into the user's wallet
 */
export async function internalizeWithdrawal(
  paymentData: {
    tx: any // AtomicBEEF type
    derivationPrefix: string
    derivationSuffix: string
    senderIdentityKey: string
  }
): Promise<{ txid: string }> {
  const { WalletClient } = await import('@bsv/sdk')

  const wallet = new WalletClient()

  // Internalize the payment
  const result = await wallet.internalizeAction({
    tx: paymentData.tx,
    outputs: [
      {
        outputIndex: 0,
        protocol: 'wallet payment',
        paymentRemittance: {
          derivationPrefix: paymentData.derivationPrefix,
          derivationSuffix: paymentData.derivationSuffix,
          senderIdentityKey: paymentData.senderIdentityKey,
        },
      },
    ],
    description: 'Withdrawal from BSV Exchange',
    labels: ['withdrawal', 'exchange'],
  })

  return { txid: result.txid! }
}

/**
 * Convert BSV to satoshis
 */
export function bsvToSatoshis(bsv: number): number {
  return Math.floor(bsv * 100000000)
}

/**
 * Convert satoshis to BSV
 */
export function satoshisToBsv(satoshis: number): number {
  return satoshis / 100000000
}

/**
 * Get the server's identity key (hardcoded from backend .env)
 * In production, this should be fetched from an endpoint
 */
export async function getServerIdentityKey(): Promise<string> {
  // For now, we need to derive this from the server's private key
  // In production, add a /server-identity endpoint to the backend
  // For development, we'll compute it here
  const { PrivateKey } = await import('@bsv/sdk')

  // This is the same private key as in .env
  const serverPrivateKey = '5b7ac8e92fe2bff5382f232b1eaf7ba52f924174b04940e36ba288ea6acd7fa0'
  const privKey = new PrivateKey(serverPrivateKey, 'hex')
  return privKey.toPublicKey().toString()
}
