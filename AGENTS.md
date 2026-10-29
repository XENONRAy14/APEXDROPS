# AGENTS.md — APEX DROPS

Contexte pour les agents de code (Devin, etc.). Le propriétaire travaille en français : répondre en français.

## Le projet

Jeu de collection de cartes automobiles (voitures de route, course/F1, motos), inspiré de https://kyara.games/ mais pour l'univers auto. Boosters avec garantie (pity), garage, marché entre joueurs (prix fixe, 10 % de commission), duels par catégorie avec mises, parrainage. Crédits virtuels uniquement, aucun argent réel.

- Front : React 19 + TypeScript + Vite, hébergeable en statique (`dist/`).
- Back : PostgreSQL/Supabase. Toute la logique serveur est dans deux RPC `SECURITY DEFINER` : `game_state()` et `game_action(action, payload, request_id)`. RLS activé sans policy (aucun accès direct aux tables : c'est voulu).
- Sans variables Supabase → mode démo solo local (localStorage).
- Dépôt : https://github.com/XENONRAy14/APEXDROPS (branche `main`, push en SSH).

## Commandes

```sh
npm ci
npm run dev        # Vite sur http://localhost:5173
npm test           # migrations SQL exécutées dans PGlite + scénarios transactionnels
npm run check      # tsc
npm run build      # tsc + vite build
node scripts/build-catalog.mjs [--cache] [--pageviews] [--cars=10] [--racing=2] [--motos=3]
```

Vérification avant de conclure une tâche : `npm run check && npm test && npm run build`.

## Architecture

- `src/App.tsx` : coquille, état global, navigation, appels `run(action, payload)`.
- `src/views/` : Paddock, Garage, Market, Arena, Ranking.
- `src/modals.tsx` : toutes les modales (détail carte avec crédits photo, booster, vente, achat, duel, profil, guide).
- `src/components.tsx` : VehicleCard, CarArt (photo, SVG en secours), Modal accessible, FilterBar, Empty.
- `src/rules.ts` : constantes économiques côté client. **Miroir du SQL** : toute modification doit être répercutée dans les migrations (le SQL fait foi en mode connecté).
- `src/engine.ts` : tirages et score de course (démo) ; testé contre `race_score` SQL.
- `src/demo.ts` : transactions locales ; réhydrate les cartes sauvegardées depuis le catalogue courant.
- `src/catalog.ts` : `loadCatalog()` (import dynamique de `src/data/catalog.json`, chunk séparé), `CATALOG`, `cardById`.
- `src/api.ts` : client Supabase, idempotence (UUID de requête en sessionStorage), OAuth via `VITE_OAUTH_PROVIDER` (défaut discord).
- `supabase/migrations/` :
  - `001` schéma V3, `002` durcissement (RLS, RPC, ledger), `003` 24 cartes d'origine ;
  - `004_concurrency.sql` : verrous par compte. Ordre fixe : ligne marché/duel → profils par id croissant (`lock_profiles`). Plus de verrou global ;
  - `005_catalog_schema.sql` : colonnes `wikidata_id`, `brand`, `image_page`, `image_credit` ; `game_state` renvoie `catalog_size` au lieu du catalogue ;
  - `006_catalog_data.sql` (+ splits `006a`–`006g`) : **généré** par le script, idempotent, ne pas éditer à la main ;
  - `007` durcissement (pseudos, parrainage, quota duels) ; `008` arène gacha (8 circuits, carte adverse masquée) ; `009` fair-play (ligues de rareté, physique touge/pluie, stand 30 min) ;
  - `010_themed_packs.sql` : 8 caisses thématiques (`in_pack_theme` + `OPEN_PACK` avec `payload.pack`), prix/probas miroir de `PACKS` dans `src/rules.ts`.

## Catalogue (≈ 5 500 cartes)

Généré par `scripts/build-catalog.mjs` depuis Wikidata (SPARQL), Wikipédia (extraits FR/EN via l'API Action, par lots de 20 — l'API REST renvoie 429) et Commons (auteur + licence).

- Rareté = rang de notoriété (sitelinks, + pageviews optionnel) + 0,22 × prestige (segment P279, marque, mots-clés GT/RS…), percentiles par division ; plafond « Rare » pour SUV/utilitaires/motos ≤ 250 cm³.
- Stats : Wikidata réelles → chiffres cités dans l'extrait Wikipédia si cohérents (×0,4–×2,5 de l'estimation) → estimation déterministe (seed = QID). Ce sont des stats de jeu.
- **Stabilité** : ids, raretés et stats déjà présents dans `catalog.json` sont figés à chaque resynchro (inventaires). Pour rééquilibrer de zéro avant publication seulement : supprimer `catalog.json` puis relancer.
- Les 24 cartes d'origine (ids 1–24) sont définies dans `LEGACY` du script (stats et textes manuels conservés).
- `--cache` lit `node_modules/.cache/apex-catalog-raw.json` (absent sur une nouvelle machine : faire une synchro complète, ~30 min).
- Photos sous licences libres : l'attribution affichée dans la fiche carte est obligatoire, ne pas la retirer.

## Conventions

- Pas de commentaires ajoutés/supprimés sans raison ; code compact ; textes UI en français.
- Ne jamais mettre de clé `service_role` ou secret dans `VITE_*`. `.env.local` n'est pas versionné.
- Commits : message en français, pas de push forcé.

## Limites connues / idées suivantes

- ~800 cartes sans année connue (1995 par défaut) ; quelques stats estimées fausses (ex. « BMW R 75 » lu comme 75 cm³, Veyron sous-évaluée).
- Chunk catalogue ~670 Ko gzip (allégeable : dériver `image_page`/`category` au runtime).
- Prochaines étapes envisagées :
  1. Page « Collection » façon Kyara : toutes les cartes possédées/non possédées, % de complétion par marque/catégorie.
  2. Catégorie « Pilotes » via Wikidata (photos libres) — ne pas utiliser les headshots OpenF1 (droits F1).
  3. Pagination serveur du marché et test de charge avant ouverture publique.
- `scripts/sync-real-photos.js` est un ancien stub sans effet (remplacé par `build-catalog.mjs`), suppression en attente de validation.
