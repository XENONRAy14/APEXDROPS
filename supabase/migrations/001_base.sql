-- =========================================================================
-- APEX DROPS V3 : SCHEMA COMPLET + MARKETPLACE + DUELS TOUGE/F1 + LEADERBOARD
-- =========================================================================



-- 1. TABLE PROFILES (Ajout de duels_won et duels_lost pour le Leaderboard)
CREATE TABLE public.profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    username TEXT NOT NULL,
    avatar_url TEXT,
    referral_code UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
    referred_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    referrals_count INT DEFAULT 0 NOT NULL,
    bonus_packs INT DEFAULT 2 NOT NULL,
    pity_counter INT DEFAULT 0 NOT NULL,
    collection_score BIGINT DEFAULT 0 NOT NULL,
    cash_balance BIGINT DEFAULT 5000 NOT NULL,
    duels_won INT DEFAULT 0 NOT NULL,
    duels_lost INT DEFAULT 0 NOT NULL,
    last_pack_opened_at TIMESTAMPTZ DEFAULT (NOW() - INTERVAL '15 minutes') NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 2. TABLE CARDS
CREATE TABLE public.cards (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('Street & Touge', 'F1 & Prototype', 'Rally & Legend', 'MotoGP & Superbike', 'Driver')),
    rarity TEXT NOT NULL CHECK (rarity IN ('Common', 'Rare', 'Epic', 'Legendary', 'Mythic')),
    power_hp INT NOT NULL,
    weight_kg INT NOT NULL,
    top_speed_kmh INT NOT NULL,
    handling_score INT NOT NULL CHECK (handling_score BETWEEN 1 AND 100),
    year INT NOT NULL,
    market_value INT NOT NULL,
    image_url TEXT NOT NULL,
    lore TEXT
);

-- 3. TABLE USER_CARDS (Inventaire)
CREATE TABLE public.user_cards (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    card_id INT REFERENCES public.cards(id) ON DELETE CASCADE NOT NULL,
    quantity INT DEFAULT 1 NOT NULL CHECK (quantity >= 0),
    is_foil BOOLEAN DEFAULT FALSE NOT NULL,
    first_obtained_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    UNIQUE(user_id, card_id, is_foil)
);

-- 4. TABLE MARKET_LISTINGS (Hôtel des Ventes entre joueurs)
CREATE TABLE public.market_listings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    seller_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    seller_name TEXT NOT NULL,
    card_id INT REFERENCES public.cards(id) ON DELETE CASCADE NOT NULL,
    is_foil BOOLEAN DEFAULT FALSE NOT NULL,
    price INT NOT NULL CHECK (price >= 500 AND price <= 50000000),
    status TEXT DEFAULT 'ACTIVE' NOT NULL CHECK (status IN ('ACTIVE', 'SOLD', 'CANCELLED')),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 5. TABLE DUEL_LOBBIES (Arène de Duels PvP avec Mise en Cash & Circuit Aléatoire)
CREATE TABLE public.duel_lobbies (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    creator_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    creator_name TEXT NOT NULL,
    creator_card_id INT REFERENCES public.cards(id) ON DELETE CASCADE NOT NULL,
    creator_is_foil BOOLEAN DEFAULT FALSE NOT NULL,
    bet_amount INT NOT NULL CHECK (bet_amount >= 1000 AND bet_amount <= 10000000),
    status TEXT DEFAULT 'OPEN' NOT NULL CHECK (status IN ('OPEN', 'FINISHED', 'CANCELLED')),
    challenger_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    challenger_name TEXT,
    challenger_card_id INT REFERENCES public.cards(id) ON DELETE SET NULL,
    track_name TEXT,
    winner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    winner_name TEXT,
    creator_score NUMERIC(10,2),
    challenger_score NUMERIC(10,2),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

