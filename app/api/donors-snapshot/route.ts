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

async function rpcGetLogs(address: `0x${string}`, fromBlock: bigint, toBlock: bigint) {
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

export async function GET() {
  try {
    const faucet =
      (process.env.FAUCET_CONTRACT_ADDRESS as `0x${string}`) ||
      (process.env.NEXT_PUBLIC_FAUCET_CONTRACT_ADDRESS as `0x${string}`);
    if (!faucet) return NextResponse.json({ error: "Contract address missing" }, { status: 500 });

    // Determine scan range
    const rawEnv = (process.env.DEPLOY_BLOCK_NUMBER || "0").trim();
    const fromBlock = rawEnv.startsWith("0x") ? BigInt(rawEnv) : BigInt(parseInt(rawEnv, 10));
    const head = await publicClient.getBlockNumber();

    // Chunked scan
    const totals = new Map<string, bigint>();
    let current = fromBlock;
    let step = 20000n;
    const minStep = 1000n;

    while (current <= head) {
      let end = current + step - 1n;
      if (end > head) end = head;
      try {
        const logs: any[] = await rpcGetLogs(faucet, current, end);
        for (const log of logs) {
          const t1 = log.topics?.[1] as string | undefined;
          if (!t1) continue;
          const from = getAddress(("0x" + t1.slice(-40)) as `0x${string}`);
          const amt = BigInt(log.data as string);
          totals.set(from, (totals.get(from) || 0n) + amt);
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

    // Build base JSON payload
    const donors = await Promise.all(
      Array.from(totals.entries()).map(async ([addr, amt]) => {
        const username = await discordFor(addr).catch(() => null);
        return {
          address: addr,
          username: username || undefined,
          amountWei: amt.toString(),
        };
      })
    );

    donors.sort((a, b) => (BigInt(b.amountWei) > BigInt(a.amountWei) ? 1 : -1));

    return NextResponse.json(
      {
        lastBlock: head.toString(),
        donors,
      },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate, private" } }
    );
  } catch (e: any) {
    console.error("donors-snapshot error:", e);
    return NextResponse.json({ error: e?.message || "failed" }, { status: 500 });
  }
}