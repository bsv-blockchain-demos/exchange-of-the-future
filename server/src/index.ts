import express, { Request, Response } from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { createAuthMiddleware, AuthRequest } from '@bsv/auth-express-middleware'
import { Transaction, P2PKH, PublicKey, createNonce, InternalizeActionArgs, Random, Utils } from '@bsv/sdk'
import { makeWallet } from './wallet.js'
import { BalanceStorage } from './storage.js'

// Load environment variables
dotenv.config()
const chain = process.env.CHAIN! as 'test' | 'main'
const storageURL = process.env.STORAGE_URL!
const privateKey = process.env.PRIVATE_KEY!

const app = express()
const PORT = process.env.PORT || 3000

// Middleware
console.log('Initializing wallet...')
const wallet = await makeWallet(chain, storageURL, privateKey)
const authMiddleware = createAuthMiddleware({ wallet, logger: console, logLevel: 'debug', allowUnauthenticated: false })

app.use(cors())
app.use(express.json())
app.use(authMiddleware)

// Global state
const balanceStorage = new BalanceStorage(wallet)

/**
 * POST /deposit
 * Accepts a payment from a client and credits their balance
 *
 * Body should match PaymentToken format:
 * {
 *   customInstructions: { derivationPrefix, derivationSuffix },
 *   transaction: AtomicBEEF,
 *   amount: number
 * }
 */
app.post('/deposit', async (req: AuthRequest, res: Response) => {
  try {
    const { customInstructions, transaction, amount } = req.body

    if (!customInstructions || !transaction || !amount) {
      return res.status(400).json({
        error: 'Missing required fields: customInstructions, transaction, amount'
      })
    }

    const { derivationPrefix, derivationSuffix } = customInstructions

    // Parse the transaction to get the sender's identity key
    // The sender's identity key should be in the payment remittance
    // For now, we'll extract it from the transaction metadata
    const tx = Transaction.fromBEEF(transaction)

    // Get the sender's identity key from the first output's script
    // In a real implementation, this would come from the client
    let senderIdentityKey: string

    // Try to get sender from request body if provided
    if (req.body.sender) {
      senderIdentityKey = req.body.sender
    } else {
      return res.status(400).json({
        error: 'Sender identity key is required'
      })
    }

    // Internalize the payment
    const params: InternalizeActionArgs = {
      tx: transaction,
      outputs: [{
        outputIndex: 0,
        protocol: 'wallet payment',
        paymentRemittance: {
          derivationPrefix,
          derivationSuffix,
          senderIdentityKey
        }
      }],
      description: 'Deposit to exchange',
      labels: ['deposit', senderIdentityKey]
    }

    const result = await wallet.internalizeAction(params)

    // Update balance
    const depositAmount = tx.outputs[0].satoshis || amount
    const newBalance = await balanceStorage.addBalance(senderIdentityKey, depositAmount)

    console.log(`Deposit processed: ${depositAmount} sats from ${senderIdentityKey.slice(0, 10)}...`)
    console.log(`New balance: ${newBalance} sats`)

    return res.json({
      success: true,
      txid: result.txid,
      amount: depositAmount,
      newBalance,
      message: 'Deposit successful'
    })
  } catch (error) {
    console.error('Deposit error:', error)
    return res.status(500).json({
      error: 'Failed to process deposit',
      details: error.message
    })
  }
})

/**
 * GET /balance/:identityKey
 * Returns the balance for a given identity key
 */
app.get('/balance/:identityKey', async (req: AuthRequest, res: Response) => {
  try {
    const { identityKey } = req.params

    if (!identityKey) {
      return res.status(400).json({ error: 'Identity key is required' })
    }

    const balance = await balanceStorage.getBalance(identityKey)

    return res.json({
      identityKey,
      balance
    })
  } catch (error) {
    console.error('Balance check error:', error)
    return res.status(500).json({
      error: 'Failed to get balance',
      details: error.message
    })
  }
})

/**
 * POST /withdraw/:amount
 * Creates a withdrawal payment for the authenticated user
 * Requires authentication via @bsv/auth-express-middleware
 */
app.post('/withdraw/:amount', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const amount = Number.parseInt(req.params.amount, 10)

    if (!req.auth || !req.auth.identityKey) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    const identityKey = req.auth.identityKey

    if (Number.isNaN(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' })
    }

    // Check balance
    const currentBalance = await balanceStorage.getBalance(identityKey)
    if (currentBalance < amount) {
      return res.status(400).json({
        error: 'Insufficient balance',
        balance: currentBalance,
        requested: amount
      })
    }

    // Generate BRC29 payment
    const derivationPrefix = Utils.toBase64(Random(8))
    const derivationSuffix = Utils.toBase64(Random(8))

    // Get recipient's derived public key using BRC29 protocol
    const { publicKey: derivedPubKey } = await wallet.getPublicKey({
      protocolID: [2, '3241645161d8'], // BRC29 protocol
      keyID: `${derivationPrefix} ${derivationSuffix}`,
      counterparty: identityKey
    })

    // Create locking script
    const lockingScript = new P2PKH().lock(
      PublicKey.fromString(derivedPubKey).toAddress()
    ).toHex()

    // Create withdrawal transaction
    const action = await wallet.createAction({
      description: `Withdrawal for ${identityKey.slice(0, 10)}...`,
      outputs: [{
        satoshis: amount,
        lockingScript,
        customInstructions: JSON.stringify({
          derivationPrefix,
          derivationSuffix,
          recipient: identityKey
        }),
        outputDescription: 'Withdrawal payment'
      }],
      labels: ['withdrawal', identityKey]
    })

    // Deduct from balance
    const newBalance = await balanceStorage.subtractBalance(identityKey, amount)

    console.log(`Withdrawal processed: ${amount} sats to ${identityKey.slice(0, 10)}...`)
    console.log(`New balance: ${newBalance} sats`)

    // Return InternalizeActionArgs format for client
    const response: InternalizeActionArgs = {
      tx: action.tx,
      outputs: [{
        outputIndex: 0,
        protocol: 'wallet payment',
        paymentRemittance: {
          derivationPrefix,
          derivationSuffix,
          senderIdentityKey: (await wallet.getPublicKey({ identityKey: true })).publicKey
        }
      }],
      description: 'Withdrawal from exchange'
    }

    return res.json({
      success: true,
      payment: response,
      amount,
      newBalance,
      txid: action.txid
    })
  } catch (error) {
    console.error('Withdrawal error:', error)
    return res.status(500).json({
      error: 'Failed to process withdrawal',
      details: error.message
    })
  }
})

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    wallet: wallet ? 'initialized' : 'not initialized'
  })
})

// Start server
async function start() {
  await initializeServer()

  app.listen(PORT, () => {
    console.log(`\n🚀 BSV Exchange Server running on http://localhost:${PORT}`)
    console.log(`\nEndpoints:`)
    console.log(`  POST   /deposit              - Accept a payment deposit`)
    console.log(`  GET    /balance/:identityKey - Get user balance`)
    console.log(`  POST   /withdraw/:amount     - Withdraw funds (authenticated)`)
    console.log(`  GET    /health               - Health check\n`)
  })
}

start().catch(console.error)
