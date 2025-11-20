import { MongoClient, Db, Collection } from 'mongodb'

interface BalanceDocument {
  identityKey: string
  balance: number
  updatedAt: Date
}

/**
 * Manages user balance storage using MongoDB
 */
export class BalanceStorage {
  private client: MongoClient
  private db: Db | null = null
  private collection: Collection<BalanceDocument> | null = null
  private connectionUri: string

  constructor() {
    this.connectionUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/bsv_exchange'
    this.client = new MongoClient(this.connectionUri)
  }

  /**
   * Initialize MongoDB connection
   * Must be called before using any other methods
   */
  async connect(): Promise<void> {
    try {
      await this.client.connect()
      this.db = this.client.db()
      this.collection = this.db.collection<BalanceDocument>('balances')

      // Create index on identityKey for faster lookups
      await this.collection.createIndex({ identityKey: 1 }, { unique: true })

      console.log('Connected to MongoDB successfully')
    } catch (error) {
      console.error('Error connecting to MongoDB:', error)
      throw error
    }
  }

  /**
   * Close MongoDB connection
   */
  async disconnect(): Promise<void> {
    await this.client.close()
    console.log('Disconnected from MongoDB')
  }

  /**
   * Get user balance by identity key
   * @param identityKey - User's public identity key
   * @returns Balance in satoshis (default 0)
   */
  async getBalance(identityKey: string): Promise<number> {
    try {
      if (!this.collection) {
        throw new Error('MongoDB not connected. Call connect() first.')
      }

      const doc = await this.collection.findOne({ identityKey })
      const balance = doc?.balance ?? 0
      console.log({ getBalance: { identityKey, balance } })
      return balance
    } catch (error) {
      console.error(`Error getting balance for ${identityKey}:`, error)
      return 0
    }
  }

  /**
   * Set user balance by identity key
   * @param identityKey - User's public identity key
   * @param balance - Balance in satoshis
   */
  async setBalance(identityKey: string, balance: number): Promise<void> {
    if (!this.collection) {
      throw new Error('MongoDB not connected. Call connect() first.')
    }

    const result = await this.collection.updateOne(
      { identityKey },
      {
        $set: {
          balance,
          updatedAt: new Date()
        }
      },
      { upsert: true }
    )
    console.log({ setBalance: { identityKey, balance, result: result.modifiedCount || result.upsertedCount } })
  }

  /**
   * Add to user balance (atomic operation)
   * @param identityKey - User's public identity key
   * @param amount - Amount to add in satoshis
   */
  async addBalance(identityKey: string, amount: number): Promise<number> {
    if (!this.collection) {
      throw new Error('MongoDB not connected. Call connect() first.')
    }

    const result = await this.collection.findOneAndUpdate(
      { identityKey },
      {
        $inc: { balance: amount },
        $set: { updatedAt: new Date() }
      },
      {
        upsert: true,
        returnDocument: 'after'
      }
    )

    const newBalance = result?.balance ?? amount
    console.log({ addBalance: { identityKey, amount, newBalance } })
    return newBalance
  }

  /**
   * Subtract from user balance (atomic operation)
   * @param identityKey - User's public identity key
   * @param amount - Amount to subtract in satoshis
   * @returns New balance, or throws if insufficient funds
   */
  async subtractBalance(identityKey: string, amount: number): Promise<number> {
    if (!this.collection) {
      throw new Error('MongoDB not connected. Call connect() first.')
    }

    // First check if user has sufficient balance
    const currentDoc = await this.collection.findOne({ identityKey })
    const currentBalance = currentDoc?.balance ?? 0

    if (currentBalance < amount) {
      throw new Error(`Insufficient balance: has ${currentBalance}, needs ${amount}`)
    }

    // Perform atomic decrement
    const result = await this.collection.findOneAndUpdate(
      {
        identityKey,
        balance: { $gte: amount } // Double-check sufficient balance in atomic operation
      },
      {
        $inc: { balance: -amount },
        $set: { updatedAt: new Date() }
      },
      {
        returnDocument: 'after'
      }
    )

    if (!result) {
      throw new Error(`Insufficient balance: concurrent modification detected`)
    }

    const newBalance = result.balance
    console.log({ subtractBalance: { identityKey, amount, newBalance } })
    return newBalance
  }
}
