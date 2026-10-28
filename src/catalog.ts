import type { Card, Rarity } from "./types";
export { PACK_PRICE, SALVAGE, TRACKS } from "./rules";

// Catalogue généré par scripts/build-catalog.mjs (Wikidata + Commons).
// Chargé à la demande dans un chunk séparé : plusieurs milliers de cartes
// n'alourdissent pas le bundle principal et restent en cache navigateur.
export let CATALOG: Card[] = [];
let byId = new Map<number, Card>();

export async function loadCatalog() {
  if (CATALOG.length) return CATALOG;
  const data = (await import("./data/catalog.json")).default as Card[];
  CATALOG = data;
  byId = new Map(data.map((c) => [c.id, c]));
  return CATALOG;
}

export const cardById = (id: number) => byId.get(id);

export const RARITY_LABEL: Record<Rarity, string> = {
  Common: "Commune",
  Rare: "Rare",
  Epic: "Épique",
  Legendary: "Légendaire",
  Mythic: "Mythique",
};
