"use client";

import { useEffect, useState } from "react";
import { ethers } from "ethers";

export default function ArchivePage() {
  const [abi, setAbi] = useState<any[]>([]);
  const [contractAddress, setContractAddress] = useState<string>("");
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const [abiJson, addrJson] = await Promise.all([
        fetch("/abi/WildSaveRegistryABI.json").then((r) => r.json()).catch(() => ({ abi: [] })),
        fetch("/abi/WildSaveRegistryAddresses.json").then((r) => r.json()).catch(() => ({})),
      ]);
      setAbi(abiJson.abi ?? []);

      const isLocal = await detectLocal();
      const address = isLocal ? addrJson.localhost?.address : addrJson.sepolia?.address;
      if (address) setContractAddress(address);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      if (!contractAddress || !abi.length) return;
      setLoading(true);
      try {
        const provider = typeof window !== "undefined" && (window as any).ethereum
          ? new ethers.BrowserProvider((window as any).ethereum)
          : ethers.getDefaultProvider("https://ethereum-sepolia-rpc.publicnode.com");
        const contract = new ethers.Contract(contractAddress, abi, provider);
        const total = Number(await contract.getTotalRescues());
        const acc: any[] = [];
        const start = Math.max(0, total - 50);
        for (let i = start; i < total; i++) {
          const r = await contract.getRescue(i);
          acc.push({ id: i, ...r });
        }
        acc.reverse();
        setItems(acc);
      } catch (e: any) {
        console.error("Load archive error:", e);
      }
      setLoading(false);
    })();
  }, [contractAddress, abi]);

  return (
    <div className="space-y-6">
      <div className="glass-card p-8">
        <h1 className="text-4xl font-bold text-green-900 mb-2">🗂️ Rescue Archive</h1>
        <p className="text-green-800">
          Browse the most recent wildlife rescue records stored on-chain. Each entry is immutable and backed by an NFT.
        </p>
      </div>

      {loading && (
        <div className="glass-card p-12 text-center">
          <div className="text-2xl text-green-800">⏳ Loading records...</div>
        </div>
      )}

      {!loading && items.length === 0 && (
        <div className="glass-card p-12 text-center">
          <div className="text-2xl text-green-800 mb-4">📭 No records yet</div>
          <p className="text-green-700">Be the first to register a rescue!</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {items.map((it) => (
          <a key={it.id} href={`/archive/${it.id}`} className="glass-card p-6 space-y-3 block hover:shadow-lg transition-shadow">
            <div className="flex items-start justify-between">
              <div className="text-2xl font-bold text-green-900">#{it.id}</div>
              <div className="text-xs bg-green-200 text-green-900 px-3 py-1 rounded-full font-semibold">
                NFT
              </div>
            </div>

            <div>
              <div className="text-lg font-bold text-green-900 mb-1">🦁 {it.animal}</div>
              <div className="text-sm text-green-800">📍 {it.location}</div>
            </div>

            {it.description && (
              <p className="text-sm text-green-700 line-clamp-2">{it.description}</p>
            )}

            <div className="pt-3 border-t border-white/30 space-y-1">
              <div className="text-xs text-green-800">
                <span className="font-semibold">Rescuer:</span> {it.rescuer?.slice(0, 6)}...{it.rescuer?.slice(-4)}
              </div>
              <div className="text-xs text-green-800">
                <span className="font-semibold">Time:</span> {formatTs(it.timestamp)}
              </div>
              <div className="text-xs text-green-800 break-all">
                <span className="font-semibold">Image:</span> {it.imageHash}
              </div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

async function detectLocal(): Promise<boolean> {
  if (typeof window !== "undefined" && window.location.hostname !== "localhost") return false;
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
  } catch { return false; }
}

function formatTs(ts: any) {
  try {
    const n = typeof ts === 'bigint' ? Number(ts) : Number(ts);
    if (!Number.isFinite(n)) return 'Invalid Date';
    return new Date(n * 1000).toLocaleString();
  } catch { return 'Invalid Date'; }
}
