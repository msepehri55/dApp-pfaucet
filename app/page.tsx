"use client";
import { useEffect, useState } from "react";
import QRCode from "react-qr-code";

const CONTRACT = process.env.NEXT_PUBLIC_FAUCET_CONTRACT_ADDRESS || "";

function short(addr: string) {
  return addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : "";
}
function formatZtc(wei: string | bigint) {
  const n = typeof wei === "string" ? BigInt(wei) : wei;
  const whole = n / 10n ** 18n;
  const frac = (n % (10n ** 18n)) / 10n ** 14n; // 4 decimals
  return `${whole}.${frac.toString().padStart(4, "0")}`;
}

export default function Home() {
  const [balance, setBalance] = useState<string>("0");
  const [address, setAddress] = useState("");
  const [discordId, setDiscordId] = useState("");
  const [claiming, setClaiming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [donors, setDonors] = useState<any[]>([]);

  async function loadBalance() {
    const res = await fetch("/api/balance", { cache: "no-store" });
    const json = await res.json();
    setBalance(json.balance);
  }
  async function loadDonors() {
    const res = await fetch("/api/donors", { next: { revalidate: 60 } });
    if (res.ok) setDonors(await res.json());
  }
  useEffect(() => {
    loadBalance();
    loadDonors();
  }, []);

  async function claim() {
    setMessage(null);
    setClaiming(true);
    try {
      const res = await fetch("/api/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, discordId })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "failed");
      setMessage(`Sent! Tx: ${json.txHash}`);
      await loadBalance();
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setClaiming(false);
    }
  }

  return (
    <main className="min-h-screen bg-black text-[#eaff74] flex flex-col items-center">
      <header className="w-full max-w-4xl flex items-center gap-3 p-4">
        <img src="/logo.png" alt="logo" className="h-10 w-10" />
        <h1 className="text-2xl font-bold">Zenchain pfaucet</h1>
      </header>

      <section className="w-full max-w-4xl grid md:grid-cols-2 gap-6 p-4">
        <div className="glass p-4">
          <h2 className="text-xl font-semibold mb-2">Donate ZTC</h2>
          <p className="text-sm opacity-80 mb-2">Send ZTC directly to the faucet contract (no wallet connect).</p>
          <div className="font-mono text-lg break-all">{CONTRACT}</div>
          <div className="mt-3 bg-white p-2 inline-block">
            <QRCode value={CONTRACT} size={140} />
          </div>
          <div className="mt-3 text-sm opacity-80">
            Faucet balance: <span className="font-semibold">{formatZtc(balance)} ZTC</span>
          </div>
        </div>

        <div className="glass p-4">
          <h2 className="text-xl font-semibold mb-2">Request 20 ZTC</h2>
          <p className="text-sm opacity-80 mb-3">
            Only allowlisted wallets (matching Discord ID) can claim once per 24h and only if wallet has &lt; 20 ZTC.
          </p>

          <label className="block text-sm mb-1">Wallet address</label>
          <input value={address} onChange={e => setAddress(e.target.value)} placeholder="0x..." className="input" />

          <label className="block text-sm mt-3 mb-1">Discord ID</label>
          <input value={discordId} onChange={e => setDiscordId(e.target.value)} placeholder="123456789012345678" className="input" />

          <button disabled={claiming} onClick={claim} className="btn mt-4">
            {claiming ? "Sending..." : "Claim 20 ZTC"}
          </button>
          {message && <div className="mt-3 text-sm">{message}</div>}
        </div>
      </section>

      <section className="w-full max-w-4xl p-4">
        <h2 className="text-xl font-semibold mb-3">Top Donors</h2>
        <div className="glass p-3">
          {donors.length === 0 && <div className="opacity-70">No donations yet.</div>}
          <ul className="space-y-2">
            {donors.map((d, i) => (
              <li key={i} className="flex justify-between">
                <div>{d.discordId || short(d.address)}</div>
                <div>{formatZtc(BigInt(d.amount))} ZTC</div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <footer className="p-6 opacity-70">Built for Zenchain testnet</footer>
    </main>
  );
}