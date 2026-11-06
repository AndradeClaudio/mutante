// Shows the testnet wallet balance (Sepolia ETH for gas and test USDC for the questions).
import "dotenv/config";
import { createPublicClient, erc20Abi, formatEther, formatUnits, http } from "viem";
import { sepolia } from "viem/chains";

const TEST_USDC = "0xcc194e1a843B658526D0D5C431f670028582Ae17";
const SEPOLIA_RPC = "https://ethereum-sepolia-rpc.publicnode.com";

const address = process.env.WALLET_ADDRESS;
if (!address) throw new Error("WALLET_ADDRESS is missing from .env; run scripts/create-wallet.mjs");

const client = createPublicClient({ chain: sepolia, transport: http(SEPOLIA_RPC) });
const [eth, usdc] = await Promise.all([
  client.getBalance({ address }),
  client.readContract({ address: TEST_USDC, abi: erc20Abi, functionName: "balanceOf", args: [address] }),
]);
console.log(`Address: ${address}\nSepolia ETH: ${formatEther(eth)}\nTest USDC: ${formatUnits(usdc, 6)}`);
