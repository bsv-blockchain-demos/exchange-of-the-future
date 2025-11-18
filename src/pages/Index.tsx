import { useState } from "react";
import { WalletConnect } from "@/components/WalletConnect";
import { Dashboard } from "@/components/Dashboard";
import { toast } from "sonner";

const Index = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [publicKey, setPublicKey] = useState("");

  const handleConnect = async () => {
    try {
      // @ts-ignore - BSV SDK types
      const { WalletClient } = await import("@bsv/sdk");
      const wallet = new WalletClient();
      const result = await wallet.getPublicKey({ identityKey: true });
      setPublicKey(result.publicKey);
      setIsConnected(true);
      toast.success("Wallet connected successfully!");
    } catch (error) {
      console.error("Failed to connect wallet:", error);
      toast.error("Failed to connect wallet. Please try again.");
    }
  };

  const handleDisconnect = () => {
    setIsConnected(false);
    setPublicKey("");
    toast.info("Wallet disconnected");
  };

  if (!isConnected) {
    return <WalletConnect onConnect={handleConnect} />;
  }

  return <Dashboard publicKey={publicKey} onDisconnect={handleDisconnect} />;
};

export default Index;
