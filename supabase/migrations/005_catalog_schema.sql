-- =========================================================================
-- APEX DROPS 5 — Catalogue étendu (Wikidata / Wikimedia Commons)
-- Colonnes de provenance et de crédit photo, index de tirage, et game_state
-- allégé : le catalogue (plusieurs milliers de cartes) est servi en fichier
-- statique par le frontend au lieu d'être renvoyé toutes les 15 secondes.
-- À appliquer après 004_concurrency.sql, puis exécuter 006_catalog_data.sql.
-- =========================================================================
BEGIN;

ALTER TABLE public.cards ADD COLUMN IF NOT EXISTS wikidata_id text UNIQUE;
ALTER TABLE public.cards ADD COLUMN IF NOT EXISTS brand text;
ALTER TABLE public.cards ADD COLUMN IF NOT EXISTS image_page text;
ALTER TABLE public.cards ADD COLUMN IF NOT EXISTS image_credit text;

-- Tirage d'une carte par rareté (OPEN_PACK) sur un catalogue de milliers de lignes.
CREATE INDEX IF NOT EXISTS cards_rarity ON public.cards(rarity);

CREATE OR REPLACE FUNCTION public.game_state()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  uid uuid := auth.uid();
  result jsonb;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Connecte-toi pour accéder au paddock.';
  END IF;
  PERFORM public.expire_duels();
  SELECT jsonb_build_object(
    'profile', (SELECT to_jsonb(p) FROM public.profiles p WHERE id = uid),
    'catalog_size', (SELECT count(*) FROM public.cards),
    'inventory', (
      SELECT coalesce(jsonb_agg(to_jsonb(u) || jsonb_build_object('cards', to_jsonb(c))
                                ORDER BY u.first_obtained_at DESC), '[]')
        FROM public.user_cards u
        JOIN public.cards c ON c.id = u.card_id
       WHERE u.user_id = uid AND u.quantity > 0),
    'listings', (
      SELECT coalesce(jsonb_agg(x), '[]') FROM (
        SELECT to_jsonb(m) || jsonb_build_object('cards', to_jsonb(c)) x
          FROM public.market_listings m
          JOIN public.cards c ON c.id = m.card_id
         WHERE status = 'ACTIVE'
           AND (m.seller_id = uid OR m.id IN (
                 SELECT id FROM public.market_listings
                  WHERE status = 'ACTIVE'
                  ORDER BY created_at DESC LIMIT 200))
         ORDER BY m.created_at DESC) q),
    'duels', (
      SELECT coalesce(jsonb_agg(x), '[]') FROM (
        SELECT to_jsonb(d) || jsonb_build_object('cards', to_jsonb(c)) x
          FROM public.duel_lobbies d
          JOIN public.cards c ON c.id = d.creator_card_id
         WHERE d.status = 'OPEN'
            OR (d.status = 'FINISHED' AND (d.creator_id = uid OR d.challenger_id = uid))
         ORDER BY (d.status = 'OPEN' AND d.creator_id = uid) DESC,
                  (d.status = 'OPEN') DESC,
                  d.created_at DESC
         LIMIT 100) q),
    'leaderboard', (
      SELECT coalesce(jsonb_agg(x), '[]') FROM (
        SELECT id, username, collection_score, duels_won, duels_lost, referrals_count
          FROM public.profiles
         ORDER BY collection_score DESC, id
         LIMIT 50) x),
    'history', (
      SELECT coalesce(jsonb_agg(x), '[]') FROM (
        SELECT id, kind, amount, balance, created_at
          FROM public.wallet_history
         WHERE user_id = uid
         ORDER BY created_at DESC
         LIMIT 50) x)
  ) INTO result;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.game_state() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.game_state() TO authenticated;

COMMIT;
