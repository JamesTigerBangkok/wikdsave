"use client";

import { useEffect, useState } from "react";
import { ethers } from "ethers";

export default function RankingPage() {
  const [abi, setAbi] = useState<any[]>([]);
  const [contractAddress, setContractAddress] = useState<string>("");
  const [top, setTop] = useState<{ user: string; count: number }[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const [abiJson, addrJson] = await Promise.all([
        fetch("/abi/WildSaveRegistryABI.json").then((r) => r.json()).catch(() => ({ abi: [] })),
        fetch("/abi/WildSaveRegistryAddresses.json").then((r) => r.json()).catch(() => ({})),
      ]);
      setAbi(abiJson.abi ?? []);
      const isLocal = await detectLocal();
      setContractAddress(isLocal ? addrJson.localhost?.address : addrJson.sepolia?.address);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      if (!abi.length || !contractAddress) return;
      setLoading(true);
      try {
        const provider = typeof window !== "undefined" && (window as any).ethereum
          ? new ethers.BrowserProvider((window as any).ethereum)
          : ethers.getDefaultProvider("https://ethereum-sepolia-rpc.publicnode.com");
        const contract = new ethers.Contract(contractAddress, abi, provider);
        const total = Number(await contract.getTotalRescues());
        const n = Math.min(total, 200);
        const map = new Map<string, number>();
        for (let i = total - n; i < total; i++) {
          if (i < 0) continue;
          const r = await contract.getRescue(i);
          const c = map.get(r.rescuer) ?? 0;
          map.set(r.rescuer, c + 1);
        }
        const arr = Array.from(map.entries())
          .map(([user, count]) => ({ user, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 50);
        setTop(arr);
      } catch (e: any) {
        console.error("Ranking load error:", e);
      }
      setLoading(false);
    })();
  }, [abi, contractAddress]);

  return (
    <div className="space-y-6">
      <div className="glass-card p-8">
        <h1 className="text-4xl font-bold text-green-900 mb-2">🏆 Contributor Rankings</h1>
        <p className="text-green-800">
          Top volunteers ranked by rescue count (based on recent 200 records). The more you contribute, the higher you rank!
        </p>
      </div>

      {loading && (
        <div className="glass-card p-12 text-center">
          <div className="text-2xl text-green-800">⏳ Loading rankings...</div>
        </div>
      )}

      {!loading && top.length === 0 && (
        <div className="glass-card p-12 text-center">
          <div className="text-2xl text-green-800 mb-4">📭 No contributors yet</div>
          <p className="text-green-700">Be the first to register a rescue!</p>
        </div>
      )}

      {!loading && top.length > 0 && (
        <div className="glass-card p-8">
          <div className="space-y-4">
            {top.map((t, i) => (
              <div
                key={t.user}
                className="flex items-center justify-between p-4 bg-white/40 rounded-lg hover:bg-white/60 transition-all"
              >
                <div className="flex items-center gap-4">
                  <div
                    className={`text-3xl font-bold ${
                      i === 0
                        ? "text-yellow-600"
                        : i === 1
                        ? "text-gray-500"
                        : i === 2
                        ? "text-orange-600"
                        : "text-green-700"
                    }`}
                  >
                    {i === 0 && "🥇"}
                    {i === 1 && "🥈"}
                    {i === 2 && "🥉"}
                    {i > 2 && `#${i + 1}`}
                  </div>
                  <div>
                    <div className="font-mono text-green-900 font-semibold">
                      {t.user.slice(0, 6)}...{t.user.slice(-4)}
                    </div>
                    <div className="text-xs text-green-700">Contributor</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-green-800">{t.count}</div>
                  <div className="text-xs text-green-700">Rescues</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="glass-card p-6">
        <h3 className="text-xl font-bold text-green-900 mb-3">🎖️ Earn Badges & Rewards</h3>
        <p className="text-green-800 mb-4">
          Reach milestones to unlock special NFT badges:
        </p>
        <div className="space-y-2 text-green-800">
          <div>🥉 <strong>Beginner:</strong> 1-4 rescues</div>
          <div>🥈 <strong>Intermediate:</strong> 5-19 rescues</div>
          <div>🥇 <strong>Expert:</strong> 20+ rescues</div>
        </div>
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
