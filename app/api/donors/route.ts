import { NextResponse } from "next/server";
import { publicClient } from "@/lib/clients";
import { faucetAbi } from "@/lib/abi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

async function getEventsAll(
  address: `0x${string}`,
  fromBlock: bigint,
  toBlock: bigint
) {
  // First try a single query (most providers will handle it if the range isn't huge)
  try {
    return await publicClient.getContractEvents({
      address,
      abi: faucetAbi,
      eventName: "Donated",
      fromBlock,
      toBlock,
    });
  } catch {
    // Fallback: chunked range scan
    const out: any[] = [];
    let current = fromBlock;
    const maxStep = 20000n;
    let step = maxStep;

    while (current <= toBlock) {
      const end = current + step - 1n > toBlock ? toBlock : current + step - 1n;
      try {
        const part = await publicClient.getContractEvents({
          address,
          abi: faucetAbi,
          eventName: "Donated",
          fromBlock: current,
          toBlock: end,
        });
        out.push(...part);
        current = end + 1n;
        // gently increase step back up if we had previously reduced it
        if (step < maxStep) step = step * 2n > maxStep ? maxStep : step * 2n;
      } catch {
        // reduce step and retry the same window
        step = step / 2n;
        if (step < 1000n) {
          // if even very small windows fail, break to avoid infinite loop
          break;
        }
        continue;
      }
    }
    return out;
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

    const envFrom = process.env.DEPLOY_BLOCK_NUMBER?.trim() || "0";
    let fromBlock = 0n;
    try {
      fromBlock = BigInt(envFrom);
    } catch {
      fromBlock = 0n;
    }

    const head = await publicClient.getBlockNumber();
    const toBlock = head;

    // Fetch events
    const events = await getEventsAll(address, fromBlock, toBlock);

    // Aggregate totals by donor address
    const totals = new Map<string, bigint>();
    for (const e of events) {
      const from = (e.args as any)?.from as string | undefined;
      const amount = (e.args as any)?.amount as bigint | undefined;
      if (!from || amount === undefined) continue;
      totals.set(from, (totals.get(from) || 0n) + amount);
    }

    // Sort and limit (top 50; UI paginates 5 per page)
    const entries = Array.from(totals.entries());
    entries.sort((a, b) => (b[1] > a[1] ? 1 : -1));
    const top = entries.slice(0, 50);

    // Map to response (username enrichment happens client-side display as 'Unknown' if null)
    const enriched = top.map(([addr, amount]) => ({
      address: addr,
      username: null as string | null, // keep simple; your UI shows Unknown if null
      amount: amount.toString(),
    }));

    return NextResponse.json(enriched, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate, private" },
    });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e?.message || "failed" }, { status: 500 });
  }
}