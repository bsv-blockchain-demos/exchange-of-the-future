import { useState } from "react";
import { WalletConnect } from "@/components/WalletConnect";
import { Dashboard } from "@/components/Dashboard";
import { toast } from "sonner";
import { useWallet } from "@/hooks/use-wallet";

const Index = () => {
  const [identityKey, setIdentityKey] = useState("");
  const { wallet } = useWallet();

  const handleConnect = async () => {
    try {
      if (!wallet) {
        throw new Error("No wallet available");
      }
      const { publicKey } = await wallet.getPublicKey({ identityKey: true });
      setIdentityKey(publicKey);
      toast.success("Wallet connected successfully!");
    } catch (error) {
      console.error("Failed to connect wallet:", error);
      toast.error("Failed to connect wallet. Please try again.");
    }
  };

  const handleDisconnect = () => {
    setIdentityKey("");
    toast.info("Wallet disconnected");
  };

  if (!identityKey) {
    return <WalletConnect onConnect={handleConnect} />;
  }

  return <Dashboard identityKey={identityKey} onDisconnect={handleDisconnect} />;
};

export default Index;
