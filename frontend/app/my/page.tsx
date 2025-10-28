"use client";

import { useEffect, useState } from "react";
import { ethers } from "ethers";
import { ensureRelayerInstance, loadOrCreateUserDecryptSignature, userDecryptHandles } from "../lib/userDecrypt";

export default function MyPage() {
  const [abi, setAbi] = useState<any[]>([]);
  const [contractAddress, setContractAddress] = useState<string>("");
  const [account, setAccount] = useState<string>("");
  const [ids, setIds] = useState<number[]>([]);
  const [countClear, setCountClear] = useState<string | undefined>(undefined);
  const [isAtLeast, setIsAtLeast] = useState<string | undefined>(undefined);
  const [tierClear, setTierClear] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [claimed, setClaimed] = useState<{ b: boolean; i: boolean; e: boolean }>({ b: false, i: false, e: false });
  const [hasEthereum, setHasEthereum] = useState(false);

  const storageKey = (addr: string) => `wildsave:badge:${addr.toLowerCase()}`;

  const resetDecryptSignature = () => {
    try {
      if (typeof window !== "undefined") {
        Object.keys(localStorage)
          .filter((k) => k.startsWith("fhevm:userDecrypt:"))
          .forEach((k) => localStorage.removeItem(k));
      }
      // 清空已显示的结果，下一次将触发重新签名
      setCountClear(undefined);
      setIsAtLeast(undefined);
      setTierClear(undefined);
      alert("Cleared cached FHE user-decrypt signature. Next decrypt will re-sign.");
    } catch (e: any) {
      alert("Failed to clear cache: " + e.message);
    }
  };

  useEffect(() => {
    setHasEthereum(typeof window !== "undefined" && !!(window as any).ethereum);
    (async () => {
      const [abiJson, addrJson] = await Promise.all([
        fetch("abi/WildSaveRegistryABI.json").then((r) => r.json()).catch(() => ({ abi: [] })),
        fetch("abi/WildSaveRegistryAddresses.json").then((r) => r.json()).catch(() => ({})),
      ]);
      setAbi(abiJson.abi ?? []);
      const isLocal = await detectLocal();
      setContractAddress(isLocal ? addrJson.localhost?.address : addrJson.sepolia?.address);
    })();
  }, []);

  // Detect pre-connected wallet and listen for changes
  useEffect(() => {
    if (!window?.ethereum) return;

    const load = async () => {
      try {
        const accs = await window.ethereum.request({ method: "eth_accounts" }).catch(() => []);
        if (Array.isArray(accs) && accs.length > 0) setAccount(accs[0]);
      } catch {}
    };

    load();

    const onAccountsChanged = (accs: string[]) => {
      if (Array.isArray(accs) && accs.length > 0) setAccount(accs[0]);
      else setAccount("");
    };
    window.ethereum.on?.("accountsChanged", onAccountsChanged);
    return () => window.ethereum?.removeListener?.("accountsChanged", onAccountsChanged);
  }, []);

  const connect = async () => {
    if (!window.ethereum) return alert("Please install MetaMask");
    const [addr] = await window.ethereum.request({ method: "eth_requestAccounts" });
    setAccount(addr);
    try {
      const raw = localStorage.getItem(storageKey(addr));
      if (raw) setClaimed(JSON.parse(raw));
      else setClaimed({ b: false, i: false, e: false });
    } catch {}
  };

  const load = async () => {
    if (!abi.length || !contractAddress || !account) return;
    setLoading(true);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const contract = new ethers.Contract(contractAddress, abi, provider);
      const arr = await contract.getRescuesByUser(account);
      setIds(arr.map((x: any) => Number(x)));
    } catch (e: any) {
      alert("Error: " + e.message);
    }
    setLoading(false);
  };

  const decryptCount = async () => {
    if (!abi.length || !contractAddress || !account) return;
    setLoading(true);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(contractAddress, abi, signer);
      let handle: any = await contract.getRescueCountHandle(account);
      // Ensure handle is 0x-prefixed hex string
      try { handle = ethers.hexlify(handle as any); } catch {}

      try {
        const res = await fetch("http://localhost:8545", { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "web3_clientVersion", params: [] }) });
        const data = await res.json();
        if (data?.result?.toLowerCase?.().includes("hardhat")) {
          const { MockFhevmInstance } = await import("@fhevm/mock-utils");
          const mock = await (MockFhevmInstance as any).create({ rpcUrl: "http://localhost:8545" });
          const v = await mock.decryptPublic(contractAddress, handle);
          setCountClear(v?.toString?.() ?? String(v));
          setLoading(false);
          return;
        }
      } catch {}

      const instance = await ensureRelayerInstance();
      const sig = await loadOrCreateUserDecryptSignature(instance, signer, [contractAddress as `0x${string}`]);
      const resMap = await userDecryptHandles(instance, [{ handle, contractAddress }], sig);
      setCountClear(resMap[handle]?.toString?.() ?? String(resMap[handle]));
    } catch (e: any) {
      alert("Decrypt error: " + e.message);
    }
    setLoading(false);
  };

  const checkThreshold = async () => {
    // 客户端基于已解密的贡献计数计算（避免链上授权限制）
    if (!countClear) {
      await decryptCount();
    }
    try {
      const n = BigInt(countClear ?? 0);
      setIsAtLeast(String(n >= 10n));
    } catch (e: any) {
      alert("Threshold check error: " + e.message);
    }
  };

  const queryTier = async () => {
    // 客户端基于已解密的贡献计数计算（0:<5, 1:>=5, 2:>=20）
    if (!countClear) {
      await decryptCount();
    }
    try {
      const n = BigInt(countClear ?? 0);
      const tier = n >= 20n ? 2 : n >= 5n ? 1 : 0;
      setTierClear(String(tier));
    } catch (e: any) {
      alert("Tier query error: " + e.message);
    }
  };

  const eligible = () => {
    try {
      // 优先使用已解密的计数；若未解密，则回退到已加载记录数量 ids.length
      const n = countClear !== undefined ? BigInt(countClear) : BigInt(ids.length);
      return { b: n >= 1n, i: n >= 5n, e: n >= 20n };
    } catch { return { b: false, i: false, e: false }; }
  };

  const claim = (type: 'b' | 'i' | 'e') => {
    const el = eligible();
    if (!el[type]) { alert('Not eligible yet.'); return; }
    const next = { ...claimed, [type]: true } as { b: boolean; i: boolean; e: boolean };
    setClaimed(next);
    try { if (account) localStorage.setItem(storageKey(account), JSON.stringify(next)); } catch {}
    alert('Identity claimed!');
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="glass-card p-8">
        <h1 className="text-4xl font-bold text-green-900 mb-2">🙋 My Rescues</h1>
        <p className="text-green-800 mb-6">
          View your rescue records and decrypt your encrypted contribution stats using FHE user decryption.
        </p>

        {!account ? (
          <button onClick={connect} disabled={!hasEthereum} className="btn-primary w-full">
            {hasEthereum ? "🦊 Connect Wallet" : "⚠️ MetaMask Not Found"}
          </button>
        ) : (
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="font-semibold text-green-900">Connected: {account.slice(0, 6)}...{account.slice(-4)}</div>
            </div>

            <button onClick={load} disabled={loading} className="btn-secondary w-full">
              {loading ? "Loading..." : "📋 Load My Records"}
            </button>
          </div>
        )}
      </div>

      {account && ids.length > 0 && (
        <div className="glass-card p-8">
          <h2 className="text-2xl font-bold text-green-900 mb-4">My Rescue IDs</h2>
          <div className="flex flex-wrap gap-3">
            {ids.map((id) => (
              <div key={id} className="bg-green-600 text-white px-4 py-2 rounded-lg font-semibold">
                #{id}
              </div>
            ))}
          </div>
          <div className="glass-card p-6 space-y-4">
            <h3 className="text-xl font-bold text-green-900">🎖️ Claim Your Identity</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-lg bg-white/70 border">
                <div className="font-semibold text-green-900 mb-1">🥉 Beginner</div>
                <div className="text-sm text-green-800 mb-2">Require: ≥1 rescues</div>
                <button className="btn-primary w-full" disabled={!eligible().b || claimed.b} onClick={async () => {
                  try {
                    const provider = new ethers.BrowserProvider(window.ethereum);
                    const signer = await provider.getSigner();
                    const contract = new ethers.Contract(contractAddress, abi, signer);
                    const tx = await (contract as any).claimIdentity(1);
                    await tx.wait();
                    claim('b');
                  } catch (e: any) { alert('Claim failed: ' + e.message); }
                }}>
                  {claimed.b ? '✅ Claimed' : eligible().b ? 'Claim' : 'Not eligible'}
                </button>
              </div>
              <div className="p-4 rounded-lg bg-white/70 border">
                <div className="font-semibold text-green-900 mb-1">🥈 Intermediate</div>
                <div className="text-sm text-green-800 mb-2">Require: ≥5 rescues</div>
                <button className="btn-primary w-full" disabled={!eligible().i || claimed.i} onClick={async () => {
                  try {
                    const provider = new ethers.BrowserProvider(window.ethereum);
                    const signer = await provider.getSigner();
                    const contract = new ethers.Contract(contractAddress, abi, signer);
                    const tx = await (contract as any).claimIdentity(2);
                    await tx.wait();
                    claim('i');
                  } catch (e: any) { alert('Claim failed: ' + e.message); }
                }}>
                  {claimed.i ? '✅ Claimed' : eligible().i ? 'Claim' : 'Not eligible'}
                </button>
              </div>
              <div className="p-4 rounded-lg bg-white/70 border">
                <div className="font-semibold text-green-900 mb-1">🥇 Expert</div>
                <div className="text-sm text-green-800 mb-2">Require: ≥20 rescues</div>
                <button className="btn-primary w-full" disabled={!eligible().e || claimed.e} onClick={async () => {
                  try {
                    const provider = new ethers.BrowserProvider(window.ethereum);
                    const signer = await provider.getSigner();
                    const contract = new ethers.Contract(contractAddress, abi, signer);
                    const tx = await (contract as any).claimIdentity(3);
                    await tx.wait();
                    claim('e');
                  } catch (e: any) { alert('Claim failed: ' + e.message); }
                }}>
                  {claimed.e ? '✅ Claimed' : eligible().e ? 'Claim' : 'Not eligible'}
                </button>
              </div>
            </div>
            <div className="text-xs text-green-700">Note: Demo stores claim status locally. We can mint real badge NFTs later.</div>
          </div>
        </div>
      )}

      {account && (
        <div className="glass-card p-8 space-y-6">
          <h2 className="text-2xl font-bold text-green-900 mb-4">🔓 FHE Decryption</h2>
          <p className="text-green-800 mb-4">
            Your contribution count, threshold check, and tier are encrypted on-chain. Click below to decrypt them using FHEVM user decryption (EIP-712 signature required once).
          </p>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <button onClick={decryptCount} disabled={loading} className="btn-primary">
              {loading ? "⏳" : "Decrypt Count"}
            </button>
            <button onClick={checkThreshold} disabled={loading} className="btn-primary">
              {loading ? "⏳" : "Check ≥ 10"}
            </button>
            <button onClick={queryTier} disabled={loading} className="btn-primary">
              {loading ? "⏳" : "Query Tier"}
            </button>
            <button onClick={resetDecryptSignature} disabled={loading} className="btn-secondary">
              Reset Signature
            </button>
          </div>

          <div className="space-y-4 bg-white/50 rounded-lg p-6">
            <div>
              <div className="text-sm font-semibold text-green-800 mb-1">Contribution Count:</div>
              <div className="text-3xl font-bold text-green-700">{countClear ?? "-"}</div>
            </div>
            <div>
              <div className="text-sm font-semibold text-green-800 mb-1">At Least 10 Rescues:</div>
              <div className="text-2xl font-bold text-green-700">{isAtLeast ?? "-"}</div>
            </div>
            <div>
              <div className="text-sm font-semibold text-green-800 mb-1">Tier (0/1/2):</div>
              <div className="text-2xl font-bold text-green-700">
                {tierClear === "0" && "🥉 Beginner"}
                {tierClear === "1" && "🥈 Intermediate (≥5)"}
                {tierClear === "2" && "🥇 Expert (≥20)"}
                {!tierClear && "-"}
              </div>
            </div>
          </div>
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
