import express, { Request, Response } from 'express'
import dotenv from 'dotenv'
import { createAuthMiddleware, AuthRequest } from '@bsv/auth-express-middleware'
import { Transaction, P2PKH, PublicKey, InternalizeActionArgs, Random, Utils, WalletInterface } from '@bsv/sdk'
import { makeWallet } from './wallet.js'
import { BalanceStorage } from './storage.js'

// Load environment variables
dotenv.config()
const chain = process.env.CHAIN! as 'test' | 'main'
const storageURL = process.env.STORAGE_URL!
const privateKey = process.env.PRIVATE_KEY!

const app = express()
const PORT = process.env.PORT || 3000

let _balanceStorage: BalanceStorage;
let _wallet: WalletInterface;
// Middleware
async function initializeWalletMiddleware(app: express.Application): Promise<void> {
  console.log('Initializing wallet...')
  // Global state
  _wallet = await makeWallet(chain, storageURL, privateKey);
  _balanceStorage = new BalanceStorage();
  await _balanceStorage.connect();
  const authMiddleware = createAuthMiddleware({ wallet: _wallet, logger: console, logLevel: 'debug', allowUnauthenticated: false })
  app.use(authMiddleware)
}

// CORS setup
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Headers', '*')
  res.header('Access-Control-Allow-Methods', '*')
  res.header('Access-Control-Expose-Headers', '*')
  res.header('Access-Control-Allow-Private-Network', 'true')

  if (req.method === 'OPTIONS') {
    res.sendStatus(200)
  } else {
    next()
  }
})
app.use(express.json())

