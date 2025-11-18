import { PrivateKey, KeyDeriver, WalletInterface } from '@bsv/sdk'
import { Wallet, WalletStorageManager, WalletSigner, Services, StorageClient } from '@bsv/wallet-toolbox'

/**
 * Creates and initializes a BSV wallet with storage
 */
export async function makeWallet(
  chain: 'test' | 'main',
  storageURL: string,
  privateKey: string
): Promise<WalletInterface> {
  const keyDeriver = new KeyDeriver(new PrivateKey(privateKey, 'hex'))
  const storageManager = new WalletStorageManager(keyDeriver.identityKey)
  const signer = new WalletSigner(chain, keyDeriver, storageManager)
  const services = new Services(chain)
  const wallet = new Wallet(signer, services)
  const client = new StorageClient(wallet, storageURL)

  await client.makeAvailable()
  await storageManager.addWalletStorageProvider(client)

  return wallet
}
