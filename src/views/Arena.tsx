import {
  ArrowUpRight,
  Clock,
  Flag,
  Plus,
  ShieldCheck,
  Trophy,
} from "lucide-react";
import { CarArt, Empty } from "../components";
import { DUEL_WINNER_SHARE } from "../rules";
import { money } from "../format";
import type { Duel, Owned, Profile } from "../types";

export function Arena({
  isDemo,
  duels,
  p,
  inv,
  now,
  busy,
  onCreate,
  onCancel,
  onChallenge,
}: {
  isDemo: boolean;
  duels: Duel[];
  p: Profile | undefined;
  inv: Owned[];
  now: number;
  busy: boolean;
  onCreate: () => void;
  onCancel: (d: Duel) => void;
  onChallenge: (d: Duel) => void;
}) {
  const open = duels.filter((d) => d.status === "OPEN"),
    finished = duels.filter((d) => d.status === "FINISHED");
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">
            CHOISIS TA MACHINE. TROUVE TA TRAJECTOIRE.
          </span>
          <h1>
            L’arène<span>.</span>
          </h1>
          <p>
            Route, compétition ou moto : les duels se jouent dans la même
            catégorie.
          </p>
        </div>
        <button
          className="btn primary"
          disabled={!inv.length || busy}
          onClick={onCreate}
        >
          <Plus size={17} /> Ouvrir un défi
        </button>
      </div>
      <div className="arena-rules">
        <div>
          <Flag />
          <b>Circuit mystère</b>
          <span>Tiré au sort après engagement</span>
        </div>
        <div>
          <ShieldCheck />
          <b>Holo = cosmétique</b>
          <span>Aucun bonus de performance</span>
        </div>
        <div>
          <Clock />
          <b>24 h pour courir</b>
          <span>Mise remboursée à l’expiration</span>
        </div>
        <div>
          <Trophy />
          <b>95 % du pot</b>
          <span>5 % de frais d’arène</span>
        </div>
      </div>
      {isDemo && (
        <div className="info-note">
          Les rivaux de cette démo sont simulés. Les règles de score sont
          identiques au mode connecté.
        </div>
      )}
      <div className="section-heading">
        <h2>Défis ouverts</h2>
        <span className="count-pill">{open.length} en piste</span>
      </div>
      <div className="duel-grid">
        {open.map((d) => (
          <article className="duel-card" key={d.id}>
            <div className="duel-top">
              <span className="outline-pill">{d.cards.division}</span>
              <span>
                <Clock size={13} />{" "}
                {Math.max(
                  0,
                  Math.ceil(
                    (new Date(d.expires_at).getTime() - now) / 3600000,
                  ),
                )}{" "}
                h restantes
              </span>
            </div>
            <div className="duel-vehicle">
              <CarArt card={d.cards} />
              <div>
                <small>DÉFI DE {d.creator_name.toUpperCase()}</small>
                <h3>{d.cards.name}</h3>
                <p>
                  {d.cards.power_hp} ch · Châssis {d.cards.handling_score}
                </p>
              </div>
            </div>
            <div className="duel-bottom">
              <div>
                <small>MISE À SUIVRE</small>
                <strong>
                  {money(d.bet_amount)} <span>CR</span>
                </strong>
              </div>
              <button
                className={`btn ${d.creator_id === p?.id ? "secondary" : "dark"}`}
                disabled={
                  busy ||
                  (d.creator_id !== p?.id &&
                    ((p?.cash_balance || 0) < d.bet_amount ||
                      !inv.some(
                        (u) => u.cards.division === d.cards.division,
                      )))
                }
                onClick={() =>
                  d.creator_id === p?.id ? onCancel(d) : onChallenge(d)
                }
              >
                {d.creator_id === p?.id
                  ? "Annuler & rembourser"
                  : "Relever le défi"}
                <ArrowUpRight size={16} />
              </button>
            </div>
            <small className="duel-hint">
              {d.creator_id === p?.id
                ? "Ta carte est réservée tant que ce défi reste ouvert."
                : !inv.some((u) => u.cards.division === d.cards.division)
                  ? `Une carte ${d.cards.division} est nécessaire.`
                  : `Pot net à gagner : ${money(Math.floor(d.bet_amount * 2 * DUEL_WINNER_SHARE))} CR`}
            </small>
          </article>
        ))}
      </div>
      {!open.length && (
        <Empty
          title="La piste est libre."
          desc="Crée le premier défi du paddock. Ta mise reste remboursable tant qu’aucun rival n’a accepté."
        />
      )}
      <div className="section-heading">
        <h2>Derniers résultats</h2>
      </div>
      <div className="results-list">
        {finished.map((d) => (
          <div key={d.id}>
            <span className="result-flag">
              <Flag size={20} />
            </span>
            <span>
              <b>{d.track_name}</b>
              <small>
                {d.creator_score} pts / {d.challenger_score} pts
              </small>
            </span>
            <strong>
              <Trophy size={16} /> {d.winner_name}
            </strong>
          </div>
        ))}
      </div>
      {!finished.length && (
        <p className="footnote">
          Tes courses terminées apparaîtront ici. Le challenger voit la carte
          adverse : choisis les défis qui te conviennent.
        </p>
      )}
    </>
  );
}
