import { NextResponse } from "next/server";
import { publicClient } from "@/lib/clients";
import baseJson from "../../data/base-donors.json"; // fixed path
import { discordFor } from "@/lib/allowlist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type BaseDonor = { username: string; amountWei: string };
type BaseData = { lastBlock: number; donors: BaseDonor[] };

// Scan recent blocks for native-value transfers to the faucet (instant)
async function scanRecentTransfers(
  faucet: `0x${string}`,
  fromBlock: bigint,
  toBlock: bigint
) {
  const totalsByAddress = new Map<string, bigint>();
  if (toBlock < fromBlock) return totalsByAddress;

  const faucetLower = faucet.toLowerCase();
  const start = Number(fromBlock);
  const end = Number(toBlock);

  const batchSize = 40;
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
        const from = String(tx.from).toLowerCase();
        totalsByAddress.set(from, (totalsByAddress.get(from) || 0n) + value);
      }
    }
  }
  return totalsByAddress;
}

export async function GET() {
  try {
    const faucet =
      (process.env.FAUCET_CONTRACT_ADDRESS as `0x${string}`) ||
      (process.env.NEXT_PUBLIC_FAUCET_CONTRACT_ADDRESS as `0x${string}`);
    if (!faucet) {
      return NextResponse.json({ error: "Contract address missing" }, { status: 500 });
    }

    const base = (baseJson as unknown as BaseData) || { lastBlock: 0, donors: [] };

    // Seed totals from baked donors in UI (by username, in wei)
    const totalsByUser = new Map<string, bigint>();
    for (const d of base.donors || []) {
      const u = (d.username || "Unknown").trim();
      totalsByUser.set(u, (totalsByUser.get(u) || 0n) + BigInt(d.amountWei));
    }

    const head = await publicClient.getBlockNumber();

    // Only scan recent tail for “new” donors (fast)
    const tailWindow = BigInt(process.env.DONOR_TAIL_WINDOW || "600");
    const baseLast = BigInt(base.lastBlock || 0);
    let from = baseLast + 1n;
    const minFrom = head > tailWindow ? head - tailWindow + 1n : 0n;
    if (from < minFrom) from = minFrom;
    if (from > head) from = head;

    // Scan recent native transfers
    const recentByAddr = await scanRecentTransfers(faucet, from, head);

    // Enrich addresses to usernames (allowlist), and merge into totals by username
    for (const [addrLower, amt] of recentByAddr.entries()) {
      const username = (await discordFor(addrLower).catch(() => null)) || "Unknown";
      const key = username.trim();
      totalsByUser.set(key, (totalsByUser.get(key) || 0n) + amt);
    }

    // Sort and cap
    const entries = Array.from(totalsByUser.entries());
    entries.sort((a, b) => (a[1] === b[1] ? 0 : b[1] > a[1] ? 1 : -1));
    const top = entries.slice(0, 50);

    // Response uses wei string amounts (UI formats)
    const enriched = top.map(([username, amountWei]) => ({
      username,
      amount: amountWei.toString(),
    }));

    return NextResponse.json(enriched, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate, private" },
    });
  } catch (e: any) {
    console.error("donors api error:", e);
    return NextResponse.json({ error: e?.message || "failed" }, { status: 500 });
  }
}