import { promises as fs } from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.cwd(), '..', 'backend');
const deploymentsDir = path.join(root, 'deployments');
const outDir = path.resolve(process.cwd(), 'public', 'abi');

async function main() {
  await fs.mkdir(outDir, { recursive: true });

  const sepolia = path.join(deploymentsDir, 'sepolia', 'WildSaveRegistry.json');
  const localhost = path.join(deploymentsDir, 'localhost', 'WildSaveRegistry.json');

  const outputs = [];

  for (const file of [sepolia, localhost]) {
    try {
      const stat = await fs.stat(file);
      if (!stat.isFile()) continue;
      const content = JSON.parse(await fs.readFile(file, 'utf8'));
      outputs.push({ network: path.basename(path.dirname(file)), address: content.address, abi: content.abi });
    } catch {}
  }

  if (outputs.length) {
    const last = outputs[0];
    await fs.writeFile(path.join(outDir, 'WildSaveRegistryABI.json'), JSON.stringify({ abi: last.abi }, null, 2));
    const addresses = Object.fromEntries(outputs.map(o => [o.network, { address: o.address }]));
    await fs.writeFile(path.join(outDir, 'WildSaveRegistryAddresses.json'), JSON.stringify(addresses, null, 2));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

