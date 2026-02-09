/**
 * KYC Record Storage using MongoDB
 */

import { MongoClient, Db, Collection } from 'mongodb'
import { KycCertificate } from './trustflow/certificate.js'
import { SanctionsCheckResult } from './trustflow/sanctions-mock.js'

export interface KycRecord {
  identityKey: string
  certificate: KycCertificate
  sanctionsResult: SanctionsCheckResult
  revoked?: boolean
  revokedAt?: Date
  createdAt: Date
  updatedAt: Date
}

/**
 * Manages KYC record storage using MongoDB
 */
export class KycStorage {
  private client: MongoClient
  private db: Db | null = null
  private collection: Collection<KycRecord> | null = null
  private connectionUri: string

  constructor() {
    this.connectionUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/bsv_exchange'
    this.client = new MongoClient(this.connectionUri)
  }

  /**
   * Initialize MongoDB connection
   */
  async connect(): Promise<void> {
    try {
      await this.client.connect()
      this.db = this.client.db()
      this.collection = this.db.collection<KycRecord>('kyc_records')

      // Create indexes
      await this.collection.createIndex({ identityKey: 1 })
      await this.collection.createIndex({ 'certificate.fields.serialNumber': 1 }, { unique: true })

      console.log('[KycStorage] Connected to MongoDB successfully')
    } catch (error) {
      console.error('[KycStorage] Error connecting to MongoDB:', error)
      throw error
    }
  }

  /**
   * Close MongoDB connection
   */
  async disconnect(): Promise<void> {
    await this.client.close()
    console.log('[KycStorage] Disconnected from MongoDB')
  }

  /**
   * Save a KYC record
   */
  async saveKycRecord(record: KycRecord): Promise<void> {
    if (!this.collection) {
      throw new Error('[KycStorage] MongoDB not connected. Call connect() first.')
    }

    // Upsert by identityKey - replace any existing record for this user
    await this.collection.updateOne(
      { identityKey: record.identityKey },
      {
        $set: {
          ...record,
          updatedAt: new Date(),
        },
      },
      { upsert: true }
    )

    console.log(`[KycStorage] Saved KYC record for ${record.identityKey.slice(0, 16)}...`)
  }

  /**
   * Get KYC record by identity key
   */
  async getKycRecord(identityKey: string): Promise<KycRecord | null> {
    if (!this.collection) {
      throw new Error('[KycStorage] MongoDB not connected. Call connect() first.')
    }

    const record = await this.collection.findOne({ identityKey })
    return record
  }

  /**
   * Get KYC record by certificate serial number
   */
  async getKycRecordBySerial(serialNumber: string): Promise<KycRecord | null> {
    if (!this.collection) {
      throw new Error('[KycStorage] MongoDB not connected. Call connect() first.')
    }

    const record = await this.collection.findOne({
      'certificate.fields.serialNumber': serialNumber,
    })
    return record
  }

  /**
   * Check if a user has a valid (non-expired, non-revoked, clear) KYC record
   */
  async hasValidKyc(identityKey: string): Promise<{
    valid: boolean
    reason?: string
    record?: KycRecord
  }> {
    const record = await this.getKycRecord(identityKey)

    if (!record) {
      return { valid: false, reason: 'No KYC record found' }
    }

    // Check if revoked
    if (record.revoked) {
      return { valid: false, reason: 'KYC certificate has been revoked', record }
    }

    // Check if expired
    const expiresAt = new Date(record.certificate.fields.expiresAt)
    if (new Date() > expiresAt) {
      return { valid: false, reason: 'KYC certificate has expired', record }
    }

    // Check sanctions status
    if (record.certificate.fields.sanctionsStatus === 'matched') {
      return { valid: false, reason: 'User is on sanctions list', record }
    }

    return { valid: true, record }
  }

  /**
   * Mark a KYC record as revoked
   */
  async revokeKycRecord(serialNumber: string): Promise<boolean> {
    if (!this.collection) {
      throw new Error('[KycStorage] MongoDB not connected. Call connect() first.')
    }

    const result = await this.collection.updateOne(
      { 'certificate.fields.serialNumber': serialNumber },
      {
        $set: {
          revoked: true,
          revokedAt: new Date(),
          updatedAt: new Date(),
        },
      }
    )

    return result.modifiedCount > 0
  }

  /**
   * Delete a KYC record
   */
  async deleteKycRecord(identityKey: string): Promise<boolean> {
    if (!this.collection) {
      throw new Error('[KycStorage] MongoDB not connected. Call connect() first.')
    }

    const result = await this.collection.deleteOne({ identityKey })
    return result.deletedCount > 0
  }

  /**
   * Get all KYC records (for admin/debug purposes)
   */
  async getAllKycRecords(limit: number = 100): Promise<KycRecord[]> {
    if (!this.collection) {
      throw new Error('[KycStorage] MongoDB not connected. Call connect() first.')
    }

    const records = await this.collection
      .find({})
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray()

    return records
  }
}
