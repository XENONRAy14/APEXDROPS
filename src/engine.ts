import { CATALOG } from "./catalog";
import {
  FOIL_RATE,
  PILOT_VARIANCE,
  PITY_LIMIT,
  PITY_MYTHIC_RATE,
  RARITY_ODDS,
  SCORE_POWER_REF,
  SCORE_SPEED_REF,
  TRACK_WEIGHTS,
  TRACKS,
} from "./rules";
import type { Card, Rarity } from "./types";
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
  return (
    p * weights[0] +
    v * weights[1] +
    c.handling_score * weights[2] +
    l * weights[3]
  );
}
export function race(a: Card, b: Card, rng = random) {
  if (a.division !== b.division)
    throw Error("Choisis un véhicule de la même catégorie.");
  const track = Math.min(TRACKS.length - 1, Math.floor(rng() * TRACKS.length));
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
