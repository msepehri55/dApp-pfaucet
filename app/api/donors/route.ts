import { NextResponse } from "next/server";
import { publicClient } from "@/lib/clients";
import { keccak256, toBytes, toHex, getAddress } from "viem";
import { discordFor } from "@/lib/allowlist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

// Topic0 for Donated(address,uint256)
const donatedTopic = keccak256(toBytes("Donated(address,uint256)"));

async function rpcGetLogs(
  address: `0x${string}`,
  fromBlock: bigint,
  toBlock: bigint
): Promise<any[]> {
  // Raw eth_getLogs to allow using 'topics' filter without viem type constraints
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

async function getLogsChunkedRaw(
  address: `0x${string}`,
  fromBlock: bigint,
  toBlock: bigint
) {
  const logs: any[] = [];
  let current = fromBlock;
  let step = 20000n; // 20k blocks per chunk
  const minStep = 1000n;

  while (current <= toBlock) {
    let end = current + step - 1n;
    if (end > toBlock) end = toBlock;
    try {
      const chunk = await rpcGetLogs(address, current, end);
      logs.push(...chunk);
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
        current = end + 1n; // skip tiny window to avoid infinite loop
      }
    }
  }
  return logs;
}

function decodeDonatedLog(log: any) {
  try {
    const t1 = log.topics?.[1] as string | undefined;
    if (!t1) return null;
    const addr = getAddress(("0x" + t1.slice(-40)) as `0x${string}`);
    const amt = BigInt(log.data as string); // uint256 encoded
    return { from: addr, amount: amt };
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const address =
      (process.env.FAUCET_CONTRACT_ADDRESS as `0x${string}`) ||
      (process.env.NEXT_PUBLIC_FAUCET_CONTRACT_ADDRESS as `0x${string}`);
    if (!address) {
      return NextResponse.json({ error: "Contract address missing" }, { status: 500 });
    }

    // Parse deploy block (decimal or hex)
    const rawEnv = (process.env.DEPLOY_BLOCK_NUMBER || "0").trim();
    let fromBlock: bigint;
    try {
      fromBlock = rawEnv.startsWith("0x") ? BigInt(rawEnv) : BigInt(parseInt(rawEnv, 10));
    } catch {
      fromBlock = 0n;
    }

    const head = await publicClient.getBlockNumber();

    // 1) Primary scan from deploy block to head
    let logs = await getLogsChunkedRaw(address, fromBlock, head);

    // 2) Fallback to recent windows if empty (provider range limits, wrong env, etc.)
    if (!logs.length) {
      const windows = [300_000n, 150_000n, 60_000n, 10_000n, 5_000n];
      for (const win of windows) {
        const start = head > win ? head - win : 0n;
        try {
          logs = await getLogsChunkedRaw(address, start, head);
          if (logs.length) break;
        } catch {
          // try next smaller window
        }
      }
    }

    // Aggregate totals by donor
    const totals = new Map<string, bigint>();
    for (const log of logs) {
      const parsed = decodeDonatedLog(log);
      if (!parsed) continue;
      totals.set(parsed.from, (totals.get(parsed.from) || 0n) + parsed.amount);
    }

    const entries = Array.from(totals.entries());
    entries.sort((a, b) => (b[1] > a[1] ? 1 : -1));
    const top = entries.slice(0, 50); // UI paginates 5/page

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