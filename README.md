# APEX DROPS — Origins / V4

Jeu de collection automobile : 24 cartes, boosters, garage, marché à prix fixe et duels par catégorie. Interface française responsive, illustrations SVG originales stylisées, finitions holographiques cosmétiques et mode de démonstration autonome.

## Démarrage rapide

Node.js 22.12+ (ou 24 LTS). Depuis le répertoire du projet :

```sh
npm ci
npm run dev
```

Sans variables Supabase, le jeu fonctionne en **démo solo locale** : 28 000 crédits, sept modèles, deux boosters bonus, annonces et adversaires fictifs. La progression se conserve dans le navigateur. Profil → Réinitialiser la démo permet de recommencer. Ce mode n’est jamais importé dans les comptes réels.

```sh
npm test
npm run build
```

Le dossier `dist/` est publiable sur un hébergeur statique HTTPS. Ne pas ouvrir `index.html` directement via `file://` : utiliser le serveur de développement ou un hébergeur.

## Connecter le vrai multijoueur

1. Créer un projet Supabase réservé au jeu.
2. Dans SQL Editor, exécuter dans cet ordre :
   - `supabase/migrations/001_base.sql`
   - `supabase/migrations/002_hardening.sql`
   - `supabase/migrations/003_catalog.sql`
   - `supabase/migrations/004_concurrency.sql`
   - `supabase/migrations/005_catalog_schema.sql`
   - `supabase/migrations/006_catalog_data.sql` (généré, ~2 Mo : à ré-exécuter après chaque synchro du catalogue)
3. Supabase → Authentication → Providers → Discord : activer le fournisseur avec les identifiants de votre application Discord. Dans le portail Discord, utiliser **l’URL de callback affichée par Supabase**. Un autre fournisseur OAuth (GitHub, Google…) peut être choisi via `VITE_OAUTH_PROVIDER` dans `.env.local`.
4. Dans Supabase → URL Configuration, renseigner l’URL HTTPS finale du site comme Site URL et URL de redirection autorisée. Pour le développement, ajouter l’origine locale effectivement affichée par Vite.
5. Copier `.env.example` vers `.env.local` et renseigner :

```dotenv
VITE_SUPABASE_URL=https://VOTRE-PROJET.supabase.co
VITE_SUPABASE_ANON_KEY=VOTRE_CLE_PUBLIQUE
```

6. Relancer le serveur ou reconstruire avec `npm run build`. Les variables Vite sont injectées **au build**, pas au chargement du site. Ne jamais placer de clé `service_role`, mot de passe PostgreSQL ou secret Discord dans ces variables.
7. Facultatif mais recommandé : activer `pg_cron` dans Supabase puis exécuter `supabase/optional_cron.sql`. Sans cette tâche, les remboursements des défis expirés sont traités au prochain appel à `game_state` ou `game_action`.
8. Vérifier une connexion Discord réelle et une vente entre deux comptes sur une base de préproduction avant d’inviter la communauté.

Le compte réel commence avec 5 000 crédits, deux boosters bonus et un booster gratuit disponible. Le premier compte reçoit automatiquement son profil au premier login. Aucune connexion réelle ni base distante n’a été configurée dans cette livraison : leurs identifiants n’étaient pas fournis.

## Si la V3 a déjà été installée

Sauvegarder la base et tester la migration sur un clone. **Ne pas exécuter `001_base.sql`** : les tables existent déjà. Exécuter `002_hardening.sql`, `003_catalog.sql`, `004_concurrency.sql`, `005_catalog_schema.sql` puis `006_catalog_data.sql`, une fois chacun. Si `002_hardening.sql` a déjà été appliqué, exécuter seulement `004` à `006`. Les cartes 1 à 24 et les inventaires sont conservés. Arrêter l’ancienne interface pendant la migration : ses RPC sont volontairement révoquées. Les identifiants des dix cartes V3 sont conservés, les inventaires et soldes restent en place et les cotes sont recalculées.

La migration n’efface pas les soldes éventuellement abusifs accumulés avant la correction : les examiner séparément. La nouvelle contrainte refuse une base contenant déjà des soldes négatifs. Les anciennes fonctions vulnérables restent présentes pour traçabilité mais ne sont plus exécutables par `public`, `anon` ou `authenticated`. Le nouveau frontend n’appelle que `game_state` et `game_action`.

## Règles économiques

