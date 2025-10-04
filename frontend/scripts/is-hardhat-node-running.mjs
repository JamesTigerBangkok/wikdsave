import http from 'node:http';

function rpc(payload) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: 'localhost', port: 8545, method: 'POST', path: '/', headers: { 'content-type': 'application/json' } }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.end(JSON.stringify(payload));
  });
}

async function main() {
  try {
    const ver = await rpc({ jsonrpc: '2.0', id: 1, method: 'web3_clientVersion', params: [] });
    if (!ver?.result?.toLowerCase().includes('hardhat')) process.exit(1);
    // try FHEVM metadata
    await rpc({ jsonrpc: '2.0', id: 2, method: 'fhevm_relayer_metadata', params: [] });
  } catch {
    process.exit(1);
  }
}

main();


