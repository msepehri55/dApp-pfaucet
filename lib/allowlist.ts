import { parse } from "csv-parse/sync";

// The sheet uses headers like "Discord username" and "wallet address"
type Row = Record<string, string>;

let cache: { at: number; map: Map<string, string> } | null = null;

function normalizeKey(k: string) {
  return k.toLowerCase().replace(/[\s_]+/g, "");
}
function normalizeAddr(a: string) {
  return (a || "").trim().toLowerCase();
}

export async function getAllowlist(): Promise<Map<string, string>> {
  const now = Date.now();
  if (cache && now - cache.at < 5 * 60 * 1000) return cache.map;

  const url = process.env.ALLOWLIST_CSV_URL!;
  if (!url) throw new Error("ALLOWLIST_CSV_URL missing");

  const res = await fetch(url);
  const text = await res.text();

  const records = parse(text, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Row[];

  const map = new Map<string, string>();

  for (const row of records) {
    // Normalize headers to be tolerant of spaces/underscores/case
    const norm: Record<string, string> = {};
    for (const [k, v] of Object.entries(row)) {
      norm[normalizeKey(k)] = (v ?? "").toString().trim();
    }
    const wallet = norm["walletaddress"] || norm["address"] || norm["wallet"];
    const username =
      norm["discordusername"] ||
      norm["discord"] ||
      norm["username"] ||
      norm["discordname"];

    if (wallet && username) {
      map.set(normalizeAddr(wallet), username);
    }
  }

  cache = { at: now, map };
  return map;
}

export async function isAllowedPair(address: string, discordUsername: string) {
  const map = await getAllowlist();
  return map.get(address.toLowerCase()) === (discordUsername || "").trim();
}

export async function discordFor(address: string): Promise<string | null> {
  const map = await getAllowlist();
  return map.get(address.toLowerCase()) || null;
}