- 3 cartes par booster ; gratuit toutes les 10 minutes ; achat d’un bonus : 15 000 CR.
- Probabilités par carte hors garantie : commune 55 %, rare 30 %, épique 12,7 %, légendaire 2 %, mythique 0,3 %.
- Après 29 tirages sans légendaire ou mythique, le 30e est légendaire à 90 % ou mythique à 10 %. Le compteur est par **carte**, pas par booster.
- Finition holo : 8 %, indépendante de la rareté. Cote ×2,5, sans bonus en duel ni au recyclage.
- Recyclage par doublon : 100 / 250 / 600 / 1 400 / 3 000 CR selon la rareté. Un exemplaire de chaque variante est conservé ; les favoris sont exclus.
- Le recyclage de trois cartes ne dépasse jamais 9 000 CR : acheter un booster pour recycler ne produit pas de monnaie en boucle.
- Marché : prix de 500 à 50 000 000 CR, 25 annonces actives maximum par compte. Commission vendeur de 10 %, arrondie à l’entier inférieur pour le versement.
- La cote du garage compte uniquement les cartes dans l’inventaire, doublons inclus. Les annonces sont hors inventaire. La cote est indicative et distincte de la valeur de recyclage.
- Parrainage pendant les sept premiers jours : un seul parrain, pas d’auto-parrainage, un point Ambassadeur pour le parrain. Aucune récompense monétaire multi-compte.
- Aucun achat de crédits contre de l’argent réel, aucun retrait, aucune valeur monétaire garantie.

## Duels

- Catégories séparées : Route, Compétition, Moto.
- Le challenger voit la carte de l’hôte ; ce n’est pas une sélection secrète simultanée.
- Mise entre 1 000 et 1 000 000 CR ; trois défis ouverts maximum ; expiration à 24 h.
- Mise réservée à la création ; carte non vendable tant que l’un de ses défis reste ouvert. Les doublons peuvent être recyclés, puisqu’un exemplaire reste toujours conservé.
- Annulation avant acceptation et remboursement à expiration. Acceptation, débits, verdict et versements sont atomiques.
- Quatre circuits équiprobables, pondérant puissance/vitesse/châssis/légèreté :

| Circuit     | Puissance | Vitesse | Châssis | Légèreté |
| ----------- | --------: | ------: | ------: | -------: |
| Espigoulier |       8 % |     7 % |    55 % |     30 % |
| Hunaudières |      40 % |    45 % |    10 % |      5 % |
| Gineste     |      20 % |    15 % |    45 % |     20 % |
| Monaco      |      10 % |    15 % |    55 % |     20 % |

Puissance normalisée sur 700 ch ; vitesse sur 370 km/h ; légèreté = `(2000 - poids) / 18`, bornée entre 0 et 100. Scores modulés par ±3 % ; égalités départagées au hasard. 95 % du pot pour le vainqueur, 5 % détruits. Les scores ne prétendent pas simuler une physique automobile réelle.

## Architecture et sécurité

L’interface Next.js incomplète a été remplacée par **React + TypeScript + Vite**, hébergeable statiquement. La logique serveur reste dans **PostgreSQL/Supabase**. Les anciennes routes Next ne sont plus nécessaires : elles ne constituaient pas la frontière de sécurité de la base.

- `src/App.tsx` : coquille, état global et navigation.
- `src/views/` : les cinq écrans (paddock, garage, marché, arène, classement).
- `src/modals.tsx` : fenêtres de détail, booster, vente, achat, duel, profil et guide.
- `src/components.tsx` : cartes, illustrations, filtres et modales accessibles.
- `src/rules.ts` : constantes économiques partagées, miroir des règles SQL.
- `src/catalog.ts` : chargement du catalogue généré (`src/data/catalog.json`).
- `scripts/build-catalog.mjs` : génération du catalogue depuis Wikidata/Commons.
- `src/engine.ts` : moteur utilisé en démo, testé contre le SQL.
- `src/demo.ts` : transactions locales de démonstration.
- `src/api.ts` : authentification Discord et appels RPC.
- `supabase/migrations` : schéma, durcissement, catalogue.
- `tests/game.test.ts` : tests sur PostgreSQL embarqué via PGlite.

L’identité provient exclusivement de `auth.uid()` dans les RPC. Toutes les tables du jeu ont RLS activé et aucun accès direct n’est accordé aux rôles clients. **L’absence de policies de table est volontaire** : aucune lecture/écriture directe, seules les deux RPC explicitement accordées à `authenticated` exposent les données autorisées. Les fonctions auxiliaires sont privées, avec `search_path` fixé. Le classement n’expose ni solde ni code de parrainage d’autrui.

