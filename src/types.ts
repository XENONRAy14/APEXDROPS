export type Rarity = "Common" | "Rare" | "Epic" | "Legendary" | "Mythic";
export type Division = "Route" | "Compétition" | "Moto";
export interface Card {
  id: number;
  name: string;
  category: string;
  rarity: Rarity;
  power_hp: number;
  weight_kg: number;
  top_speed_kmh: number;
  handling_score: number;
  year: number;
  market_value: number;
  image_url: string;
  lore: string;
  division: Division;
  color: string;
  shape: "coupe" | "hatch" | "race" | "moto";
  wikidata_id?: string | null;
  brand?: string | null;
  image_page?: string | null;
  image_credit?: string | null;
}
export interface Owned {
  id: string;
  card_id: number;
  quantity: number;
  is_foil: boolean;
  favorite: boolean;
  cards: Card;
}
export interface Profile {
  id: string;
  username: string;
  cash_balance: number;
  bonus_packs: number;
  pity_counter: number;
  collection_score: number;
  duels_won: number;
  duels_lost: number;
  referral_code: string;
  referrals_count: number;
  last_pack_opened_at: string;
  referred_by: string | null;
  created_at: string;
}
export interface Listing {
  id: string;
  seller_id: string;
  seller_name: string;
  card_id: number;
  is_foil: boolean;
  price: number;
  status: string;
  created_at: string;
  cards: Card;
}
export interface Duel {
  id: string;
  creator_id: string;
  creator_name: string;
  creator_card_id: number;
  creator_is_foil: boolean;
  bet_amount: number;
  status: string;
  track_name: string | null;
  winner_name: string | null;
  creator_score: number | null;
  challenger_score: number | null;
  expires_at: string;
  created_at: string;
  cards: Card;
}
export interface Entry {
  id: string;
  kind: string;
  amount: number;
  balance: number;
  created_at: string;
}
export interface GameState {
  profile: Profile;
  inventory: Owned[];
  listings: Listing[];
  duels: Duel[];
  leaderboard: Profile[];
  history: Entry[];
  catalog_size?: number;
}
export interface Draw extends Card {
  is_foil: boolean;
  is_new: boolean;
}
export interface DuelResult {
  track_name: string;
  winner_name: string;
  winner_id: string;
  creator_card: string;
  challenger_card: string;
  creator_score: number;
  challenger_score: number;
  pot_won: number;
}
export type Action =
  | "OPEN_PACK"
  | "BUY_PACK"
  | "QUICK_SELL"
  | "LIST"
  | "BUY"
  | "CANCEL_LISTING"
  | "CREATE_DUEL"
  | "ACCEPT_DUEL"
  | "CANCEL_DUEL"
  | "FAVORITE"
  | "CLAIM_REFERRAL";
export interface ActionResult {
  cards?: Draw[];
  duel?: DuelResult;
  message?: string;
}
export type Run = (
  action: Action,
  payload?: Record<string, unknown>,
  done?: (r: ActionResult) => void,
) => void;
