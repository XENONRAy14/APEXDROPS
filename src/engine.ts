import { CATALOG } from "./catalog";
import {
  FOIL_RATE,
  LEAGUE_MAX_RANK,
  PILOT_VARIANCE,
  PIT_COOLDOWN_MS,
  PITY_LIMIT,
  PITY_MYTHIC_RATE,
  RARITY_ODDS,
  SCORE_POWER_REF,
  SCORE_SPEED_REF,
  TRACK_WEIGHTS,
  TRACKS,
  type League,
} from "./rules";
import type { Card, Owned, Rarity } from "./types";

const RARITY_RANK: Record<Rarity, number> = {
  Common: 0,
  Rare: 1,
  Epic: 2,
  Legendary: 3,
  Mythic: 4,
};

export function leagueForRarity(r: Rarity): League {
  if (r === "Common" || r === "Rare") return "Street";
  if (r === "Epic" || r === "Legendary") return "Pro";
  return "Hyper";
}

export function canEnterLeague(r: Rarity, league?: League | null): boolean {
  if (!league) return true;
  return RARITY_RANK[r] <= LEAGUE_MAX_RANK[league];
}

export function pitRemainingSec(u: Owned, now = Date.now()): number {
  if (u.quantity > 1 || !u.last_raced_at) return 0;
  const end = new Date(u.last_raced_at).getTime() + PIT_COOLDOWN_MS;
  return Math.max(0, Math.ceil((end - now) / 1000));
}
export function random() {
  return crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
}
export function draw(
  pity: number,
  rng = random,
): { card: Card; foil: boolean; pity: number } {
  const r = rng();
  let rarity: Rarity;
  if (pity >= PITY_LIMIT - 1)
    rarity = rng() < PITY_MYTHIC_RATE ? "Mythic" : "Legendary";
  else {
    rarity = "Common";
    for (const [name, threshold] of RARITY_ODDS)
      if (r < threshold) {
        rarity = name;
        break;
      }
  }
  const pool = CATALOG.filter((c) => c.rarity === rarity);
  return {
    card: pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))],
    foil: rng() < FOIL_RATE,
    pity: rarity === "Legendary" || rarity === "Mythic" ? 0 : pity + 1,
  };
}
export function score(c: Card, track: number) {
  const p = Math.min(c.power_hp / SCORE_POWER_REF, 1) * 100,
    v = Math.min(c.top_speed_kmh / SCORE_SPEED_REF, 1) * 100,
    l = Math.max(0, Math.min(100, (2000 - c.weight_kg) / 18));
  const weights = TRACK_WEIGHTS[track];
  const base =
    p * weights[0] +
    v * weights[1] +
    c.handling_score * weights[2] +
    l * weights[3];
  // Touge & Pluie (Espigoulier = 0, Akina = 5) : surpuissance = patinage, poids lourd = inertie, poids plume = bonus.
  if (track === 0 || track === 5) {
    const wheelspin = Math.min(18, Math.max(0, (c.power_hp - 320) / 38));
    const inertia = Math.min(16, Math.max(0, (c.weight_kg - 1150) / 45));
    const feather =
      c.division === "Moto"
        ? 0
        : Math.min(8, Math.max(0, (1050 - c.weight_kg) / 30));
    return Math.max(5, Math.min(100, base + feather - wheelspin - inertia));
  }
  // Col technique & Urbain (Gineste = 2, Monaco = 3) : gabarit lourd et excès de puissance pénalisés.
  if (track === 2 || track === 3) {
    const wheelspin = Math.min(12, Math.max(0, (c.power_hp - 520) / 55));
    const inertia = Math.min(10, Math.max(0, (c.weight_kg - 1380) / 60));
    return Math.max(5, Math.min(100, base - wheelspin - inertia));
  }
  return base;
}

export function trackNote(c: Card, track: number): { text: string; tone: "good" | "warn" | "neutral" } {
  if (track === 0 || track === 5) {
    const pen =
      Math.min(18, Math.max(0, (c.power_hp - 320) / 38)) +
      Math.min(16, Math.max(0, (c.weight_kg - 1150) / 45));
    const bon =
      c.division === "Moto"
        ? 0
        : Math.min(8, Math.max(0, (1050 - c.weight_kg) / 30));
    if (pen >= 8)
      return {
        text: `Trop lourde / puissante en épingle (-${pen.toFixed(0)} pts)`,
        tone: "warn",
      };
    if (bon >= 2 || c.handling_score >= 88)
      return {
        text: `Spécialiste Touge & Pluie (+${Math.max(1, bon).toFixed(0)} pts)`,
        tone: "good",
      };
  }
  if (track === 2 || track === 3) {
    const pen =
      Math.min(12, Math.max(0, (c.power_hp - 520) / 55)) +
      Math.min(10, Math.max(0, (c.weight_kg - 1380) / 60));
    if (pen >= 6)
      return {
        text: `Gabarit pénalisé dans le sinueux (-${pen.toFixed(0)} pts)`,
        tone: "warn",
      };
    if (c.handling_score >= 86)
      return { text: "Châssis affûté pour le sinueux", tone: "good" };
  }
  if ((track === 1 || track === 4 || track === 7) && c.top_speed_kmh >= 310)
    return { text: "Pleine charge · Reine des lignes droites", tone: "good" };
  return { text: "Configuration équilibrée", tone: "neutral" };
}
export function trackIndex(name?: string | null): number {
  const idx = name ? TRACKS.indexOf(name) : -1;
  return idx >= 0 ? idx : 0;
}
export function race(
  a: Card,
  b: Card,
  rng = random,
  presetTrack?: string | null,
) {
  if (a.division !== b.division)
    throw Error("Choisis un véhicule de la même catégorie.");
  const preset = presetTrack ? TRACKS.indexOf(presetTrack) : -1;
  const track =
    preset >= 0
      ? preset
      : Math.min(TRACKS.length - 1, Math.floor(rng() * TRACKS.length));
  const vary = () => 1 - PILOT_VARIANCE / 2 + rng() * PILOT_VARIANCE;
  const aScore = Math.round(score(a, track) * vary() * 100) / 100,
    bScore = Math.round(score(b, track) * vary() * 100) / 100;
  return {
    track_name: TRACKS[track],
    aScore,
    bScore,
    aWins: aScore === bScore ? rng() < 0.5 : aScore > bScore,
  };
}
export function integer(value: unknown, min: number, max: number) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < min || n > max)
    throw Error(
      `Choisis un nombre entier entre ${min.toLocaleString("fr-FR")} et ${max.toLocaleString("fr-FR")}.`,
    );
  return n;
}

export function uuid() {
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 15) | 64;
  b[8] = (b[8] & 63) | 128;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
