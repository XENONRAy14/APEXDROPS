import type { Rarity } from "./types";

// Source unique des règles économiques côté client (démo + interface).
// ATTENTION : toute valeur modifiée ici doit être répercutée dans le SQL —
// supabase/migrations (game_action, race_score, salvage_value) reste
// l'implémentation qui fait foi en mode connecté.

// Boosters
export const PACK_PRICE = 15000;
export const PACK_CARDS = 3;
export const PACK_COOLDOWN_MS = 600_000; // 10 minutes

// Tirages : seuils cumulés par rareté (hors garantie pity)
export const RARITY_ODDS: [Rarity, number][] = [
  ["Mythic", 0.003],
  ["Legendary", 0.023],
  ["Epic", 0.15],
  ["Rare", 0.45],
];
export const PITY_LIMIT = 30; // 30e carte garantie si 29 tirages sans L/M
export const PITY_MYTHIC_RATE = 0.1;
export const FOIL_RATE = 0.08;
export const FOIL_MULTIPLIER = 2.5;

// Recyclage des doublons par rareté
export const SALVAGE: Record<Rarity, number> = {
  Common: 100,
  Rare: 250,
  Epic: 600,
  Legendary: 1400,
  Mythic: 3000,
};

// Marché
export const LIST_MIN = 500;
export const LIST_MAX = 50_000_000;
export const LIST_MAX_ACTIVE = 25;
export const MARKET_FEE = 0.1; // commission vendeur

// Duels
export const BET_MIN = 1000;
export const BET_MAX = 1_000_000;
export const DUEL_MAX_OPEN = 3;
export const DUEL_TTL_MS = 86_400_000; // 24 h
export const DUEL_WINNER_SHARE = 0.95;
export const TRACKS = [
  "Espigoulier · Pluie",
  "Hunaudières · Vitesse",
  "Gineste · Technique",
  "Monaco · Précision",
];
// Pondérations [puissance, vitesse, châssis, légèreté] par circuit
export const TRACK_WEIGHTS = [
  [0.08, 0.07, 0.55, 0.3],
  [0.4, 0.45, 0.1, 0.05],
  [0.2, 0.15, 0.45, 0.2],
  [0.1, 0.15, 0.55, 0.2],
];
export const SCORE_POWER_REF = 700;
export const SCORE_SPEED_REF = 370;
export const PILOT_VARIANCE = 0.06; // ±3 % autour de 1.0

// Démarrage et parrainage
export const START_CASH = 5000;
export const START_BONUS_PACKS = 2;
export const REFERRAL_WINDOW_DAYS = 7;
export const REFERRAL_PACKS_REFI = 2;
export const REFERRAL_CASH_REFI = 5000;
export const REFERRAL_PACKS_REFERRER = 3;
export const REFERRAL_CASH_REFERRER = 7500;
