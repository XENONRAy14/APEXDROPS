import {
  ArrowRight,
  ArrowUpRight,
  CarFront,
  Clock,
  ShieldCheck,
  Sparkles,
  Trophy,
} from "lucide-react";
import { PACK_PRICE } from "../rules";
import { CarArt, Empty, TrackArt, VehicleCard } from "../components";
import { money, refUrl, time } from "../format";
import type { Card, Owned, Profile } from "../types";

export function Paddock({
  p,
  inv,
  unique,
  catalogSize,
  cooldown,
  busy,
  heroCard,
  onDetail,
  onOpenPack,
  onBuyPack,
  onGuide,
  goGarage,
  goArena,
  onCopy,
}: {
  p: Profile | undefined;
  inv: Owned[];
  unique: number;
  catalogSize: number;
  cooldown: number;
  busy: boolean;
  heroCard: Card;
  onDetail: (c: Card) => void;
  onOpenPack: () => void;
  onBuyPack: () => void;
  onGuide: () => void;
  goGarage: () => void;
  goArena: () => void;
  onCopy: () => void;
}) {
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">
            <span className="tiny-square" /> TON PROCHAIN COUP DE CŒUR T’ATTEND
          </span>
          <h1>
            Bienvenue au paddock<span>.</span>
          </h1>
          <p>
            De la première GTI à la légende de circuit. Chaque carte a son
            histoire.
          </p>
        </div>
        <button className="text-btn" onClick={onGuide}>
          Les règles du jeu <ArrowUpRight size={17} />
        </button>
      </div>
      <div className="hero-grid">
        <section className="hero-feature">
          <div className="hero-gridlines" />
          <div className="hero-top">
            <span className="outline-pill">L’ESPRIT TOUGE</span>
            <span>01 — ORIGINS</span>
          </div>
          <div className="hero-copy">
            <h2>
              Petite voiture.
              <br />
              <em>Grand caractère.</em>
            </h2>
            <p>
              La Ford Puma 1.7 ouvre le bal.
              <br />
              Une icône à collectionner, une histoire à écrire.
            </p>
          </div>
          <div className="hero-car">
            <span className="hero-word">PUMA</span>
            <CarArt card={heroCard} hero />
          </div>
          <div className="hero-footer">
            <div>
              <strong>FORD PUMA 1.7</strong>
              <span>1998 / 125 CH / 1 039 KG</span>
            </div>
            <button
              className="round-link"
              aria-label="Découvrir la Ford Puma"
              onClick={() => onDetail(heroCard)}
            >
              <ArrowUpRight />
            </button>
          </div>
        </section>
        <section className="booster-panel">
          <div className="booster-top">
            <span className="eyebrow">LE RITUEL DU PADDOCK</span>
            <span className="live-dot" />
          </div>
          <h2>
            Trois cartes.
            <br />
            Une nouvelle histoire.
          </h2>
          <div className="pack-illustration">
            <div className="pack-shadow" />
            <div className="pack-back" />
            <div className="pack">
              <span className="pack-ridges" />
              <span className="pack-title">
                APEX
                <br />
                DROPS
              </span>
              <span className="pack-symbol">A</span>
              <span className="pack-caption">
                ORIGINS — VOL. 01
                <br />
                <b>3 CARTES À COLLECTIONNER</b>
              </span>
              <span className="pack-ridges bottom" />
            </div>
            <span className="pack-count">
              <Sparkles size={13} /> {p?.bonus_packs} bonus
            </span>
          </div>
          <button
            className="btn dark full"
            disabled={busy || (cooldown > 0 && !p?.bonus_packs)}
            onClick={onOpenPack}
          >
            {busy
              ? "Ouverture…"
              : cooldown === 0
                ? "Ouvrir mon booster gratuit"
                : p?.bonus_packs
                  ? "Utiliser un booster bonus"
                  : `Prochain booster · ${time(cooldown)}`}
            <ArrowRight size={18} />
          </button>
          <div className="booster-sub">
            <Clock size={13} />
            {cooldown === 0
              ? "Un booster gratuit toutes les 10 min"
              : `Gratuit dans ${time(cooldown)}`}
            <button
              disabled={busy || (p?.cash_balance || 0) < PACK_PRICE}
              onClick={onBuyPack}
            >
              + Acheter
            </button>
          </div>
        </section>
      </div>
      <div className="stats-row">
        <div>
          <span className="stat-icon">
            <CarFront />
          </span>
          <div>
            <small>VÉHICULES COLLECTIONNÉS</small>
            <strong>
              {unique}
              <span> / {catalogSize}</span>
            </strong>
          </div>
          <div className="mini-progress">
            <i style={{ width: `${(unique / catalogSize) * 100}%` }} />
          </div>
        </div>
        <div>
          <span className="stat-icon">
            <Sparkles />
          </span>
          <div>
            <small>COTE DU GARAGE</small>
            <strong>
              {money(p?.collection_score || 0)}
              <span> CR</span>
            </strong>
          </div>
        </div>
        <div>
          <span className="stat-icon">
            <Trophy />
          </span>
          <div>
            <small>PALMARÈS EN DUEL</small>
            <strong>
              {p?.duels_won || 0}
              <span> V / {p?.duels_lost || 0} D</span>
            </strong>
          </div>
        </div>
      </div>
      <div className="section-heading">
        <div>
          <span className="eyebrow">LA COLLECTION PREND VIE</span>
          <h2>Dans ton garage</h2>
        </div>
        <button className="text-btn" onClick={goGarage}>
          Voir la collection <ArrowRight size={17} />
        </button>
      </div>
      <div className="card-grid home-cards">
        {inv.slice(0, 4).map((u) => (
          <VehicleCard
            key={u.id}
            card={u.cards}
            foil={u.is_foil}
            owned={u}
            onInspect={() => onDetail(u.cards)}
          />
        ))}
      </div>
      {!inv.length && (
        <Empty
          title="La première page est à écrire."
          desc="Ouvre ton premier booster pour découvrir tes trois premières cartes."
        />
      )}
      <div className="bottom-grid">
        <section className="arena-teaser">
          <div>
            <span className="eyebrow">L’ARÈNE · CIRCUIT MYSTÈRE</span>
            <h2>
              La piste décide.
              <br />À toi de choisir la machine.
            </h2>
            <p>
              Trois catégories, quatre circuits.
              <br />
              Relève un défi et trouve ta trajectoire.
            </p>
            <button className="btn light" onClick={goArena}>
              Entrer dans l’arène <ArrowRight size={17} />
            </button>
          </div>
          <TrackArt />
        </section>
        <section className="collection-tip">
          <ShieldCheck size={28} />
          <h3>Une collection qui t’appartient.</h3>
          <p>
            Protège tes favoris, recycle tes doublons et échange avec le
            paddock.
          </p>
          <div className="pity-label">
            <span>Garantie légendaire</span>
            <b>{p?.pity_counter || 0} / 30 cartes</b>
          </div>
          <div className="progress">
            <i style={{ width: `${((p?.pity_counter || 0) / 30) * 100}%` }} />
          </div>
          <small>
            Une légendaire ou mieux au plus tard au 30e tirage sans légendaire
            ni mythique.
          </small>
        </section>
      </div>
      <section className="referral-banner">
        <div>
          <span className="eyebrow">
            <Sparkles size={13} /> BOOSTERS GRATUITS ILLIMITÉS · PARRAINAGE
            VIRAL
          </span>
          <h3>
            Pas envie d’attendre 10 minutes ? Invite ton squad Discord !
          </h3>
          <p>
            Tu gagnes <b>+3 Boosters Bonus & +7 500 CR</b> pour chaque ami qui
            rejoint le paddock avec ton lien (et ton filleul démarre avec{" "}
            <b>+2 Boosters & +5 000 CR</b>).
          </p>
        </div>
        <div className="referral-actions">
          <code>{refUrl(p?.referral_code)}</code>
          <button className="btn primary" onClick={onCopy}>
            Copier mon lien ({p?.referrals_count || 0} parrainés)
          </button>
        </div>
      </section>
    </>
  );
}
