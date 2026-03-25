import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowDownUp, LogOut, TrendingUp, Send, Loader2, ShieldAlert, ShieldCheck, FileCheck, FileX, User } from "lucide-react";
import { toast } from "sonner";
import { depositPayment, getBalance, withdrawFunds, swapFunds } from "@/lib/api";
import {
  createDepositPayment,
  internalizeWithdrawal
} from "@/lib/bsv-wallet";
import { AuthFetch, IdentityClient } from "@bsv/sdk";
import { useWallet } from "@/hooks/use-wallet";
import { TransactionHistory } from "@/components/TransactionHistory";
import { KycCheck } from "@/components/KycCheck";
import { KycStatusInfo, loadCertificateFromLocalStorage, KycCertificate } from "@/lib/kyc";


interface DashboardProps {
  identityKey: string;
  onDisconnect: () => void;
}

const BSV_USD_RATE = 25000;
const SATOSHIS_PER_BSV = 100000000;

export const Dashboard = ({ identityKey, onDisconnect }: DashboardProps) => {
  const [bsvBalanceSats, setBsvBalanceSats] = useState(0); // Store in satoshis
  const [usdBalance, setUsdBalance] = useState(0);
  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [swapAmount, setSwapAmount] = useState("");
  const [swapDirection, setSwapDirection] = useState<"bsv-to-usd" | "usd-to-bsv">("bsv-to-usd");
  const [isDepositing, setIsDepositing] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);
  const [authFetch, setAuthFetch] = useState<AuthFetch | null>(null);
  const [serverIdentityKey, setServerIdentityKey] = useState<string>("");
  const [transactionRefreshKey, setTransactionRefreshKey] = useState(0);
  const [kycStatus, setKycStatus] = useState<KycStatusInfo | null>(null);
  const [certificate, setCertificate] = useState<KycCertificate | null>(null);
  const [avatarURL, setAvatarURL] = useState<string | null>(null);
  const [identityName, setIdentityName] = useState<string | null>(null);

  const { wallet } = useWallet();

  // Resolve avatar using IdentityClient
  useEffect(() => {
    if (!identityKey || !wallet) return;
    const resolveIdentity = async () => {
      try {
        const client = new IdentityClient(wallet);
        const identities = await client.resolveByIdentityKey(
          { identityKey },
          true
        );
        if (identities.length > 0) {
          const identity = identities[0];
          if (identity.avatarURL) setAvatarURL(identity.avatarURL);
          if (identity.name && identity.name !== "Unknown Identity") setIdentityName(identity.name);
        }
      } catch (err) {
        console.log("Could not resolve identity avatar:", err);
      }
    };
    resolveIdentity();
  }, [identityKey, wallet]);

  // Load certificate from localStorage when KYC status changes
  const handleKycStatusChange = useCallback((status: KycStatusInfo) => {
    setKycStatus(status);
    const cert = loadCertificateFromLocalStorage();
    setCertificate(cert);
  }, []);

  // Load balance from backend on mount
  useEffect(() => {
    const f = new AuthFetch(wallet);
    setAuthFetch(f);
    loadBalance(f);
  }, [identityKey]);

  const loadBalance = async (authFetch: AuthFetch) => {
    try {
      setIsLoadingBalance(true);
      const result = await getBalance(authFetch);
      // Backend stores in satoshis, keep as satoshis
      setBsvBalanceSats(result.balance);
      setUsdBalance(result.usdBalance);
      setServerIdentityKey(result.serverIdentityKey);
      toast.info(`Loaded balance: ${result.balance} satoshis, $${result.usdBalance.toFixed(5)} USD`);
    } catch (error) {
      console.error("Failed to load balance:", error);
      toast.error("Failed to load balance from server");
    } finally {
      setIsLoadingBalance(false);
    }
  };

  const handleDeposit = useCallback(async () => {
    if (!authFetch) {
      toast.error("Authentication not ready");
      return;
    }

    if (!certificate) {
      toast.error("No certificate loaded. Get one from the Certification Company.");
      return;
    }

    const amountSatoshis = Number.parseInt(depositAmount, 10);
    if (Number.isNaN(amountSatoshis) || amountSatoshis < 1 || amountSatoshis > 1000) {
      toast.error("Please enter a valid amount between 1 and 1000 satoshis");
      return;
    }

    setIsDepositing(true);
    try {
      toast.info("Creating deposit transaction...");

      console.log({ serverIdentityKey })

      // Create the payment transaction (amount already in satoshis)
      const paymentToken = await createDepositPayment(
        amountSatoshis,
        serverIdentityKey
      );

      toast.info("Presenting certificate and sending deposit...");

      // Send to backend with certificate
      const result = await depositPayment(paymentToken, authFetch, certificate);

      // Update local balance from server response (already in satoshis)
      setBsvBalanceSats(result.newBalance);
      setDepositAmount("");

      toast.success(
        `Deposited ${amountSatoshis} sats\nTXID: ${result.txid.slice(0, 16)}...`
      );

      // Refresh transaction history
      setTransactionRefreshKey(prev => prev + 1);
    } catch (error: any) {
      console.error("Deposit failed:", error);
      toast.error(`Deposit failed: ${error.message}`);
    } finally {
      setIsDepositing(false);
    }
  }, [authFetch, depositAmount, serverIdentityKey])

  const handleWithdraw = useCallback(async () => {
    const amountSatoshis = Number.parseInt(withdrawAmount, 10);
    if (Number.isNaN(amountSatoshis) || amountSatoshis <= 0) {
      toast.error("Please enter a valid amount in satoshis");
      return;
    }
    if (amountSatoshis > bsvBalanceSats) {
      toast.error("Insufficient balance");
      return;
    }

    setIsWithdrawing(true);
    try {
      toast.info("Creating withdrawal...");

      const result = await withdrawFunds(amountSatoshis, authFetch);

      toast.info("Internalizing withdrawal payment...");

      // Internalize the payment into our wallet
      const paymentData = result.payment.outputs[0].paymentRemittance;
      await internalizeWithdrawal({
        tx: result.payment.tx,
        derivationPrefix: paymentData.derivationPrefix,
        derivationSuffix: paymentData.derivationSuffix,
        senderIdentityKey: paymentData.senderIdentityKey,
      });

      // Update local balance from server response (already in satoshis)
      setBsvBalanceSats(result.newBalance);
      setWithdrawAmount("");

      toast.success(
        `Withdrawn ${amountSatoshis} sats\nTXID: ${result.txid.slice(0, 16)}...`
      );

      // Refresh transaction history
      setTransactionRefreshKey(prev => prev + 1);
    } catch (error: any) {
      console.error("Withdrawal failed:", error);
      toast.error(`Withdrawal failed: ${error.message}`);
    } finally {
      setIsWithdrawing(false);
    }
  }, [authFetch, withdrawAmount, bsvBalanceSats]);

  const handleSwap = async () => {
    if (!authFetch) {
      toast.error("Authentication not ready");
      return;
    }

    const amount = Number.parseFloat(swapAmount);
    if (Number.isNaN(amount) || amount <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    try {
      if (swapDirection === "bsv-to-usd") {
        // Swapping satoshis to USD
        const satoshis = Math.floor(amount);
        if (satoshis > bsvBalanceSats) {
          toast.error("Insufficient BSV balance");
          return;
        }

        toast.info("Processing swap...");
        const result = await swapFunds("bsv-to-usd", satoshis, authFetch);

        setBsvBalanceSats(result.bsvBalance);
        setUsdBalance(result.usdBalance);

        const usdAmount = (satoshis / SATOSHIS_PER_BSV) * BSV_USD_RATE;
        toast.success(`Swapped ${satoshis} sats for $${usdAmount.toFixed(5)} USD`);
      } else {
        // Swapping USD to satoshis
        const usdAmount = amount;
        if (usdAmount > usdBalance) {
          toast.error("Insufficient USD balance");
          return;
        }

        toast.info("Processing swap...");
        const result = await swapFunds("usd-to-bsv", usdAmount, authFetch);

        setBsvBalanceSats(result.bsvBalance);
        setUsdBalance(result.usdBalance);

        const satoshis = Math.floor((usdAmount / BSV_USD_RATE) * SATOSHIS_PER_BSV);
        toast.success(`Swapped $${usdAmount.toFixed(5)} USD for ${satoshis} sats`);
      }

      setSwapAmount("");
    } catch (error: any) {
      console.error("Swap failed:", error);
      toast.error(`Swap failed: ${error.message}`);
    }
  };

  const toggleSwapDirection = () => {
    setSwapDirection(prev => prev === "bsv-to-usd" ? "usd-to-bsv" : "bsv-to-usd");
    setSwapAmount("");
  };

  const truncatedKey = `${identityKey.slice(0, 8)}...${identityKey.slice(-6)}`;

  return (
    <div className="min-h-screen bg-background p-3 sm:p-6">
      <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6">
        {/* Header with login indicator */}
        <div className="flex justify-between items-center gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {/* Avatar / Identity indicator */}
            <div className="h-10 w-10 shrink-0 rounded-full bg-muted border border-border overflow-hidden flex items-center justify-center">
              {avatarURL ? (
                <img
                  src={avatarURL}
                  alt={identityName || "Avatar"}
                  className="h-full w-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                    (e.target as HTMLImageElement).parentElement!.querySelector(".fallback-icon")?.classList.remove("hidden");
                  }}
                />
              ) : null}
              <User className={`h-5 w-5 text-muted-foreground ${avatarURL ? "hidden fallback-icon" : "fallback-icon"}`} />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent leading-tight">
                BSV Exchange
              </h1>
              <p className="text-xs sm:text-sm text-muted-foreground truncate">
                {identityName ? `${identityName} · ` : ""}{truncatedKey}
              </p>
            </div>
          </div>
          <Button onClick={onDisconnect} variant="outline" size="sm" className="shrink-0">
            <LogOut className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Disconnect</span>
          </Button>
        </div>

        {/* BSV Balance + Deposit + Withdraw grouped together */}
        <Card className="bg-gradient-card backdrop-blur-lg border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-foreground">BSV Balance</CardTitle>
            <CardDescription>Bitcoin SV (in satoshis)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Balance display */}
            {isLoadingBalance ? (
              <div className="flex items-center space-x-2">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <span className="text-muted-foreground">Loading...</span>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-2xl sm:text-4xl font-bold text-primary">{bsvBalanceSats.toLocaleString()} <span className="text-base font-normal">sats</span></p>
                  <p className="text-sm text-muted-foreground mt-1">
                    ≈ ${((bsvBalanceSats / SATOSHIS_PER_BSV) * BSV_USD_RATE).toFixed(5)} USD
                  </p>
                </div>
                <div>
                  <p className="text-2xl sm:text-4xl font-bold text-secondary">${usdBalance.toFixed(5)}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    ≈ {Math.floor((usdBalance / BSV_USD_RATE) * SATOSHIS_PER_BSV).toLocaleString()} sats
                  </p>
                </div>
              </div>
            )}

            {/* Deposit & Withdraw side by side */}
            <div className="grid sm:grid-cols-2 gap-4 pt-2 border-t border-border">
              {/* Deposit */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-foreground">Deposit BSV</h3>
                {(!certificate || !kycStatus?.canDeposit) && (
                  <div className="p-2 rounded-lg bg-yellow-50 border border-yellow-200 text-yellow-800 text-xs flex items-center gap-2">
                    <ShieldAlert className="h-3 w-3 shrink-0" />
                    <span>Certificate required to deposit</span>
                  </div>
                )}
                <div className="flex gap-2">
                  <Input
                    id="deposit-amount"
                    type="number"
                    placeholder="sats (1-1000)"
                    min="1"
                    max="1000"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    className="bg-input border-border"
                    disabled={!certificate || !kycStatus?.canDeposit}
                  />
                  <Button
                    onClick={handleDeposit}
                    disabled={isDepositing || isLoadingBalance || !certificate || !kycStatus?.canDeposit}
                    className="bg-primary hover:bg-primary/90 text-primary-foreground shrink-0"
                  >
                    {isDepositing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Deposit"}
                  </Button>
                </div>
              </div>

              {/* Withdraw */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-foreground flex items-center">
                  <Send className="mr-1.5 h-3.5 w-3.5" />
                  Withdraw BSV
                </h3>
                <div className="flex gap-2">
                  <Input
                    id="withdraw-amount"
                    type="number"
                    placeholder="sats"
                    min="1"
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    className="bg-input border-border"
                  />
                  <Button
                    onClick={handleWithdraw}
                    disabled={isWithdrawing || isLoadingBalance}
                    className="bg-secondary hover:bg-secondary/90 text-secondary-foreground shrink-0"
                  >
                    {isWithdrawing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Withdraw"}
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Swap Interface */}
        <Card className="bg-gradient-card backdrop-blur-lg border-border">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center text-foreground">
              <TrendingUp className="mr-2 h-5 w-5 text-primary" />
              Swap
            </CardTitle>
            <CardDescription>Exchange rate: 1 BSV = ${BSV_USD_RATE} USD</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
              {/* BSV Input */}
              <div className="flex-1 space-y-2">
                <Label htmlFor="swap-bsv">BSV (Satoshis)</Label>
                <div className="p-3 sm:p-4 bg-muted rounded-lg">
                  <Input
                    id="swap-bsv"
                    type="number"
                    placeholder="0"
                    value={swapDirection === "bsv-to-usd" ? swapAmount : swapAmount && !Number.isNaN(Number.parseFloat(swapAmount)) ? Math.floor((Number.parseFloat(swapAmount) / BSV_USD_RATE) * SATOSHIS_PER_BSV).toString() : ""}
                    onChange={(e) => {
                      setSwapAmount(e.target.value)
                      setSwapDirection("bsv-to-usd")
                    }}
                    className="bg-input border-border text-lg font-semibold"
                  />
                  <p className="text-sm text-muted-foreground mt-2">
                    Balance: {bsvBalanceSats.toLocaleString()} sats
                  </p>
                </div>
              </div>

              {/* Swap Button */}
              <div className="flex items-center justify-center py-1 sm:pt-8">
                <Button
                  onClick={toggleSwapDirection}
                  variant="outline"
                  size="icon"
                  className="rounded-full rotate-90 sm:rotate-0"
                >
                  <ArrowDownUp className="h-4 w-4" />
                </Button>
              </div>

              {/* USD Input */}
              <div className="flex-1 space-y-2">
                <Label htmlFor="swap-usd">USD</Label>
                <div className="p-3 sm:p-4 bg-muted rounded-lg">
                  <Input
                    id="swap-usd"
                    type="number"
                    placeholder="0.00000"
                    step="0.00001"
                    value={swapDirection === "usd-to-bsv" ? swapAmount : swapAmount && !Number.isNaN(Number.parseInt(swapAmount, 10)) ? ((Number.parseInt(swapAmount, 10) / SATOSHIS_PER_BSV) * BSV_USD_RATE).toFixed(5) : ""}
                    onChange={(e) => {
                      setSwapAmount(e.target.value)
                      setSwapDirection("usd-to-bsv")
                    }}
                    className="bg-input border-border text-lg font-semibold"
                  />
                  <p className="text-sm text-muted-foreground mt-2">
                    Balance: ${usdBalance.toFixed(5)}
                  </p>
                </div>
              </div>
            </div>

            <Button
              onClick={handleSwap}
              className="w-full mt-4 bg-gradient-primary hover:opacity-90 text-primary-foreground font-semibold"
            >
              Swap {swapDirection === "bsv-to-usd" ? "Sats to USD" : "USD to Sats"}
            </Button>
          </CardContent>
        </Card>

        {/* Certification Company - Get Certificate */}
        <KycCheck
          authFetch={authFetch}
          serverIdentityKey={serverIdentityKey}
          onKycStatusChange={handleKycStatusChange}
        />

        {/* Exchange: Certificate Presentation */}
        <Card className="bg-gradient-card backdrop-blur-lg border-border">
          <CardHeader>
            <CardTitle className="flex items-center text-foreground">
              <ShieldCheck className="mr-2 h-5 w-5 text-primary" />
              Exchange: Certificate Presentation
            </CardTitle>
            <CardDescription>
              Present your Identity Certificate to enable deposits at this exchange.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {certificate ? (
              <div className="p-4 rounded-lg border border-green-200 bg-green-50">
                <div className="flex items-center gap-2 mb-3">
                  <FileCheck className="h-5 w-5 text-green-600" />
                  <span className="font-medium text-green-800">Certificate Loaded</span>
                </div>
                <div className="text-sm text-green-700 space-y-1">
                  <p><strong>Name:</strong> {certificate.fields.officialName}</p>
                  <p><strong>Status:</strong> {certificate.fields.sanctionsStatus === 'clear' ? 'Clear' : 'Sanctioned'}</p>
                  <p><strong>Expires:</strong> {new Date(certificate.fields.expiresAt).toLocaleString()}</p>
                  <p className="text-xs text-green-600 mt-2">
                    Serial: {certificate.fields.serialNumber.slice(0, 8)}...
                  </p>
                </div>
                {certificate.fields.sanctionsStatus === 'matched' && (
                  <div className="mt-3 p-2 rounded bg-red-100 text-red-700 text-sm">
                    Sanctions match detected. Deposits are blocked.
                  </div>
                )}
              </div>
            ) : (
              <div className="p-4 rounded-lg border border-yellow-200 bg-yellow-50">
                <div className="flex items-center gap-2 mb-2">
                  <FileX className="h-5 w-5 text-yellow-600" />
                  <span className="font-medium text-yellow-800">No Certificate Loaded</span>
                </div>
                <p className="text-sm text-yellow-700">
                  Get a certificate from the Certification Company above to enable deposits.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Transaction History */}
        <TransactionHistory authFetch={authFetch} refreshKey={transactionRefreshKey} />
      </div>
    </div>
  );
};
