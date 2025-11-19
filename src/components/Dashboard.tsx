import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowDownUp, LogOut, Wallet, TrendingUp, Send, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { depositPayment, getBalance, withdrawFunds } from "@/lib/api";
import {
  createDepositPayment,
  internalizeWithdrawal,
  bsvToSatoshis,
  satoshisToBsv
} from "@/lib/bsv-wallet";
import { AuthFetch } from "@bsv/sdk";
import { useWallet } from "@/hooks/use-wallet";


interface DashboardProps {
  identityKey: string;
  onDisconnect: () => void;
}

const BSV_USD_RATE = 30;

export const Dashboard = ({ identityKey, onDisconnect }: DashboardProps) => {
  const [bsvBalance, setBsvBalance] = useState(0);
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

  const { wallet } = useWallet();

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
      // Backend stores in satoshis, convert to BSV for display
      setBsvBalance(satoshisToBsv(result.balance));
      setServerIdentityKey(result.identityKey);
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
    
    const amount = Number.parseFloat(depositAmount);
    if (Number.isNaN(amount) || amount <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    setIsDepositing(true);
    try {
      toast.info("Creating deposit transaction...");

      // Convert BSV to satoshis
      const amountSatoshis = bsvToSatoshis(amount);

      // Create the payment transaction
      const paymentToken = await createDepositPayment(
        amountSatoshis,
        serverIdentityKey
      );

      toast.info("Sending deposit to server...");

      // Send to backend
      const result = await depositPayment(paymentToken, authFetch);

      // Update local balance from server response
      setBsvBalance(satoshisToBsv(result.newBalance));
      setDepositAmount("");

      toast.success(
        `Deposited ${amount} BSV (${amountSatoshis} sats)\nTXID: ${result.txid.slice(0, 16)}...`
      );
    } catch (error: any) {
      console.error("Deposit failed:", error);
      toast.error(`Deposit failed: ${error.message}`);
    } finally {
      setIsDepositing(false);
    }
  }, [authFetch])

  const handleWithdraw = useCallback(async () => {
    const amount = Number.parseFloat(withdrawAmount);
    if (Number.isNaN(amount) || amount <= 0 || amount >= 21000000) {
      toast.error("Please enter a valid amount");
      return;
    }
    if (amount > bsvBalance) {
      toast.error("Insufficient BSV balance");
      return;
    }

    setIsWithdrawing(true);
    try {
      toast.info("Creating withdrawal...");

      const amountSatoshis = bsvToSatoshis(amount);

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

      // Update local balance from server response
      setBsvBalance(satoshisToBsv(result.newBalance));
      setWithdrawAmount("");

      toast.success(
        `Withdrawn ${amount} BSV (${amountSatoshis} sats)\nTXID: ${result.txid.slice(0, 16)}...`
      );
    } catch (error: any) {
      console.error("Withdrawal failed:", error);
      toast.error(`Withdrawal failed: ${error.message}`);
    } finally {
      setIsWithdrawing(false);
    }
  }, [authFetch]);

  const handleSwap = () => {
    const amount = Number.parseFloat(swapAmount);
    if (Number.isNaN(amount) || amount <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    if (swapDirection === "bsv-to-usd") {
      if (amount > bsvBalance) {
        toast.error("Insufficient BSV balance");
        return;
      }
      setBsvBalance(prev => prev - amount);
      setUsdBalance(prev => prev + (amount * BSV_USD_RATE));
      toast.success(`Swapped ${amount} BSV for $${(amount * BSV_USD_RATE).toFixed(2)}`);
    } else {
      if (amount > usdBalance) {
        toast.error("Insufficient USD balance");
        return;
      }
      setUsdBalance(prev => prev - amount);
      setBsvBalance(prev => prev + (amount / BSV_USD_RATE));
      toast.success(`Swapped $${amount.toFixed(2)} for ${(amount / BSV_USD_RATE).toFixed(8)} BSV`);
    }
    setSwapAmount("");
  };

  const toggleSwapDirection = () => {
    setSwapDirection(prev => prev === "bsv-to-usd" ? "usd-to-bsv" : "bsv-to-usd");
    setSwapAmount("");
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-4xl font-bold bg-gradient-primary bg-clip-text text-transparent">
              BSV Exchange
            </h1>
            <p className="text-muted-foreground mt-2">
              <Wallet className="inline h-4 w-4 mr-1" />
              {identityKey}
            </p>
          </div>
          <Button onClick={onDisconnect} variant="outline">
            <LogOut className="mr-2 h-4 w-4" />
            Disconnect
              {serverIdentityKey}
          </Button>
        </div>

        {/* Balances */}
        <div className="grid md:grid-cols-2 gap-6">
          <Card className="bg-gradient-card backdrop-blur-lg border-border">
            <CardHeader>
              <CardTitle className="text-foreground">BSV Balance</CardTitle>
              <CardDescription>Bitcoin SV</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingBalance ? (
                <div className="flex items-center space-x-2">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <span className="text-muted-foreground">Loading...</span>
                </div>
              ) : (
                <>
                  <p className="text-4xl font-bold text-primary">{bsvBalance.toFixed(8)}</p>
                  <p className="text-muted-foreground mt-2">
                    ≈ ${(bsvBalance * BSV_USD_RATE).toFixed(2)} USD
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="bg-gradient-card backdrop-blur-lg border-border">
            <CardHeader>
              <CardTitle className="text-foreground">USD Balance</CardTitle>
              <CardDescription>US Dollar</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-4xl font-bold text-secondary">${usdBalance.toFixed(2)}</p>
              <p className="text-muted-foreground mt-2">
                ≈ {(usdBalance / BSV_USD_RATE).toFixed(8)} BSV
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Swap Interface */}
        <Card className="bg-gradient-card backdrop-blur-lg border-border">
          <CardHeader>
            <CardTitle className="flex items-center text-foreground">
              <TrendingUp className="mr-2 h-5 w-5 text-primary" />
              Swap
            </CardTitle>
            <CardDescription>Exchange rate: 1 BSV = ${BSV_USD_RATE} USD</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="swap-amount">Amount</Label>
              <Input
                id="swap-amount"
                type="number"
                placeholder="0.00"
                value={swapAmount}
                onChange={(e) => setSwapAmount(e.target.value)}
                className="bg-input border-border"
              />
            </div>
            
            <div className="flex items-center justify-center">
              <Button
                onClick={toggleSwapDirection}
                variant="outline"
                size="icon"
                className="rounded-full"
              >
                <ArrowDownUp className="h-4 w-4" />
              </Button>
            </div>

            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">
                {swapDirection === "bsv-to-usd" ? "BSV → USD" : "USD → BSV"}
              </p>
              <p className="text-lg font-semibold text-foreground">
                {swapAmount && !Number.isNaN(Number.parseFloat(swapAmount))
                  ? swapDirection === "bsv-to-usd"
                    ? `≈ $${(Number.parseFloat(swapAmount) * BSV_USD_RATE).toFixed(2)} USD`
                    : `≈ ${(Number.parseFloat(swapAmount) / BSV_USD_RATE).toFixed(8)} BSV`
                  : "Enter amount"}
              </p>
            </div>

            <Button
              onClick={handleSwap}
              className="w-full bg-gradient-primary hover:opacity-90 text-primary-foreground font-semibold"
            >
              Swap {swapDirection === "bsv-to-usd" ? "BSV to USD" : "USD to BSV"}
            </Button>
          </CardContent>
        </Card>

        {/* Deposit & Withdraw */}
        <div className="grid md:grid-cols-2 gap-6">
          <Card className="bg-gradient-card backdrop-blur-lg border-border">
            <CardHeader>
              <CardTitle className="text-foreground">Deposit BSV</CardTitle>
              <CardDescription>Add funds to your exchange balance</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="deposit-amount">Amount (BSV)</Label>
                <Input
                  id="deposit-amount"
                  type="number"
                  placeholder="0.00000000"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  className="bg-input border-border"
                />
              </div>
              <Button
                onClick={handleDeposit}
                disabled={isDepositing || isLoadingBalance}
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                {isDepositing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  "Deposit"
                )}
              </Button>
            </CardContent>
          </Card>

          <Card className="bg-gradient-card backdrop-blur-lg border-border">
            <CardHeader>
              <CardTitle className="flex items-center text-foreground">
                <Send className="mr-2 h-5 w-5" />
                Withdraw BSV
              </CardTitle>
              <CardDescription>Send funds back to your wallet</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="withdraw-amount">Amount (BSV)</Label>
                <Input
                  id="withdraw-amount"
                  type="number"
                  placeholder="0.00000000"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  className="bg-input border-border"
                />
              </div>
              <Button
                onClick={handleWithdraw}
                disabled={isWithdrawing || isLoadingBalance}
                className="w-full bg-secondary hover:bg-secondary/90 text-secondary-foreground"
              >
                {isWithdrawing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  "Withdraw"
                )}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};
