import { Plus, Users } from "lucide-react";
import { Empty, VehicleCard } from "../components";
import { money } from "../format";
import type { Card, Listing, Profile } from "../types";

export function Market({
  isDemo,
  listings,
  hasMore,
  filterBar,
  myId,
  busy,
  p,
  onDetail,
  onCancel,
  onBuy,
  goGarage,
  onLoadMore,
}: {
  isDemo: boolean;
  listings: Listing[];
  hasMore: boolean;
  filterBar: React.ReactNode;
  myId: string | undefined;
  busy: boolean;
  p: Profile | undefined;
  onDetail: (c: Card) => void;
  onCancel: (m: Listing) => void;
  onBuy: (m: Listing) => void;
  goGarage: () => void;
  onLoadMore: () => void;
}) {
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">LES BONNES TROUVAILLES DU PADDOCK</span>
          <h1>
            Le marché<span>.</span>
          </h1>
          <p>
            Ventes à prix fixe · 10 % de frais pour le vendeur · Retrait
            gratuit
          </p>
        </div>
        <button className="btn primary" onClick={goGarage}>
          <Plus size={17} /> Mettre une carte en vente
        </button>
      </div>
      {isDemo && (
        <div className="info-note">
          <Users size={17} /> Annonces de démonstration. Les achats sont
          enregistrés uniquement dans ce navigateur.
        </div>
      )}
      {filterBar}
      <div className="card-grid">
        {listings.map((m) => (
          <VehicleCard
            key={m.id}
            card={m.cards}
            foil={m.is_foil}
            onInspect={() => onDetail(m.cards)}
          >
            <div className="seller">
              <span className="seller-avatar">{m.seller_name[0]}</span>
              {m.seller_name}
              {m.seller_id === myId && <span className="mine-label">TOI</span>}
            </div>
            <div className="card-actions">
              <span>
                <small>PRIX DEMANDÉ</small>
                <b>{money(m.price)} CR</b>
              </span>
              {m.seller_id === myId ? (
                <button
                  className="small-btn"
                  disabled={busy}
                  onClick={() => onCancel(m)}
                >
                  Retirer
                </button>
              ) : (
                <button
                  className="small-btn accent"
                  disabled={busy || (p?.cash_balance || 0) < m.price}
                  onClick={() => onBuy(m)}
                >
                  Acheter <Plus size={14} />
                </button>
              )}
            </div>
          </VehicleCard>
        ))}
      </div>
      {!listings.length && (
        <Empty
          title="Le marché est calme."
          desc="Aucune annonce ne correspond à ta sélection. Tu peux vendre une carte depuis ton garage."
        />
      )}
      {hasMore && (
        <button className="btn load-more" onClick={onLoadMore}>
          Afficher plus
        </button>
      )}
      <p className="footnote">
        Les 200 annonces les plus récentes et toutes tes annonces sont
        affichées. La cote est une valeur de collection, pas une promesse de
        revente.
      </p>
    </>
  );
}
