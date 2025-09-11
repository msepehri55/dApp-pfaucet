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

  if (!contract) {
    return NextResponse.json({ error: "Contract address missing" }, { status: 500 });
  }

  const balance = await publicClient.getBalance({ address: contract });

  return NextResponse.json(
    { balance: balance.toString() },
    { headers: { "Cache-Control": "no-store, no-cache, must-revalidate, private" } }
  );
}