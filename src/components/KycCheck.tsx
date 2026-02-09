/**
 * KYC Check Component
 * Displays KYC status and allows users to initiate verification
 */

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Loader2,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
} from 'lucide-react'
import { toast } from 'sonner'
import { AuthFetch } from '@bsv/sdk'
import {
  createSignedKycAuthorization,
  KycStatusInfo,
  KycStatus,
  saveCertificateToLocalStorage,
  loadCertificateFromLocalStorage,
  isCertificateExpiredClient,
  KycCertificate,
} from '@/lib/kyc'
import { submitKycVerification } from '@/lib/api'

interface KycCheckProps {
  authFetch: AuthFetch | null
  serverIdentityKey: string
  onKycStatusChange?: (status: KycStatusInfo) => void
}

const EXCHANGE_NAME = 'BSV Swift Exchange'

export function KycCheck({
  authFetch,
  serverIdentityKey,
  onKycStatusChange,
}: KycCheckProps) {
  const [kycStatus, setKycStatus] = useState<KycStatusInfo | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isCheckingStatus, setIsCheckingStatus] = useState(true)
  const [officialName, setOfficialName] = useState('')

  // Load certificate from localStorage on mount
  useEffect(() => {
    loadKycStatus()
  }, [])

  const loadKycStatus = useCallback(async () => {
    setIsCheckingStatus(true)
    try {
      // Load certificate from localStorage
      const certificate = loadCertificateFromLocalStorage()

      if (!certificate) {
        const noStatus: KycStatusInfo = {
          status: 'not_verified',
          message: 'No certificate found. Get one from the Certification Company.',
          canDeposit: false,
        }
        setKycStatus(noStatus)
        onKycStatusChange?.(noStatus)
        return
      }

      // Check if expired client-side
      if (isCertificateExpiredClient(certificate)) {
        const expiredStatus: KycStatusInfo = {
          status: 'expired',
          message: 'Your certificate has expired. Please get a new one.',
          canDeposit: false,
          certificate: {
            officialName: certificate.fields.officialName,
            serialNumber: certificate.fields.serialNumber,
            issuedAt: certificate.fields.issuedAt,
            expiresAt: certificate.fields.expiresAt,
            sanctionsStatus: certificate.fields.sanctionsStatus,
          },
        }
        setKycStatus(expiredStatus)
        onKycStatusChange?.(expiredStatus)
        return
      }

      // Check sanctions status
      if (certificate.fields.sanctionsStatus === 'matched') {
        const sanctionedStatus: KycStatusInfo = {
          status: 'sanctioned',
          message: 'Certificate indicates sanctions match. Deposits blocked.',
          canDeposit: false,
          certificate: {
            officialName: certificate.fields.officialName,
            serialNumber: certificate.fields.serialNumber,
            issuedAt: certificate.fields.issuedAt,
            expiresAt: certificate.fields.expiresAt,
            sanctionsStatus: certificate.fields.sanctionsStatus,
          },
        }
        setKycStatus(sanctionedStatus)
        onKycStatusChange?.(sanctionedStatus)
        return
      }

      // Valid certificate
      const validStatus: KycStatusInfo = {
        status: 'verified',
        message: 'Certificate loaded. Ready for deposit.',
        canDeposit: true,
        certificate: {
          officialName: certificate.fields.officialName,
          serialNumber: certificate.fields.serialNumber,
          issuedAt: certificate.fields.issuedAt,
          expiresAt: certificate.fields.expiresAt,
          sanctionsStatus: certificate.fields.sanctionsStatus,
        },
      }
      setKycStatus(validStatus)
      onKycStatusChange?.(validStatus)
    } catch (error: any) {
      console.error('Failed to load KYC status:', error)
      setKycStatus({
        status: 'not_verified',
        message: 'Error loading certificate. Please try again.',
        canDeposit: false,
      })
    } finally {
      setIsCheckingStatus(false)
    }
  }, [onKycStatusChange])

  const handleKycSubmit = useCallback(async () => {
    if (!authFetch || !serverIdentityKey) {
      toast.error('Authentication not ready')
      return
    }

    if (!officialName.trim()) {
      toast.error('Please enter your official name')
      return
    }

    if (officialName.trim().length < 2) {
      toast.error('Please enter a valid name')
      return
    }

    setIsLoading(true)
    toast.loading('Signing KYC authorization...')

    try {
      // Create and sign the authorization
      const signedAuth = await createSignedKycAuthorization(
        officialName.trim(),
        serverIdentityKey,
        EXCHANGE_NAME
      )

      toast.loading('Submitting to TrustFlow for verification...')

      // Submit to TrustFlow
      const result = await submitKycVerification(signedAuth, authFetch)

      toast.dismiss()

      if (result.success && result.certificate) {
        // Save the certificate to localStorage
        saveCertificateToLocalStorage(result.certificate as KycCertificate)

        const certificateInfo = {
          officialName: result.certificate.fields.officialName,
          serialNumber: result.certificate.fields.serialNumber,
          issuedAt: result.certificate.fields.issuedAt,
          expiresAt: result.certificate.fields.expiresAt,
          sanctionsStatus: result.certificate.fields.sanctionsStatus,
        }

        if (result.sanctionsResult?.sanctioned) {
          toast.error(
            `Certificate issued but you are on the sanctions list. Deposits are blocked.`
          )
          const newStatus: KycStatusInfo = {
            status: 'sanctioned',
            message: 'Certificate issued. Sanctions match - deposits blocked.',
            canDeposit: false,
            certificate: certificateInfo,
          }
          setKycStatus(newStatus)
          onKycStatusChange?.(newStatus)
        } else {
          toast.success('Certificate issued! You can now present it to the exchange.')
          const newStatus: KycStatusInfo = {
            status: 'verified',
            message: 'Certificate saved. Ready to present to exchange for deposit.',
            canDeposit: true,
            certificate: certificateInfo,
          }
          setKycStatus(newStatus)
          onKycStatusChange?.(newStatus)
        }
        setOfficialName('')
      } else if (!result.success) {
        toast.error(result.error || 'KYC verification failed')
      }
    } catch (error: any) {
      toast.dismiss()
      console.error('KYC submission failed:', error)
      toast.error(`KYC verification failed: ${error.message}`)
    } finally {
      setIsLoading(false)
    }
  }, [authFetch, serverIdentityKey, officialName, onKycStatusChange])

  const getStatusIcon = (status: KycStatus) => {
    switch (status) {
      case 'verified':
        return <CheckCircle className="h-5 w-5 text-green-600" />
      case 'sanctioned':
        return <XCircle className="h-5 w-5 text-red-600" />
      case 'expired':
        return <Clock className="h-5 w-5 text-orange-600" />
      case 'revoked':
        return <ShieldX className="h-5 w-5 text-red-600" />
      case 'not_verified':
        return <AlertTriangle className="h-5 w-5 text-yellow-600" />
      case 'pending':
        return <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />
      default:
        return <ShieldAlert className="h-5 w-5 text-gray-600" />
    }
  }

  const getStatusColor = (status: KycStatus) => {
    switch (status) {
      case 'verified':
        return 'border-green-200 bg-green-50'
      case 'sanctioned':
        return 'border-red-200 bg-red-50'
      case 'expired':
      case 'revoked':
        return 'border-orange-200 bg-orange-50'
      case 'not_verified':
        return 'border-yellow-200 bg-yellow-50'
      default:
        return 'border-gray-200 bg-gray-50'
    }
  }

  if (isCheckingStatus) {
    return (
      <Card className="bg-gradient-card backdrop-blur-lg border-border">
        <CardHeader>
          <CardTitle className="flex items-center text-foreground">
            <ShieldCheck className="mr-2 h-5 w-5 text-primary" />
            Certification Company: Get Certificate
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span className="ml-2 text-muted-foreground">
              Loading certificate...
            </span>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="bg-gradient-card backdrop-blur-lg border-border">
      <CardHeader>
        <CardTitle className="flex items-center text-foreground">
          <ShieldCheck className="mr-2 h-5 w-5 text-primary" />
          Certification Company: Get Certificate
        </CardTitle>
        <CardDescription>
          Get an Identity Certificate to enable deposits at the exchange.
          Your name will be checked against sanctions lists.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Status Display */}
        {kycStatus && (
          <div
            className={`p-4 rounded-lg border ${getStatusColor(kycStatus.status)}`}
          >
            <div className="flex items-center gap-2 mb-2">
              {getStatusIcon(kycStatus.status)}
              <span className="font-medium">
                {kycStatus.status === 'verified' && 'Verified'}
                {kycStatus.status === 'sanctioned' && 'Sanctioned'}
                {kycStatus.status === 'expired' && 'Expired'}
                {kycStatus.status === 'revoked' && 'Revoked'}
                {kycStatus.status === 'not_verified' && 'Not Verified'}
                {kycStatus.status === 'pending' && 'Pending'}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">{kycStatus.message}</p>

            {/* Certificate details if available */}
            {kycStatus.certificate && (
              <div className="mt-3 pt-3 border-t border-current/10 text-sm">
                <p>
                  <strong>Name:</strong> {kycStatus.certificate.officialName}
                </p>
                <p>
                  <strong>Issued:</strong>{' '}
                  {new Date(kycStatus.certificate.issuedAt).toLocaleString()}
                </p>
                <p>
                  <strong>Expires:</strong>{' '}
                  {new Date(kycStatus.certificate.expiresAt).toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Serial: {kycStatus.certificate.serialNumber.slice(0, 8)}...
                </p>
              </div>
            )}
          </div>
        )}

        {/* Show form if not verified or needs re-verification */}
        {(!kycStatus ||
          kycStatus.status === 'not_verified' ||
          kycStatus.status === 'expired' ||
          kycStatus.status === 'revoked') && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="official-name">Official Name</Label>
              <Input
                id="official-name"
                type="text"
                placeholder="Enter your full legal name"
                value={officialName}
                onChange={(e) => setOfficialName(e.target.value)}
                className="bg-input border-border"
                disabled={isLoading}
              />
              <p className="text-xs text-muted-foreground">
                This name will be checked against sanctions lists. Use your
                legal name as it appears on official documents.
              </p>
            </div>

            <div className="bg-muted/50 p-3 rounded-lg text-sm">
              <p className="font-medium mb-1">Test Names:</p>
              <ul className="text-muted-foreground text-xs space-y-1">
                <li>
                  <span className="text-green-600">Clear:</span> "Alice Smith",
                  "John Doe", or any normal name
                </li>
                <li>
                  <span className="text-red-600">Sanctioned:</span> "Sanctioned
                  Person", "Ivan Blocked", "Test Sanctioned"
                </li>
              </ul>
            </div>

            <Button
              onClick={handleKycSubmit}
              disabled={isLoading || !officialName.trim()}
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Issuing Certificate...
                </>
              ) : (
                <>
                  <ShieldCheck className="mr-2 h-4 w-4" />
                  Issue Identity Certificate
                </>
              )}
            </Button>
          </div>
        )}

        {/* Get new certificate button - visible for verified or sanctioned */}
        {(kycStatus?.status === 'verified' || kycStatus?.status === 'sanctioned') && (
          <Button
            variant="outline"
            onClick={() =>
              setKycStatus({
                status: 'not_verified',
                message: 'Request new certificate',
                canDeposit: false,
              })
            }
            className="w-full"
          >
            Get New Certificate
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
