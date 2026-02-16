import { useState, useCallback, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  ScanLine,
  UserCheck,
  Globe,
  Award,
  CheckCircle,
  XCircle,
  Loader2,
  FileText,
  ArrowLeft,
  ShieldCheck,
  Upload,
  User,
  CreditCard,
} from 'lucide-react'
import { toast } from 'sonner'
import { WalletClient, AuthFetch, Utils } from '@bsv/sdk'

const CERTIFIER_API_BASE = import.meta.env.VITE_CERTIFIER_API_BASE || 'http://localhost:3001'
const KYC_CERTIFICATE_TYPE = Utils.toBase64(Utils.toArray('kyc-identity', 'utf8'))

type Step = 'submit' | 'processing' | 'result'

interface VerificationStep {
  id: string
  label: string
  icon: React.ReactNode
  status: 'pending' | 'active' | 'success' | 'error'
  detail?: string
}

interface CertifierFlowProps {
  identityKey: string
}

export function CertifierFlow({ identityKey }: CertifierFlowProps) {
  const [step, setStep] = useState<Step>('submit')
  const [officialName, setOfficialName] = useState('')
  const [documentUploaded, setDocumentUploaded] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [certIssued, setCertIssued] = useState(false)
  const [certError, setCertError] = useState<string | null>(null)
  const [verificationSteps, setVerificationSteps] = useState<VerificationStep[]>([])
  const authFetchRef = useRef<AuthFetch | null>(null)

  useEffect(() => {
    const wallet = new WalletClient()
    authFetchRef.current = new AuthFetch(wallet)
  }, [])

  const updateStep = useCallback((stepId: string, update: Partial<VerificationStep>) => {
    setVerificationSteps(prev =>
      prev.map(s => s.id === stepId ? { ...s, ...update } : s)
    )
  }, [])

  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

  const handleSubmit = useCallback(async () => {
    if (!officialName.trim() || officialName.trim().length < 2) {
      toast.error('Please enter your full legal name')
      return
    }

    setStep('processing')
    setIsProcessing(true)
    setCertError(null)

    const steps: VerificationStep[] = [
      { id: 'scan', label: 'Scanning identity document...', icon: <ScanLine className="h-5 w-5" />, status: 'pending' },
      { id: 'verify', label: 'Verifying identity information...', icon: <UserCheck className="h-5 w-5" />, status: 'pending' },
      { id: 'sanctions', label: 'Screening international sanctions databases...', icon: <Globe className="h-5 w-5" />, status: 'pending' },
      { id: 'cert', label: 'Issuing blockchain certificate...', icon: <Award className="h-5 w-5" />, status: 'pending' },
    ]
    setVerificationSteps(steps)

    try {
      // Step 1: Scan document (mock)
      updateStep('scan', { status: 'active' })
      await delay(1800)
      updateStep('scan', { status: 'success', detail: 'Document format validated' })

      // Step 2: Verify identity (mock)
      updateStep('verify', { status: 'active' })
      await delay(2000)
      updateStep('verify', { status: 'success', detail: 'Identity information confirmed' })

      // Step 3: Sanctions check (real API call)
      updateStep('sanctions', { status: 'active', label: 'Screening international sanctions databases...' })

      const reviewResponse = await authFetchRef.current!.fetch(`${CERTIFIER_API_BASE}/api/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ officialName: officialName.trim() }),
      })

      if (!reviewResponse.ok) {
        const err = await reviewResponse.json()
        throw new Error(err.error || 'Sanctions review failed')
      }

      const reviewResult = await reviewResponse.json() as {
        approved: boolean
        sanctionsResult: { sanctioned: boolean; matchedEntity: string | null; source: string }
      }

      if (!reviewResult.approved) {
        updateStep('sanctions', {
          status: 'error',
          label: 'Sanctions match detected',
          detail: `Match: ${reviewResult.sanctionsResult.matchedEntity || 'Unknown entity'}`,
        })
        updateStep('cert', { status: 'error', label: 'Certificate issuance blocked' })
        setCertError(`Certification denied: sanctions match found for "${reviewResult.sanctionsResult.matchedEntity}". You cannot be certified.`)
        setStep('result')
        setIsProcessing(false)
        return
      }

      updateStep('sanctions', {
        status: 'success',
        detail: `Clear — checked via ${reviewResult.sanctionsResult.source}`,
      })

      // Step 4: Issue certificate (real API call)
      updateStep('cert', { status: 'active', label: 'Generating blockchain certificate...' })

      const certResponse = await authFetchRef.current!.fetch(`${CERTIFIER_API_BASE}/api/certify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      if (!certResponse.ok) {
        const err = await certResponse.json()
        throw new Error(err.details || err.error || 'Certificate issuance failed')
      }

      const certResult = await certResponse.json() as {
        certificate: {
          type: string
          serialNumber: string
          subject: string
          certifier: string
          revocationOutpoint: string
          fields: Record<string, string>
          signature: string
        }
        masterKeyring: Record<string, string>
      }

      // Store the certificate in the wallet
      const wallet = new WalletClient()
      await wallet.acquireCertificate({
        type: certResult.certificate.type,
        certifier: certResult.certificate.certifier,
        acquisitionProtocol: 'direct',
        fields: certResult.certificate.fields,
        serialNumber: certResult.certificate.serialNumber,
        revocationOutpoint: certResult.certificate.revocationOutpoint,
        signature: certResult.certificate.signature,
        keyringRevealer: certResult.certificate.certifier,
        keyringForSubject: certResult.masterKeyring,
      })

      updateStep('cert', { status: 'success', detail: 'Stored in your wallet' })
      setCertIssued(true)
      setStep('result')
      toast.success('Identity certificate issued and stored in your wallet!')
    } catch (error: any) {
      console.error('[Certifier] Flow error:', error)
      setCertError(error.message || 'An unexpected error occurred')
      setStep('result')
    } finally {
      setIsProcessing(false)
    }
  }, [officialName, updateStep])

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-950 p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 mb-3">
            <ShieldCheck className="w-7 h-7 text-indigo-400" />
          </div>
          <h1 className="text-3xl font-bold text-white">CertifyMe Identity Services</h1>
          <p className="text-indigo-300/60 mt-1 text-sm">Trusted identity verification for digital asset compliance</p>
          <p className="text-indigo-400/40 text-xs mt-2 font-mono">{identityKey.slice(0, 16)}...{identityKey.slice(-8)}</p>
        </div>

        {/* Step 1: Submit Documents */}
        {step === 'submit' && (
          <Card className="bg-slate-900/80 border-indigo-500/20 backdrop-blur-lg">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <FileText className="h-5 w-5 text-indigo-400" />
                Submit Identity Documents
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Name input */}
              <div className="space-y-2">
                <Label htmlFor="official-name" className="text-indigo-200">Full Legal Name</Label>
                <Input
                  id="official-name"
                  type="text"
                  placeholder="Enter your full legal name as it appears on your ID"
                  value={officialName}
                  onChange={(e) => setOfficialName(e.target.value)}
                  className="bg-slate-800/60 border-indigo-500/30 text-white placeholder:text-slate-500 focus:border-indigo-400"
                />
              </div>

              {/* Mock document upload */}
              <div className="space-y-2">
                <Label className="text-indigo-200">Identity Document</Label>
                <div
                  onClick={() => setDocumentUploaded(true)}
                  className={`
                    border-2 rounded-xl p-6 cursor-pointer transition-all
                    ${documentUploaded
                      ? 'border-green-500/40 bg-green-950/20 border-solid'
                      : 'border-dashed border-indigo-500/30 bg-slate-800/30 hover:border-indigo-400/50 hover:bg-slate-800/50'
                    }
                  `}
                >
                  {documentUploaded ? (
                    <div className="flex items-center gap-4">
                      {/* Mock ID card illustration */}
                      <div className="flex-shrink-0 w-48 h-28 rounded-lg bg-gradient-to-br from-slate-700 to-slate-800 border border-slate-600/50 p-3 relative overflow-hidden">
                        {/* Card header bar */}
                        <div className="flex items-center gap-1.5 mb-2">
                          <div className="w-4 h-4 rounded-full bg-indigo-500/60" />
                          <div className="text-[9px] font-bold text-slate-400 tracking-widest uppercase">Government ID</div>
                        </div>
                        {/* Card body */}
                        <div className="flex gap-2">
                          {/* Photo placeholder */}
                          <div className="w-10 h-12 rounded bg-slate-600/80 flex items-center justify-center flex-shrink-0">
                            <User className="w-6 h-6 text-slate-400" />
                          </div>
                          {/* Text lines */}
                          <div className="flex-1 space-y-1.5 pt-0.5">
                            <div className="text-[8px] text-slate-300 font-medium truncate">{officialName || 'Full Name'}</div>
                            <div className="h-1.5 w-full bg-slate-600/60 rounded" />
                            <div className="h-1.5 w-3/4 bg-slate-600/60 rounded" />
                            <div className="h-1.5 w-1/2 bg-slate-600/60 rounded" />
                          </div>
                        </div>
                        {/* Checkmark overlay */}
                        <div className="absolute top-2 right-2">
                          <CheckCircle className="h-4 w-4 text-green-400" />
                        </div>
                      </div>
                      <div className="flex-1">
                        <p className="text-green-300 font-medium">Document uploaded</p>
                        <p className="text-green-400/60 text-xs mt-1">Government-issued photo ID verified</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-4">
                      {/* Empty ID card placeholder */}
                      <div className="flex-shrink-0 w-48 h-28 rounded-lg border-2 border-dashed border-indigo-500/20 bg-slate-800/40 flex flex-col items-center justify-center">
                        <CreditCard className="h-8 w-8 text-indigo-400/30 mb-1" />
                        <Upload className="h-4 w-4 text-indigo-400/40" />
                      </div>
                      <div className="flex-1">
                        <p className="text-indigo-300/70 font-medium">Click to upload ID document</p>
                        <p className="text-indigo-400/40 text-xs mt-1">Passport, driver's license, or national ID</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <Button
                onClick={handleSubmit}
                disabled={!officialName.trim() || !documentUploaded}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-5"
              >
                Submit for Verification
              </Button>

              <p className="text-indigo-400/40 text-xs text-center">
                Your information will be verified against international sanctions databases.
                Certificates are stored securely in your wallet.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Processing */}
        {(step === 'processing' || (step === 'result' && verificationSteps.length > 0)) && (
          <Card className="bg-slate-900/80 border-indigo-500/20 backdrop-blur-lg">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                {isProcessing && <Loader2 className="h-5 w-5 text-indigo-400 animate-spin" />}
                {!isProcessing && certIssued && <CheckCircle className="h-5 w-5 text-green-400" />}
                {!isProcessing && certError && <XCircle className="h-5 w-5 text-red-400" />}
                Verification Progress
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {verificationSteps.map((vs) => (
                  <div key={vs.id} className={`
                    flex items-start gap-3 p-3 rounded-lg transition-all duration-500
                    ${vs.status === 'active' ? 'bg-indigo-500/10 border border-indigo-500/30' : ''}
                    ${vs.status === 'success' ? 'bg-green-500/5 border border-green-500/20' : ''}
                    ${vs.status === 'error' ? 'bg-red-500/5 border border-red-500/20' : ''}
                    ${vs.status === 'pending' ? 'opacity-40' : ''}
                  `}>
                    {/* Status icon */}
                    <div className="mt-0.5">
                      {vs.status === 'pending' && <div className="h-5 w-5 rounded-full border-2 border-slate-600" />}
                      {vs.status === 'active' && <Loader2 className="h-5 w-5 text-indigo-400 animate-spin" />}
                      {vs.status === 'success' && <CheckCircle className="h-5 w-5 text-green-400" />}
                      {vs.status === 'error' && <XCircle className="h-5 w-5 text-red-400" />}
                    </div>

                    {/* Step icon */}
                    <div className={`
                      ${vs.status === 'success' ? 'text-green-400' : ''}
                      ${vs.status === 'error' ? 'text-red-400' : ''}
                      ${vs.status === 'active' ? 'text-indigo-400' : ''}
                      ${vs.status === 'pending' ? 'text-slate-500' : ''}
                    `}>
                      {vs.icon}
                    </div>

                    {/* Label and detail */}
                    <div className="flex-1">
                      <p className={`text-sm font-medium ${
                        vs.status === 'success' ? 'text-green-300' :
                        vs.status === 'error' ? 'text-red-300' :
                        vs.status === 'active' ? 'text-indigo-200' :
                        'text-slate-400'
                      }`}>
                        {vs.label}
                      </p>
                      {vs.detail && (
                        <p className={`text-xs mt-0.5 ${
                          vs.status === 'success' ? 'text-green-400/60' :
                          vs.status === 'error' ? 'text-red-400/60' :
                          'text-indigo-400/50'
                        }`}>
                          {vs.detail}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Result */}
        {step === 'result' && (
          <Card className={`backdrop-blur-lg ${
            certIssued
              ? 'bg-green-950/40 border-green-500/30'
              : 'bg-red-950/40 border-red-500/30'
          }`}>
            <CardContent className="pt-6">
              {certIssued ? (
                <div className="text-center space-y-4">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-500/20 border border-green-500/30">
                    <Award className="h-8 w-8 text-green-400" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-green-300">Certificate Issued</h3>
                    <p className="text-green-400/60 mt-1 text-sm">
                      Your identity certificate has been stored in your wallet.
                    </p>
                  </div>
                  <div className="bg-green-500/10 rounded-lg p-4 text-left text-sm space-y-1">
                    <p className="text-green-300"><strong>Name:</strong> {officialName}</p>
                    <p className="text-green-300"><strong>Status:</strong> Verified</p>
                    <p className="text-green-300"><strong>Storage:</strong> Wallet (encrypted)</p>
                  </div>
                  <Button
                    onClick={() => window.location.href = '/'}
                    className="bg-green-600 hover:bg-green-500 text-white"
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Return to Exchange
                  </Button>
                </div>
              ) : (
                <div className="text-center space-y-4">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-500/20 border border-red-500/30">
                    <XCircle className="h-8 w-8 text-red-400" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-red-300">Certification Denied</h3>
                    <p className="text-red-400/70 mt-1 text-sm">{certError}</p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setStep('submit')
                      setVerificationSteps([])
                      setCertError(null)
                      setOfficialName('')
                      setDocumentUploaded(false)
                    }}
                    className="border-red-500/30 text-red-300 hover:bg-red-500/10"
                  >
                    Try Again
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
