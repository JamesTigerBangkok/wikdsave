/* eslint-disable @typescript-eslint/no-explicit-any */

export type UserDecryptSignature = {
  publicKey: string;
  privateKey: string;
  signature: string;
  contractAddresses: `0x${string}`[];
  userAddress: `0x${string}`;
  startTimestamp: number;
  durationDays: number;
};

declare global {
  interface Window {
    relayerSDK: any;
    ethereum?: any;
  }
}

export async function ensureRelayerInstance(): Promise<any> {
  if (typeof window === "undefined") throw new Error("no window");
  if (!window.relayerSDK) {
    await new Promise<void>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://cdn.zama.ai/relayer-sdk-js/0.2.0/relayer-sdk-js.umd.cjs";
      s.type = "text/javascript";
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("Failed to load relayer-sdk"));
      document.head.appendChild(s);
    });
  }
  await window.relayerSDK.initSDK();
  const instance = await window.relayerSDK.createInstance({
    ...window.relayerSDK.SepoliaConfig,
    network: window.ethereum,
  });
  return instance;
}

function buildStorageKey(contracts: string[], user: string, pub?: string) {
  const base = `fhevm:userDecrypt:${user}:${contracts.sort().join(",")}`;
  return pub ? `${base}:${pub.slice(0, 16)}` : base;
}

export async function loadOrCreateUserDecryptSignature(
  instance: any,
  signer: any,
  contractAddresses: `0x${string}`[],
  reusePublicKey?: string
): Promise<UserDecryptSignature> {
  const userAddress = (await signer.getAddress()) as `0x${string}`;
  const storageKey = buildStorageKey(contractAddresses, userAddress, reusePublicKey);
  try {
    const cached = localStorage.getItem(storageKey);
    if (cached) return JSON.parse(cached) as UserDecryptSignature;
  } catch {}

  const { publicKey, privateKey } = instance.generateKeypair();
  const startTimestamp = Math.floor(Date.now() / 1000);
  const durationDays = 365;
  const eip712 = instance.createEIP712(publicKey, contractAddresses, startTimestamp, durationDays);
  const signature = await signer.signTypedData(
    eip712.domain,
    { UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification },
    eip712.message
  );

  const sig: UserDecryptSignature = {
    publicKey,
    privateKey,
    signature,
    contractAddresses,
    userAddress,
    startTimestamp,
    durationDays,
  };
  try { localStorage.setItem(storageKey, JSON.stringify(sig)); } catch {}
  return sig;
}

export async function userDecryptHandles(
  instance: any,
  handles: { handle: string; contractAddress: string }[],
  sig: UserDecryptSignature
): Promise<Record<string, bigint>> {
  return instance.userDecrypt(
    handles,
    sig.privateKey,
    sig.publicKey,
    sig.signature,
    sig.contractAddresses,
    sig.userAddress,
    sig.startTimestamp,
    sig.durationDays
  );
}



