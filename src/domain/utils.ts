export const MINUTE = 60_000;
export const HOUR = 3_600_000;
export const DAY = 86_400_000;

export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

export function clamp01(x: number): number {
  return clamp(x, 0, 1);
}

let idCounter = 0;
export function uid(prefix: string): string {
  idCounter = (idCounter + 1) % 46656; // 36^3
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}${idCounter.toString(36)}${rand}`;
}

/** Deterministic small PRNG (mulberry32) for reproducible fuzz in tests. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function daysBetween(a: number, b: number): number {
  return (b - a) / DAY;
}

export function round(x: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(x * f) / f;
}

export function pct(x: number): number {
  return Math.round(clamp01(x) * 100);
}

export function shuffle<T>(arr: T[], rng: () => number = Math.random): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\u2018\u2019\u201C\u201D]/g, "'")
    .replace(/[.,;:!?"()\[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function containsAny(text: string, keywords: string[]): string | null {
  const t = normalizeText(text);
  for (const k of keywords) {
    const nk = normalizeText(k);
    if (nk && t.includes(nk)) return k;
  }
  return null;
}

export function unique<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

export function sum(arr: number[]): number {
  let s = 0;
  for (const x of arr) s += x;
  return s;
}

export function mean(arr: number[]): number {
  return arr.length ? sum(arr) / arr.length : 0;
}

export function wordCount(s: string): number {
  return s.trim() ? s.trim().split(/\s+/).length : 0;
}
