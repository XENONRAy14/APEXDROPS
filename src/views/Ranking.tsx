import { RefreshCw, Users } from "lucide-react";
import { money } from "../format";
import type { Profile } from "../types";

export function Ranking({
  isDemo,
  leaderboard,
  myId,
  onRefresh,
}: {
  isDemo: boolean;
  leaderboard: Profile[];
  myId: string | undefined;
  onRefresh: () => void;
}) {
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">LES COLLECTIONNEURS DU PADDOCK</span>
          <h1>
            Le classement<span>.</span>
          </h1>
          <p>Top 50 par cote du garage · Actualisé toutes les 15 secondes</p>
        </div>
        <button className="text-btn" onClick={onRefresh}>
          <RefreshCw size={16} /> Actualiser
        </button>
      </div>
      {isDemo && (
        <div className="info-note">
          Classement de démonstration : trois profils fictifs et ton garage
          local.
        </div>
      )}
      <div className="ranking-panel">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Rang</th>
                <th>Collectionneur</th>
                <th>Cote du garage</th>
                <th>Victoires / défaites</th>
                <th>Ambassadeur</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((u, i) => (
                <tr key={u.id} className={u.id === myId ? "my-row" : ""}>
                  <td>
                    <span className={`rank rank-${i + 1}`}>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                  </td>
                  <td>
                    <span className="player">
                      <span className="player-avatar">{u.username[0]}</span>
                      <b>{u.username}</b>
                      {u.id === myId && <small>TOI</small>}
                    </span>
                  </td>
                  <td>
                    <strong>{money(u.collection_score)} CR</strong>
                  </td>
                  <td>
                    {u.duels_won}{" "}
                    <span className="muted">/ {u.duels_lost}</span>
                  </td>
                  <td>
                    {u.referrals_count} <Users size={13} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="footnote">
        La cote compte uniquement les cartes présentes au garage, doublons
        inclus. Une carte mise en vente sort de ce calcul jusqu’à son retrait.
      </p>
    </>
  );
}
