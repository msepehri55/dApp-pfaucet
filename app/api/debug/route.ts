import { NextResponse } from "next/server";
import { publicClient } from "@/lib/clients";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function GET() {
  const contract =
    (process.env.FAUCET_CONTRACT_ADDRESS as `0x${string}`) ||
    (process.env.NEXT_PUBLIC_FAUCET_CONTRACT_ADDRESS as `0x${string}`);
  const deployBlockEnv = process.env.DEPLOY_BLOCK_NUMBER || "(not set)";

  let headBlock: string | number = "(error)";
  try {
    const n = await publicClient.getBlockNumber();
    headBlock = n.toString();
  } catch (e: any) {
    headBlock = `error: ${e?.message || String(e)}`;
  }

  return NextResponse.json({
    contractInUse: contract,
    DEPLOY_BLOCK_NUMBER_env: deployBlockEnv,
    currentBlock: headBlock,
  });
}