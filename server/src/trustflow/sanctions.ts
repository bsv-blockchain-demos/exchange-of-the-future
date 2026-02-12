/**
 * OpenSanctions (yente) API integration for KYC/Sanctions screening
 * Calls the yente /match/default endpoint at localhost:8000
 */

const YENTE_BASE_URL = process.env.YENTE_URL || 'http://localhost:8000'
const MATCH_SCORE_THRESHOLD = 0.7

export interface SanctionsCheckResult {
  sanctioned: boolean
  matchedEntity: string | null
  checkedAt: string
  source: string
  score?: number
}

/**
 * Build a yente match request body from a name string.
 * Splits the name into firstName / lastName parts.
 */
function buildMatchPayload(name: string): object {
  const parts = name.trim().split(/\s+/)
  const firstName = parts[0] || name
  const lastName = parts.length > 1 ? parts.slice(1).join(' ') : undefined

  const properties: Record<string, string[]> = {
    name: [name],
    firstName: [firstName],
  }
  if (lastName) {
    properties.lastName = [lastName]
  }

  return {
    schema: 'Person',
    properties,
  }
}

/**
 * Check if a name appears on sanctions lists via the yente API
 * @param name - The name to check
 * @returns SanctionsCheckResult with sanctioned status
 */
export async function checkSanctions(name: string): Promise<SanctionsCheckResult> {
  const payload = buildMatchPayload(name)

  console.log(`[TrustFlow] Sanctions check for "${name}" via ${YENTE_BASE_URL}/match/default`)

  try {
    const body = { queries: { q1: payload } }
    const response = await fetch(`${YENTE_BASE_URL}/match/default`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`yente API returned ${response.status}: ${text}`)
    }

    const data = await response.json() as {
      responses: Record<string, {
        results: Array<{ id: string; caption: string; score: number }>
      }>
    }

    console.log('[TrustFlow] yente response:', JSON.stringify(data, null, 2))

    const topMatch = data.responses?.q1?.results?.[0]
    const sanctioned = !!topMatch && topMatch.score >= MATCH_SCORE_THRESHOLD

    const result: SanctionsCheckResult = {
      sanctioned,
      matchedEntity: sanctioned ? topMatch.caption : null,
      checkedAt: new Date().toISOString(),
      source: 'opensanctions-yente',
      score: topMatch?.score,
    }

    console.log(`[TrustFlow] Sanctions result:`, result)
    return result
  } catch (error: any) {
    console.error(`[TrustFlow] Sanctions API error:`, error.message)

    // Fail open with a warning — in production you may want to fail closed
    return {
      sanctioned: false,
      matchedEntity: null,
      checkedAt: new Date().toISOString(),
      source: 'opensanctions-yente (unavailable)',
    }
  }
}
