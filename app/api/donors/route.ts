import { NextResponse } from "next/server";
import { publicClient } from "@/lib/clients";
import { keccak256, toBytes, toHex, getAddress } from "viem";
import { discordFor } from "@/lib/allowlist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

// Donated(address,uint256)
const donatedTopic = keccak256(toBytes("Donated(address,uint256)"));

// Raw eth_getLogs to filter by topics
async function rpcGetLogs(
  address: `0x${string}`,
  fromBlock: bigint,
  toBlock: bigint
): Promise<any[]> {
  return publicClient.transport.request({
    method: "eth_getLogs",
    params: [
      {
        address,
        fromBlock: toHex(fromBlock),
        toBlock: toHex(toBlock),
        topics: [donatedTopic],
      },
    ],
  });
}

function decodeDonated(log: any) {
  try {
    const t1 = log.topics?.[1] as string | undefined;
    if (!t1) return null;
    const from = getAddress(("0x" + t1.slice(-40)) as `0x${string}`);
    const amount = BigInt(log.data as string);
    return { from, amount };
  } catch {
    return null;
  }
}

// Scan logs in chunks for historical window
async function scanLogsChunked(
  address: `0x${string}`,
  fromBlock: bigint,
  toBlock: bigint
) {
  const totals = new Map<string, bigint>();
  if (toBlock < fromBlock) return totals;

  let current = fromBlock;
  let step = 20000n;
  const minStep = 1000n;

  while (current <= toBlock) {
    let end = current + step - 1n;
    if (end > toBlock) end = toBlock;
    try {
      const logs = await rpcGetLogs(address, current, end);
      for (const log of logs) {
        const parsed = decodeDonated(log);
        if (!parsed) continue;
        totals.set(parsed.from, (totals.get(parsed.from) || 0n) + parsed.amount);
      }
      current = end + 1n;
      if (step < 20000n) {
        const next = step * 2n;
        step = next > 20000n ? 20000n : next;
      }
    } catch {
      if (step > minStep) {
        step = step / 2n;
        continue;
      } else {
        current = end + 1n;
      }
    }
  }
  return totals;
}

// Scan recent blocks directly for native-value transfers to the faucet (instant, no log indexing)
async function scanRecentBlocksForTransfers(
  address: `0x${string}`,
  fromBlock: bigint,
  toBlock: bigint
) {
  const totals = new Map<string, bigint>();
  if (toBlock < fromBlock) return totals;

  const addrLower = address.toLowerCase();
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
        if (!to || to !== addrLower) continue;
        const value: bigint = typeof tx.value === "bigint" ? tx.value : BigInt(tx.value || 0);
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
    const address =
      (process.env.FAUCET_CONTRACT_ADDRESS as `0x${string}`) ||
      (process.env.NEXT_PUBLIC_FAUCET_CONTRACT_ADDRESS as `0x${string}`);

    if (!address) {
      return NextResponse.json({ error: "Contract address missing" }, { status: 500 });
    }

    // Deploy block from env (decimal or hex). If missing, start at 0.
    const rawEnv = (process.env.DEPLOY_BLOCK_NUMBER || "0").trim();
    let deployBlock: bigint;
    try {
      deployBlock = rawEnv.startsWith("0x") ? BigInt(rawEnv) : BigInt(parseInt(rawEnv, 10));
    } catch {
      deployBlock = 0n;
    }

    const head = await publicClient.getBlockNumber();

    // Define a "tail window" of recent blocks to scan by transactions (instant updates)
    const tailWindow = 300n; // tune as desired; 300 blocks is usually a few minutes
    const tailStart = head > tailWindow ? head - tailWindow + 1n : 0n;

    // Historical window: from deployBlock up to just before tailStart
    const histFrom = deployBlock;
    const histTo = tailStart > 0n ? tailStart - 1n : 0n;

    // 1) Historical totals via logs (reliable, but can be delayed for most recent blocks)
    const histTotals = await scanLogsChunked(address, histFrom, histTo);

    // 2) Real-time totals from recent blocks via direct tx scanning (no log delay)
    const recentTotals = await scanRecentBlocksForTransfers(address, tailStart, head);

    // Merge totals: histTotals + recentTotals
    const totals = new Map<string, bigint>(histTotals);
    for (const [from, amt] of recentTotals.entries()) {
      totals.set(from, (totals.get(from) || 0n) + amt);
    }

    // Sort and take top 50 (UI paginates 5/page)
    const entries = Array.from(totals.entries());
    entries.sort((a, b) => (b[1] > a[1] ? 1 : -1));
    const top = entries.slice(0, 50);

    // Enrich with Discord username from your sheet (if available)
    const enriched = await Promise.all(
      top.map(async ([addr, amount]) => {
        const username = await discordFor(addr).catch(() => null);
        return { address: addr, username, amount: amount.toString() };
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