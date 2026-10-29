-- =========================================================================
-- APEX DROPS 5.3 — Équilibrage Arène :
-- 1. Physique Sweet-Spot Touge/Pluie (malus patinage & inertie, bonus poids plume)
-- 2. Ligues par rareté (Street / Pro / Hyper) pour empêcher les Mythic d'écraser les Common
-- 3. Arrêt au stand de 30 min après une course (sauf doublon en stock)
-- =========================================================================
BEGIN;

ALTER TABLE public.user_cards
  ADD COLUMN IF NOT EXISTS last_raced_at timestamptz;

ALTER TABLE public.duel_lobbies
  ADD COLUMN IF NOT EXISTS rarity_league text NOT NULL DEFAULT 'Hyper'
  CHECK (rarity_league IN ('Street', 'Pro', 'Hyper'));

CREATE OR REPLACE FUNCTION public.card_league(r text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN r IN ('Common', 'Rare') THEN 'Street'
    WHEN r IN ('Epic', 'Legendary') THEN 'Pro'
    ELSE 'Hyper'
  END
$$;

CREATE OR REPLACE FUNCTION public.league_rank(l text)
RETURNS int
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE l
    WHEN 'Street' THEN 1
    WHEN 'Pro'    THEN 2
    ELSE 3
  END
$$;

CREATE OR REPLACE FUNCTION public.race_score(c public.cards, t int)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN t IN (0, 5) THEN
      greatest(5::numeric, least(100::numeric,
        (CASE WHEN t = 0
          THEN least(c.power_hp/700.0,1)*100*.08 + least(c.top_speed_kmh/370.0,1)*100*.07 + c.handling_score*.55 + greatest(0,least(100,(2000-c.weight_kg)/18.0))*.30
          ELSE least(c.power_hp/700.0,1)*100*.05 + least(c.top_speed_kmh/370.0,1)*100*.05 + c.handling_score*.50 + greatest(0,least(100,(2000-c.weight_kg)/18.0))*.40
        END)
        + (CASE WHEN c.division = 'Moto' THEN 0 ELSE least(8.0, greatest(0.0, (1050.0 - c.weight_kg) / 30.0)) END)
        - least(18.0, greatest(0.0, (c.power_hp - 320.0) / 38.0))
        - least(16.0, greatest(0.0, (c.weight_kg - 1150.0) / 45.0))
      ))
    WHEN t IN (2, 3) THEN
      greatest(5::numeric, least(100::numeric,
        (CASE WHEN t = 2
          THEN least(c.power_hp/700.0,1)*100*.20 + least(c.top_speed_kmh/370.0,1)*100*.15 + c.handling_score*.45 + greatest(0,least(100,(2000-c.weight_kg)/18.0))*.20
          ELSE least(c.power_hp/700.0,1)*100*.10 + least(c.top_speed_kmh/370.0,1)*100*.15 + c.handling_score*.55 + greatest(0,least(100,(2000-c.weight_kg)/18.0))*.20
        END)
        - least(12.0, greatest(0.0, (c.power_hp - 520.0) / 55.0))
        - least(10.0, greatest(0.0, (c.weight_kg - 1380.0) / 60.0))
      ))
    WHEN t = 1 THEN least(c.power_hp/700.0,1)*100*.40 + least(c.top_speed_kmh/370.0,1)*100*.45 + c.handling_score*.10 + greatest(0,least(100,(2000-c.weight_kg)/18.0))*.05
    WHEN t = 4 THEN least(c.power_hp/700.0,1)*100*.55 + least(c.top_speed_kmh/370.0,1)*100*.35 + c.handling_score*.05 + greatest(0,least(100,(2000-c.weight_kg)/18.0))*.05
    WHEN t = 6 THEN least(c.power_hp/700.0,1)*100*.25 + least(c.top_speed_kmh/370.0,1)*100*.25 + c.handling_score*.25 + greatest(0,least(100,(2000-c.weight_kg)/18.0))*.25
    ELSE            least(c.power_hp/700.0,1)*100*.30 + least(c.top_speed_kmh/370.0,1)*100*.60 + c.handling_score*.05 + greatest(0,least(100,(2000-c.weight_kg)/18.0))*.05
  END
$$;

UPDATE public.duel_lobbies d
   SET rarity_league = public.card_league(c.rarity)
  FROM public.cards c
 WHERE c.id = d.creator_card_id;

CREATE OR REPLACE FUNCTION public.game_action(
  p_action text,
  p_payload jsonb,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  uid             uuid := auth.uid();
  p               public.profiles%ROWTYPE;
  ref_p           public.profiles%ROWTYPE;
  uc              public.user_cards%ROWTYPE;
  c               public.cards%ROWTYPE;
  c2              public.cards%ROWTYPE;
  m               public.market_listings%ROWTYPE;
  d               public.duel_lobbies%ROWTYPE;
  prior           public.game_requests%ROWTYPE;
  result          jsonb := '{}';
  drawn           jsonb := '[]';
  tracks          text[] := ARRAY[
    'Espigoulier · Pluie',
    'Hunaudières · Vitesse',
    'Gineste · Technique',
    'Monaco · Précision',
    'Monza · Pleine charge',
    'Akina · Descente Touge',
    'Nürburgring · Nordschleife',
    'Wangan · Minuit'
  ];
  target_rarity   text;
  foil            boolean;
  fresh           boolean;
  roll            float;
  use_bonus       boolean;
  amount          int;
  locked_qty      int;
  total           bigint := 0;
  n               int := 0;
  i               int;
  track           int;
  s1              numeric;
  s2              numeric;
  win             uuid;
  lose            uuid;
  winner          text;
  ref             uuid;
  rec             record;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Connecte-toi pour jouer.';
  END IF;
  IF p_request_id IS NULL OR p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'Requête invalide.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(uid::text)::bigint);

  SELECT * INTO prior
    FROM public.game_requests
   WHERE user_id = uid
     AND request_id = p_request_id;
  IF FOUND THEN
    IF prior.action <> p_action OR prior.payload <> p_payload THEN
      RAISE EXCEPTION 'Identifiant de requête déjà utilisé.';
    END IF;
    RETURN prior.result;
  END IF;

  IF (SELECT count(*)
        FROM public.game_requests
       WHERE user_id = uid
         AND created_at > now() - interval '1 minute') >= 40 THEN
    RAISE EXCEPTION 'Trop d’actions. Réessaie dans une minute.';
  END IF;

  PERFORM public.expire_duels();
  PERFORM set_config('apex.action', p_action, true);

  IF p_action IN ('BUY', 'CANCEL_LISTING') THEN
    SELECT * INTO m
      FROM public.market_listings
     WHERE id = (p_payload->>'id')::uuid
       AND status = 'ACTIVE'
     FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Cette annonce n’est plus disponible.';
    END IF;
    PERFORM public.lock_profiles(
      uid,
      CASE WHEN p_action = 'BUY' THEN m.seller_id ELSE NULL END
    );

  ELSIF p_action IN ('ACCEPT_DUEL', 'CANCEL_DUEL') THEN
    SELECT * INTO d
      FROM public.duel_lobbies
     WHERE id = (p_payload->>'id')::uuid
     FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Défi introuvable.';
    END IF;
    PERFORM public.lock_profiles(
      uid,
      CASE
        WHEN p_action = 'ACCEPT_DUEL' AND d.creator_id <> uid
          THEN d.creator_id
        ELSE NULL
      END
    );

  ELSIF p_action = 'CLAIM_REFERRAL' THEN
    SELECT * INTO p FROM public.profiles WHERE id = uid;
    IF p.referred_by IS NOT NULL OR p.created_at < now() - interval '7 days' THEN
      RAISE EXCEPTION 'Parrainage déjà utilisé ou délai de 7 jours dépassé.';
    END IF;
    BEGIN
      SELECT id INTO ref
        FROM public.profiles
       WHERE referral_code = (p_payload->>'code')::uuid
         AND id <> uid;
    EXCEPTION WHEN invalid_text_representation THEN
      ref := NULL;
    END;
    IF ref IS NULL THEN
      RAISE EXCEPTION 'Code de parrainage invalide.';
    END IF;
    PERFORM public.lock_profiles(uid, ref);

  ELSE
    PERFORM public.lock_profiles(uid, NULL);
  END IF;

  SELECT * INTO p FROM public.profiles WHERE id = uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profil introuvable.';
  END IF;

  IF p_action = 'OPEN_PACK' THEN
    use_bonus := p.last_pack_opened_at > now() - interval '10 minutes';
    IF use_bonus AND p.bonus_packs < 1 THEN
      RAISE EXCEPTION 'Ton prochain booster gratuit n’est pas encore prêt.';
    END IF;
    FOR i IN 1..3 LOOP
      roll := random();
      IF p.pity_counter >= 29 THEN
        target_rarity := CASE WHEN random() < .1 THEN 'Mythic' ELSE 'Legendary' END;
      ELSE
        target_rarity := CASE
          WHEN roll < .003 THEN 'Mythic'
          WHEN roll < .023 THEN 'Legendary'
          WHEN roll < .15  THEN 'Epic'
          WHEN roll < .45  THEN 'Rare'
          ELSE 'Common' END;
      END IF;
      p.pity_counter := CASE
        WHEN target_rarity IN ('Legendary', 'Mythic') THEN 0
        ELSE p.pity_counter + 1 END;
      SELECT * INTO c
        FROM public.cards
       WHERE cards.rarity = target_rarity
       ORDER BY random()
       LIMIT 1;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Catalogue incomplet : %.', target_rarity;
      END IF;
      foil := random() < .08;
      fresh := NOT EXISTS(
        SELECT 1 FROM public.user_cards
         WHERE user_id = uid AND card_id = c.id AND is_foil = foil AND quantity > 0);
      INSERT INTO public.user_cards (user_id, card_id, is_foil)
      VALUES (uid, c.id, foil)
      ON CONFLICT (user_id, card_id, is_foil)
      DO UPDATE SET quantity = public.user_cards.quantity + 1;
      drawn := drawn || jsonb_build_array(
        to_jsonb(c) || jsonb_build_object('is_foil', foil, 'is_new', fresh));
    END LOOP;
    UPDATE public.profiles
       SET bonus_packs = bonus_packs - CASE WHEN use_bonus THEN 1 ELSE 0 END,
           last_pack_opened_at = CASE WHEN use_bonus THEN last_pack_opened_at ELSE now() END,
           pity_counter = p.pity_counter
     WHERE id = uid;
    result := jsonb_build_object('cards', drawn);

  ELSIF p_action = 'BUY_PACK' THEN
    IF p.cash_balance < 15000 THEN
      RAISE EXCEPTION 'Il te faut 15 000 crédits.';
    END IF;
    UPDATE public.profiles
       SET cash_balance = cash_balance - 15000,
           bonus_packs = bonus_packs + 1
     WHERE id = uid;
    result := '{"message":"Un booster bonus rejoint ton paddock."}';

  ELSIF p_action = 'QUICK_SELL' THEN
    FOR rec IN
      SELECT u.id, u.quantity, cards.rarity
        FROM public.user_cards u
        JOIN public.cards ON cards.id = u.card_id
       WHERE u.user_id = uid
         AND u.quantity > 1
         AND NOT u.favorite
    LOOP
      total := total + (rec.quantity - 1) * public.salvage_value(rec.rarity);
      n := n + rec.quantity - 1;
      UPDATE public.user_cards SET quantity = 1 WHERE id = rec.id;
    END LOOP;
    IF n = 0 THEN
      RAISE EXCEPTION 'Aucun doublon disponible hors favoris.';
    END IF;
    UPDATE public.profiles SET cash_balance = cash_balance + total WHERE id = uid;
    result := jsonb_build_object('message', n || ' doublons recyclés · +' || total || ' crédits.');

  ELSIF p_action IN ('LIST', 'CREATE_DUEL', 'FAVORITE') THEN
    SELECT * INTO uc
      FROM public.user_cards
     WHERE id = (p_payload->>'cardId')::uuid
       AND user_id = uid
       AND quantity > 0
     FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Cette carte n’est plus disponible.';
    END IF;
    SELECT * INTO c FROM public.cards WHERE id = uc.card_id;

    SELECT count(*)::int INTO locked_qty
      FROM public.duel_lobbies
     WHERE creator_id = uid
       AND creator_card_id = uc.card_id
       AND creator_is_foil = uc.is_foil
       AND status = 'OPEN';

    IF p_action = 'FAVORITE' THEN
      UPDATE public.user_cards SET favorite = NOT favorite WHERE id = uc.id;
      result := '{"message":"Favoris mis à jour."}';

    ELSIF p_action = 'LIST' THEN
      amount := (p_payload->>'price')::int;
      IF amount IS NULL OR amount < 500 OR amount > 50000000 THEN
        RAISE EXCEPTION 'Prix autorisé : 500 à 50 000 000 crédits.';
      END IF;
      IF (SELECT count(*) FROM public.market_listings
           WHERE seller_id = uid AND status = 'ACTIVE') >= 25 THEN
        RAISE EXCEPTION '25 annonces actives maximum. Retire une annonce avant de continuer.';
      END IF;
      IF uc.favorite THEN
        RAISE EXCEPTION 'Retire cette carte des favoris avant de la vendre.';
      END IF;
      IF uc.quantity <= locked_qty THEN
        RAISE EXCEPTION 'Cette carte est engagée dans un duel. Annule-le avant de vendre.';
      END IF;
      IF uc.quantity = 1 THEN
        DELETE FROM public.user_cards WHERE id = uc.id;
      ELSE
        UPDATE public.user_cards SET quantity = quantity - 1 WHERE id = uc.id;
      END IF;
      INSERT INTO public.market_listings (seller_id, seller_name, card_id, is_foil, price)
      VALUES (uid, p.username, c.id, uc.is_foil, amount);
      result := '{"message":"Annonce publiée. Tu peux la retirer à tout moment."}';

    ELSE -- CREATE_DUEL
      amount := (p_payload->>'bet')::int;
      IF amount IS NULL OR amount < 1000 OR amount > 1000000 THEN
        RAISE EXCEPTION 'Mise autorisée : 1 000 à 1 000 000 crédits.';
      END IF;
      IF p.cash_balance < amount THEN
        RAISE EXCEPTION 'Crédits insuffisants.';
      END IF;
      IF (SELECT count(*) FROM public.duel_lobbies
           WHERE creator_id = uid AND status = 'OPEN') >= 3 THEN
        RAISE EXCEPTION 'Trois défis ouverts maximum.';
      END IF;
      IF uc.quantity <= locked_qty THEN
        RAISE EXCEPTION 'Tous tes exemplaires de cette carte sont déjà engagés en duel.';
      END IF;
      IF uc.quantity = 1 AND uc.last_raced_at IS NOT NULL AND uc.last_raced_at > now() - interval '30 minutes' THEN
        RAISE EXCEPTION 'Cette machine est en révision au stand (30 min entre deux courses).';
      END IF;
      track := floor(random() * 8)::int;
      UPDATE public.profiles SET cash_balance = cash_balance - amount WHERE id = uid;
      INSERT INTO public.duel_lobbies
        (creator_id, creator_name, creator_card_id, creator_is_foil, bet_amount, track_name, rarity_league)
      VALUES (uid, p.username, c.id, uc.is_foil, amount, tracks[track + 1], public.card_league(c.rarity));
      result := jsonb_build_object(
        'message',
        'Défi ' || public.card_league(c.rarity) || ' ouvert sur ' || tracks[track + 1] || ' !'
      );
    END IF;

  ELSIF p_action = 'BUY' THEN
    IF m.seller_id = uid THEN
      RAISE EXCEPTION 'Tu ne peux pas acheter ta propre annonce.';
    END IF;
    IF p.cash_balance < m.price THEN
      RAISE EXCEPTION 'Crédits insuffisants.';
    END IF;
    UPDATE public.profiles SET cash_balance = cash_balance - m.price WHERE id = uid;
    UPDATE public.profiles
       SET cash_balance = cash_balance + floor(m.price * .9)::bigint
     WHERE id = m.seller_id;
    UPDATE public.market_listings SET status = 'SOLD' WHERE id = m.id;
    INSERT INTO public.user_cards (user_id, card_id, is_foil)
    VALUES (uid, m.card_id, m.is_foil)
    ON CONFLICT (user_id, card_id, is_foil)
    DO UPDATE SET quantity = public.user_cards.quantity + 1;
    result := '{"message":"La carte a rejoint ton garage."}';

  ELSIF p_action = 'CANCEL_LISTING' THEN
    IF m.seller_id <> uid THEN
      RAISE EXCEPTION 'Cette annonce ne t’appartient pas.';
    END IF;
    UPDATE public.market_listings SET status = 'CANCELLED' WHERE id = m.id;
    INSERT INTO public.user_cards (user_id, card_id, is_foil)
    VALUES (uid, m.card_id, m.is_foil)
    ON CONFLICT (user_id, card_id, is_foil)
    DO UPDATE SET quantity = public.user_cards.quantity + 1;
    result := '{"message":"Annonce retirée. Carte restituée."}';

  ELSIF p_action = 'CANCEL_DUEL' THEN
    IF d.status <> 'OPEN' THEN
      IF d.status = 'CANCELLED' AND d.expires_at <= now() THEN
        result := '{"message":"Ce défi a expiré. La mise a été remboursée."}';
      ELSE
        RAISE EXCEPTION 'Ce défi n’est plus ouvert.';
      END IF;
    ELSE
      IF d.creator_id <> uid THEN
        RAISE EXCEPTION 'Ce défi ne t’appartient pas.';
      END IF;
      UPDATE public.profiles SET cash_balance = cash_balance + d.bet_amount WHERE id = uid;
      UPDATE public.duel_lobbies SET status = 'CANCELLED' WHERE id = d.id;
      result := '{"message":"Défi annulé. Mise remboursée."}';
    END IF;

  ELSIF p_action = 'ACCEPT_DUEL' THEN
    IF d.status <> 'OPEN' THEN
      IF d.status = 'CANCELLED' AND d.expires_at <= now() THEN
        result := '{"message":"Ce défi a expiré. La mise a été remboursée."}';
      ELSE
        RAISE EXCEPTION 'Ce défi n’est plus ouvert.';
      END IF;
    ELSE
      IF d.creator_id = uid THEN
        RAISE EXCEPTION 'Tu ne peux pas affronter ton propre défi.';
      END IF;
      SELECT * INTO uc
        FROM public.user_cards
       WHERE id = (p_payload->>'cardId')::uuid
         AND user_id = uid
         AND quantity > 0
       FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Véhicule indisponible.';
      END IF;
      IF uc.quantity = 1 AND uc.last_raced_at IS NOT NULL AND uc.last_raced_at > now() - interval '30 minutes' THEN
        RAISE EXCEPTION 'Cette machine est en révision au stand (30 min entre deux courses).';
      END IF;
      SELECT * INTO c  FROM public.cards WHERE id = d.creator_card_id;
      SELECT * INTO c2 FROM public.cards WHERE id = uc.card_id;
      IF c.division <> c2.division THEN
        RAISE EXCEPTION 'Choisis un véhicule de la même catégorie.';
      END IF;
      IF public.league_rank(public.card_league(c2.rarity)) > public.league_rank(d.rarity_league) THEN
        RAISE EXCEPTION 'Ce défi est limité à la ligue %.', d.rarity_league;
      END IF;
      IF p.cash_balance < d.bet_amount THEN
        RAISE EXCEPTION 'Crédits insuffisants.';
      END IF;
      UPDATE public.profiles SET cash_balance = cash_balance - d.bet_amount WHERE id = uid;
      UPDATE public.user_cards SET last_raced_at = now() WHERE id = uc.id;
      UPDATE public.user_cards
         SET last_raced_at = now()
       WHERE user_id = d.creator_id
         AND card_id = d.creator_card_id
         AND is_foil = d.creator_is_foil;
      track := coalesce(array_position(tracks, d.track_name) - 1, floor(random() * 8)::int);
      s1 := round(public.race_score(c,  track) * (.97 + random() * .06)::numeric, 2);
      s2 := round(public.race_score(c2, track) * (.97 + random() * .06)::numeric, 2);
      IF s1 > s2 OR (s1 = s2 AND random() < .5) THEN
        win := d.creator_id;
        lose := uid;
        winner := d.creator_name;
      ELSE
        win := uid;
        lose := d.creator_id;
        winner := p.username;
      END IF;
      amount := floor(d.bet_amount * 2 * .95)::int;
      UPDATE public.profiles
        SET cash_balance = cash_balance + amount,
            duels_won = duels_won + 1
       WHERE id = win;
      UPDATE public.profiles SET duels_lost = duels_lost + 1 WHERE id = lose;
      UPDATE public.duel_lobbies
         SET status = 'FINISHED',
             challenger_id = uid,
             challenger_name = p.username,
             challenger_card_id = c2.id,
             track_name = tracks[track + 1],
             winner_id = win,
             winner_name = winner,
             creator_score = s1,
             challenger_score = s2
       WHERE id = d.id
      RETURNING * INTO d;
      result := jsonb_build_object('duel', jsonb_build_object(
        'track_name', d.track_name,
        'winner_name', winner,
        'winner_id', win,
        'creator_card', c.name,
        'challenger_card', c2.name,
        'creator_card_id', c.id,
        'challenger_card_id', c2.id,
        'creator_score', s1,
        'challenger_score', s2,
        'pot_won', amount));
    END IF;

  ELSIF p_action = 'CLAIM_REFERRAL' THEN
    IF p.referred_by IS NOT NULL OR p.created_at < now() - interval '7 days' THEN
      RAISE EXCEPTION 'Parrainage déjà utilisé ou délai de 7 jours dépassé.';
    END IF;
    SELECT * INTO ref_p FROM public.profiles WHERE id = ref;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Code de parrainage invalide.';
    END IF;
    IF ref_p.referred_by = uid THEN
      RAISE EXCEPTION 'Parrainage croisé interdit.';
    END IF;
    IF ref_p.referrals_count >= 25 THEN
      RAISE EXCEPTION 'Ce parrain a atteint la limite de 25 filleuls.';
    END IF;
    UPDATE public.profiles
       SET referred_by = ref,
           bonus_packs = bonus_packs + 2,
           cash_balance = cash_balance + 5000
     WHERE id = uid;
    UPDATE public.profiles
       SET referrals_count = referrals_count + 1,
           bonus_packs = bonus_packs + 3,
           cash_balance = cash_balance + 7500
     WHERE id = ref;
    result := '{"message":"Parrainage validé ! +2 Boosters & +5 000 CR pour toi, +3 Boosters & +7 500 CR pour ton parrain !"}';

  ELSE
    RAISE EXCEPTION 'Action inconnue.';
  END IF;

  INSERT INTO public.game_requests (user_id, request_id, action, payload, result)
  VALUES (uid, p_request_id, p_action, p_payload, result);
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION
  public.card_league(text),
  public.league_rank(text),
  public.race_score(public.cards, int),
  public.game_action(text, jsonb, uuid)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.game_action(text, jsonb, uuid)
TO authenticated;

COMMIT;
