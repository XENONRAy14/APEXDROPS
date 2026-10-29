import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowRight, Flag, LogOut, RefreshCw } from "lucide-react";
import { CarArt, Empty, Modal, VehicleCard } from "./components";
import { RARITY_LABEL, SALVAGE } from "./catalog";
import { LIST_MAX, LIST_MIN, BET_MAX, BET_MIN } from "./rules";
import { eventNames, money } from "./format";
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
  return (
    <Modal
      title={create ? "Ouvrir un défi" : "Relever le défi"}
      onClose={onClose}
    >
      <p>
        {create
          ? "Choisis ton véhicule et une mise. Le circuit sera tiré au sort quand un rival acceptera."
          : `Face à ${challenge?.cards.name}. Choisis ta carte ${challenge?.cards.division}.`}
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(
            create ? "CREATE_DUEL" : "ACCEPT_DUEL",
            create
              ? { cardId: selected, bet: Number(bet) }
              : { cardId: selected, id: challenge?.id },
            (r) => {
              onClose();
              if (r.duel) onResult(r.duel);
            },
          );
        }}
      >
        <label className="field">
          Ton véhicule
          <select
            required
            value={selected}
            onChange={(e) => onSelected(e.target.value)}
          >
            {inv
              .filter(
                (u) =>
                  create || u.cards.division === challenge?.cards.division,
              )
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.cards.name} · {u.cards.division}
                  {u.is_foil ? " · Holo" : ""}
                </option>
              ))}
          </select>
        </label>
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
            ? "La carte ne pourra pas être vendue pendant le défi. Annulation gratuite avant acceptation."
            : "Le résultat est définitif dès confirmation. La mise est perdue en cas de défaite."}
        </p>
        <button className="btn primary full" disabled={busy || !selected}>
          {create
            ? "Réserver la mise et ouvrir"
            : "Confirmer et lancer la course"}
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
  return (
    <Modal
      title={
        result.winner_id === myId
          ? "La victoire est à toi."
          : "La revanche t’attend."
      }
      onClose={onClose}
    >
      <div className="race-result">
        <Flag size={40} />
        <span>{result.track_name}</span>
        <h3>{result.winner_name} remporte la course</h3>
        <div>
          <p>
            {result.creator_card}
            <b>{result.creator_score} pts</b>
          </p>
          <strong>VS</strong>
          <p>
            {result.challenger_card}
            <b>{result.challenger_score} pts</b>
          </p>
        </div>
        <p>
          Pot versé au vainqueur : <b>{money(result.pot_won)} CR</b>
        </p>
        <small>
          Score pondéré selon le circuit, puis variation de pilotage de ±3 %.
          Holographiques sans bonus.
        </small>
      </div>
      <button className="btn dark full" onClick={onClose}>
        Retour à l’arène
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
              value={`${location.origin}/?ref=${p?.referral_code}`}
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
