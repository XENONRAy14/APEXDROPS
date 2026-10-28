import { ArrowUpRight, RefreshCw } from "lucide-react";
import { Empty, VehicleCard } from "../components";
import { FOIL_MULTIPLIER } from "../rules";
import { money } from "../format";
import type { Owned } from "../types";

export function Garage({
  unique,
  catalogSize,
  totalCards,
  duplicates,
  busy,
  garage,
  hasMore,
  filterBar,
  onRecycle,
  onDetail,
  onFavorite,
  onSell,
  onLoadMore,
}: {
  unique: number;
  catalogSize: number;
  totalCards: number;
  duplicates: number;
  busy: boolean;
  garage: Owned[];
  hasMore: boolean;
  filterBar: React.ReactNode;
  onRecycle: () => void;
  onDetail: (u: Owned) => void;
  onFavorite: (u: Owned) => void;
  onSell: (u: Owned) => void;
  onLoadMore: () => void;
}) {
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">CHAQUE CARTE RACONTE UNE HISTOIRE</span>
          <h1>
            Ton garage<span>.</span>
          </h1>
          <p>
            {unique} modèles sur {catalogSize} · {totalCards} cartes · Photos HD
            Authentiques & Finitions Holo 3D
          </p>
        </div>
        <button
          className="btn primary"
          disabled={busy || !duplicates}
          onClick={onRecycle}
        >
          <RefreshCw size={17} /> Recycler {duplicates} doublon
          {duplicates > 1 ? "s" : ""}
        </button>
      </div>
      {filterBar}
      <div className="card-grid">
        {garage.map((u) => (
          <VehicleCard
            key={u.id}
            card={u.cards}
            foil={u.is_foil}
            owned={u}
            onInspect={() => onDetail(u)}
            onFavorite={() => onFavorite(u)}
          >
            <div className="card-actions">
              <span>
                <small>COTE INDICATIVE</small>
                <b>
                  {money(u.cards.market_value * (u.is_foil ? FOIL_MULTIPLIER : 1))}{" "}
                  CR
                </b>
              </span>
              <button
                className="small-btn"
                disabled={busy || u.favorite}
                onClick={() => onSell(u)}
              >
                Vendre <ArrowUpRight size={14} />
              </button>
            </div>
          </VehicleCard>
        ))}
      </div>
      {!garage.length && (
        <Empty
          title="Aucune carte dans cette sélection."
          desc="Essaie une autre recherche ou ouvre un booster pour agrandir ton garage."
        />
      )}
      {hasMore && (
        <button className="btn load-more" onClick={onLoadMore}>
          Afficher plus
        </button>
      )}
    </>
  );
}
