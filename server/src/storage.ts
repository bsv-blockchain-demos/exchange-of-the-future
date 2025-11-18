import { LocalKVStore, WalletInterface } from '@bsv/sdk'

/**
 * Manages user balance storage using LocalKVStore
 */
export class BalanceStorage {
  private kvStore: LocalKVStore

  constructor(wallet: WalletInterface) {
    this.kvStore = new LocalKVStore(wallet)
  }

  /**
   * Get user balance by identity key
   * @param identityKey - User's public identity key
   * @returns Balance in satoshis (default 0)
   */
  async getBalance(identityKey: string): Promise<number> {
    try {
      const value = await this.kvStore.get(identityKey)
      if (!value) return 0
      const balance = parseInt(value, 10)
      return isNaN(balance) ? 0 : balance
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
    await this.kvStore.set(identityKey, balance.toString())
  }

  /**
   * Add to user balance
   * @param identityKey - User's public identity key
   * @param amount - Amount to add in satoshis
   */
  async addBalance(identityKey: string, amount: number): Promise<number> {
    const currentBalance = await this.getBalance(identityKey)
    const newBalance = currentBalance + amount
    await this.setBalance(identityKey, newBalance)
    return newBalance
  }

  /**
   * Subtract from user balance
   * @param identityKey - User's public identity key
   * @param amount - Amount to subtract in satoshis
   * @returns New balance, or throws if insufficient funds
   */
  async subtractBalance(identityKey: string, amount: number): Promise<number> {
    const currentBalance = await this.getBalance(identityKey)
    if (currentBalance < amount) {
      throw new Error(`Insufficient balance: has ${currentBalance}, needs ${amount}`)
    }
    const newBalance = currentBalance - amount
    await this.setBalance(identityKey, newBalance)
    return newBalance
  }
}
