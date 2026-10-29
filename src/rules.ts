import type { Rarity } from "./types";

// Source unique des règles économiques côté client (démo + interface).
// ATTENTION : toute valeur modifiée ici doit être répercutée dans le SQL —
// supabase/migrations (game_action, race_score, salvage_value) reste
// l'implémentation qui fait foi en mode connecté.

// Boosters
export const PACK_PRICE = 15000;
export const PACK_CARDS = 3;
export const PACK_COOLDOWN_MS = 600_000; // 10 minutes

export type PackId =
  | "origins"
  | "jdm"
  | "muscle"
  | "moto"
  | "f1"
  | "initiald"
  | "euro"
  | "apex";

export interface PackSpec {
  id: PackId;
  name: string;
  subtitle: string;
  symbol: string;
  accent: string;
  gradient: string;
  price: number;
  freeEligible?: boolean;
  foilRate: number;
  // Seuils cumulés [Mythic, Legendary, Epic, Rare] — le reste tombe en Common
  odds: [Rarity, number][];
  oddsLabel: string;
}

export const PACKS: PackSpec[] = [
  {
    id: "origins",
    name: "Origins Mix",
    subtitle: "Toutes les 5 513 machines",
    symbol: "源",
    accent: "#ef4444",
    gradient: "linear-gradient(155deg, #3b1219 0%, #170d16 55%, #0b0e17 100%)",
    price: 15000,
    freeEligible: true,
    foilRate: 0.08,
    odds: [
      ["Mythic", 0.003],
      ["Legendary", 0.023],
      ["Epic", 0.15],
      ["Rare", 0.45],
    ],
    oddsLabel: "0,3 % Myth. · 2 % Lég. · 12,7 % Ép.",
  },
  {
    id: "jdm",
    name: "JDM & Touge",
    subtitle: "Japonaises · Nismo, VTEC & Rotatif",
    symbol: "峠",
    accent: "#f43f5e",
    gradient: "linear-gradient(155deg, #4c1127 0%, #1d1022 55%, #0b0e17 100%)",
    price: 18000,
    foilRate: 0.09,
    odds: [
      ["Mythic", 0.008],
      ["Legendary", 0.048],
      ["Epic", 0.228],
      ["Rare", 0.6],
    ],
    oddsLabel: "0,8 % Myth. · 4 % Lég. · 18 % Ép.",
  },
  {
    id: "muscle",
    name: "American Muscle",
    subtitle: "V8 US · Mustang, Charger, Corvette, Viper",
    symbol: "烈",
    accent: "#f97316",
    gradient: "linear-gradient(155deg, #4a200d 0%, #1f140e 55%, #0b0e17 100%)",
    price: 18000,
    foilRate: 0.09,
    odds: [
      ["Mythic", 0.008],
      ["Legendary", 0.048],
      ["Epic", 0.228],
      ["Rare", 0.6],
    ],
    oddsLabel: "0,8 % Myth. · 4 % Lég. · 18 % Ép.",
  },
  {
    id: "moto",
    name: "MotoGP & Superbike",
    subtitle: "1 117 Deux-roues · Ducati, Yamaha, Honda, Kawasaki",
    symbol: "輪",
    accent: "#06b6d4",
    gradient: "linear-gradient(155deg, #0c3547 0%, #0e1b2a 55%, #0b0e17 100%)",
    price: 18000,
    foilRate: 0.09,
    odds: [
      ["Mythic", 0.008],
      ["Legendary", 0.048],
      ["Epic", 0.228],
      ["Rare", 0.6],
    ],
    oddsLabel: "0,8 % Myth. · 4 % Lég. · 18 % Ép.",
  },
  {
    id: "f1",
    name: "F1 & Le Mans",
    subtitle: "1 294 Monoplaces, Groupe C, WRC & Prototypes",
    symbol: "速",
    accent: "#22c55e",
    gradient: "linear-gradient(155deg, #0d3b26 0%, #0e1f1b 55%, #0b0e17 100%)",
    price: 24000,
    foilRate: 0.1,
    odds: [
      ["Mythic", 0.015],
      ["Legendary", 0.075],
      ["Epic", 0.315],
      ["Rare", 0.7],
    ],
    oddsLabel: "1,5 % Myth. · 6 % Lég. · 24 % Ép.",
  },
  {
    id: "initiald",
    name: "Initial D · Project D",
    subtitle: "AE86, RX-7 FD/FC, GT-R, Silvia, Evo, Impreza, NSX",
    symbol: "藤",
    accent: "#eab308",
    gradient: "linear-gradient(155deg, #47380b 0%, #1f1b0d 55%, #0b0e17 100%)",
    price: 28000,
    foilRate: 0.12,
    odds: [
      ["Mythic", 0.025],
      ["Legendary", 0.125],
      ["Epic", 0.45],
      ["Rare", 0.8],
    ],
    oddsLabel: "2,5 % Myth. · 10 % Lég. · 32,5 % Ép.",
  },
  {
    id: "euro",
    name: "Euro Prestige",
    subtitle: "Ferrari, Lamborghini, Porsche, McLaren, Bugatti, Pagani",
    symbol: "皇",
    accent: "#a855f7",
    gradient: "linear-gradient(155deg, #331454 0%, #19102a 55%, #0b0e17 100%)",
    price: 32000,
    foilRate: 0.12,
    odds: [
      ["Mythic", 0.025],
      ["Legendary", 0.125],
      ["Epic", 0.45],
      ["Rare", 0.8],
    ],
    oddsLabel: "2,5 % Myth. · 10 % Lég. · 32,5 % Ép.",
  },
  {
    id: "apex",
    name: "Coffre APEX VIP",
    subtitle: "100 % Épique, Légendaire ou Mythique · 0 % Commune/Rare",
    symbol: "極",
    accent: "#fbbf24",
    gradient: "linear-gradient(155deg, #5c4209 0%, #2b1708 50%, #090b10 100%)",
    price: 55000,
    foilRate: 0.15,
    odds: [
      ["Mythic", 0.05],
      ["Legendary", 0.25],
      ["Epic", 1.0],
      ["Rare", 1.0],
    ],
    oddsLabel: "5 % Mythic · 20 % Légendaire · 75 % Épique",
  },
];

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
  "Monza · Pleine charge",
  "Akina · Descente Touge",
  "Nürburgring · Nordschleife",
  "Wangan · Minuit",
];
export const TRACK_TAGS = [
  "Pluie · Châssis & Légèreté",
  "Ligne droite · Vitesse & Puissance",
  "Col rapide · Équilibre & Grip",
  "Urbain · Précision pure",
  "Pleine charge · Puissance brute",
  "Touge · Poids plume & Épingles",
  "Complet · Polyvalence totale",
  "Autoroute · Vitesse de pointe",
];
// Pondérations [puissance, vitesse, châssis, légèreté] par circuit
export const TRACK_WEIGHTS = [
  [0.08, 0.07, 0.55, 0.3],
  [0.4, 0.45, 0.1, 0.05],
  [0.2, 0.15, 0.45, 0.2],
  [0.1, 0.15, 0.55, 0.2],
  [0.55, 0.35, 0.05, 0.05],
  [0.05, 0.05, 0.5, 0.4],
  [0.25, 0.25, 0.25, 0.25],
  [0.3, 0.6, 0.05, 0.05],
];
export const SCORE_POWER_REF = 700;
export const SCORE_SPEED_REF = 370;
export const PILOT_VARIANCE = 0.06; // ±3 % autour de 1.0
export const PIT_COOLDOWN_MS = 1_800_000; // 30 min de révision au stand après une course

export type League = "Street" | "Pro" | "Hyper";
export const LEAGUE_LABEL: Record<League, string> = {
  Street: "Ligue Street (Commune · Rare)",
  Pro: "Ligue Pro (Épique · Légendaire max)",
  Hyper: "Ligue Hyper (Toutes raretés)",
};
export const LEAGUE_MAX_RANK: Record<League, number> = {
  Street: 1, // Common (0), Rare (1)
  Pro: 3, // + Epic (2), Legendary (3)
  Hyper: 4, // + Mythic (4)
};

// Démarrage et parrainage
export const START_CASH = 5000;
export const START_BONUS_PACKS = 2;
export const REFERRAL_WINDOW_DAYS = 7;
export const REFERRAL_PACKS_REFI = 2;
export const REFERRAL_CASH_REFI = 5000;
export const REFERRAL_PACKS_REFERRER = 3;
export const REFERRAL_CASH_REFERRER = 7500;
