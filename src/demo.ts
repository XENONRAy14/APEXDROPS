import { CATALOG, cardById } from "./catalog";
import {
  canEnterLeague,
  draw,
  integer,
  leagueForRarity,
  pitRemainingSec,
  race,
  random,
  uuid,
} from "./engine";
import {
  BET_MAX,
  START_BONUS_PACKS,
  BET_MIN,
  DUEL_MAX_OPEN,
  DUEL_TTL_MS,
  DUEL_WINNER_SHARE,
  LIST_MAX,
  LIST_MAX_ACTIVE,
  LIST_MIN,
  PACK_COOLDOWN_MS,
  PACK_PRICE,
  SALVAGE,
  TRACKS,
} from "./rules";
import type {
  Action,
  ActionResult,
  Card,
  GameState,
  Owned,
  Profile,
} from "./types";
const KEY = "apex-drops-v4";
const iso = () => new Date().toISOString();
const id = () => uuid();
function starter(): GameState {
  const profile: Profile = {
    id: "demo",
    username: "Pilote",
    cash_balance: 28000,
    bonus_packs: START_BONUS_PACKS,
    pity_counter: 0,
    collection_score: 0,
    duels_won: 0,
    duels_lost: 0,
    referral_code: "DEMO",
    referrals_count: 0,
    last_pack_opened_at: new Date(0).toISOString(),
    referred_by: null,
    created_at: iso(),
  };
  const inventory: Owned[] = [0, 7, 8, 9, 11, 16, 20].map((n, i) => ({
    id: id(),
    card_id: n + 1,
    quantity: i === 2 ? 3 : 1,
    is_foil: i === 0,
    favorite: i === 0,
    cards: CATALOG[n],
  }));
  const names = ["Touge Club", "Mistral Racing", "Apex Hunter"];
  const bots = names.map((username, i) => ({
    ...profile,
    id: `bot-${i}`,
    username,
    collection_score: [482500, 326000, 194000][i],
    duels_won: [28, 19, 12][i],
    duels_lost: [9, 12, 8][i],
  }));
  const listings = [1, 4, 5, 12, 15, 21].map((n, i) => ({
    id: id(),
    seller_id: bots[i % 3].id,
    seller_name: names[i % 3],
    card_id: n + 1,
    is_foil: i === 2,
    price: [24000, 35000, 18000, 16500, 21000, 6500][i],
    status: "ACTIVE",
    created_at: iso(),
    cards: CATALOG[n],
  }));
  const duels = [7, 16, 20].map((n, i) => ({
    id: id(),
    creator_id: bots[i].id,
    creator_name: names[i],
    creator_card_id: n + 1,
    creator_is_foil: false,
    bet_amount: [1000, 1500, 2000][i],
    status: "OPEN",
    rarity_league: leagueForRarity(CATALOG[n].rarity),
    track_name: TRACKS[i % TRACKS.length],
    winner_name: null,
    creator_score: null,
    challenger_score: null,
    created_at: iso(),
    expires_at: new Date(Date.now() + 86400000).toISOString(),
    cards: CATALOG[n],
  }));
  return reconcile({
    profile,
    inventory,
    listings,
    duels,
    leaderboard: bots,
    history: [],
  });
}
function reconcile(s: GameState) {
  s.profile.collection_score = s.inventory.reduce(
    (v, u) => v + u.quantity * u.cards.market_value * (u.is_foil ? 2.5 : 1),
    0,
  );
  s.leaderboard = [
    ...s.leaderboard.filter((p) => p.id !== s.profile.id),
    { ...s.profile },
  ].sort((a, b) => b.collection_score - a.collection_score);
  return s;
}
function credit(s: GameState, amount: number, kind: string) {
  if (s.profile.cash_balance + amount < 0) throw Error("Crédits insuffisants.");
  s.profile.cash_balance += amount;
  s.history.unshift({
    id: id(),
    kind,
    amount,
    balance: s.profile.cash_balance,
    created_at: iso(),
  });
  s.history = s.history.slice(0, 50);
}
function add(s: GameState, cardId: number, foil: boolean) {
  const owned = s.inventory.find(
    (u) => u.card_id === cardId && u.is_foil === foil,
  );
  if (owned) owned.quantity++;
  else
    s.inventory.unshift({
      id: id(),
      card_id: cardId,
      is_foil: foil,
      quantity: 1,
      favorite: false,
      cards: cardById(cardId)!,
    });
  return !owned;
}
function read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as GameState & { catalog?: unknown };
      if (s.profile && Array.isArray(s.inventory) && Array.isArray(s.history)) {
        // Les cartes sauvegardées sont rafraîchies depuis le catalogue courant
        // (photos réparées, crédits) ; les anciennes sauvegardes V4 migrent seules.
        delete s.catalog;
        const fresh = <T extends { cards: Card; card_id?: number; creator_card_id?: number }>(x: T) => {
          const c = cardById(x.card_id ?? x.creator_card_id ?? x.cards.id);
          return c ? { ...x, cards: c } : x;
        };
        s.inventory = s.inventory.map(fresh);
        s.listings = s.listings.map(fresh);
        s.duels = s.duels.map(fresh);
        return s;
      }
    }
  } catch {
    /* corrupted demo falls back safely */
  }
  return starter();
}
function save(s: GameState) {
  localStorage.setItem(KEY, JSON.stringify(reconcile(s)));
}
function expire(s: GameState) {
  for (const d of s.duels)
    if (d.status === "OPEN" && new Date(d.expires_at).getTime() <= Date.now()) {
      d.status = "CANCELLED";
      if (d.creator_id === "demo") credit(s, d.bet_amount, "DUEL_REFUND");
    }
}
export function demoState() {
  const s = read();
  expire(s);
  save(s);
  return s;
}
export async function demoAction(
  action: Action,
  payload: Record<string, unknown>,
): Promise<ActionResult> {
  const run = () => {
    const s = read();
    expire(s);
    let result: ActionResult = {};
    const p = s.profile;
    if (action === "OPEN_PACK") {
      const bonus =
        Date.now() - new Date(p.last_pack_opened_at).getTime() <
        PACK_COOLDOWN_MS;
      if (bonus && p.bonus_packs < 1)
        throw Error("Ton booster gratuit n’est pas encore prêt.");
      if (bonus) p.bonus_packs--;
      else p.last_pack_opened_at = iso();
      result.cards = [];
      for (let i = 0; i < 3; i++) {
        const d = draw(p.pity_counter);
        p.pity_counter = d.pity;
        result.cards.push({
          ...d.card,
          is_foil: d.foil,
          is_new: add(s, d.card.id, d.foil),
        });
      }
    } else if (action === "BUY_PACK") {
      credit(s, -PACK_PRICE, action);
      p.bonus_packs++;
      result.message = "Un booster bonus rejoint ton paddock.";
    } else if (action === "QUICK_SELL") {
      let total = 0,
        n = 0;
      for (const u of s.inventory)
        if (!u.favorite && u.quantity > 1) {
          n += u.quantity - 1;
          total += (u.quantity - 1) * SALVAGE[u.cards.rarity];
          u.quantity = 1;
        }
      if (!n) throw Error("Aucun doublon disponible hors favoris.");
      credit(s, total, action);
      result.message = `${n} doublons recyclés · +${total} crédits.`;
    } else if (["LIST", "CREATE_DUEL", "FAVORITE"].includes(action)) {
      const u = s.inventory.find((u) => u.id === payload.cardId);
      if (!u) throw Error("Carte indisponible.");
      if (action === "FAVORITE") u.favorite = !u.favorite;
      else if (action === "LIST") {
        const price = integer(payload.price, LIST_MIN, LIST_MAX);
        if (
          s.listings.filter((m) => m.seller_id === "demo").length >=
          LIST_MAX_ACTIVE
        )
          throw Error("25 annonces actives maximum.");
        if (u.favorite)
          throw Error("Retire cette carte des favoris avant de la vendre.");
        if (
          s.duels.some(
            (d) =>
              d.creator_id === "demo" &&
              d.status === "OPEN" &&
              d.creator_card_id === u.card_id &&
              d.creator_is_foil === u.is_foil,
          )
        )
          throw Error("Annule le duel de cette carte avant de la vendre.");
        s.listings.unshift({
          id: id(),
          seller_id: "demo",
          seller_name: p.username,
          card_id: u.card_id,
          is_foil: u.is_foil,
          price,
          status: "ACTIVE",
          created_at: iso(),
          cards: u.cards,
        });
        u.quantity--;
        s.inventory = s.inventory.filter((u) => u.quantity > 0);
        result.message = "Annonce publiée. Retrait possible à tout moment.";
      } else {
        const bet = integer(payload.bet, BET_MIN, BET_MAX);
        if (
          s.duels.filter((d) => d.creator_id === "demo" && d.status === "OPEN")
            .length >= DUEL_MAX_OPEN
        )
          throw Error("Trois défis ouverts maximum.");
        credit(s, -bet, action);
        if (pitRemainingSec(u) > 0)
          throw Error(
            "Cette machine est en révision au stand (30 min entre deux courses).",
          );
        const pickedTrack =
          TRACKS[Math.min(TRACKS.length - 1, Math.floor(random() * TRACKS.length))];
        const lg = leagueForRarity(u.cards.rarity);
        s.duels.unshift({
          id: id(),
          creator_id: "demo",
          creator_name: p.username,
          creator_card_id: u.card_id,
          creator_is_foil: u.is_foil,
          bet_amount: bet,
          status: "OPEN",
          rarity_league: lg,
          track_name: pickedTrack,
          winner_name: null,
          creator_score: null,
          challenger_score: null,
          expires_at: new Date(Date.now() + DUEL_TTL_MS).toISOString(),
          created_at: iso(),
          cards: u.cards,
        });
        result.message = `Défi ${lg} ouvert sur ${pickedTrack} !`;
      }
    } else if (action === "BUY" || action === "CANCEL_LISTING") {
      const m = s.listings.find(
        (m) => m.id === payload.id && m.status === "ACTIVE",
      );
      if (!m) throw Error("Annonce indisponible.");
      if (action === "BUY") {
        if (m.seller_id === "demo") throw Error("C’est ta propre annonce.");
        credit(s, -m.price, action);
        m.status = "SOLD";
      } else {
        if (m.seller_id !== "demo")
          throw Error("Cette annonce ne t’appartient pas.");
        m.status = "CANCELLED";
      }
      add(s, m.card_id, m.is_foil);
      s.listings = s.listings.filter((m) => m.status === "ACTIVE");
      result.message = "Carte ajoutée au garage.";
    } else if (action === "ACCEPT_DUEL" || action === "CANCEL_DUEL") {
      const d = s.duels.find((d) => d.id === payload.id && d.status === "OPEN");
      if (!d) throw Error("Ce défi n’est plus ouvert.");
      if (action === "CANCEL_DUEL") {
        if (d.creator_id !== "demo")
          throw Error("Ce défi ne t’appartient pas.");
        credit(s, d.bet_amount, action);
        d.status = "CANCELLED";
        result.message = "Défi annulé, mise remboursée.";
      } else {
        if (d.creator_id === "demo")
          throw Error("Tu ne peux pas affronter ton propre défi.");
        const u = s.inventory.find((u) => u.id === payload.cardId);
        if (!u) throw Error("Sélectionne un véhicule.");
        if (pitRemainingSec(u) > 0)
          throw Error(
            "Cette machine est en révision au stand (30 min entre deux courses).",
          );
        const lg = d.rarity_league || leagueForRarity(d.cards.rarity);
        if (!canEnterLeague(u.cards.rarity, lg))
          throw Error(`Ce défi est limité à la ligue ${lg}.`);
        const r = race(d.cards, u.cards, random, d.track_name);
        credit(s, -d.bet_amount, action);
        u.last_raced_at = iso();
        const won = !r.aWins,
          pot = Math.floor(d.bet_amount * 2 * DUEL_WINNER_SHARE);
        if (won) {
          credit(s, pot, "DUEL_WIN");
          p.duels_won++;
        } else p.duels_lost++;
        Object.assign(d, {
          status: "FINISHED",
          track_name: r.track_name,
          winner_name: won ? p.username : d.creator_name,
          creator_score: r.aScore,
          challenger_score: r.bScore,
        });
        result.duel = {
          track_name: r.track_name,
          winner_id: won ? "demo" : d.creator_id,
          winner_name: d.winner_name!,
          creator_card: d.cards.name,
          challenger_card: u.cards.name,
          creator_card_id: d.cards.id,
          challenger_card_id: u.cards.id,
          creator_score: r.aScore,
          challenger_score: r.bScore,
          pot_won: pot,
        };
      }
    } else if (action === "CLAIM_REFERRAL")
      throw Error("Le parrainage nécessite un compte connecté.");
    save(s);
    return result;
  };
  return navigator.locks ? navigator.locks.request(KEY, run) : run();
}
export function resetDemo() {
  localStorage.removeItem(KEY);
  return demoState();
}
