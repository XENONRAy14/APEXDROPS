-- APEX DROPS 4. Apply AFTER the original V3 schema OR 001_base.sql, never both.
BEGIN;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_nonnegative CHECK(cash_balance>=0 AND bonus_packs>=0 AND pity_counter>=0);
ALTER TABLE public.user_cards ADD COLUMN favorite boolean NOT NULL DEFAULT false;
ALTER TABLE public.cards ADD COLUMN division text NOT NULL DEFAULT 'Route' CHECK(division IN ('Route','Compétition','Moto'));
ALTER TABLE public.cards ADD COLUMN color text NOT NULL DEFAULT '#e76b40';
ALTER TABLE public.cards ADD COLUMN shape text NOT NULL DEFAULT 'coupe';
ALTER TABLE public.cards ADD CONSTRAINT cards_positive CHECK(power_hp>0 AND weight_kg>0 AND top_speed_kmh>0 AND market_value>0);
ALTER TABLE public.duel_lobbies ADD COLUMN expires_at timestamptz NOT NULL DEFAULT now()+interval '24 hours';
CREATE TABLE public.game_requests(user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE, request_id uuid NOT NULL, action text NOT NULL, payload jsonb NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(user_id,request_id));
CREATE TABLE public.wallet_history(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,kind text NOT NULL,amount bigint NOT NULL,balance bigint NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX market_active ON public.market_listings(created_at DESC) WHERE status='ACTIVE';
CREATE INDEX duels_open ON public.duel_lobbies(expires_at) WHERE status='OPEN';
CREATE INDEX profiles_rank ON public.profiles(collection_score DESC);
CREATE INDEX history_user ON public.wallet_history(user_id,created_at DESC);
CREATE INDEX requests_time ON public.game_requests(user_id,created_at DESC);
-- Retire insecure V3 entry points even when upgrading an existing database.
DO $$ DECLARE r record; BEGIN
 FOR r IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN('open_booster_pack','quick_sell_all_duplicates','buy_booster_with_cash','create_market_listing','buy_market_listing','create_duel_lobby','accept_duel_lobby') LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated',r.sig);
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 INSERT INTO public.profiles(id,username,avatar_url) VALUES(NEW.id,left(coalesce(NEW.raw_user_meta_data->>'full_name',NEW.raw_user_meta_data->>'name','Pilote'),40),NEW.raw_user_meta_data->>'avatar_url');
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
CREATE FUNCTION public.wallet_audit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.cash_balance<>OLD.cash_balance THEN
 INSERT INTO public.wallet_history(user_id,kind,amount,balance) VALUES(NEW.id,coalesce(nullif(current_setting('apex.action',true),''),'ADJUSTMENT'),NEW.cash_balance-OLD.cash_balance,NEW.cash_balance);
 END IF; RETURN NEW;
END $$;
CREATE TRIGGER wallet_changed AFTER UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.wallet_audit();
CREATE FUNCTION public.inventory_score() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE uid uuid; BEGIN
 uid:=CASE WHEN TG_OP='DELETE' THEN OLD.user_id ELSE NEW.user_id END;
 UPDATE public.profiles SET collection_score=(SELECT coalesce(sum(c.market_value::bigint*uc.quantity*CASE WHEN uc.is_foil THEN 2.5 ELSE 1 END),0)::bigint FROM public.user_cards uc JOIN public.cards c ON c.id=uc.card_id WHERE uc.user_id=uid) WHERE id=uid;
 RETURN NULL;
END $$;
CREATE TRIGGER inventory_changed AFTER INSERT OR UPDATE OR DELETE ON public.user_cards FOR EACH ROW EXECUTE FUNCTION public.inventory_score();
CREATE FUNCTION public.salvage_value(r text) RETURNS integer LANGUAGE sql IMMUTABLE SET search_path='' AS $$ SELECT CASE r WHEN 'Common' THEN 100 WHEN 'Rare' THEN 250 WHEN 'Epic' THEN 600 WHEN 'Legendary' THEN 1400 WHEN 'Mythic' THEN 3000 ELSE 0 END $$;
CREATE FUNCTION public.race_score(c public.cards,t int) RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE t
 WHEN 0 THEN least(c.power_hp/700.0,1)*100*.08+least(c.top_speed_kmh/370.0,1)*100*.07+c.handling_score*.55+greatest(0,least(100,(2000-c.weight_kg)/18.0))*.30
 WHEN 1 THEN least(c.power_hp/700.0,1)*100*.40+least(c.top_speed_kmh/370.0,1)*100*.45+c.handling_score*.10+greatest(0,least(100,(2000-c.weight_kg)/18.0))*.05
 WHEN 2 THEN least(c.power_hp/700.0,1)*100*.20+least(c.top_speed_kmh/370.0,1)*100*.15+c.handling_score*.45+greatest(0,least(100,(2000-c.weight_kg)/18.0))*.20
 ELSE least(c.power_hp/700.0,1)*100*.10+least(c.top_speed_kmh/370.0,1)*100*.15+c.handling_score*.55+greatest(0,least(100,(2000-c.weight_kg)/18.0))*.20 END
$$;
-- One short transaction lock makes cross-player transfers serial and deadlock-free.
-- Intended for a small community. Replace with ordered account locks after load testing.
CREATE FUNCTION public.expire_duels() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d record; BEGIN
 PERFORM pg_advisory_xact_lock(724210);
 PERFORM set_config('apex.action','DUEL_REFUND',true);
 FOR d IN SELECT * FROM public.duel_lobbies WHERE status='OPEN' AND expires_at<=now() FOR UPDATE LOOP
 UPDATE public.profiles SET cash_balance=cash_balance+d.bet_amount WHERE id=d.creator_id;
 UPDATE public.duel_lobbies SET status='CANCELLED' WHERE id=d.id;
 END LOOP;
END $$;
CREATE FUNCTION public.game_action(p_action text,p_payload jsonb,p_request_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 uid uuid:=auth.uid(); p public.profiles%ROWTYPE; uc public.user_cards%ROWTYPE;
 c public.cards%ROWTYPE; c2 public.cards%ROWTYPE; m public.market_listings%ROWTYPE; d public.duel_lobbies%ROWTYPE;
 prior public.game_requests%ROWTYPE; result jsonb:='{}'; drawn jsonb:='[]'; target_rarity text; foil boolean; fresh boolean; roll float; use_bonus boolean;
 value int; amount int; total bigint:=0; n int:=0; i int; track int; s1 numeric;s2 numeric; win uuid; lose uuid; winner text; challenger text; ref uuid; rec record; target uuid;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Connecte-toi pour jouer.'; END IF;
 IF p_request_id IS NULL OR p_payload IS NULL OR jsonb_typeof(p_payload)<>'object' THEN RAISE EXCEPTION 'Requête invalide.'; END IF;
 PERFORM pg_advisory_xact_lock(724210);
 SELECT * INTO prior FROM public.game_requests WHERE user_id=uid AND request_id=p_request_id;
 IF FOUND THEN
 IF prior.action<>p_action OR prior.payload<>p_payload THEN RAISE EXCEPTION 'Identifiant de requête déjà utilisé.'; END IF;
 RETURN prior.result;
 END IF;
 IF (SELECT count(*) FROM public.game_requests WHERE user_id=uid AND created_at>now()-interval '1 minute')>=40 THEN RAISE EXCEPTION 'Trop d’actions. Réessaie dans une minute.'; END IF;
 PERFORM public.expire_duels();
 PERFORM set_config('apex.action',p_action,true);
 SELECT * INTO p FROM public.profiles WHERE id=uid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Profil introuvable.'; END IF;
 IF p_action='OPEN_PACK' THEN
 use_bonus:=p.last_pack_opened_at>now()-interval '10 minutes';
 IF use_bonus AND p.bonus_packs<1 THEN RAISE EXCEPTION 'Ton prochain booster gratuit n’est pas encore prêt.'; END IF;
 FOR i IN 1..3 LOOP
 roll:=random();
 IF p.pity_counter>=29 THEN target_rarity:=CASE WHEN random()<.1 THEN 'Mythic' ELSE 'Legendary' END;
 ELSE target_rarity:=CASE WHEN roll<.003 THEN 'Mythic' WHEN roll<.023 THEN 'Legendary' WHEN roll<.15 THEN 'Epic' WHEN roll<.45 THEN 'Rare' ELSE 'Common' END; END IF;
 p.pity_counter:=CASE WHEN target_rarity IN('Legendary','Mythic') THEN 0 ELSE p.pity_counter+1 END;
 SELECT * INTO c FROM public.cards WHERE cards.rarity=target_rarity ORDER BY random() LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'Catalogue incomplet : %.',target_rarity; END IF;
 foil:=random()<.08;
 fresh:=NOT EXISTS(SELECT 1 FROM public.user_cards WHERE user_id=uid AND card_id=c.id AND is_foil=foil AND quantity>0);
 INSERT INTO public.user_cards(user_id,card_id,is_foil) VALUES(uid,c.id,foil) ON CONFLICT(user_id,card_id,is_foil) DO UPDATE SET quantity=public.user_cards.quantity+1;
 drawn:=drawn||jsonb_build_array(to_jsonb(c)||jsonb_build_object('is_foil',foil,'is_new',fresh));
 END LOOP;
 UPDATE public.profiles SET bonus_packs=bonus_packs-CASE WHEN use_bonus THEN 1 ELSE 0 END,last_pack_opened_at=CASE WHEN use_bonus THEN last_pack_opened_at ELSE now() END,pity_counter=p.pity_counter WHERE id=uid;
 result:=jsonb_build_object('cards',drawn);
 ELSIF p_action='BUY_PACK' THEN
 IF p.cash_balance<15000 THEN RAISE EXCEPTION 'Il te faut 15 000 crédits.'; END IF;
 UPDATE public.profiles SET cash_balance=cash_balance-15000,bonus_packs=bonus_packs+1 WHERE id=uid;
 result:='{"message":"Un booster bonus rejoint ton paddock."}';
 ELSIF p_action='QUICK_SELL' THEN
 FOR rec IN SELECT u.id,u.quantity,cards.rarity FROM public.user_cards u JOIN public.cards ON cards.id=u.card_id WHERE u.user_id=uid AND u.quantity>1 AND NOT u.favorite LOOP
 total:=total+(rec.quantity-1)*public.salvage_value(rec.rarity); n:=n+rec.quantity-1;
 UPDATE public.user_cards SET quantity=1 WHERE id=rec.id;
 END LOOP;
 IF n=0 THEN RAISE EXCEPTION 'Aucun doublon disponible hors favoris.'; END IF;
 UPDATE public.profiles SET cash_balance=cash_balance+total WHERE id=uid;
 result:=jsonb_build_object('message',n||' doublons recyclés · +'||total||' crédits.');
 ELSIF p_action IN('LIST','CREATE_DUEL','FAVORITE') THEN
 SELECT * INTO uc FROM public.user_cards WHERE id=(p_payload->>'cardId')::uuid AND user_id=uid AND quantity>0 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Cette carte n’est plus disponible.'; END IF;
 SELECT * INTO c FROM public.cards WHERE id=uc.card_id;
 IF p_action='FAVORITE' THEN
 UPDATE public.user_cards SET favorite=NOT favorite WHERE id=uc.id;
 result:='{"message":"Favoris mis à jour."}';
 ELSIF p_action='LIST' THEN
 amount:=(p_payload->>'price')::int;
 IF amount IS NULL OR amount<500 OR amount>50000000 THEN RAISE EXCEPTION 'Prix autorisé : 500 à 50 000 000 crédits.'; END IF;
 IF (SELECT count(*) FROM public.market_listings WHERE seller_id=uid AND status='ACTIVE')>=25 THEN RAISE EXCEPTION '25 annonces actives maximum. Retire une annonce avant de continuer.'; END IF;
 IF uc.favorite THEN RAISE EXCEPTION 'Retire cette carte des favoris avant de la vendre.'; END IF;
 IF EXISTS(SELECT 1 FROM public.duel_lobbies WHERE creator_id=uid AND creator_card_id=uc.card_id AND creator_is_foil=uc.is_foil AND status='OPEN') THEN RAISE EXCEPTION 'Cette carte est engagée dans un duel. Annule-le avant de vendre.'; END IF;
 IF uc.quantity=1 THEN DELETE FROM public.user_cards WHERE id=uc.id; ELSE UPDATE public.user_cards SET quantity=quantity-1 WHERE id=uc.id; END IF;
 INSERT INTO public.market_listings(seller_id,seller_name,card_id,is_foil,price) VALUES(uid,p.username,c.id,uc.is_foil,amount);
 result:='{"message":"Annonce publiée. Tu peux la retirer à tout moment."}';
 ELSE
 amount:=(p_payload->>'bet')::int;
 IF amount IS NULL OR amount<1000 OR amount>1000000 THEN RAISE EXCEPTION 'Mise autorisée : 1 000 à 1 000 000 crédits.'; END IF;
 IF p.cash_balance<amount THEN RAISE EXCEPTION 'Crédits insuffisants.'; END IF;
 IF (SELECT count(*) FROM public.duel_lobbies WHERE creator_id=uid AND status='OPEN')>=3 THEN RAISE EXCEPTION 'Trois défis ouverts maximum.'; END IF;
 UPDATE public.profiles SET cash_balance=cash_balance-amount WHERE id=uid;
 INSERT INTO public.duel_lobbies(creator_id,creator_name,creator_card_id,creator_is_foil,bet_amount) VALUES(uid,p.username,c.id,uc.is_foil,amount);
 result:='{"message":"Défi ouvert pendant 24 h. Mise réservée et remboursable."}';
 END IF;
 ELSIF p_action IN('BUY','CANCEL_LISTING') THEN
 SELECT * INTO m FROM public.market_listings WHERE id=(p_payload->>'id')::uuid AND status='ACTIVE' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Cette annonce n’est plus disponible.'; END IF;
 IF p_action='BUY' THEN
 IF m.seller_id=uid THEN RAISE EXCEPTION 'Tu ne peux pas acheter ta propre annonce.'; END IF;
 IF p.cash_balance<m.price THEN RAISE EXCEPTION 'Crédits insuffisants.'; END IF;
 UPDATE public.profiles SET cash_balance=cash_balance-m.price WHERE id=uid;
 UPDATE public.profiles SET cash_balance=cash_balance+floor(m.price*.9)::bigint WHERE id=m.seller_id;
 UPDATE public.market_listings SET status='SOLD' WHERE id=m.id;
 ELSE
 IF m.seller_id<>uid THEN RAISE EXCEPTION 'Cette annonce ne t’appartient pas.'; END IF;
 UPDATE public.market_listings SET status='CANCELLED' WHERE id=m.id;
 END IF;
 INSERT INTO public.user_cards(user_id,card_id,is_foil) VALUES(uid,m.card_id,m.is_foil) ON CONFLICT(user_id,card_id,is_foil) DO UPDATE SET quantity=public.user_cards.quantity+1;
 result:=jsonb_build_object('message',CASE WHEN p_action='BUY' THEN 'La carte a rejoint ton garage.' ELSE 'Annonce retirée. Carte restituée.' END);
 ELSIF p_action IN('ACCEPT_DUEL','CANCEL_DUEL') THEN
 SELECT * INTO d FROM public.duel_lobbies WHERE id=(p_payload->>'id')::uuid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Défi introuvable.'; END IF;
 IF d.status<>'OPEN' THEN
 IF d.status='CANCELLED' AND d.expires_at<=now() THEN result:='{"message":"Ce défi a expiré. La mise a été remboursée."}';
 ELSE RAISE EXCEPTION 'Ce défi n’est plus ouvert.'; END IF;
 ELSE
 IF p_action='CANCEL_DUEL' THEN
 IF d.creator_id<>uid THEN RAISE EXCEPTION 'Ce défi ne t’appartient pas.'; END IF;
 UPDATE public.profiles SET cash_balance=cash_balance+d.bet_amount WHERE id=uid;
 UPDATE public.duel_lobbies SET status='CANCELLED' WHERE id=d.id;
 result:='{"message":"Défi annulé. Mise remboursée."}';
 ELSE
 IF d.creator_id=uid THEN RAISE EXCEPTION 'Tu ne peux pas affronter ton propre défi.'; END IF;
 SELECT * INTO uc FROM public.user_cards WHERE id=(p_payload->>'cardId')::uuid AND user_id=uid AND quantity>0;
 IF NOT FOUND THEN RAISE EXCEPTION 'Véhicule indisponible.'; END IF;
 SELECT * INTO c FROM public.cards WHERE id=d.creator_card_id;
 SELECT * INTO c2 FROM public.cards WHERE id=uc.card_id;
 IF c.division<>c2.division THEN RAISE EXCEPTION 'Choisis un véhicule de la même catégorie.'; END IF;
 IF p.cash_balance<d.bet_amount THEN RAISE EXCEPTION 'Crédits insuffisants.'; END IF;
 UPDATE public.profiles SET cash_balance=cash_balance-d.bet_amount WHERE id=uid;
 track:=floor(random()*4)::int;
 s1:=round(public.race_score(c,track)*(.97+random()*.06)::numeric,2);
 s2:=round(public.race_score(c2,track)*(.97+random()*.06)::numeric,2);
 IF s1>s2 OR (s1=s2 AND random()<.5) THEN win:=d.creator_id;lose:=uid;winner:=d.creator_name;ELSE win:=uid;lose:=d.creator_id;winner:=p.username;END IF;
 amount:=floor(d.bet_amount*2*.95)::int;
 UPDATE public.profiles SET cash_balance=cash_balance+amount,duels_won=duels_won+1 WHERE id=win;
 UPDATE public.profiles SET duels_lost=duels_lost+1 WHERE id=lose;
 UPDATE public.duel_lobbies SET status='FINISHED',challenger_id=uid,challenger_name=p.username,challenger_card_id=c2.id,track_name=(ARRAY['Espigoulier · Pluie','Hunaudières · Vitesse','Gineste · Technique','Monaco · Précision'])[track+1],winner_id=win,winner_name=winner,creator_score=s1,challenger_score=s2 WHERE id=d.id RETURNING * INTO d;
 result:=jsonb_build_object('duel',jsonb_build_object('track_name',d.track_name,'winner_name',winner,'winner_id',win,'creator_card',c.name,'challenger_card',c2.name,'creator_score',s1,'challenger_score',s2,'pot_won',amount));
 END IF; END IF;
 ELSIF p_action='CLAIM_REFERRAL' THEN
 IF p.referred_by IS NOT NULL OR p.created_at<now()-interval '7 days' THEN RAISE EXCEPTION 'Parrainage déjà utilisé ou délai de 7 jours dépassé.'; END IF;
 SELECT id INTO ref FROM public.profiles WHERE referral_code=(p_payload->>'code')::uuid AND id<>uid;
 IF ref IS NULL THEN RAISE EXCEPTION 'Code de parrainage invalide.'; END IF;
 -- Récompense virale style Kyara : +2 Boosters & +5 000 CR pour le filleul, +3 Boosters & +7 500 CR pour le parrain !
 UPDATE public.profiles SET referred_by=ref, bonus_packs=bonus_packs+2, cash_balance=cash_balance+5000 WHERE id=uid;
 UPDATE public.profiles SET referrals_count=referrals_count+1, bonus_packs=bonus_packs+3, cash_balance=cash_balance+7500 WHERE id=ref;
 result:='{"message":"Parrainage validé ! +2 Boosters & +5 000 CR pour toi, +3 Boosters & +7 500 CR pour ton parrain !"}';
 ELSE RAISE EXCEPTION 'Action inconnue.'; END IF;
 INSERT INTO public.game_requests(user_id,request_id,action,payload,result) VALUES(uid,p_request_id,p_action,p_payload,result);
 RETURN result;
END $$;
CREATE FUNCTION public.game_state() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE uid uuid:=auth.uid(); result jsonb; BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Connecte-toi pour accéder au paddock.'; END IF;
 PERFORM public.expire_duels();
 SELECT jsonb_build_object(
 'profile',(SELECT to_jsonb(p) FROM public.profiles p WHERE id=uid),
 'catalog',(SELECT coalesce(jsonb_agg(c ORDER BY id),'[]') FROM public.cards c),
 'inventory',(SELECT coalesce(jsonb_agg(to_jsonb(u)||jsonb_build_object('cards',to_jsonb(c)) ORDER BY u.first_obtained_at DESC),'[]') FROM public.user_cards u JOIN public.cards c ON c.id=u.card_id WHERE u.user_id=uid AND u.quantity>0),
 'listings',(SELECT coalesce(jsonb_agg(x),'[]') FROM (SELECT to_jsonb(m)||jsonb_build_object('cards',to_jsonb(c)) x FROM public.market_listings m JOIN public.cards c ON c.id=m.card_id WHERE status='ACTIVE' AND (m.seller_id=uid OR m.id IN (SELECT id FROM public.market_listings WHERE status='ACTIVE' ORDER BY created_at DESC LIMIT 200)) ORDER BY m.created_at DESC) q),
 'duels',(SELECT coalesce(jsonb_agg(x),'[]') FROM (SELECT to_jsonb(d)||jsonb_build_object('cards',to_jsonb(c)) x FROM public.duel_lobbies d JOIN public.cards c ON c.id=d.creator_card_id WHERE d.status='OPEN' OR (d.status='FINISHED' AND (d.creator_id=uid OR d.challenger_id=uid)) ORDER BY (d.status='OPEN' AND d.creator_id=uid) DESC,(d.status='OPEN') DESC,d.created_at DESC LIMIT 100) q),
 'leaderboard',(SELECT coalesce(jsonb_agg(x),'[]') FROM (SELECT id,username,collection_score,duels_won,duels_lost,referrals_count FROM public.profiles ORDER BY collection_score DESC,id LIMIT 50) x),
 'history',(SELECT coalesce(jsonb_agg(x),'[]') FROM (SELECT id,kind,amount,balance,created_at FROM public.wallet_history WHERE user_id=uid ORDER BY created_at DESC LIMIT 50) x)
 ) INTO result;
 RETURN result;
END $$;
-- Defense in depth: only the two authenticated RPCs are exposed.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.duel_lobbies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.profiles,public.cards,public.user_cards,public.market_listings,public.duel_lobbies,public.game_requests,public.wallet_history FROM anon,authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user(),public.wallet_audit(),public.inventory_score(),public.salvage_value(text),public.race_score(public.cards,int),public.expire_duels(),public.game_action(text,jsonb,uuid),public.game_state() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.game_action(text,jsonb,uuid),public.game_state() TO authenticated;
-- Repair pre-existing inventory valuation and enforce the revised pity threshold.
UPDATE public.profiles p SET collection_score=(SELECT coalesce(sum(c.market_value::bigint*u.quantity*CASE WHEN u.is_foil THEN 2.5 ELSE 1 END),0)::bigint FROM public.user_cards u JOIN public.cards c ON c.id=u.card_id WHERE u.user_id=p.id),pity_counter=least(pity_counter,29);
COMMIT;
