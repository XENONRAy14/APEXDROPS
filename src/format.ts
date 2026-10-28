export const money = (n: number) =>
  new Intl.NumberFormat("fr-FR").format(n);

export const time = (n: number) =>
  `${Math.floor(n / 60)
    .toString()
    .padStart(2, "0")}:${(n % 60).toString().padStart(2, "0")}`;

export const eventNames: Record<string, string> = {
  BUY_PACK: "Booster acheté",
  BUY: "Achat / vente au marché",
  QUICK_SELL: "Recyclage des doublons",
  CREATE_DUEL: "Mise réservée",
  ACCEPT_DUEL: "Duel résolu",
  CANCEL_DUEL: "Duel annulé",
  DUEL_REFUND: "Défi expiré · remboursement",
  DUEL_WIN: "Victoire en duel",
  ADJUSTMENT: "Ajustement",
};
