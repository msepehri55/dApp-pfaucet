import { NextResponse } from "next/server";
import { publicClient } from "@/lib/clients";
import { parseAbiItem } from "viem";
import { discordFor } from "@/lib/allowlist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const donatedEvent = parseAbiItem("event Donated(address indexed from, uint256 amount)");

async function getLogsChunked(address: `0x${string}`, fromBlock: bigint, toBlock: bigint) {
  const logs: any[] = [];
  let current = fromBlock;
  let step = 20000n;      // start with 20k blocks
  const minStep = 1000n;  // fallback minimum

  while (current <= toBlock) {
    let end = current + step - 1n;
    if (end > toBlock) end = toBlock;
    try {
      const chunk = await publicClient.getLogs({
        address,
        fromBlock: current,
        toBlock: end,
        events: [donatedEvent],
        // strict left default (true) is fine since we filter by event
      });
      logs.push(...chunk);
      current = end + 1n;
      // opportunistically ramp step back up (capped at 20k)
      if (step < 20000n) step = step * 2n > 20000n ? 20000n : step * 2n;
    } catch {
      // provider likely refused range; halve step and retry
      if (step > minStep) {
        step = step / 2n;
        continue;
      } else {
        // if even min step fails, skip this slice to avoid infinite loop
        current = end + 1n;
      }
    }
  }
  return logs;
}

export async function GET() {
  try {
    const address =
      (process.env.FAUCET_CONTRACT_ADDRESS as `0x${string}`) ||
      (process.env.NEXT_PUBLIC_FAUCET_CONTRACT_ADDRESS as `0x${string}`);
    const fromBlock = BigInt(process.env.DEPLOY_BLOCK_NUMBER || "0");
    const toBlock = await publicClient.getBlockNumber();

    const logs = await getLogsChunked(address, fromBlock, toBlock);

    const totals = new Map<string, bigint>();
    for (const log of logs) {
      const args: any = log.args;
      const from = args.from as string;
      const amt = args.amount as bigint;
      totals.set(from, (totals.get(from) || 0n) + amt);
    }

    const entries = Array.from(totals.entries());
    entries.sort((a, b) => (b[1] > a[1] ? 1 : -1));
    const top = entries.slice(0, 50); // UI paginates 5 per page

    const enriched = await Promise.all(
      top.map(async ([addr, amount]) => {
        const username = await discordFor(addr).catch(() => null);
        return { address: addr, username, amount: amount.toString() };
      })
    );

    return NextResponse.json(enriched, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate, private" }
    });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e?.message || "failed" }, { status: 500 });
  }
}