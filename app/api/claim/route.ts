import { NextResponse } from "next/server";
import { isAddress } from "viem";
import { publicClient, walletClient } from "@/lib/clients";
import { faucetAbi } from "@/lib/abi";
import { isAllowedPair } from "@/lib/allowlist";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { address, discordId } = await req.json();

    if (!address || !discordId) {
      return NextResponse.json({ error: "address and discordId required" }, { status: 400 });
    }
    if (!isAddress(address)) {
      return NextResponse.json({ error: "invalid address" }, { status: 400 });
    }

    const allowed = await isAllowedPair(address, discordId);
    if (!allowed) {
      return NextResponse.json({ error: "not in allowlist" }, { status: 403 });
    }

    const contract = process.env.FAUCET_CONTRACT_ADDRESS as `0x${string}`;

    const [payout, threshold, lastClaimTs, recipientBal, faucetBal, cooldown] = await Promise.all([
      publicClient.readContract({ address: contract, abi: faucetAbi, functionName: "payoutAmount" }) as Promise<bigint>,
      publicClient.readContract({ address: contract, abi: faucetAbi, functionName: "minEligibleBalance" }) as Promise<bigint>,
      publicClient.readContract({ address: contract, abi: faucetAbi, functionName: "lastClaim", args: [address] }) as Promise<bigint>,
      publicClient.getBalance({ address }),
      publicClient.getBalance({ address: contract }),
      publicClient.readContract({ address: contract, abi: faucetAbi, functionName: "cooldown" }) as Promise<bigint>,
    ]);

    if (recipientBal >= threshold) {
      return NextResponse.json({ error: "balance >= threshold" }, { status: 400 });
    }
    if (faucetBal < payout) {
      return NextResponse.json({ error: "faucet empty" }, { status: 400 });
    }

    const now = BigInt(Math.floor(Date.now() / 1000));
    if (now - lastClaimTs < cooldown) {
      const wait = Number(cooldown - (now - lastClaimTs));
      return NextResponse.json({ error: "cooldown active", secondsLeft: wait }, { status: 429 });
    }

    const hash = await walletClient.writeContract({
      address: contract,
      abi: faucetAbi,
      functionName: "claimFor",
      args: [address as `0x${string}`],
    });

    return NextResponse.json({ txHash: hash });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e?.shortMessage || e?.message || "unknown error" }, { status: 500 });
  }
}