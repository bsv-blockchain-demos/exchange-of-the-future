import { Button } from "@/components/ui/button";
import { Wallet } from "lucide-react";

interface WalletConnectProps {
  onConnect: () => void;
}

export const WalletConnect = ({ onConnect }: WalletConnectProps) => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-8 p-8">
        <div className="space-y-4">
          <h1 className="text-6xl font-bold bg-gradient-primary bg-clip-text text-transparent">
            Superfast Exchange
          </h1>
          <p className="text-xl text-muted-foreground">
            Trade BSV using Direct Instant Payments.
          </p>
        </div>
        
        <div className="flex justify-center">
          <Button
            onClick={onConnect}
            size="lg"
            className="bg-gradient-primary hover:opacity-90 text-primary-foreground font-semibold px-8 py-6 text-lg shadow-glow transition-all hover:scale-105"
          >
            <Wallet className="mr-2 h-6 w-6" />
            Connect Wallet
          </Button>
        </div>
        
        <p className="text-sm text-muted-foreground mt-8">
          Powered by BSV Blockchain
        </p>
      </div>
    </div>
  );
};