await initializeWalletMiddleware(app);

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
    const args = req.body as PaymentToken;

    if (!args.transaction || !args.customInstructions) {
      return res.status(400).json({
        error: 'Missing required fields: transaction, customInstructions'
      })
    }

    const transaction = Transaction.fromBEEF(args.transaction)

    const { derivationPrefix, derivationSuffix } = args.customInstructions;
    const senderIdentityKey = req.auth.identityKey; // This should be passed in the request body

    const depositAmount = transaction.outputs[0].satoshis
    const pkh = transaction.outputs[0].lockingScript.chunks[2].data

    const { publicKey: derivedPubKey } = await _wallet.getPublicKey({
      protocolID: [2, '3241645161d8'], // BRC29 protocol
      keyID: `${derivationPrefix} ${derivationSuffix}`,
      counterparty: senderIdentityKey,
      forSelf: true
    })


    if (PublicKey.fromString(derivedPubKey).toHash('hex') !== Utils.toHex(pkh)) {
      return res.status(400).json({
        error: 'PublicKey Hash Mismatch'
      })
    }

    // Internalize the payment
    const params: InternalizeActionArgs = {
      tx: args.transaction,
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

    const { accepted } = await _wallet.internalizeAction(params)

    if (!accepted) {
      return res.status(400).json({
        error: 'Failed to process deposit',
        details: 'Transaction was not accepted'
      })
    }

    // Update balance
    const newBalance = await _balanceStorage.addBalance(senderIdentityKey, depositAmount)

    console.log(`Deposit processed: ${depositAmount} sats from ${senderIdentityKey.slice(0, 10)}...`)
    console.log(`New balance: ${newBalance} sats`)

    return res.json({
      success: true,
      txid: transaction.id('hex'),
      depositAmount,
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
 * GET /balance
 * Returns the balance for the authenticated user
 */
app.get('/balance', async (req: AuthRequest, res: Response) => {
  try {
    const { identityKey } = req.auth

    if (!identityKey) {
      return res.status(400).json({ error: 'Identity key is required' })
    }

    const balance = await _balanceStorage.getBalance(identityKey)
    const usdBalance = await _balanceStorage.getUsdBalance(identityKey)

    const { publicKey: serverIdentityKey } = await _wallet.getPublicKey({ identityKey: true })

    return res.json({
      serverIdentityKey,
      balance,
      usdBalance
    })
  } catch (error: any) {
    console.error('Balance check error:', error)
    return res.status(500).json({
      error: 'Failed to get balance',
      details: error.message
    })
  }
})

/**
 * GET /transactions
 * Returns transaction history for the authenticated user
 */
app.get('/transactions', async (req: AuthRequest, res: Response) => {
  try {
    const { identityKey } = req.auth

    if (!identityKey) {
      return res.status(400).json({ error: 'Authentication required' })
    }

    // Get actions from the wallet
    const result = await _wallet.listActions({
      labels: [identityKey],
      limit: 50,
      includeLabels: true
    })

    console.dir(result, { depth: null })

    // listActions returns { totalActions, actions }
    const actionsList = result.actions || []

    // Transform actions into a simpler format for the frontend
    const transactions = actionsList.map((action) => {
      // Determine direction based on labels
      const isDeposit = action.labels?.includes('deposit')
      const isWithdrawal = action.labels?.includes('withdrawal')

      let direction: 'deposit' | 'withdrawal' | 'unknown' = 'unknown'
      if (isDeposit) {
        direction = 'deposit'
      } else if (isWithdrawal) {
        direction = 'withdrawal'
      }

      // Calculate total amount from outputs
      const amount = action.satoshis || 0

      return {
        txid: action.txid,
        counterparty: identityKey,
        amount,
        direction,
        description: action.description
      }
    })

    return res.json({
      transactions
    })
  } catch (error: any) {
    console.error('Transaction history error:', error)
    return res.status(500).json({
      error: 'Failed to get transaction history',
      details: error.message
    })
  }
})

/**
 * POST /swap
 * Swap between BSV and USD
 * Requires authentication via @bsv/auth-express-middleware
 *
 * Body: { direction: 'bsv-to-usd' | 'usd-to-bsv', amount: number }
 */
app.post('/swap', async (req: AuthRequest, res: Response) => {
  try {
    const { direction, amount } = req.body

    if (!req.auth || !req.auth.identityKey) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    const identityKey = req.auth.identityKey

    if (!direction || (direction !== 'bsv-to-usd' && direction !== 'usd-to-bsv')) {
      return res.status(400).json({ error: 'Invalid direction. Must be "bsv-to-usd" or "usd-to-bsv"' })
    }

    if (typeof amount !== 'number' || Number.isNaN(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' })
    }

    const BSV_USD_RATE = 25000
    const SATOSHIS_PER_BSV = 100000000

    let result: { bsvBalance: number, usdBalance: number }

    if (direction === 'bsv-to-usd') {
      // Swap satoshis to USD
      const satoshis = Math.floor(amount)
      const usdAmount = (satoshis / SATOSHIS_PER_BSV) * BSV_USD_RATE

      result = await _balanceStorage.swapBsvToUsd(identityKey, satoshis, usdAmount)

      console.log(`Swapped ${satoshis} sats to $${usdAmount.toFixed(5)} USD for ${identityKey.slice(0, 10)}...`)
    } else {
      // Swap USD to satoshis
      const usdAmount = amount
      const satoshis = Math.floor((usdAmount / BSV_USD_RATE) * SATOSHIS_PER_BSV)

      result = await _balanceStorage.swapUsdToBsv(identityKey, usdAmount, satoshis)

      console.log(`Swapped $${usdAmount.toFixed(5)} USD to ${satoshis} sats for ${identityKey.slice(0, 10)}...`)
    }

    return res.json({
      success: true,
      bsvBalance: result.bsvBalance,
      usdBalance: result.usdBalance,
      direction
    })
  } catch (error: any) {
    console.error('Swap error:', error)
    return res.status(500).json({
      error: 'Failed to process swap',
      details: error.message
    })
  }
})

/**
 * POST /withdraw
 * Creates a withdrawal payment for the authenticated user
 * Requires authentication via @bsv/auth-express-middleware
 *
 * Body: { amount: number }
 */
app.post('/withdraw', async (req: AuthRequest, res: Response) => {
  try {
    const { amount } = req.body

    if (!req.auth || !req.auth.identityKey) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    const identityKey = req.auth.identityKey
    const { publicKey: serverIdentityKey } = await _wallet.getPublicKey({ identityKey: true })

    if (typeof amount !== 'number' || Number.isNaN(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' })
    }

    // Check balance
    const currentBalance = await _balanceStorage.getBalance(identityKey)
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
    const { publicKey: derivedPubKey } = await _wallet.getPublicKey({
      protocolID: [2, '3241645161d8'], // BRC29 protocol
      keyID: `${derivationPrefix} ${derivationSuffix}`,
      counterparty: identityKey
    })

    // Create locking script
    const lockingScript = new P2PKH().lock(
      PublicKey.fromString(derivedPubKey).toAddress()
    ).toHex()

    // Create withdrawal transaction
    const action = await _wallet.createAction({
      description: `Withdrawal for ${identityKey.slice(0, 10)}...`,
      outputs: [{
        satoshis: amount,
        lockingScript,
        customInstructions: JSON.stringify({
          derivationPrefix,
          derivationSuffix,
          senderIdentityKey: serverIdentityKey
        }),
        outputDescription: 'Withdrawal payment'
      }],
      labels: ['withdrawal', identityKey],
      options: {
        randomizeOutputs: false
      }
    })

    // Deduct from balance
    const newBalance = await _balanceStorage.subtractBalance(identityKey, amount)

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
          senderIdentityKey: serverIdentityKey
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
  } catch (error: any) {
    console.error('Withdrawal error:', error)
    return res.status(500).json({
      error: 'Failed to process withdrawal',
      details: error.message
    })
  }
})

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    wallet: !!_wallet ? 'initialized' : 'not initialized',
    balanceStorage: !!_balanceStorage ? 'initialized' : 'not initialized',
    timestamp: new Date().toISOString(),
  })
})

// Start server
async function start() {
  app.listen(PORT, () => {
    console.log(`\n🚀 BSV Exchange Server running on http://localhost:${PORT}`)
    console.log(`\nEndpoints:`)
    console.log(`  POST   /deposit              - Accept a payment deposit`)
    console.log(`  GET    /balance              - Get user balance`)
    console.log(`  GET    /transactions         - Get transaction history (authenticated)`)
    console.log(`  POST   /swap                 - Swap between BSV and USD (authenticated)`)
    console.log(`  POST   /withdraw             - Withdraw funds (authenticated)`)
    console.log(`  GET    /health               - Health check\n`)
  })
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n\nShutting down gracefully...')
  if (_balanceStorage) {
    await _balanceStorage.disconnect()
  }
  process.exit(0)
})

process.on('SIGTERM', async () => {
  console.log('\n\nShutting down gracefully...')
  if (_balanceStorage) {
    await _balanceStorage.disconnect()
  }
  process.exit(0)
})

start().catch(console.error)
