import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ArrowRight, Check, Flag, LogOut, RefreshCw, Search, Trophy } from "lucide-react";
import { CarArt, Empty, Modal, VehicleCard } from "./components";
import { CATALOG, RARITY_LABEL, SALVAGE, cardById } from "./catalog";
import { LIST_MAX, LIST_MIN, BET_MAX, BET_MIN, TRACKS } from "./rules";
import { score, trackIndex } from "./engine";
import { TrackProfile } from "./views/Arena";
import { eventNames, money, refUrl } from "./format";
import type {
  Card,
  Draw,
  Duel,
  DuelResult,
  Entry,
  Listing,
  Owned,
  Profile,
  Rarity,
  Run,
} from "./types";

export function DetailModal({
  card,
  onClose,
}: {
  card: Card;
  onClose: () => void;
}) {
  return (
    <Modal title={card.name} onClose={onClose}>
      <div className={`detail-art rarity-${card.rarity.toLowerCase()}`}>
        <CarArt card={card} />
      </div>
      <div className="detail-meta">
        <span>{RARITY_LABEL[card.rarity]}</span>
        <span>{card.division}</span>
        <span>{card.year}</span>
      </div>
      <p>{card.lore}</p>
      <div className="detail-stats">
        {[
          ["Puissance", `${card.power_hp} ch`],
          ["Poids", `${card.weight_kg} kg`],
          ["Vitesse", `${card.top_speed_kmh} km/h`],
          ["Châssis", `${card.handling_score}/100`],
        ].map(([k, v]) => (
          <div key={k}>
            <small>{k}</small>
            <b>{v}</b>
          </div>
        ))}
      </div>
      <div className="info-note">
        Recyclage d’un doublon : {money(SALVAGE[card.rarity])} CR. La finition
        holo ne change pas les performances.
      </div>
      {card.image_page && (
        <small className="footnote">
          Photo :{" "}
          <a href={card.image_page} target="_blank" rel="noopener noreferrer">
            {card.image_credit || "Wikimedia Commons"}
          </a>
          {card.wikidata_id && (
            <>
              {" · "}
              <a
                href={`https://www.wikidata.org/wiki/${card.wikidata_id}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Fiche Wikidata
              </a>
            </>
          )}
        </small>
      )}
      <small className="footnote">
        Les caractéristiques servent à l’équilibrage du jeu : réelles quand
        Wikidata les fournit, estimées sinon. Ce n’est pas une fiche
        constructeur.
      </small>
    </Modal>
  );
}

// Durée du suspense avant le retournement, selon la rareté.
const TEASE_MS: Record<Rarity, number> = {
  Common: 700,
  Rare: 950,
  Epic: 1500,
  Legendary: 2000,
  Mythic: 2500,
};
const HIGH_ROLL = new Set<Rarity>(["Epic", "Legendary", "Mythic"]);

export function DrawsModal({
  draws,
  onInspect,
  onDone,
  onClose,
}: {
  draws: Draw[];
  onInspect: (d: Draw) => void;
  onDone: () => void;
  onClose: () => void;
}) {
  const [shown, setShown] = useState<Set<number>>(new Set());
  const [teasing, setTeasing] = useState<number | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [mass, setMass] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const startReveal = (i: number) => {
    if (shown.has(i) || teasing !== null) return;
    const d = draws[i];
    setTeasing(i);
    timer.current = setTimeout(() => {
      setShown((s) => new Set(s).add(i));
      setTeasing(null);
      if (d.is_foil || d.rarity === "Legendary" || d.rarity === "Mythic") {
        setFlash(d.color);
        setTimeout(() => setFlash(null), 750);
      }
    }, TEASE_MS[d.rarity]);
  };
  const revealAll = () => {
    clearTimeout(timer.current);
    setTeasing(null);
    setMass(true);
    setShown(new Set(draws.map((_, i) => i)));
  };
  const done = shown.size === draws.length;

  return (
    <Modal title="Ton booster Origins" wide onClose={onClose}>
      {flash && <div className="reveal-flash" style={{ background: flash }} />}
      <p className="modal-intro">
        {done
          ? "Trois nouvelles histoires pour ton garage."
          : `${shown.size}/3 révélées · touche une carte pour la retourner.`}
      </p>
      <div className="reveal-grid">
        {draws.map((d, i) =>
          shown.has(i) ? (
            <div
              className={`revealed-card flip-in rarity-${d.rarity.toLowerCase()}`}
              style={mass ? { animationDelay: `${i * 140}ms` } : undefined}
              key={i}
            >
              <VehicleCard
                card={d}
                foil={d.is_foil}
                onInspect={() => onInspect(d)}
              />
              <span className={`new-badge ${d.is_new ? "" : "duplicate"}`}>
                {d.is_new ? "NOUVELLE CARTE" : "DOUBLON"}
                {d.is_foil ? " · HOLO" : ""}
              </span>
            </div>
          ) : teasing === i ? (
            <div
              key={i}
              className={`card-back teasing ${HIGH_ROLL.has(d.rarity) ? "high-roll" : ""}`}
              style={{ "--rc": d.color } as CSSProperties}
              aria-live="polite"
            >
              <span>
                APEX
                <br />
                DROPS
              </span>
              <b>A</b>
              <small>RÉVÉLATION…</small>
            </div>
          ) : (
            <button
              key={i}
              className="card-back"
              onClick={() => startReveal(i)}
              aria-label={`Révéler la carte ${i + 1}`}
            >
              <span>
                APEX
                <br />
                DROPS
              </span>
              <b>A</b>
              <small>TOUCHER POUR RÉVÉLER</small>
            </button>
          ),
        )}
      </div>
      <div className="modal-actions">
        <button
          className="btn primary"
          onClick={() => (done ? onDone() : revealAll())}
        >
          {done ? "Voir mon garage" : "Tout révéler"} <ArrowRight size={17} />
        </button>
      </div>
      <p className="footnote">
        Les trois cartes sont déjà enregistrées. Tu peux fermer cette fenêtre
        sans les perdre.
      </p>
    </Modal>
  );
}

export function SellModal({
  sell,
  price,
  onPrice,
  busy,
  run,
  onClose,
}: {
  sell: Owned;
  price: string;
  onPrice: (v: string) => void;
  busy: boolean;
  run: Run;
  onClose: () => void;
}) {
  return (
    <Modal title="Mettre en vente" onClose={onClose}>
      <p>
        <b>{sell.cards.name}</b>
        {sell.is_foil ? " · Holo" : ""}
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run("LIST", { cardId: sell.id, price: Number(price) }, onClose);
        }}
      >
        <label className="field">
          Prix en crédits
          <input
            autoFocus
            type="number"
            min={LIST_MIN}
            max={LIST_MAX}
            step="1"
            required
            value={price}
            onChange={(e) => onPrice(e.target.value)}
          />
        </label>
        <div className="cost-summary">
          <span>Frais de marché</span>
          <b>10 %</b>
          <span>Tu recevras après vente</span>
          <b>{money(Math.floor(Number(price || 0) * 0.9))} CR</b>
        </div>
        <p className="footnote">
          Un exemplaire sera réservé au marché. Retrait gratuit possible avant
          achat.
        </p>
        <button className="btn primary full" disabled={busy}>
          Publier l’annonce
        </button>
      </form>
    </Modal>
  );
}

export function BuyModal({
  buy,
  cash,
  busy,
  run,
  onClose,
}: {
  buy: Listing;
  cash: number;
  busy: boolean;
  run: Run;
  onClose: () => void;
}) {
  return (
    <Modal title="Confirmer l’achat" onClose={onClose}>
      <CarArt card={buy.cards} />
      <h3>
        {buy.cards.name}
        {buy.is_foil ? " · Holo" : ""}
      </h3>
      <div className="cost-summary">
        <span>Prix total</span>
        <b>{money(buy.price)} CR</b>
        <span>Solde après achat</span>
        <b>{money(cash - buy.price)} CR</b>
      </div>
      <button
        className="btn primary full"
        disabled={busy}
        onClick={() => run("BUY", { id: buy.id }, onClose)}
      >
        Acheter cette carte
      </button>
    </Modal>
  );
}

function avgTrackScore(c: Card) {
  let s = 0;
  for (let t = 0; t < TRACKS.length; t++) s += score(c, t);
  return s / TRACKS.length;
}

export function DuelFormModal({
  challenge,
  inv,
  selected,
  onSelected,
  bet,
  onBet,
  busy,
  run,
  onClose,
  onResult,
}: {
  challenge: Duel | null;
  inv: Owned[];
  selected: string;
  onSelected: (v: string) => void;
  bet: string;
  onBet: (v: string) => void;
  busy: boolean;
  run: Run;
  onClose: () => void;
  onResult: (r: DuelResult) => void;
}) {
  const create = !challenge;
  const [q, setQ] = useState("");
  const [divFilter, setDivFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("fit");
  const tIdx = challenge ? trackIndex(challenge.track_name) : -1;

  const metric = (c: Card) =>
    tIdx >= 0 ? score(c, tIdx) : avgTrackScore(c);

  const pool = useMemo(() => {
    const filtered = inv.filter(
      (u) =>
        (create
          ? divFilter === "all" || u.cards.division === divFilter
          : u.cards.division === challenge?.cards.division) &&
        u.cards.name.toLocaleLowerCase().includes(q.toLocaleLowerCase()),
    );
    return [...filtered].sort((a, b) => {
      if (sortBy === "power") return b.cards.power_hp - a.cards.power_hp;
      if (sortBy === "speed")
        return b.cards.top_speed_kmh - a.cards.top_speed_kmh;
      if (sortBy === "handling")
        return b.cards.handling_score - a.cards.handling_score;
      if (sortBy === "light") return a.cards.weight_kg - b.cards.weight_kg;
      return metric(b.cards) - metric(a.cards);
    });
  }, [inv, create, divFilter, challenge, q, sortBy, tIdx]);

  const current =
    inv.find((u) => u.id === selected) || pool[0] || null;

  useEffect(() => {
    if (current && current.id !== selected) onSelected(current.id);
  }, [current, selected, onSelected]);

  return (
    <Modal
      title={create ? "Ouvrir un défi" : "Relever le défi"}
      wide
      onClose={onClose}
    >
      {challenge ? (
        <>
          <TrackProfile trackName={challenge.track_name} />
          <p className="modal-intro">
            Défi <b>{challenge.cards.division}</b> de{" "}
            <b>{challenge.creator_name}</b> · Sa machine est secrète. Choisis la
            voiture de ton garage la mieux adaptée à ce circuit !
          </p>
        </>
      ) : (
        <p className="modal-intro">
          Choisis ta machine et ta mise : l’un des <b>8 circuits</b> sera tiré
          au sort à l’ouverture, et ta voiture restera secrète pour tes rivaux
          jusqu’au départ.
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!current) return;
          run(
            create ? "CREATE_DUEL" : "ACCEPT_DUEL",
            create
              ? { cardId: current.id, bet: Number(bet) }
              : { cardId: current.id, id: challenge?.id },
            (r) => {
              onClose();
              if (r.duel) onResult(r.duel);
            },
          );
        }}
      >
        {current && (
          <div className={`duel-selected-banner rarity-${current.cards.rarity.toLowerCase()}`}>
            <CarArt card={current.cards} />
            <div className="duel-selected-info">
              <span className="eyebrow">
                MACHINE SÉLECTIONNÉE · {RARITY_LABEL[current.cards.rarity]} ·{" "}
                {current.cards.division}
                {current.is_foil ? " · HOLO" : ""}
              </span>
              <h3>{current.cards.name}</h3>
              <div className="duel-selected-stats">
                <span>
                  <small>Puissance</small>
                  <b>{current.cards.power_hp} ch</b>
                </span>
                <span>
                  <small>Vitesse</small>
                  <b>{current.cards.top_speed_kmh} km/h</b>
                </span>
                <span>
                  <small>Châssis</small>
                  <b>{current.cards.handling_score}/100</b>
                </span>
                <span>
                  <small>Poids</small>
                  <b>{current.cards.weight_kg} kg</b>
                </span>
              </div>
            </div>
            <div className="duel-fit-pill">
              <small>{challenge ? "SCORE CIRCUIT" : "POLYVALENCE"}</small>
              <strong>{metric(current.cards).toFixed(1)}</strong>
              <span>/ 100 pts</span>
            </div>
          </div>
        )}

        <div className="duel-picker-controls">
          <label className="search">
            <Search size={16} />
            <input
              type="search"
              placeholder="Chercher un modèle dans ton garage…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </label>
          {create && (
            <select
              value={divFilter}
              onChange={(e) => setDivFilter(e.target.value)}
              aria-label="Catégorie"
            >
              <option value="all">Toutes catégories</option>
              <option value="Route">Route</option>
              <option value="Compétition">Compétition</option>
              <option value="Moto">Moto</option>
            </select>
          )}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            aria-label="Trier par"
          >
            <option value="fit">
              {challenge ? "Trier : Meilleure sur ce circuit" : "Trier : Polyvalence"}
            </option>
            <option value="power">Trier : Puissance (ch)</option>
            <option value="speed">Trier : Vitesse (km/h)</option>
            <option value="handling">Trier : Châssis</option>
            <option value="light">Trier : Plus légère (kg)</option>
          </select>
        </div>

        <div className="duel-picker-grid" role="listbox" aria-label="Ton garage">
          {pool.map((u) => {
            const active = current?.id === u.id;
            const fit = metric(u.cards);
            return (
              <button
                type="button"
                key={u.id}
                role="option"
                aria-selected={active}
                className={`duel-pick-card rarity-${u.cards.rarity.toLowerCase()} ${active ? "selected" : ""}`}
                onClick={() => onSelected(u.id)}
              >
                <div className="duel-pick-photo">
                  <CarArt card={u.cards} />
                  <span className="duel-pick-fit">{fit.toFixed(1)} pts</span>
                  {active && (
                    <span className="duel-pick-check">
                      <Check size={14} />
                    </span>
                  )}
                </div>
                <div className="duel-pick-body">
                  <small>
                    {RARITY_LABEL[u.cards.rarity]} · {u.cards.division}
                    {u.is_foil ? " · Holo" : ""}
                  </small>
                  <b>{u.cards.name}</b>
                  <div className="duel-pick-specs">
                    <span>{u.cards.power_hp} ch</span>
                    <span>{u.cards.top_speed_kmh} km/h</span>
                    <span>Châs. {u.cards.handling_score}</span>
                    <span>{u.cards.weight_kg} kg</span>
                  </div>
                </div>
              </button>
            );
          })}
          {!pool.length && (
            <Empty
              title="Aucun véhicule correspondant."
              desc="Change de filtre ou ouvre un booster pour agrandir ton garage."
            />
          )}
        </div>

        {create && (
          <label className="field">
            Mise en crédits
            <input
              type="number"
              required
              min={BET_MIN}
              max={BET_MAX}
              step="1"
              value={bet}
              onChange={(e) => onBet(e.target.value)}
            />
          </label>
        )}
        <div className="cost-summary">
          <span>Mise engagée</span>
          <b>
            {money(create ? Number(bet || 0) : challenge?.bet_amount || 0)} CR
          </b>
          <span>Pot net pour le vainqueur</span>
          <b>
            {money(
              Math.floor(
                (create ? Number(bet || 0) : challenge?.bet_amount || 0) * 1.9,
              ),
            )}{" "}
            CR
          </b>
        </div>
        <p className="footnote">
          {create
            ? "Un exemplaire est réservé pendant le défi. Ta voiture reste masquée aux rivaux jusqu’au départ."
            : "Départ immédiat : la voiture adverse se retourne et la course se joue sur le circuit annoncé."}
        </p>
        <button className="btn primary full" disabled={busy || !current}>
          {create
            ? "Tirer le circuit & ouvrir le défi"
            : "Révéler la voiture adverse & lancer la course"}
        </button>
      </form>
    </Modal>
  );
}

export function DuelResultModal({
  result,
  myId,
  onClose,
}: {
  result: DuelResult;
  myId: string | undefined;
  onClose: () => void;
}) {
  // Phase 0 : carte adverse secrète qui tremble (0–1.1s)
  // Phase 1 : carte adverse révélée + course par secteurs (1.1–2.7s)
  // Phase 2 : photo-finish & podium (2.7s+)
  const [phase, setPhase] = useState<0 | 1 | 2>(0);
  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 1100);
    const t2 = setTimeout(() => setPhase(2), 2700);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  const findCard = (id?: number, name?: string) =>
    (id ? cardById(id) : undefined) ||
    CATALOG.find((c) => c.name === name) ||
    CATALOG[0];

  const creatorCard = findCard(result.creator_card_id, result.creator_card);
  const challengerCard = findCard(
    result.challenger_card_id,
    result.challenger_card,
  );
  const won = result.winner_id === myId;
  const maxScore = Math.max(result.creator_score, result.challenger_score, 1);
  const cPct = Math.min(100, Math.max(35, (result.creator_score / maxScore) * 100));
  const chPct = Math.min(100, Math.max(35, (result.challenger_score / maxScore) * 100));

  return (
    <Modal
      title={
        phase < 2
          ? `Départ sur ${result.track_name}…`
          : won
            ? "Drapeau à damier · Victoire !"
            : "Photo-finish · La revanche t’attend."
      }
      wide
      onClose={onClose}
    >
      {phase === 2 && won && (
        <div
          className="reveal-flash"
          style={{ background: "#fbbf24" }}
        />
      )}
      <TrackProfile trackName={result.track_name} />

      <div className="duel-showdown">
        <div className={`showdown-fighter ${ phase === 0 ? "teasing-rival" : "flip-in"}`}>
          {phase === 0 ? (
            <div className="card-back teasing high-roll" style={{ minHeight: 230 }}>
              <span>ADVERSAIRE</span>
              <b>?</b>
              <small>RÉVÉLATION DE LA MACHINE…</small>
            </div>
          ) : (
            <div className={`showdown-card rarity-${creatorCard.rarity.toLowerCase()}`}>
              <CarArt card={creatorCard} />
              <small>DÉFENSEUR · {RARITY_LABEL[creatorCard.rarity]}</small>
              <h4>{result.creator_card}</h4>
              <p>
                {creatorCard.power_hp} ch · {creatorCard.top_speed_kmh} km/h ·
                Châssis {creatorCard.handling_score}
              </p>
              {phase === 2 && (
                <strong className="showdown-score">
                  {result.creator_score} pts
                </strong>
              )}
            </div>
          )}
        </div>

        <div className="showdown-vs">
          <span>VS</span>
        </div>

        <div className="showdown-fighter">
          <div className={`showdown-card rarity-${challengerCard.rarity.toLowerCase()}`}>
            <CarArt card={challengerCard} />
            <small>CHALLENGER · {RARITY_LABEL[challengerCard.rarity]}</small>
            <h4>{result.challenger_card}</h4>
            <p>
              {challengerCard.power_hp} ch · {challengerCard.top_speed_kmh} km/h ·
              Châssis {challengerCard.handling_score}
            </p>
            {phase === 2 && (
              <strong className="showdown-score">
                {result.challenger_score} pts
              </strong>
            )}
          </div>
        </div>
      </div>

      {phase >= 1 && (
        <div className="race-telemetry">
          <div className="telemetry-head">
            <span>SECTEUR 1</span>
            <span>SECTEUR 2</span>
            <span>ARRIVÉE</span>
          </div>
          <div className="telemetry-lane">
            <small>{result.creator_card}</small>
            <div className="telemetry-track">
              <i
                style={{ width: phase === 1 ? "68%" : `${cPct}%` }}
                className={
                  phase === 2 && result.creator_score >= result.challenger_score
                    ? "lead"
                    : ""
                }
              />
            </div>
          </div>
          <div className="telemetry-lane">
            <small>{result.challenger_card}</small>
            <div className="telemetry-track">
              <i
                style={{ width: phase === 1 ? "68%" : `${chPct}%` }}
                className={
                  phase === 2 && result.challenger_score >= result.creator_score
                    ? "lead"
                    : ""
                }
              />
            </div>
          </div>
        </div>
      )}

      {phase === 2 ? (
        <div className="race-result">
          <Trophy size={34} />
          <h3>{result.winner_name} remporte la course !</h3>
          <p>
            Pot versé au vainqueur : <b>{money(result.pot_won)} CR</b>
          </p>
          <small>
            Score pondéré selon les 4 jauges du circuit ({result.track_name}),
            puis variation de pilotage de ±3 %.
          </small>
        </div>
      ) : (
        <p className="modal-intro" style={{ textAlign: "center" }}>
          {phase === 0
            ? "Révélation du véhicule adverse sur la grille de départ…"
            : "Pleine charge dans les secteurs chronométrés…"}
        </p>
      )}

      <button
        className="btn primary full"
        onClick={() => (phase < 2 ? setPhase(2) : onClose())}
      >
        {phase < 2 ? "Passer l’animation" : "Retour à l’arène"}
      </button>
    </Modal>
  );
}

export type ConfirmKind = "recycle" | "pack" | "reset";

export function ConfirmModal({
  kind,
  duplicates,
  recycleValue,
  busy,
  onConfirm,
  onClose,
}: {
  kind: ConfirmKind;
  duplicates: number;
  recycleValue: number;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      title={
        kind === "recycle"
          ? "Recycler les doublons ?"
          : kind === "pack"
            ? "Acheter un booster bonus ?"
            : "Recommencer la démo ?"
      }
      onClose={onClose}
    >
      <p>
        {kind === "recycle"
          ? `${duplicates} exemplaires seront recyclés pour ${money(recycleValue)} crédits. Un exemplaire de chaque variante est conservé. Les favoris sont protégés.`
          : kind === "pack"
            ? `15 000 crédits seront déduits. Le booster rejoint tes bonus et contient trois cartes aléatoires.`
            : "Ta progression locale sera effacée et le garage de départ restauré."}
      </p>
      <div className="modal-actions">
        <button className="btn secondary" onClick={onClose}>
          Annuler
        </button>
        <button className="btn primary" disabled={busy} onClick={onConfirm}>
          Confirmer
        </button>
      </div>
    </Modal>
  );
}

export function HistoryModal({
  history,
  onClose,
}: {
  history: Entry[];
  onClose: () => void;
}) {
  return (
    <Modal title="Mes transactions" onClose={onClose}>
      <p className="muted">Les 50 dernières variations de ton solde.</p>
      <div className="history-list">
        {history.map((h) => (
          <div key={h.id}>
            <span>
              <b>{eventNames[h.kind] || h.kind}</b>
              <small>{new Date(h.created_at).toLocaleString("fr-FR")}</small>
            </span>
            <span>
              <b className={h.amount > 0 ? "positive" : ""}>
                {h.amount > 0 ? "+" : ""}
                {money(h.amount)} CR
              </b>
              <small>Solde {money(h.balance)} CR</small>
            </span>
          </div>
        ))}
      </div>
      {!history.length && (
        <Empty
          title="Aucune transaction."
          desc="Tes achats, recyclages et mises apparaîtront ici."
        />
      )}
    </Modal>
  );
}

export function AccountModal({
  p,
  isDemo,
  providerName,
  refCode,
  onRefCode,
  busy,
  run,
  onCopy,
  onReset,
  onLogout,
  onClose,
}: {
  p: Profile | undefined;
  isDemo: boolean;
  providerName: string;
  refCode: string;
  onRefCode: (v: string) => void;
  busy: boolean;
  run: Run;
  onCopy: () => void;
  onReset: () => void;
  onLogout: () => void;
  onClose: () => void;
}) {
  return (
    <Modal title="Ton profil pilote" onClose={onClose}>
      <h3>{p?.username}</h3>
      <p>
        {isDemo
          ? "La progression de démonstration est sauvegardée dans ce navigateur."
          : `Ton compte ${providerName} protège l’accès à ton garage.`}
      </p>
      {!isDemo && (
        <>
          <h4>Parrainage Viral (Boosters & Cash)</h4>
          <p>
            Chaque ami qui valide ton code reçoit immédiatement{" "}
            <b>+2 Boosters Bonus & +5 000 CR</b>, et tu touches{" "}
            <b>+3 Boosters Bonus & +7 500 CR</b> !
          </p>
          <label className="field">
            Ton lien
            <input
              readOnly
              value={refUrl(p?.referral_code)}
            />
          </label>
          <button className="btn secondary" onClick={onCopy}>
            Copier le lien
          </button>
          {!p?.referred_by && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                run("CLAIM_REFERRAL", { code: refCode }, () =>
                  localStorage.removeItem("apex-ref"),
                );
              }}
            >
              <label className="field">
                Code de ton parrain (dans les 7 jours)
                <input
                  required
                  value={refCode}
                  onChange={(e) => onRefCode(e.target.value)}
                />
              </label>
              <button className="btn primary" disabled={busy}>
                Valider le parrainage
              </button>
            </form>
          )}
        </>
      )}
      <div className="modal-actions">
        {isDemo ? (
          <button className="btn secondary" onClick={onReset}>
            <RefreshCw size={16} /> Réinitialiser la démo
          </button>
        ) : (
          <button className="btn secondary" onClick={onLogout}>
            <LogOut size={16} /> Se déconnecter
          </button>
        )}
      </div>
    </Modal>
  );
}

export function GuideModal({
  isDemo,
  onClose,
}: {
  isDemo: boolean;
  onClose: () => void;
}) {
  return (
    <Modal title="Le guide du paddock" wide onClose={onClose}>
      <div className="guide-grid">
        <section>
          <span className="guide-number">01</span>
          <h3>Collectionne</h3>
          <p>
            Un booster gratuit toutes les 10 minutes, trois cartes par
            booster. Les bonus permettent d’ouvrir sans attendre. Le gratuit
            est toujours utilisé en premier.
          </p>
          <p>
            30 tirages sans légendaire ni mythique au maximum. Le 30e donne 90
            % de légendaire, 10 % de mythique.
          </p>
        </section>
        <section>
          <span className="guide-number">02</span>
          <h3>Échange</h3>
          <p>
            Achète et vends à prix fixe. Le vendeur reçoit 90 % du prix. Une
            annonce peut être retirée gratuitement avant sa vente.
          </p>
          <p>
            Le recyclage conserve un exemplaire de chaque variante et ignore
            les favoris. La cote ne représente pas la valeur de recyclage.
          </p>
        </section>
        <section>
          <span className="guide-number">03</span>
          <h3>Prends la piste</h3>
          <p>
            Défis entre véhicules de même catégorie. Quatre circuits
            équiprobables valorisent différemment puissance, vitesse, châssis
            et légèreté.
          </p>
          <p>
            Variation de pilotage ±3 %. Égalité départagée au hasard. Le
            vainqueur reçoit 95 % du pot. Défi annulable et remboursé après 24
            h sans rival.
          </p>
        </section>
        <section>
          <span className="guide-number">04</span>
          <h3>Joue à ton rythme</h3>
          <p>
            Les crédits sont fictifs, sans achat ni retrait d’argent réel. Les
            holographiques sont cosmétiques, avec une cote de collection ×2,5.
          </p>
          <p>
            {isDemo
              ? "La démo est solo, locale et réinitialisable. Les autres profils sont fictifs."
              : "Les annonces et classements sont rafraîchis toutes les 15 secondes. Les mises expirées sont remboursées au prochain chargement ou par la tâche serveur."}
          </p>
        </section>
      </div>
      <h3>Probabilités par carte, hors garantie</h3>
      <div className="odds-table">
        {(
          [
            ["Common", "55 %"],
            ["Rare", "30 %"],
            ["Epic", "12,7 %"],
            ["Legendary", "2 %"],
            ["Mythic", "0,3 %"],
          ] as [Rarity, string][]
        ).map(([r, odd]) => (
          <div key={r}>
            <span>{RARITY_LABEL[r]}</span>
            <b>{odd}</b>
            <small>Recyclage : {money(SALVAGE[r])} CR</small>
          </div>
        ))}
      </div>
      <p className="footnote">
        8 % de chance de finition holographique, indépendante de la rareté.
        Modèle tiré uniformément dans sa rareté. Les crédits recyclés d’un
        booster ne peuvent pas dépasser 9 000, pour un prix d’achat de 15 000.
        Illustrations originales stylisées ; aucun partenariat constructeur
        revendiqué.
      </p>
    </Modal>
  );
}
