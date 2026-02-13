/**
 * KYC Certificate Status Component
 * Shows certificate status from the user's wallet and links to the certifier app
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
import {
  ShieldCheck,
  ShieldAlert,
  Loader2,
  CheckCircle,
  AlertTriangle,
  ExternalLink,
  RefreshCw,
} from 'lucide-react'
import type { WalletCertificate } from '@bsv/sdk'
import {
  getCertificateFromWallet,
  KycStatusInfo,
  KycStatus,
} from '@/lib/kyc'

interface KycCheckProps {
  certifierPubKey: string
  onKycStatusChange?: (status: KycStatusInfo) => void
}

export function KycCheck({
  certifierPubKey,
  onKycStatusChange,
}: KycCheckProps) {
  const [kycStatus, setKycStatus] = useState<KycStatusInfo | null>(null)
  const [isCheckingStatus, setIsCheckingStatus] = useState(true)

  const loadKycStatus = useCallback(async () => {
    setIsCheckingStatus(true)
    try {
      if (!certifierPubKey) {
        const noStatus: KycStatusInfo = {
          status: 'not_verified',
          message: 'Certifier not configured. Cannot check certificates.',
          canDeposit: false,
        }
        setKycStatus(noStatus)
        onKycStatusChange?.(noStatus)
        return
      }

      const certificate = await getCertificateFromWallet(certifierPubKey)

      if (!certificate) {
        const noStatus: KycStatusInfo = {
          status: 'not_verified',
          message: 'No identity certificate found in your wallet.',
          canDeposit: false,
        }
        setKycStatus(noStatus)
        onKycStatusChange?.(noStatus)
        return
      }

      // Certificate found in wallet
      const validStatus: KycStatusInfo = {
        status: 'verified',
        message: 'Identity certificate found in your wallet. Ready for deposits.',
        canDeposit: true,
        certificate,
      }
      setKycStatus(validStatus)
      onKycStatusChange?.(validStatus)
    } catch (error: any) {
      console.error('Failed to load KYC status:', error)
      const errStatus: KycStatusInfo = {
        status: 'error' as KycStatus,
        message: 'Error checking wallet for certificates.',
        canDeposit: false,
      }
      setKycStatus(errStatus)
      onKycStatusChange?.(errStatus)
    } finally {
      setIsCheckingStatus(false)
    }
  }, [certifierPubKey, onKycStatusChange])

  useEffect(() => {
    loadKycStatus()
  }, [loadKycStatus])

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
            Identity Certificate
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span className="ml-2 text-muted-foreground">
              Checking wallet for certificates...
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
          Identity Certificate
        </CardTitle>
        <CardDescription>
          An identity certificate from a trusted certifier is required for deposits.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {kycStatus && (
          <div className={`p-4 rounded-lg border ${getStatusColor(kycStatus.status)}`}>
            <div className="flex items-center gap-2 mb-2">
              {kycStatus.status === 'verified' && <CheckCircle className="h-5 w-5 text-green-600" />}
              {kycStatus.status === 'not_verified' && <AlertTriangle className="h-5 w-5 text-yellow-600" />}
              {kycStatus.status === 'error' && <ShieldAlert className="h-5 w-5 text-red-600" />}
              <span className="font-medium">
                {kycStatus.status === 'verified' && 'Certificate Found'}
                {kycStatus.status === 'not_verified' && 'No Certificate'}
                {kycStatus.status === 'error' && 'Error'}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">{kycStatus.message}</p>

            {kycStatus.certificate && (
              <div className="mt-3 pt-3 border-t border-current/10 text-sm">
                <p>
                  <strong>Certifier:</strong>{' '}
                  {kycStatus.certificate.certifier.slice(0, 16)}...
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Serial: {kycStatus.certificate.serialNumber.slice(0, 16)}...
                </p>
                <p className="text-xs text-muted-foreground">
                  Stored in: Wallet (encrypted)
                </p>
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          {(!kycStatus || kycStatus.status === 'not_verified' || kycStatus.status === 'error') && (
            <Button
              onClick={() => window.location.href = '/certify'}
              className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white"
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              Get Certified
            </Button>
          )}
          <Button
            variant="outline"
            onClick={loadKycStatus}
            className="flex-shrink-0"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        {kycStatus?.status === 'verified' && (
          <Button
            variant="outline"
            onClick={() => window.location.href = '/certify'}
            className="w-full"
          >
            <ExternalLink className="mr-2 h-4 w-4" />
            Get New Certificate
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
