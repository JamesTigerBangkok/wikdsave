"use client";

import { useEffect, useState } from "react";
import { ethers } from "ethers";
import Link from "next/link";

export default function Home() {
  const [abi, setAbi] = useState<any[]>([]);
  const [contractAddress, setContractAddress] = useState<string>("");
  const [encTotal, setEncTotal] = useState<string | null>(null);
  const [clearTotal, setClearTotal] = useState<string | null>(null);
  const [totalRescues, setTotalRescues] = useState<string>("...");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const [abiJson, addrJson] = await Promise.all([
        fetch("/abi/WildSaveRegistryABI.json").then((r) => r.json()).catch(() => ({ abi: [] })),
        fetch("/abi/WildSaveRegistryAddresses.json").then((r) => r.json()).catch(() => ({})),
      ]);
      setAbi(abiJson.abi ?? []);
      const isLocal = await detectLocal();
      const addr = isLocal ? addrJson.localhost?.address : addrJson.sepolia?.address;
      setContractAddress(addr ?? "");

      // Fetch public total
      if (addr && abiJson.abi?.length) {
        try {
          const provider = ethers.getDefaultProvider("https://ethereum-sepolia-rpc.publicnode.com");
          const contract = new ethers.Contract(addr, abiJson.abi, provider);
          const total = await contract.getTotalRescues();
          setTotalRescues(total.toString());
        } catch {}
      }
    })();
  }, []);

  const fetchEncTotal = async () => {
    if (!abi.length || !contractAddress) return;
    setLoading(true);
    try {
      const provider = typeof window !== "undefined" && (window as any).ethereum
        ? new ethers.BrowserProvider((window as any).ethereum)
        : ethers.getDefaultProvider();
      const contract = new ethers.Contract(contractAddress, abi, provider);
      const h = await contract.getEncryptedTotal();
      setEncTotal(h);
    } catch (e: any) {
      alert("Error: " + e.message);
    }
    setLoading(false);
  };

  const decryptTotal = async () => {
    if (!encTotal || !contractAddress) return;
    setLoading(true);
    try {
      const res = await fetch("http://localhost:8545", { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "web3_clientVersion", params: [] }) });
      const data = await res.json();
      if (data?.result?.toLowerCase?.().includes("hardhat")) {
        const { MockFhevmInstance } = await import("@fhevm/mock-utils");
        const mock = await MockFhevmInstance.create({ rpcUrl: "http://localhost:8545" });
        const v = await mock.decryptPublic(contractAddress, encTotal);
        setClearTotal(v?.toString?.() ?? String(v));
        setLoading(false);
        return;
      }
    } catch {}

    await loadRelayerSDK();
    await window.relayerSDK.initSDK();
    const instance = await window.relayerSDK.createInstance({ ...window.relayerSDK.SepoliaConfig, network: window.ethereum });
    const v = await instance.decryptPublic(contractAddress, encTotal);
    setClearTotal(v?.toString?.() ?? String(v));
    setLoading(false);
  };

  return (
    <div className="space-y-8">
      {/* Hero Section */}
      <div className="glass-card p-12 text-center">
        <h1 className="text-5xl font-bold text-green-900 mb-4">
          🌍 WildSave
        </h1>
        <p className="text-2xl text-green-800 mb-2">Wildlife Rescue On-Chain Registry</p>
        <p className="text-lg text-green-700 mb-8">
          Every rescue action leaves a permanent mark on the blockchain.
        </p>
        <div className="flex gap-4 justify-center">
          <Link href="/submit" className="btn-primary">
            📝 Register a Rescue
          </Link>
          <Link href="/archive" className="btn-secondary">
            🗂️ View Archive
          </Link>
        </div>
      </div>

      {/* Stats Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="glass-card p-6 text-center">
          <div className="text-4xl font-bold text-green-700 mb-2">{totalRescues}</div>
          <div className="text-green-800 font-semibold">Total Rescues</div>
        </div>
        
        <div className="glass-card p-6 text-center">
          <div className="text-4xl font-bold text-green-700 mb-2">🔐</div>
          <div className="text-green-800 font-semibold">FHE Encrypted</div>
        </div>
        
        <div className="glass-card p-6 text-center">
          <div className="text-4xl font-bold text-green-700 mb-2">♾️</div>
          <div className="text-green-800 font-semibold">Immutable Records</div>
        </div>
      </div>

      {/* Encrypted Total Demo */}
      <div className="glass-card p-8">
        <h2 className="text-2xl font-bold text-green-900 mb-4">🔓 FHE Decryption Demo</h2>
        <p className="text-green-800 mb-6">
          The platform stores an encrypted total count using FHEVM. Click below to fetch and decrypt it.
        </p>
        
        <div className="flex flex-wrap gap-4 mb-6">
          <button onClick={fetchEncTotal} disabled={loading} className="btn-primary">
            {loading ? "Loading..." : "Fetch Encrypted Handle"}
          </button>
          <button onClick={decryptTotal} disabled={!encTotal || loading} className="btn-secondary">
            {loading ? "Decrypting..." : "Decrypt Total"}
          </button>
        </div>

        <div className="space-y-3 bg-white/50 rounded-lg p-4">
          <div>
            <span className="font-semibold text-green-800">Encrypted Handle:</span>
            <div className="text-sm text-gray-700 break-all">{encTotal ?? "-"}</div>
          </div>
          <div>
            <span className="font-semibold text-green-800">Decrypted Value:</span>
            <div className="text-2xl font-bold text-green-700">{clearTotal ?? "-"}</div>
          </div>
        </div>
      </div>

      {/* Features */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="glass-card p-6">
          <div className="text-3xl mb-3">🦉</div>
          <h3 className="text-xl font-bold text-green-900 mb-2">Rescue Registry</h3>
          <p className="text-green-800">
            Submit rescue actions with animal name, location, description, and image CID. Each record mints an NFT.
          </p>
        </div>

        <div className="glass-card p-6">
          <div className="text-3xl mb-3">🔒</div>
          <h3 className="text-xl font-bold text-green-900 mb-2">Privacy by FHE</h3>
          <p className="text-green-800">
            User contribution counts and timestamps are encrypted using FHEVM, enabling on-chain computation without exposure.
          </p>
        </div>

        <div className="glass-card p-6">
          <div className="text-3xl mb-3">🏆</div>
          <h3 className="text-xl font-bold text-green-900 mb-2">Contributor Rankings</h3>
          <p className="text-green-800">
            Top volunteers are ranked based on rescue counts. Earn badges and NFT rewards for your contributions.
          </p>
        </div>

        <div className="glass-card p-6">
          <div className="text-3xl mb-3">🌐</div>
          <h3 className="text-xl font-bold text-green-900 mb-2">Global Archive</h3>
          <p className="text-green-800">
            Browse all rescue records with filters by species, location, and time. View on an interactive map.
          </p>
        </div>
      </div>
    </div>
  );
}

async function detectLocal(): Promise<boolean> {
  // Skip local detection in production/testnet
  if (typeof window !== "undefined" && window.location.hostname !== "localhost") {
    return false;
  }
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 500);
    const res = await fetch("http://localhost:8545", {
      method: "POST",
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "web3_clientVersion", params: [] }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    const data = await res.json();
    return data?.result?.toLowerCase?.().includes("hardhat");
  } catch {
    return false;
  }
}

async function loadRelayerSDK() {
  if (typeof window === "undefined") return;
  if ((window as any).relayerSDK) return;
  await new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.zama.ai/relayer-sdk-js/0.2.0/relayer-sdk-js.umd.cjs";
    s.type = "text/javascript";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load relayer-sdk"));
    document.head.appendChild(s);
  });
}
