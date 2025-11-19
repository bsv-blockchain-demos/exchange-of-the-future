import { PaymentToken } from './api'
import { WalletClient, P2PKH, PublicKey, Utils, Random, Transaction } from '@bsv/sdk'

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
): Promise<PaymentToken> {
  // Dynamically import WalletClient to avoid issues

  const wallet = new WalletClient()

  // Get our identity key
  const { publicKey: senderIdentityKey } = await wallet.getPublicKey({
    identityKey: true
  })

  // Generate derivation paths
  const derivationPrefix = Utils.toBase64(Random(8))
  const derivationSuffix = Utils.toBase64(Random(8))

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
        outputDescription: 'Exchange deposit',
      },
    ],
    labels: ['deposit', senderIdentityKey],
  })

  const paymentToken: PaymentToken = {
    customInstructions: {
      derivationPrefix,
      derivationSuffix,
    },
    transaction: action.tx,
    amount: amountSatoshis,
  }

  return paymentToken;
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

  if (!result.accepted) {
    throw new Error('Withdrawal payment was not accepted');
  }

  const transaction = Transaction.fromBEEF(paymentData.tx);
  const txid = transaction.id('hex');

  return { txid }
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
