import { NextResponse } from "next/server";
import { publicClient } from "@/lib/clients";
import baseData from "@/data/base-donors.json";
import { discordFor } from "@/lib/allowlist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type BaseDonor = { address: string; username?: string; amountWei: string };
type BaseData = { lastBlock: number; donors: BaseDonor[] };

// Scan recent blocks for native-value transfers to the faucet (fast, “instant” updates)
async function scanRecentTransfers(
  faucet: `0x${string}`,
  fromBlock: bigint,
  toBlock: bigint
) {
  const totals = new Map<string, bigint>();
  if (toBlock < fromBlock) return totals;

  const faucetLower = faucet.toLowerCase();
  const start = Number(fromBlock);
  const end = Number(toBlock);

  const batchSize = 40; // fetch 40 blocks in parallel per batch
  for (let i = start; i <= end; i += batchSize) {
    const batchEnd = Math.min(end, i + batchSize - 1);
    const promises: Promise<any>[] = [];
    for (let b = i; b <= batchEnd; b++) {
      promises.push(
        publicClient.getBlock({
          blockNumber: BigInt(b),
          includeTransactions: true,
        })
      );
    }
    const blocks = await Promise.all(promises);
    for (const block of blocks) {
      const txs = (block as any).transactions as any[];
      for (const tx of txs) {
        const to: string | undefined = tx.to ? String(tx.to).toLowerCase() : undefined;
        if (!to || to !== faucetLower) continue;
        const value: bigint =
          typeof tx.value === "bigint" ? tx.value : BigInt(tx.value || 0);
        if (value <= 0n) continue;
        const from = String(tx.from);
        totals.set(from, (totals.get(from) || 0n) + value);
      }
    }
  }
  return totals;
}

export async function GET() {
  try {
    const faucet =
      (process.env.FAUCET_CONTRACT_ADDRESS as `0x${string}`) ||
      (process.env.NEXT_PUBLIC_FAUCET_CONTRACT_ADDRESS as `0x${string}`);
    if (!faucet) {
      return NextResponse.json({ error: "Contract address missing" }, { status: 500 });
    }

    const base = (baseData as BaseData) || { lastBlock: 0, donors: [] };

    // Seed totals from the base JSON (donors baked into the UI)
    const baseTotals = new Map<string, bigint>();
    const baseUsername = new Map<string, string>();
    for (const d of base.donors || []) {
      const addr = d.address.toLowerCase();
      baseTotals.set(addr, (baseTotals.get(addr) || 0n) + BigInt(d.amountWei));
      if (d.username) baseUsername.set(addr, d.username);
    }

    const head = await publicClient.getBlockNumber();

    // Tail window: only scan the recent N blocks for instant new donors
    const tailWindow = BigInt(process.env.DONOR_TAIL_WINDOW || "600"); // default ~600 blocks
    const baseLast = BigInt(base.lastBlock || 0);
    let from = baseLast + 1n;
    const minFrom = head > tailWindow ? head - tailWindow + 1n : 0n;
    if (from < minFrom) from = minFrom;
    if (from > head) from = head;

    // Scan recent transfers
    const recent = await scanRecentTransfers(faucet, from, head);

    // Merge totals: base + recent
    const totals = new Map<string, bigint>(baseTotals);
    for (const [addr, amt] of recent.entries()) {
      const key = addr.toLowerCase();
      totals.set(key, (totals.get(key) || 0n) + amt);
    }

    // Sort and limit
    const entries = Array.from(totals.entries());
    entries.sort((a, b) => (b[1] > a[1] ? 1 : -1));
    const top = entries.slice(0, 50);

    // Prepare response with usernames:
    // - use baked username if present
    // - else try to resolve via allowlist CSV
    const enriched = await Promise.all(
      top.map(async ([addrLower, amount]) => {
        const baked = baseUsername.get(addrLower) || null;
        const resolved = baked || (await discordFor(addrLower).catch(() => null));
        return {
          address: addrLower,
          username: resolved,
          amount: amount.toString(), // wei
        };
      })
    );

    return NextResponse.json(enriched, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate, private" },
    });
  } catch (e: any) {
    console.error("donors api error:", e);
    return NextResponse.json({ error: e?.message || "failed" }, { status: 500 });
  }
}