import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { zenchainTestnet } from "./chain";

const rpcUrl = process.env.RPC_URL || "https://zenchain-testnet.api.onfinality.io/public";

export const publicClient = createPublicClient({
  chain: zenchainTestnet,
  transport: http(rpcUrl, { batch: false }), // disable batching for reliability with getLogs
});

const pkRaw = process.env.OPERATOR_PRIVATE_KEY || "";
if (!pkRaw) {
  console.warn("OPERATOR_PRIVATE_KEY missing. /api/claim will fail until you set it.");
}
const pk = pkRaw ? (pkRaw.startsWith("0x") ? pkRaw : `0x${pkRaw}`) : ("0x" + "0".repeat(64));

export const walletClient = createWalletClient({
  chain: zenchainTestnet,
  transport: http(rpcUrl, { batch: false }), // keep consistent
  account: privateKeyToAccount(pk as `0x${string}`),
});