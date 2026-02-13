/**
 * Certificate utilities for the exchange server
 */

/**
 * Check if a revocation anchor UTXO is still unspent (certificate not revoked)
 * Uses WhatsOnChain API
 */
export async function checkRevocationStatus(
  outpoint: string
): Promise<{ revoked: boolean; error?: string }> {
  if (!outpoint) {
    return { revoked: false, error: 'No revocation outpoint' }
  }

  const [txid, voutStr] = outpoint.split(':')
  const vout = parseInt(voutStr, 10)

  if (!txid || isNaN(vout)) {
    return { revoked: false, error: 'Invalid outpoint format' }
  }

  try {
    // Check if the UTXO is unspent using WhatsOnChain API (mainnet)
    const response = await fetch(
      `https://api.whatsonchain.com/v1/bsv/main/tx/${txid}/out/${vout}/spent`
    )

    if (!response.ok) {
      // If 404, the transaction might not be confirmed yet - treat as unspent
      if (response.status === 404) {
        console.log(`[Exchange] Revocation anchor ${outpoint} not found (may be unconfirmed)`)
        return { revoked: false }
      }
      throw new Error(`WhatsOnChain API error: ${response.status}`)
    }

    const spentInfo = await response.json() as { txid?: string } | null

    // If spentInfo is null or empty, the UTXO is unspent
    const isSpent = !!(spentInfo && spentInfo.txid)

    console.log(`[Exchange] Revocation check for ${outpoint}: ${isSpent ? 'REVOKED' : 'VALID'}`)

    return { revoked: isSpent }
  } catch (error: any) {
    console.error(`[Exchange] Error checking revocation status:`, error)
    // On error, assume not revoked to avoid false positives
    return { revoked: false, error: error.message }
  }
}
