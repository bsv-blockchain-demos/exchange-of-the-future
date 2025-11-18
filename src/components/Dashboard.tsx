import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowDownUp, LogOut, Wallet, TrendingUp, Send } from "lucide-react";
import { toast } from "sonner";

interface DashboardProps {
  publicKey: string;
  onDisconnect: () => void;
}

const BSV_USD_RATE = 30;

export const Dashboard = ({ publicKey, onDisconnect }: DashboardProps) => {
  const [bsvBalance, setBsvBalance] = useState(0);
  const [usdBalance, setUsdBalance] = useState(0);
  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [swapAmount, setSwapAmount] = useState("");
  const [swapDirection, setSwapDirection] = useState<"bsv-to-usd" | "usd-to-bsv">("bsv-to-usd");

  const truncatedKey = `${publicKey.slice(0, 8)}...${publicKey.slice(-8)}`;

  const handleDeposit = () => {
    const amount = parseFloat(depositAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }
    setBsvBalance(prev => prev + amount);
    setDepositAmount("");
    toast.success(`Deposited ${amount} BSV`);
  };

  const handleWithdraw = () => {
    const amount = parseFloat(withdrawAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }
    if (amount > bsvBalance) {
      toast.error("Insufficient BSV balance");
      return;
    }
    setBsvBalance(prev => prev - amount);
    setWithdrawAmount("");
    toast.success(`Withdrawn ${amount} BSV`);
  };

  const handleSwap = () => {
    const amount = parseFloat(swapAmount);
    if (isNaN(amount) || amount <= 0) {
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
              {truncatedKey}
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
              <CardDescription>Bitcoin SV</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-4xl font-bold text-primary">{bsvBalance.toFixed(8)}</p>
              <p className="text-muted-foreground mt-2">
                ≈ ${(bsvBalance * BSV_USD_RATE).toFixed(2)} USD
              </p>
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
                {swapAmount && !isNaN(parseFloat(swapAmount))
                  ? swapDirection === "bsv-to-usd"
                    ? `≈ $${(parseFloat(swapAmount) * BSV_USD_RATE).toFixed(2)} USD`
                    : `≈ ${(parseFloat(swapAmount) / BSV_USD_RATE).toFixed(8)} BSV`
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
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                Deposit
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
                className="w-full bg-secondary hover:bg-secondary/90 text-secondary-foreground"
              >
                Withdraw
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};
