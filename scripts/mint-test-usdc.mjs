// Mints TEST USDC (public mint on the Telegraph testnet contract) to pay for the questions.
// Usage: node scripts/mint-test-usdc.mjs [amount]
import "dotenv/config";
import { createPublicClient, createWalletClient, http, parseAbi, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

const TEST_USDC = "0xcc194e1a843B658526D0D5C431f670028582Ae17";
const SEPOLIA_RPC = "https://ethereum-sepolia-rpc.publicnode.com";
const AMOUNT_USDC = process.argv[2] ?? "10";

const account = privateKeyToAccount(process.env.TESTNET_PRIVATE_KEY);
const transport = http(SEPOLIA_RPC);
const wallet = createWalletClient({ account, chain: sepolia, transport });
const reader = createPublicClient({ chain: sepolia, transport });

const hash = await wallet.writeContract({
  address: TEST_USDC,
  abi: parseAbi(["function mint(address to, uint256 amount)"]),
  functionName: "mint",
  args: [account.address, parseUnits(AMOUNT_USDC, 6)],
});
console.log(`Transaction sent: https://sepolia.etherscan.io/tx/${hash}`);
const receipt = await reader.waitForTransactionReceipt({ hash });
console.log(`Status: ${receipt.status}`);
