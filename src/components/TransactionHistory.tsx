import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowDownToLine, ArrowUpFromLine, History, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getTransactions, Transaction } from "@/lib/api";
import { AuthFetch } from "@bsv/sdk";
import { toast } from "sonner";

interface TransactionHistoryProps {
  authFetch: AuthFetch | null;
}

export const TransactionHistory = ({ authFetch }: TransactionHistoryProps) => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (authFetch) {
      loadTransactions();
    }
  }, [authFetch]);

  const loadTransactions = async () => {
    if (!authFetch) return;

    try {
      setIsLoading(true);
      const result = await getTransactions(authFetch);
      setTransactions(result.transactions);
    } catch (error: any) {
      console.error("Failed to load transactions:", error);
      toast.error("Failed to load transaction history");
    } finally {
      setIsLoading(false);
    }
  };

  const formatTxid = (txid: string) => {
    if (!txid) return "N/A";
    return `${txid.slice(0, 8)}...${txid.slice(-8)}`;
  };

  const formatCounterparty = (counterparty: string) => {
    if (!counterparty) return "N/A";
    return `${counterparty.slice(0, 8)}...${counterparty.slice(-8)}`;
  };

  return (
    <Card className="bg-gradient-card backdrop-blur-lg border-border">
      <CardHeader>
        <CardTitle className="flex items-center text-foreground">
          <History className="mr-2 h-5 w-5 text-primary" />
          Transaction History
        </CardTitle>
        <CardDescription>Recent deposits and withdrawals</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-2 text-muted-foreground">Loading transactions...</span>
          </div>
        ) : transactions.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No transactions yet
          </div>
        ) : (
          <div className="rounded-md border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>TXID</TableHead>
                  <TableHead>Counterparty</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Direction</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((tx) => (
                  <TableRow key={tx.txid}>
                    <TableCell className="font-mono text-sm">
                      {formatTxid(tx.txid)}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {formatCounterparty(tx.counterparty)}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {tx.amount.toLocaleString()} sats
                    </TableCell>
                    <TableCell>
                      {tx.direction === 'deposit' ? (
                        <Badge variant="default" className="bg-green-500/20 text-green-500 hover:bg-green-500/30">
                          <ArrowDownToLine className="mr-1 h-3 w-3" />
                          Deposit
                        </Badge>
                      ) : tx.direction === 'withdrawal' ? (
                        <Badge variant="default" className="bg-blue-500/20 text-blue-500 hover:bg-blue-500/30">
                          <ArrowUpFromLine className="mr-1 h-3 w-3" />
                          Withdrawal
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Unknown</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
