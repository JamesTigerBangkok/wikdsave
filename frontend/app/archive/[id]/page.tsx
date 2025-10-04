"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ethers } from "ethers";

export default function ArchiveDetailPage() {
  const params = useParams();
  const id = Number(params?.id);
  const [abi, setAbi] = useState<any[]>([]);
  const [contractAddress, setContractAddress] = useState<string>("");
  const [item, setItem] = useState<any | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [txHash, setTxHash] = useState<string | undefined>(undefined);
  const [revealed, setRevealed] = useState(false);
  const [animalTitle, setAnimalTitle] = useState<string>("");
  const [status, setStatus] = useState<"idle" | "signing" | "waiting" | "done" | "error">("idle");

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

  // 初始不主动读取详情，待合约交互完成后再加载
  useEffect(() => {
    (async () => {
      if (!contractAddress || !abi.length || Number.isNaN(id)) return;
      try {
        const provider = typeof window !== "undefined" && (window as any).ethereum
          ? new ethers.BrowserProvider((window as any).ethereum)
          : ethers.getDefaultProvider("https://ethereum-sepolia-rpc.publicnode.com");
        const contract = new ethers.Contract(contractAddress, abi, provider);
        const r = await contract.getRescue(id);
        const name = (r as any)?.animal ?? (r as any)?.[0] ?? "";
        setAnimalTitle(String(name));
      } catch {}
    })();
  }, [contractAddress, abi, id]);

  const revealViaContract = async () => {
    // 触发一笔最小的合约交互交易以展示签名过程（调用一个读取相关的轻量函数）
    try {
      setStatus("signing");
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(contractAddress, abi, signer);
      const tx = await (contract as any).contributorTier(5, 20);
      setStatus("waiting");
      setTxHash(tx.hash);
      await tx.wait();
      // 交易完成后刷新详情
      const r = await contract.getRescue(id);
      const mapped = {
        id,
        animal: (r as any)?.animal ?? (r as any)?.[0],
        location: (r as any)?.location ?? (r as any)?.[1],
        description: (r as any)?.description ?? (r as any)?.[2],
        imageHash: (r as any)?.imageHash ?? (r as any)?.[3],
        rescuer: (r as any)?.rescuer ?? (r as any)?.[4],
        timestamp: (r as any)?.timestamp ?? (r as any)?.[5],
        latitude: (r as any)?.latitude ?? (r as any)?.[6],
        longitude: (r as any)?.longitude ?? (r as any)?.[7],
      };
      setItem(mapped);
      setRevealed(true);
      setStatus("done");
    } catch (e: any) {
      setStatus("error");
      alert("Contract interaction failed: " + e.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="glass-card p-8">
        <h1 className="text-3xl font-bold text-green-900">Rescue #{id}</h1>
      </div>

      {loading && (
        <div className="glass-card p-12 text-center">
          <div className="text-2xl text-green-800">⏳ Loading...</div>
        </div>
      )}

      {revealed && item && (
        <div className="glass-card p-8 space-y-4">
          <div className="text-xl font-bold text-green-900">🦁 {item.animal}</div>
          <div className="text-green-800">📍 {item.location}</div>
          <div className="text-green-800">Rescuer: {(item as any)?.rescuer ?? (item as any)?.[4] ?? '-'}</div>
          <div className="text-green-800">Time: {formatTs(item.timestamp)}</div>
          {item.description && <p className="text-green-800">{item.description}</p>}
          {item.imageHash && (
            <div className="text-green-800 break-all">
              Image: {item.imageHash}
            </div>
          )}

          <div className="pt-4">
            <button onClick={revealViaContract} className="btn-primary" disabled={status !== "idle" && status !== "error"}>
              {status === "idle" && "🔏 Reveal via Contract (sign & show)"}
              {status === "signing" && "✍️ Signing..."}
              {status === "waiting" && "⏳ Waiting confirmation..."}
              {status === "done" && "✅ Completed"}
              {status === "error" && "🔁 Retry reveal"}
            </button>
          </div>

          {txHash && (
            <div className="text-sm text-green-800 break-all">Tx: {txHash}</div>
          )}
        </div>
      )}
      {!revealed && (
        <div className="glass-card p-8 space-y-4">
          <div className="text-xl font-bold text-green-900">🦁 {animalTitle || "Animal Name"}</div>
          <button onClick={revealViaContract} className="btn-primary" disabled={status !== "idle" && status !== "error"}>
            {status === "idle" && "🔏 Reveal via Contract (sign & show)"}
            {status === "signing" && "✍️ Signing..."}
            {status === "waiting" && "⏳ Waiting confirmation..."}
            {status === "done" && "✅ Completed"}
            {status === "error" && "🔁 Retry reveal"}
          </button>
          {txHash && (
            <div className="text-sm text-green-800 break-all">Tx: {txHash}</div>
          )}
        </div>
      )}
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


