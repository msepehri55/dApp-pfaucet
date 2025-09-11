import { parse } from "csv-parse/sync";

type Entry = { wallet_address: string; discord_id: string };

// simple in-memory cache for ~5 minutes between invocations
let cache: { at: number; map: Map<string, string> } | null = null;

function normalize(a: string) {
  return a.trim().toLowerCase();
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
    trim: true
  }) as Entry[];

  const map = new Map<string, string>();
  for (const row of records) {
    if (!row.wallet_address || !row.discord_id) continue;
    map.set(normalize(row.wallet_address), String(row.discord_id).trim());
  }

  cache = { at: now, map };
  return map;
}

export async function isAllowedPair(address: string, discordId: string) {
  const map = await getAllowlist();
  return map.get(address.toLowerCase()) === (discordId || "").trim();
}

export async function discordFor(address: string): Promise<string | null> {
  const map = await getAllowlist();
  return map.get(address.toLowerCase()) || null;
}