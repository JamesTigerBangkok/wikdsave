"use client";

import { useEffect, useState } from "react";
import { ethers } from "ethers";

declare global {
  interface Window {
    relayerSDK: any;
    ethereum?: any;
  }
}

async function loadRelayerSDK() {
  if (typeof window === "undefined") return;
  if (window.relayerSDK) return;
  await new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.zama.ai/relayer-sdk-js/0.2.0/relayer-sdk-js.umd.cjs";
    s.type = "text/javascript";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load relayer-sdk"));
    document.head.appendChild(s);
  });
}

export default function SubmitPage() {
  const [status, setStatus] = useState<string>("idle");
  const [msg, setMsg] = useState<string>("");
  const [network, setNetwork] = useState<"mock" | "sepolia" | undefined>(undefined);
  const [hasEthereum, setHasEthereum] = useState(false);

  // Form
  const [animal, setAnimal] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [imageHash, setImageHash] = useState("");
  const [lat, setLat] = useState("0");
  const [lng, setLng] = useState("0");

  const [account, setAccount] = useState<string>("");
  const [contractAddress, setContractAddress] = useState<string>("");
  const [abi, setAbi] = useState<any[]>([]);

  useEffect(() => {
    setHasEthereum(typeof window !== "undefined" && !!(window as any).ethereum);
    (async () => {
      const [abiJson, addrJson] = await Promise.all([
        fetch("abi/WildSaveRegistryABI.json").then((r) => r.json()).catch(() => ({ abi: [] })),
        fetch("abi/WildSaveRegistryAddresses.json").then((r) => r.json()).catch(() => ({})),
      ]);

      setAbi(abiJson.abi ?? []);

      try {
        const res = await fetch("http://localhost:8545", { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "web3_clientVersion", params: [] }) });
        const data = await res.json();
        if (data?.result?.toLowerCase?.().includes("hardhat")) {
          setNetwork("mock");
          setContractAddress(addrJson.localhost?.address ?? "");
          return;
        }
      } catch {}

      setNetwork("sepolia");
      setContractAddress(addrJson.sepolia?.address ?? "");
      await loadRelayerSDK();
      await window.relayerSDK.initSDK();
    })();
  }, []);

  // Detect existing wallet connection and listen to changes
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
  };

  const submit = async () => {
    if (!contractAddress || !abi.length) return alert("Contract not configured");
    if (!animal || !location || !imageHash) return alert("Please fill required fields");

    setStatus("pending");
    setMsg("Processing transaction...");

    try {
      if (network === "mock") {
        const { MockFhevmInstance } = await import("@fhevm/mock-utils");
        const mock = await (MockFhevmInstance as any).create({ rpcUrl: "http://localhost:8545" });

        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const contract = new ethers.Contract(contractAddress, abi, signer);

        const input = mock.createEncryptedInput(contractAddress, await signer.getAddress());
        input.add32(BigInt(1));
        const enc = await input.encrypt();

        const tx = await contract.addRescue(animal, location, description, imageHash, Number(lat), Number(lng), enc.handles[0], enc.inputProof);
        setMsg(`Transaction submitted: ${tx.hash}`);
        await tx.wait();
        setStatus("success");
        setMsg("✅ Rescue registered successfully! NFT minted.");
        return;
      }

      if (network === "sepolia") {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const contract = new ethers.Contract(contractAddress, abi, signer);

        const instance = await window.relayerSDK.createInstance({
          ...window.relayerSDK.SepoliaConfig,
          network: window.ethereum,
        });

        const input = instance.createEncryptedInput(contractAddress, await signer.getAddress());
        input.add32(BigInt(1));
        const enc = await input.encrypt();

        const tx = await contract.addRescue(animal, location, description, imageHash, Number(lat), Number(lng), enc.handles[0], enc.inputProof);
        setMsg(`Transaction submitted: ${tx.hash}`);
        await tx.wait();
        setStatus("success");
        setMsg("✅ Rescue registered successfully! NFT minted.");
        return;
      }
    } catch (e: any) {
      setStatus("error");
      setMsg(`❌ Error: ${e?.message ?? String(e)}`);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="glass-card p-8">
        <h1 className="text-4xl font-bold text-green-900 mb-2">📝 Register a Rescue</h1>
        <p className="text-green-800 mb-6">
          Submit a wildlife rescue action to the blockchain. Each record will mint an NFT and contribute to your on-chain reputation.
        </p>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <div className="font-semibold text-blue-900">Network: {network ?? "Detecting..."}</div>
          <div className="text-sm text-blue-800">
            {account ? `Connected: ${account.slice(0, 6)}...${account.slice(-4)}` : "Not connected"}
          </div>
        </div>

        {!account && (
          <button onClick={connect} disabled={!hasEthereum} className="btn-primary w-full mb-6">
            {hasEthereum ? "🦊 Connect Wallet" : "⚠️ MetaMask Not Found"}
          </button>
        )}

        {account && (
          <div className="space-y-4">
            <div>
              <label className="block text-green-900 font-semibold mb-2">Animal Name *</label>
              <input
                type="text"
                placeholder="e.g., Panda, Owl, Sea Turtle"
                value={animal}
                onChange={(e) => setAnimal(e.target.value)}
                className="w-full"
              />
            </div>

            <div>
              <label className="block text-green-900 font-semibold mb-2">Location *</label>
              <input
                type="text"
                placeholder="e.g., Amazon Rainforest, Pacific Ocean"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full"
              />
            </div>

            <div>
              <label className="block text-green-900 font-semibold mb-2">Description</label>
              <textarea
                placeholder="Describe the rescue action..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                className="w-full"
              />
            </div>

            <div>
              <label className="block text-green-900 font-semibold mb-2">Image CID * (IPFS)</label>
              <input
                type="text"
                placeholder="ipfs://QmXXX... or Qm..."
                value={imageHash}
                onChange={(e) => setImageHash(e.target.value)}
                className="w-full"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-green-900 font-semibold mb-2">Latitude (* 1e6)</label>
                <input
                  type="number"
                  placeholder="e.g., 40123456"
                  value={lat}
                  onChange={(e) => setLat(e.target.value)}
                  className="w-full"
                />
              </div>
              <div>
                <label className="block text-green-900 font-semibold mb-2">Longitude (* 1e6)</label>
                <input
                  type="number"
                  placeholder="e.g., -74007890"
                  value={lng}
                  onChange={(e) => setLng(e.target.value)}
                  className="w-full"
                />
              </div>
            </div>

            <button
              onClick={submit}
              disabled={status === "pending"}
              className="btn-primary w-full text-lg py-4"
            >
              {status === "pending" ? "⏳ Submitting..." : "🚀 Submit to Blockchain"}
            </button>
          </div>
        )}

        {msg && (
          <div className={`mt-6 p-4 rounded-lg ${
            status === "success" ? "bg-green-100 border border-green-300 text-green-900" :
            status === "error" ? "bg-red-100 border border-red-300 text-red-900" :
            "bg-blue-100 border border-blue-300 text-blue-900"
          }`}>
            {msg}
          </div>
        )}
      </div>
    </div>
  );
}
