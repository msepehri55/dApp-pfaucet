"use client";
import { useEffect, useState } from "react";

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
  const [discordUsername, setDiscordUsername] = useState("");
  const [claiming, setClaiming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [donors, setDonors] = useState<any[]>([]);
  const [page, setPage] = useState(0);
  const pageSize = 5;

  async function loadBalance() {
    // Add cache-busting query param to bypass any CDN cache
    const res = await fetch(`/api/balance?t=${Date.now()}`, { cache: "no-store" });
    const json = await res.json();
    if (json?.balance) setBalance(json.balance);
  }
  async function loadDonors() {
    // Add cache-busting query param to bypass any CDN cache
    const res = await fetch(`/api/donors?t=${Date.now()}`, { cache: "no-store" });
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
        body: JSON.stringify({ address, discordUsername })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "failed");
      setMessage(`Sent! Tx: ${json.txHash}`);
      await loadBalance();
      await loadDonors();
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setClaiming(false);
    }
  }

  const pageStart = page * pageSize;
  const pageEnd = pageStart + pageSize;
  const pageItems = donors.slice(pageStart, pageEnd);
  const canPrev = page > 0;
  const canNext = pageEnd < donors.length;

  return (
    <main className="min-h-screen bg-[#0B0B0F] text-[#E8F5E9] flex flex-col items-center">
      <header className="w-full max-w-4xl flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="logo" className="h-10 w-10" />
          <h1 className="text-2xl font-bold gradient-text">Zenchain pfaucet</h1>
        </div>
        <div className="text-xs opacity-70 font-mono">{short(CONTRACT)}</div>
      </header>

      <section className="w-full max-w-4xl grid md:grid-cols-2 gap-6 p-4">
        <div className="glass p-5">
          <h2 className="text-xl font-semibold mb-2 gradient-text">Donate ZTC</h2>
          <p className="text-sm opacity-80 mb-2">Send ZTC directly to the faucet contract:</p>
          <div className="font-mono text-lg break-all">{CONTRACT}</div>
          <div className="mt-3 text-sm opacity-80">
            Faucet balance: <span className="font-semibold">{formatZtc(balance)} ZTC</span>
          </div>
        </div>

        <div className="glass p-5">
          <h2 className="text-xl font-semibold mb-2 gradient-text">Request 100 ZTC</h2>
          <p className="text-sm opacity-80 mb-3">
            Only allowlisted wallets (matching Discord username) can claim once per 24h and only if wallet has &lt; 100 ZTC.
          </p>

          <label className="block text-sm mb-1">Wallet address</label>
          <input value={address} onChange={e => setAddress(e.target.value)} placeholder="0x..." className="input" />

          <label className="block text-sm mt-3 mb-1">Discord username</label>
          <input value={discordUsername} onChange={e => setDiscordUsername(e.target.value)} placeholder="e.g. m.sepehri" className="input" />

          <button disabled={claiming} onClick={claim} className="btn mt-4">
            {claiming ? "Sending..." : "Claim 100 ZTC"}
          </button>
          {message && <div className="mt-3 text-sm">{message}</div>}
        </div>
      </section>

      <section className="w-full max-w-4xl p-4">
        <h2 className="text-xl font-semibold mb-3 gradient-text">Top Donors</h2>
        <div className="glass p-4">
          {pageItems.length === 0 && <div className="opacity-70">No donations yet.</div>}
          <ul className="space-y-2">
            {pageItems.map((d, i) => (
              <li key={i} className="flex justify-between">
                <div>{d.username || "Unknown"}</div>
                <div>{formatZtc(BigInt(d.amount))} ZTC</div>
              </li>
            ))}
          </ul>
          <div className="flex justify-between items-center mt-4">
            <button className="btn" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={!canPrev} style={{ opacity: canPrev ? 1 : 0.6 }}>
              Prev
            </button>
            <div className="text-sm opacity-80">
              Page {page + 1} / {Math.max(1, Math.ceil(donors.length / pageSize))}
            </div>
            <button className="btn" onClick={() => setPage(p => (canNext ? p + 1 : p))} disabled={!canNext} style={{ opacity: canNext ? 1 : 0.6 }}>
              Next
            </button>
          </div>
        </div>
      </section>

      <footer className="w-full max-w-4xl p-6 flex flex-col md:flex-row gap-3 md:items-center md:justify-between opacity-90">
        <div>made by <span className="font-bold gradient-text">m.sepehri</span></div>
        <div className="flex gap-3">
          <a className="btn" href="https://discord.com/users/547427240690974730" target="_blank" rel="noopener noreferrer">Discord</a>
          <a className="btn" href="https://github.com/msepehri55" target="_blank" rel="noopener noreferrer">GitHub</a>
        </div>
      </footer>
    </main>
  );
}