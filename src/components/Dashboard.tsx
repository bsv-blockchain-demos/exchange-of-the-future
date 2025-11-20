import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowDownUp, LogOut, Wallet, TrendingUp, Send, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { depositPayment, getBalance, withdrawFunds, swapFunds } from "@/lib/api";
import {
  createDepositPayment,
  internalizeWithdrawal
} from "@/lib/bsv-wallet";
import { AuthFetch } from "@bsv/sdk";
import { useWallet } from "@/hooks/use-wallet";
import { TransactionHistory } from "@/components/TransactionHistory";


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

      toast.info("Sending deposit to server...");

      // Send to backend
      const result = await depositPayment(paymentToken, authFetch);

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
          </Button>
        </div>

        {/* Balances */}
        <div className="grid md:grid-cols-2 gap-6">
          <Card className="bg-gradient-card backdrop-blur-lg border-border">
            <CardHeader>
              <CardTitle className="text-foreground">BSV Balance</CardTitle>
              <CardDescription>Bitcoin SV (in satoshis)</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingBalance ? (
                <div className="flex items-center space-x-2">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <span className="text-muted-foreground">Loading...</span>
                </div>
              ) : (
                <>
                  <p className="text-4xl font-bold text-primary">{bsvBalanceSats.toLocaleString()} sats</p>
                  <p className="text-muted-foreground mt-2">
                    ≈ ${((bsvBalanceSats / SATOSHIS_PER_BSV) * BSV_USD_RATE).toFixed(5)} USD
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
              <p className="text-4xl font-bold text-secondary">${usdBalance.toFixed(5)}</p>
              <p className="text-muted-foreground mt-2">
                ≈ {Math.floor((usdBalance / BSV_USD_RATE) * SATOSHIS_PER_BSV).toLocaleString()} sats
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
          <CardContent>
            <div className="flex items-center gap-4">
              {/* BSV Input */}
              <div className="flex-1 space-y-2">
                <Label htmlFor="swap-bsv">BSV (Satoshis)</Label>
                <div className="p-4 bg-muted rounded-lg">
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
              <div className="flex flex-col items-center gap-2 pt-8">
                <Button
                  onClick={toggleSwapDirection}
                  variant="outline"
                  size="icon"
                  className="rounded-full"
                >
                  <ArrowDownUp className="h-4 w-4" />
                </Button>
              </div>

              {/* USD Input */}
              <div className="flex-1 space-y-2">
                <Label htmlFor="swap-usd">USD</Label>
                <div className="p-4 bg-muted rounded-lg">
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

        {/* Deposit & Withdraw */}
        <div className="grid md:grid-cols-2 gap-6">
          <Card className="bg-gradient-card backdrop-blur-lg border-border">
            <CardHeader>
              <CardTitle className="text-foreground">Deposit BSV</CardTitle>
              <CardDescription>Add funds to your exchange balance (1-1000 satoshis)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="deposit-amount">Amount (satoshis)</Label>
                <Input
                  id="deposit-amount"
                  type="number"
                  placeholder="100"
                  min="1"
                  max="1000"
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
              <CardDescription>Send funds back to your wallet (in satoshis)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="withdraw-amount">Amount (satoshis)</Label>
                <Input
                  id="withdraw-amount"
                  type="number"
                  placeholder="100"
                  min="1"
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

        {/* Transaction History */}
        <TransactionHistory authFetch={authFetch} refreshKey={transactionRefreshKey} />
      </div>
    </div>
  );
};
