/**
 * Mock OpenSanctions API for KYC/Sanctions demo
 * In production, this would call the real OpenSanctions API
 */

// List of sanctioned names for demo purposes
const SANCTIONED_NAMES = [
  'sanctioned person',
  'ivan blocked',
  'kim jong-un',
  'kim jong un',
  'test sanctioned',
  'blocked user',
  'vladimir sanctioned',
]

export interface SanctionsCheckResult {
  sanctioned: boolean
  matchedEntity: string | null
  checkedAt: string
  source: string
}

/**
 * Check if a name appears on the mock sanctions list
 * @param name - The name to check (case-insensitive)
 * @returns SanctionsCheckResult with sanctioned status
 */
export function checkSanctions(name: string): SanctionsCheckResult {
  const normalizedName = name.toLowerCase().trim()

  // Check for exact or partial matches
  const matchedEntity = SANCTIONED_NAMES.find(sanctionedName =>
    normalizedName.includes(sanctionedName) ||
    sanctionedName.includes(normalizedName)
  )

  const result: SanctionsCheckResult = {
    sanctioned: !!matchedEntity,
    matchedEntity: matchedEntity || null,
    checkedAt: new Date().toISOString(),
    source: 'mock-opensanctions-api'
  }

  console.log(`[TrustFlow] Sanctions check for "${name}":`, result)

  return result
}

/**
 * Get the list of sanctioned names (for demo/testing purposes)
 */
export function getSanctionedNames(): string[] {
  return [...SANCTIONED_NAMES]
}
