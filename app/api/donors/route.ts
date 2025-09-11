import { NextResponse } from "next/server";
import { publicClient } from "@/lib/clients";
import { parseAbiItem } from "viem";
import { discordFor } from "@/lib/allowlist";

export const runtime = "nodejs";

const donatedEvent = parseAbiItem("event Donated(address indexed from, uint256 amount)");

export async function GET() {
  try {
    const address = process.env.FAUCET_CONTRACT_ADDRESS as `0x${string}`;
    const fromBlock = BigInt(process.env.DEPLOY_BLOCK_NUMBER || "0");
    const toBlock = await publicClient.getBlockNumber();

    const logs = await publicClient.getLogs({
      address,
      fromBlock,
      toBlock,
      events: [donatedEvent],
    });

    const totals = new Map<string, bigint>();
    for (const log of logs) {
      const args: any = log.args;
      const from = (args.from as string);
      const amt = args.amount as bigint;
      totals.set(from, (totals.get(from) || 0n) + amt);
    }

    const entries = Array.from(totals.entries());
    entries.sort((a, b) => (b[1] > a[1] ? 1 : -1));
    const top = entries.slice(0, 20);

    const enriched = await Promise.all(top.map(async ([addr, amount]) => {
      const di = await discordFor(addr).catch(() => null);
      return { address: addr, discordId: di, amount: amount.toString() };
    }));

    return NextResponse.json(enriched, {
      headers: { "Cache-Control": "s-maxage=60, stale-while-revalidate=300" }
    });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e?.message || "failed" }, { status: 500 });
  }
}