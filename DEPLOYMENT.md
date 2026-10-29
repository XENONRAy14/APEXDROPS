# Déploiement — APEX DROPS

Deux niveaux : **démo solo** (front statique seul, zéro backend) ou **jeu complet** (front + Supabase).

## Option A — Démo solo (5 minutes)

Le front suffit : sans variables Supabase, le jeu bascule en mode démo local (localStorage).

```sh
npm ci && npm run build
```

Le dossier `dist/` est statique : dépose-le sur n'importe quel hébergeur (Vercel, Netlify, Cloudflare Pages, GitHub Pages, VPS + nginx).

## Option B — Jeu complet (multijoueur)

### 1. Projet Supabase (~10 min, compte requis)

1. Crée un projet sur https://supabase.com (région proche des joueurs, note le mot de passe DB).
2. Dans **SQL Editor**, exécute les migrations **dans l'ordre** :
   `supabase/migrations/001_base.sql` → `002_hardening.sql` → `003_catalog.sql` → `004_concurrency.sql` → `005_catalog_schema.sql`
   Puis le catalogue en 7 parties (le SQL Editor web refuse `006_catalog_data.sql` entier car >1 Mo) :
   `006a_catalog_part1.sql` → `006b` → `006c` → `006d` → `006e` → `006f` → `006g`
   Puis les évolutions de gameplay : `007_security_hardening.sql` → `008_arena_gacha.sql` → `009_arena_fairplay.sql` → `010_themed_packs.sql`
   (Sur `001`, clique **Run without RLS** quand Supabase demande — c'est `002` qui active le RLS.)
3. Vérifie : `select count(*) from cards;` doit renvoyer 5513.

### 2. Auth OAuth (~10 min, compte requis)

Par défaut Discord (`VITE_OAUTH_PROVIDER` permet d'en changer) :

1. https://discord.com/developers/applications → **New Application** → onglet **OAuth2**.
2. Ajoute le redirect URL fourni par Supabase : dans Supabase → **Authentication → Providers → Discord**, active-le, copie le **Callback URL** et colle-le chez Discord.
3. Colle le **Client ID** et **Client Secret** Discord dans le provider Supabase.
4. Dans Supabase → **Authentication → URL Configuration** : mets l'URL du site en **Site URL** et ajoute-la aux **Redirect URLs** (+ `http://localhost:5173` pour le dev).

### 3. Variables d'environnement du front

Dans Supabase → **Project Settings → API**, récupère `Project URL` et `anon public key` (jamais la `service_role` !).

`.env.local` (local, non versionné) ou variables de l'hébergeur :

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_OAUTH_PROVIDER=discord
```

### 4. Hébergement du front

Exemple Vercel/Netlify/Cloudflare Pages : build command `npm run build`, output `dist`, et déclare les 3 variables `VITE_*` dans les settings. SPA : pas de config spéciale requise (tout tient sur `index.html`).

## Vérification post-déploiement

- [ ] La page se connecte via OAuth et revient sur le jeu.
- [ ] Ouvrir un booster crédite 3 cartes et débite 15 000 CR (ou le bonus gratuit).
- [ ] Recharger la page conserve l'inventaire (données serveur, pas localStorage).
- [ ] Un second compte voit le marché et peut miser en duel.
- [ ] La fiche carte affiche photo + crédit + lien Commons.

## Attention

- Le catalogue (~670 Ko gzip) se télécharge une fois puis est caché : normal.
- Le ledger `game_requests`/`wallet_history` n'est pas purgé automatiquement — à surveiller après quelques mois d'usage.
- Bêta privée recommandée avant ouverture publique : le modèle de verrous n'a pas été testé sous forte charge.
