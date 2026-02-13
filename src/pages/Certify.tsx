import { useState } from 'react'
import { WalletConnect } from '@/components/WalletConnect'
import { CertifierFlow } from '@/components/CertifierFlow'
import { toast } from 'sonner'
import { useWallet } from '@/hooks/use-wallet'

const Certify = () => {
  const [identityKey, setIdentityKey] = useState('')
  const { wallet } = useWallet()

  const handleConnect = async () => {
    try {
      if (!wallet) throw new Error('No wallet available')
      const { publicKey } = await wallet.getPublicKey({ identityKey: true })
      setIdentityKey(publicKey)
      toast.success('Wallet connected to CertifyMe')
    } catch (error) {
      console.error('Failed to connect wallet:', error)
      toast.error('Failed to connect wallet. Please try again.')
    }
  }

  if (!identityKey) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-950">
        <div className="max-w-2xl mx-auto pt-12 px-6">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 mb-4">
              <svg className="w-8 h-8 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">CertifyMe Identity Services</h1>
            <p className="text-indigo-300/70">Trusted identity verification for digital asset compliance</p>
          </div>
          <WalletConnect onConnect={handleConnect} />
        </div>
      </div>
    )
  }

  return <CertifierFlow identityKey={identityKey} />
}

export default Certify