Une clé de requête unique protège les mutations contre les répétitions après une réponse réseau perdue. Elle est mémorisée dans la session du navigateur ; le serveur mémorise le résultat. Toute modification de solde alimente le journal. Limite applicative de 40 mutations/minute/compte. Les verrous locaux empêchent les doubles clics et `navigator.locks`, si disponible, coordonne les onglets de démo.

### Limites opérationnelles explicites

La version est conçue pour une **petite communauté / bêta privée**. Depuis la migration `004_concurrency.sql`, chaque mutation sérialise uniquement les comptes qu’elle touche : les lignes du marché et de l’arène sont verrouillées avant les profils, et les profils toujours par identifiant croissant — un ordre de verrouillage déterministe qui rend les interblocages impossibles tout en laissant les comptes non concernés jouer en parallèle. Il faut néanmoins mesurer la charge avant une ouverture massive, puis compléter la pagination serveur. Le marché affiche les 200 annonces récentes plus toutes celles du joueur ; l’arène privilégie ses défis ouverts dans une fenêtre de 100 lignes ; le journal affiche les 50 dernières écritures. Rafraîchissement toutes les 15 secondes en onglet visible, sans abonnement Realtime.

Le grand livre et les clés d’idempotence ne sont pas purgés automatiquement. Prévoir archivage, supervision, sauvegardes et restauration selon l’exploitation. Discord seul ne supprime pas le risque de faux comptes : surveiller l’usage et configurer les protections Auth avant ouverture. Les contrôles SQL ne remplacent pas un audit externe ou un test de charge réel.

## Validation livrée

`npm test` exécute les migrations dans un moteur PostgreSQL embarqué puis vérifie les accès, inventaires, refroidissement des boosters, idempotence, transferts, taxes, réservations, annulations, expirations, parrainage et formules de course. `npm run build` vérifie TypeScript et produit le bundle.

La démonstration a également été manipulée dans un navigateur : ouverture et révélation, mise en vente, retrait et restitution, duel. Les tests locaux ne prouvent pas une intégration Discord/Supabase distante tant qu’elle n’a pas été configurée avec deux comptes réels.

## Catalogue (Wikidata + Wikimedia Commons)

Environ 5 500 cartes (voitures de route, voitures de course dont les F1, motos) générées par `scripts/build-catalog.mjs` :

```sh
node scripts/build-catalog.mjs            # synchro complète (~30 min, API publiques sans clé)
node scripts/build-catalog.mjs --cache    # rejoue l'équilibrage sur les données déjà téléchargées
node scripts/build-catalog.mjs --pageviews --cars=8 --racing=2 --motos=3
```

- **Sources** : Wikidata SPARQL (modèles ayant une photo `P18`, constructeur, année, segment `P279`, masse/puissance/vitesse quand renseignées), résumés Wikipédia FR (EN à défaut) pour la description et l’année, Commons pour l’auteur et la licence de chaque photo.
- **Rareté** : notoriété (nombre d’éditions Wikipédia, + vues mensuelles avec `--pageviews`) combinée au prestige (segment, marque, finition sportive), en percentiles par catégorie : 1,5 % mythiques, 5 % légendaires, 13,5 % épiques, 30 % rares, 50 % communes. Un SUV, un utilitaire ou une moto ≤ 250 cm³ est plafonné à « rare ».
- **Caractéristiques** : valeurs réelles Wikidata, sinon chiffres cités par Wikipédia s’ils sont cohérents, sinon estimation déterministe (époque, segment, marque). Ce sont des stats de jeu, pas des fiches constructeur ; l’interface l’indique.
- **Stabilité** : les ids, raretés et stats déjà publiés dans `src/data/catalog.json` sont figés. Une nouvelle synchro ajoute des modèles et rafraîchit photos et crédits sans toucher aux inventaires. Les 24 cartes d’origine gardent ids 1 à 24.
- **Livraison** : le frontend charge le catalogue dans un chunk séparé, mis en cache ; `game_state` ne renvoie plus que `catalog_size`.

### Licences des photos

Les photos sont affichées depuis Wikimedia Commons (pas d’hébergement local), sous licences libres (CC BY, CC BY-SA, domaine public…). Ces licences **imposent l’attribution** : la fiche détaillée de chaque carte affiche l’auteur, la licence et un lien vers la page Commons. Ne pas retirer ces crédits. Les noms de marques identifient les véhicules ; aucun partenariat constructeur n’est revendiqué.

## Propriété du déploiement

Le site livré est une démo privée. Pour un hébergement indépendant, publier `dist/` après configuration et build, activer HTTPS, puis autoriser cette origine dans Supabase. Ne pas exposer les sources, tests ou migrations comme répertoire statique : seul `dist/` doit être servi.
