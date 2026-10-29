import {
  ArrowUpRight,
  Clock,
  EyeOff,
  Flag,
  Plus,
  Trophy,
} from "lucide-react";
import { CarArt, Empty } from "../components";
import {
  DUEL_WINNER_SHARE,
  LEAGUE_LABEL,
  TRACKS,
  TRACK_TAGS,
  TRACK_WEIGHTS,
} from "../rules";
import { canEnterLeague, leagueForRarity, trackIndex } from "../engine";
import { money } from "../format";
import type { Duel, Owned, Profile } from "../types";

const STAT_LABELS = ["Puissance", "Vitesse", "Châssis", "Légèreté"] as const;

export function TrackProfile({ trackName }: { trackName?: string | null }) {
  const idx = trackIndex(trackName);
  const name = TRACKS[idx];
  const tag = TRACK_TAGS[idx];
  const w = TRACK_WEIGHTS[idx];
  return (
    <div className="track-banner">
      <div className="track-banner-head">
        <span>
          <Flag size={14} /> CIRCUIT TIRÉ AU SORT
        </span>
        <b>{name}</b>
        <small>{tag}</small>
      </div>
      <div className="track-bars">
        {STAT_LABELS.map((label, i) => {
          const pct = Math.round(w[i] * 100);
          return (
            <div key={label} className={pct >= 35 ? "dominant" : ""}>
              <span>{label}</span>
              <div className="track-bar">
                <i style={{ width: `${Math.min(100, pct * 1.4)}%` }} />
              </div>
              <b>{pct}%</b>
            </div>
          );
        })}
      </div>
    </div>
  );
}

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
            CIRCUIT CONNU · MACHINE ADVERSE SECRÈTE
          </span>
          <h1>
            L’arène<span>.</span>
          </h1>
          <p>
            Le circuit est tiré dès l’ouverture du défi. Analyse ses virages,
            fouille ton garage et garde ta machine secrète jusqu’au départ.
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
          <b>Physique Touge / Vitesse</b>
          <span>Surpuissance & poids pénalisés en col</span>
        </div>
        <div>
          <EyeOff />
          <b>3 Ligues de Rareté</b>
          <span>Street · Pro · Hyper + voiture secrète</span>
        </div>
        <div>
          <Clock />
          <b>30 min au stand</b>
          <span>Révision après course (sauf doublon)</span>
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
        {open.map((d) => {
          const mine = d.creator_id === p?.id;
          const league =
            d.rarity_league || leagueForRarity(d.cards.rarity);
          const hasEligible = inv.some(
            (u) =>
              u.cards.division === d.cards.division &&
              canEnterLeague(u.cards.rarity, league),
          );
          return (
            <article className="duel-card" key={d.id}>
              <div className="duel-top">
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <span className="outline-pill">{d.cards.division}</span>
                  <span className="outline-pill">Ligue {league}</span>
                </div>
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
              <TrackProfile trackName={d.track_name} />
              <div className="duel-vehicle">
                {mine ? (
                  <>
                    <CarArt card={d.cards} />
                    <div>
                      <small>TON DÉFI (VISIBLE PAR TOI SEUL)</small>
                      <h3>{d.cards.name}</h3>
                      <p>
                        {d.cards.power_hp} ch · {d.cards.top_speed_kmh} km/h ·
                        Châssis {d.cards.handling_score} · {d.cards.weight_kg}{" "}
                        kg
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="mystery-car">
                      <span>?</span>
                      <small>LIGUE {league.toUpperCase()}</small>
                    </div>
                    <div>
                      <small>DÉFI DE {d.creator_name.toUpperCase()}</small>
                      <h3>Machine secrète</h3>
                      <p>
                        <b>{LEAGUE_LABEL[league]}</b> · Catégorie{" "}
                        <b>{d.cards.division}</b>. Choisis ta meilleure machine
                        homologuée pour ce circuit !
                      </p>
                    </div>
                  </>
                )}
              </div>
              <div className="duel-bottom">
                <div>
                  <small>MISE À SUIVRE</small>
                  <strong>
                    {money(d.bet_amount)} <span>CR</span>
                  </strong>
                </div>
                <button
                  className={`btn ${mine ? "secondary" : "primary"}`}
                  disabled={
                    busy ||
                    (!mine &&
                      ((p?.cash_balance || 0) < d.bet_amount || !hasEligible))
                  }
                  onClick={() => (mine ? onCancel(d) : onChallenge(d))}
                >
                  {mine ? "Annuler & rembourser" : "Choisir ma voiture"}
                  <ArrowUpRight size={16} />
                </button>
              </div>
              <small className="duel-hint">
                {mine
                  ? `Homologué en ${LEAGUE_LABEL[league]}. Ta voiture reste masquée jusqu’au départ.`
                  : !hasEligible
                    ? `Il te faut une carte ${d.cards.division} éligible en ${LEAGUE_LABEL[league]}.`
                    : `Pot net à gagner : ${money(Math.floor(d.bet_amount * 2 * DUEL_WINNER_SHARE))} CR`}
              </small>
            </article>
          );
        })}
      </div>
      {!open.length && (
        <Empty
          title="La piste est libre."
          desc="Crée le premier défi du paddock : un circuit sera tiré au sort et ta voiture restera secrète jusqu’au départ."
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
                {d.creator_name} ({d.creator_score} pts) vs {d.challenger_name}{" "}
                ({d.challenger_score} pts)
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
          Tes courses terminées apparaîtront ici avec le circuit et les scores.
        </p>
      )}
    </>
  );
}
