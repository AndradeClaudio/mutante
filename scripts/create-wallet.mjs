// Creates a DISPOSABLE wallet for the Sepolia testnet only. Never send real funds to it.
import { existsSync, writeFileSync } from "node:fs";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const ENV_FILE = ".env";

if (existsSync(ENV_FILE)) {
  console.error("A .env already exists; refusing to overwrite the current wallet.");
  process.exit(1);
}

const privateKey = generatePrivateKey();
const account = privateKeyToAccount(privateKey);
writeFileSync(
  ENV_FILE,
  `# Disposable Sepolia testnet wallet. Do NOT use with real money.\nTESTNET_PRIVATE_KEY=${privateKey}\nWALLET_ADDRESS=${account.address}\n`,
);
console.log(`Wallet created. Public address: ${account.address}`);
