"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

declare global {
  interface Window { ethereum?: any }
}

export default function Navbar() {
  const pathname = usePathname();
  const isActive = (path: string) => pathname === path;

  const [account, setAccount] = useState<string | undefined>(undefined);
  const [chainId, setChainId] = useState<string | undefined>(undefined);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    if (!window.ethereum) return;

    const load = async () => {
      try {
        const [cid, accs] = await Promise.all([
          window.ethereum.request({ method: "eth_chainId" }).catch(() => undefined),
          window.ethereum.request({ method: "eth_accounts" }).catch(() => []),
        ]);
        setChainId(cid);
        if (Array.isArray(accs) && accs.length > 0) setAccount(accs[0]);
      } catch {}
    };

    load();

    const onAccountsChanged = (accs: string[]) => setAccount(accs?.[0]);
    const onChainChanged = (cid: string) => setChainId(cid);

    window.ethereum.on?.("accountsChanged", onAccountsChanged);
    window.ethereum.on?.("chainChanged", onChainChanged);
    return () => {
      window.ethereum?.removeListener?.("accountsChanged", onAccountsChanged);
      window.ethereum?.removeListener?.("chainChanged", onChainChanged);
    };
  }, []);

  const connect = async () => {
    if (!window.ethereum) {
      window.open("https://metamask.io/download/", "_blank");
      return;
    }
    setConnecting(true);
    try {
      const accs = await window.ethereum.request({ method: "eth_requestAccounts" });
      if (Array.isArray(accs) && accs.length > 0) setAccount(accs[0]);
      const cid = await window.ethereum.request({ method: "eth_chainId" });
      setChainId(cid);
    } catch (e) {}
    setConnecting(false);
  };

  const short = (addr?: string) => (addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : "");
  const shortChain = (cid?: string) => (cid ? parseInt(cid, 16) : undefined);

  return (
    <nav className="glass-card mx-auto max-w-7xl my-6 px-8 py-4">
      <div className="flex items-center justify-between gap-4">
        <Link href="/" className="text-2xl font-bold text-green-800 flex items-center gap-2">
          🐾 WildSave
        </Link>
        
        <div className="flex items-center gap-6">
          <Link 
            href="/" 
            className={`px-4 py-2 rounded-lg transition-all ${
              isActive("/") 
                ? "bg-green-600 text-white font-semibold" 
                : "text-green-800 hover:bg-white/30"
            }`}
          >
            Home
          </Link>
          <Link 
            href="/submit" 
            className={`px-4 py-2 rounded-lg transition-all ${
              isActive("/submit") 
                ? "bg-green-600 text-white font-semibold" 
                : "text-green-800 hover:bg-white/30"
            }`}
          >
            Submit Rescue
          </Link>
          <Link 
            href="/archive" 
            className={`px-4 py-2 rounded-lg transition-all ${
              isActive("/archive") 
                ? "bg-green-600 text-white font-semibold" 
                : "text-green-800 hover:bg-white/30"
            }`}
          >
            Archive
          </Link>
          <Link 
            href="/my" 
            className={`px-4 py-2 rounded-lg transition-all ${
              isActive("/my") 
                ? "bg-green-600 text-white font-semibold" 
                : "text-green-800 hover:bg-white/30"
            }`}
          >
            My Rescues
          </Link>
          <Link 
            href="/ranking" 
            className={`px-4 py-2 rounded-lg transition-all ${
              isActive("/ranking") 
                ? "bg-green-600 text-white font-semibold" 
                : "text-green-800 hover:bg-white/30"
            }`}
          >
            Rankings
          </Link>

          {!account ? (
            <button onClick={connect} className="btn-primary">
              {connecting ? "Connecting..." : "🦊 Connect Wallet"}
            </button>
          ) : (
            <div className="px-4 py-2 rounded-lg bg-white/60 border border-white/70 text-green-900 font-semibold">
              {short(account)} {shortChain(chainId) ? `(Chain ${shortChain(chainId)})` : ""}
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
