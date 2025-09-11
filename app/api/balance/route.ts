import { NextResponse } from "next/server";
import { publicClient } from "@/lib/clients";

export const runtime = "nodejs";

export async function GET() {
  const contract = process.env.FAUCET_CONTRACT_ADDRESS as `0x${string}`;
  const balance = await publicClient.getBalance({ address: contract });
  return NextResponse.json(
    { balance: balance.toString() },
    { headers: { "Cache-Control": "s-maxage=15, stale-while-revalidate=60" } }
  );
}