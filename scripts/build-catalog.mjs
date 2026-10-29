#!/usr/bin/env node
/**
 * Construit le catalogue APEX DROPS depuis Wikidata + Wikimedia Commons.
 *
 *   node scripts/build-catalog.mjs [--pageviews] [--cars=10] [--racing=2] [--motos=3]
 *
 * - Modèles de voitures, voitures de course et motos ayant une photo (P18).
 * - Rareté calculée par popularité (nombre d'éditions Wikipédia, + vues
 *   mensuelles si --pageviews), en percentiles par catégorie.
 * - Caractéristiques réelles quand Wikidata les fournit (P2109, P2067, P2052),
 *   sinon estimées de façon déterministe (époque, catégorie, rareté).
 * - Crédit auteur + licence de chaque photo récupérés sur Commons.
 * - Les ids, raretés et stats déjà publiés sont figés : une nouvelle synchro
 *   ajoute des cartes et rafraîchit les photos sans casser les inventaires.
 *
 * Sorties : src/data/catalog.json et supabase/migrations/006_catalog_data.sql
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";

const ROOT = new URL("..", import.meta.url);
const JSON_OUT = new URL("src/data/catalog.json", ROOT);
const SQL_OUT = new URL("supabase/migrations/006_catalog_data.sql", ROOT);
const UA = "ApexDropsCatalogBuilder/1.0 (open-source card game; catalog sync)";
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }),
);
const MIN_SITELINKS = {
  Route: Number(args.cars ?? 10),
  Compétition: Number(args.racing ?? 2),
  Moto: Number(args.motos ?? 3),
};

// Classes Wikidata → division du jeu
const CLASSES = [
  ["Q3231690", "Route"], // automobile model
  ["Q90834785", "Compétition"], // racing automobile model
  ["Q673687", "Compétition"], // racing automobile
  ["Q1002954", "Compétition"], // Formula One car
  ["Q23866334", "Moto"], // motorcycle model
];

// Les 24 cartes d'origine : ids, stats et textes conservés, photo réparée.
const LEGACY = [
  [1, null, "Ford Puma 1.7 Zetec-S", "Epic", 125, 1039, 203, 88, 1998, 18500, "Route", "#ef4444", "coupe", "Châssis ultra-affûté réglé avec Porsche et bloc 1.7L Yamaha VCT hurlant jusqu’à 7 000 tr/min dans les cols."],
  [2, "Q1377219", "Toyota Sprinter Trueno AE86", "Legendary", 130, 940, 200, 95, 1983, 65000, "Route", "#f59e0b", "hatch", "L’icône absolue du Touge japonais. Une propulsion de 940 kg qui humilie les supercars en descente de col."],
  [3, "Q172621", "McLaren MP4/4 - Ayrton Senna", "Mythic", 685, 540, 333, 99, 1988, 450000, "Compétition", "#ef4444", "race", "15 victoires sur 16 Grands Prix en 1988. La monoplace Honda V6 Turbo la plus dominante de l’histoire."],
  [4, "Q1335232", "Mazda 787B Quad-Rotor", "Mythic", 700, 830, 350, 96, 1991, 520000, "Compétition", "#f97316", "race", "Le hurlement mythique du quadri-rotor R26B à 9 000 tr/min dans la ligne droite des Hunaudières."],
  [5, "Q3216996", "Lancia Delta HF Integrale Evo II", "Legendary", 215, 1340, 220, 94, 1993, 95000, "Route", "#dc2626", "hatch", "Six titres mondiaux WRC consécutifs. Des ailes larges bestiales et une motricité intégrale redoutable."],
  [6, "Q1263380", "Ducati Desmosedici GP", "Legendary", 295, 157, 366, 97, 2024, 110000, "Moto", "#ef4444", "moto", "Un missile de MotoGP à aérodynamisme actif capable de pulvériser les 365 km/h en bout de ligne droite."],
  [7, "Q3342164", "Nissan Skyline GT-R R34 V-Spec", "Legendary", 280, 1560, 265, 92, 2000, 145000, "Route", "#3b82f6", "coupe", "Surnommée Godzilla. Son six cylindres en ligne biturbo RB26DETT et sa transmission ATTESA E-TS sont légendaires."],
  [8, "Q215218", "Peugeot 205 GTI 1.9", "Rare", 130, 875, 206, 86, 1987, 8500, "Route", "#ef4444", "hatch", "La reine des petites bombes françaises : 875 kg et un train arrière ultra-incisif."],
  [9, "Q392017", "Škoda Octavia Mk1 1.9 TDI", "Common", 110, 1295, 192, 68, 2001, 2200, "Route", "#64748b", "hatch", "Increvable, coupleuse dès les bas régimes et capable d’avaler 900 000 km sans jamais ouvrir le bloc."],
  [10, "Q97621378", "Honda Civic Type R EK9", "Epic", 185, 1050, 225, 90, 1997, 24000, "Route", "#eab308", "hatch", "Quand le VTEC du bloc B16B enclenche la seconde came à 6 100 tr/min jusqu’à 8 400 tr/min."],
  [11, "Q5114820", "Renault Clio II 1.4 16V", "Common", 98, 980, 185, 72, 2000, 2600, "Route", "#38bdf8", "hatch", "Légère, nerveuse et toujours prête à attaquer les épingles du quotidien."],
  [12, "Q1393500", "Volkswagen Golf II GTI 16V", "Rare", 112, 920, 191, 81, 1986, 9000, "Route", "#60a5fa", "hatch", "Calandre quatre phares liseré rouge et tempérament Youngtimer pur sang."],
  [13, "Q21036535", "BMW M3 E30 Evolution", "Epic", 200, 1200, 235, 89, 1988, 32000, "Route", "#a855f7", "coupe", "Née pour l’homologation DTM et Groupe A. Ailes élargies carrées et quatre cylindres S14 rageur."],
  [14, "Q56527895", "Porsche 911 GT3 RS (992)", "Legendary", 525, 1450, 296, 98, 2023, 180000, "Route", "#84cc16", "coupe", "860 kg d’appui aérodynamique avec DRS actif et flat-six atmosphérique à 9 000 tr/min."],
  [15, null, "Toyota Yaris I 1.0 VVT-i", "Common", 69, 980, 155, 70, 2007, 2400, "Route", "#94a3b8", "hatch", "La daily indestructible pour débuter son garage avant de viser les monstres du Touge."],
  [16, "Q24936559", "Alpine A110 S", "Epic", 252, 1103, 250, 96, 2018, 39000, "Route", "#2563eb", "coupe", "1 103 kg seulement : une ballerine chirurgicale dans les enchaînements de virages serrés."],
  [17, "Q172700", "Lotus 18 Formula Junior", "Common", 100, 420, 180, 72, 1960, 4000, "Compétition", "#10b981", "race", "420 kg à vide sans aucune assistance : l’école pure du pilotage sur piste."],
  [18, "Q1437649", "Van Diemen Formula Ford", "Rare", 115, 500, 210, 82, 1995, 10000, "Compétition", "#eab308", "race", "Pas d’aileron, pneus étroits et aspiration pure : là où tous les champions de F1 ont forgé leurs réflexes."],
  [19, "Q112972864", "Porsche 911 GT3 Cup (992)", "Epic", 510, 1260, 285, 93, 2021, 50000, "Compétition", "#a855f7", "race", "La voiture de course la plus produite au monde, taillée pour les bagarres en peloton."],
  [20, "Q114925087", "Ferrari 499P Hypercar", "Legendary", 680, 1030, 340, 97, 2023, 210000, "Compétition", "#dc2626", "race", "Double victorieuse des 24 Heures du Mans. Prototype hybride V6 biturbo d’endurance."],
  [21, null, "Honda CB500F", "Common", 47, 189, 175, 74, 2022, 3000, "Moto", "#64748b", "moto", "Le roadster A2 agile et inépuisable pour se faufiler partout."],
  [22, null, "Yamaha MT-07 CP2", "Rare", 73, 184, 205, 81, 2021, 7000, "Moto", "#3b82f6", "moto", "Bicylindre crossplane CP2 ultra-coupleux : la reine incontestée du wheeling."],
  [23, null, "Kawasaki Ninja ZX-6R 636", "Epic", 124, 198, 260, 90, 2024, 16000, "Moto", "#22c55e", "moto", "Quatre cylindres Supersport hurlant à 15 000 tr/min avec châssis pistard."],
  [24, "Q2061492", "Honda RC213V MotoGP", "Mythic", 265, 157, 350, 98, 2023, 220000, "Moto", "#f97316", "moto", "Prototype V4 d’usine conçu pour prendre 64 degrés d’angle genou et coude au vibrateur."],
];
// Fichiers Commons vérifiés pour les cartes sans QID exploitable.
const LEGACY_FILES = {
  1: "Ford_Puma_1.7.jpg",
  21: "Honda_CB500F.jpg",
  22: "Yamaha_MT-07.jpg",
  23: "Kawasaki_Ninja_ZX-6R.jpg",
};

const CATEGORY = {
  Route: "Street & Touge",
  Compétition: "F1 & Prototype",
  Moto: "MotoGP & Superbike",
};
const RARITIES = ["Mythic", "Legendary", "Epic", "Rare", "Common"];
// Part cumulée du catalogue (par catégorie), des plus populaires aux moins connues.
const RARITY_CUT = [0.015, 0.065, 0.2, 0.5, 1];
const VALUE_BAND = {
  Common: [1500, 4000],
  Rare: [6000, 12000],
  Epic: [15000, 50000],
  Legendary: [60000, 200000],
  Mythic: [250000, 600000],
};
// Segments Wikidata (P279) : prestige, profil de stats et libellé français.
// [qid, prestige, facteur puissance, poids kg, châssis, libellé]
const SEGMENTS = Object.fromEntries(
  [
    ["Q815679", 3, 3.2, 1450, 88, "Supercar"],
    ["Q274586", 2, 2.1, 1350, 82, "Voiture de sport"],
    ["Q744620", 2, 2.2, 1600, 76, "Grand tourisme"],
    ["Q1072763", 2, 2.2, 1600, 66, "Muscle car"],
    ["Q828170", 1, 1.6, 1050, 84, "Roadster"],
    ["Q5333841", 1, 1.5, 1150, 80, "Sportive compacte"],
    ["Q384127", 1, 1.8, 1600, 74, "Berline sportive"],
    ["Q1402386", 2, 1.8, 1200, 84, "Voiture de tourisme"],
    ["Q850270", 1, 1.8, 1300, 74, "Concept car"],
    ["Q5581707", 1, 1.7, 1900, 64, "Voiture de luxe"],
    ["Q1357619", 0, 1.6, 1650, 66, "Routière"],
    ["Q213853", 1, 1.5, 1300, 74, "Coupé"],
    ["Q972011", 3, 1.4, 900, 88, "Prototype de course"],
    ["Q1002954", 3, 1.5, 650, 90, "Formule 1"],
    ["Q673687", 2, 1.2, 900, 82, "Voiture de course"],
    ["Q190578", -1, 1.1, 1400, 62, "Berline"],
    ["Q216762", 0, 1, 1150, 66, "Compacte"],
    ["Q946808", -1, 0.95, 1250, 64, "Compacte"],
    ["Q1940287", -1, 1, 1400, 60, "Familiale"],
    ["Q4010528", -1, 1.05, 1450, 60, "Familiale"],
    ["Q304895", -1, 1.3, 1700, 58, "Grande berline"],
    ["Q815423", -1, 0.8, 1000, 66, "Citadine polyvalente"],
    ["Q2704381", -1, 0.8, 1050, 64, "Citadine"],
    ["Q504154", -2, 0.6, 900, 62, "Citadine"],
    ["Q1059437", -2, 0.45, 750, 60, "Kei car"],
    ["Q360369", -2, 0.35, 550, 58, "Microcar"],
    ["Q192152", -2, 1.3, 1900, 52, "SUV"],
    ["Q875600", -2, 1.05, 1500, 56, "Crossover"],
    ["Q8214696", -2, 0.9, 1250, 56, "Petit SUV"],
    ["Q223189", -2, 1, 1700, 50, "Monospace"],
    ["Q1762136", -2, 0.85, 1350, 54, "Monospace"],
    ["Q1780748", -2, 0.95, 1500, 52, "Monospace"],
    ["Q193468", -2, 0.9, 1900, 45, "Fourgon"],
    ["Q43193", -2, 1.2, 2400, 40, "Camion"],
    ["Q215601", -2, 1.2, 2000, 45, "Pick-up"],
    ["Q946596", -1, 1.1, 1900, 50, "Tout-terrain"],
    ["Q946479", -2, 0.9, 2200, 40, "Minibus"],
    ["Q3564023", -2, 0.8, 1600, 42, "Utilitaire"],
    ["Q1621751", -2, 0.8, 1400, 50, "Ludospace"],
    ["Q225600", -2, 0.5, 900, 48, "Micro-van"],
    ["Q65042828", -2, 0.6, 900, 55, "Citadine éco"],
    ["Q16948009", -1, 0.5, 600, 50, "Trois-roues"],
    ["Q739288", -2, 0.3, 400, 45, "Trois-roues"],
    ["Q193692", 0, 1.2, 1700, 64, "Électrique"],
    ["Q1076882", 0, 1.2, 1700, 64, "Électrique"],
    // Motos (facteur relatif à la base moto)
    ["Q107645860", 3, 3, 157, 97, "Moto de Grand Prix"],
    ["Q1902630", 3, 2.6, 175, 92, "Superbike"],
    ["Q1339146", 2, 2, 190, 86, "Moto sportive"],
    ["Q1964027", 1, 1.4, 190, 80, "Roadster"],
    ["Q2036147", 0, 0.9, 150, 72, "Trail"],
    ["Q193234", -2, 0.25, 120, 60, "Scooter"],
    ["Q201783", -2, 0.12, 80, 55, "Cyclomoteur"],
    ["Q1451817", -2, 0.18, 100, 58, "Underbone"],
  ].map(([q, prestige, power, kg, handling, label]) => [q, { prestige, power, kg, handling, label }]),
);
// Prestige de marque (sous-chaîne du constructeur, en minuscules).
const BRAND_TIERS = [
  [3, ["bugatti", "pagani", "koenigsegg", "mclaren", "ferrari", "lamborghini", "rimac", "hennessey", "ssc "]],
  [2, ["porsche", "aston martin", "maserati", "lotus", "alpine", "bentley", "rolls-royce", "ducati", "mv agusta", "shelby", "de tomaso", "spyker", "tvr", "caterham", "noble", "bizzarrini", "lancia", "ac cars", "morgan", "brabham", "williams", "tyrrell", "red bull", "jaguar"]],
  [1, ["bmw", "mercedes", "audi", "nissan", "alfa romeo", "subaru", "mitsubishi", "honda", "toyota", "mazda", "chevrolet", "dodge", "ford", "kawasaki", "yamaha", "suzuki", "triumph", "aprilia", "ktm", "harley", "lexus", "acura", "infiniti", "abarth", "cupra", "renault sport", "polestar", "tesla", "maybach"]],
];
const KEYWORDS = /\b(GT\d?|GTI|GTR|GT-R|RS\d*|R\d{3,}|Type R|Evo(lution)?|Turbo|Rally|Racing|Sport|Spyder|Spider|Stradale|Supersport|Competizione|AMG|M\d|SVR?|STI|Cup|Hypercar|Superleggera)\b/i;
const brandTier = (brand = "") =>
  BRAND_TIERS.find(([, list]) => list.some((b) => brand.toLowerCase().includes(b)))?.[0] ?? 0;
// Segment déduit du résumé Wikipédia quand Wikidata n'en donne aucun connu.
// L'ordre compte : la première correspondance gagne.
const TEXT_SEGMENTS = [
  [/\bsupercar|hypercar/i, "Q815679"],
  [/\bmonoplace|formule 1|formula one/i, "Q1002954"],
  [/\bprototype (de course|d'endurance|sport)|sports prototype|le mans prototype/i, "Q972011"],
  [/\bsuperbike|moto de grand prix|motogp/i, "Q1902630"],
  [/\b(moto|motocyclette) sportive|sport ?bike|supersport/i, "Q1339146"],
  [/\bscooter/i, "Q193234"],
  [/\bcyclomoteur|mobylette|moped/i, "Q201783"],
  [/\btrail\b|dual-sport/i, "Q2036147"],
  [/\broadster/i, "Q828170"],
  [/\bgrand tourisme|grand tourer/i, "Q744620"],
  [/\bmuscle car/i, "Q1072763"],
  [/\b(voiture|automobile) (de sport|sportive)|sports car/i, "Q274586"],
  [/\bS\.?U\.?V\b|sport utility|véhicule utilitaire sport|4x4/i, "Q192152"],
  [/\bcrossover/i, "Q875600"],
  [/\bmonospace|minivan|\bMPV\b/i, "Q223189"],
  [/\bludospace/i, "Q1621751"],
  [/\bpick-?up/i, "Q215601"],
  [/\bfourgon|fourgonnette|utilitaire|\bvan\b/i, "Q193468"],
  [/\bcamion|truck/i, "Q43193"],
  [/\bkei car|keijidōsha/i, "Q1059437"],
  [/\bcitadine|city car|supermini/i, "Q504154"],
  [/\bcompacte|compact car|hatchback/i, "Q946808"],
  [/\bfamiliale|family car|break\b/i, "Q1940287"],
  [/\bberline de luxe|voiture de luxe|luxury car/i, "Q5581707"],
  [/\bberline|sedan|saloon/i, "Q190578"],
];
const segmentsOf = (it) => {
  const known = it.classes.map((q) => SEGMENTS[q]).filter(Boolean);
  if (known.length || !it.extract) return known;
  // Seule la 1re phrase décrit le modèle lui-même (« La X est un SUV… »).
  const first = it.extract.split(/(?<=[.!?])\s/)[0];
  const hit = TEXT_SEGMENTS.find(([re]) => re.test(first));
  return hit ? [SEGMENTS[hit[1]]] : [];
};
// Fiches constructeurs exactes [power_hp, weight_kg, top_speed_kmh, year] pour les modèles iconiques.
const REAL_SPECS = {
  Q172610: [1001, 1888, 407, 2005], // Bugatti Veyron 16.4
  Q66587547: [1600, 1976, 380, 2022], // Bugatti Centodieci
  Q61986597: [1500, 1995, 420, 2019], // Bugatti La Voiture Noire
  Q113565134: [1600, 1995, 420, 2022], // Bugatti W16 Mistral
  Q126789787: [1800, 1995, 445, 2024], // Bugatti Tourbillon
  Q731408: [560, 1620, 342, 1991], // Bugatti EB110
  Q463627: [478, 1100, 324, 1987], // Ferrari F40
  Q748461: [520, 1230, 325, 1995], // Ferrari F50
  Q269880: [660, 1365, 350, 2002], // Ferrari Enzo
  Q3069684: [963, 1360, 352, 2013], // Ferrari LaFerrari
  Q64162421: [1000, 1570, 340, 2019], // Ferrari SF90 Stradale
  Q130549590: [1200, 1525, 350, 2024], // Ferrari F80
  Q277339: [300, 880, 280, 1962], // Ferrari 250 GTO
  Q176152: [400, 1160, 305, 1984], // Ferrari 288 GTO
  Q239793: [490, 1450, 315, 2004], // Ferrari F430
  Q117235: [400, 1390, 295, 1999], // Ferrari 360 Modena
  Q276396: [570, 1485, 325, 2009], // Ferrari 458 Italia
  Q18943721: [670, 1475, 330, 2015], // Ferrari 488 GTB
  Q61915859: [720, 1435, 340, 2019], // Ferrari F8 Tributo
  Q385268: [620, 1688, 330, 2006], // Ferrari 599 GTB Fiorano
  Q976334: [740, 1525, 340, 2012], // Ferrari F12berlinetta
  Q28790462: [800, 1525, 340, 2017], // Ferrari 812 Superfast
  Q125758337: [830, 1560, 340, 2024], // Ferrari 12Cilindri
  Q109655897: [840, 1485, 340, 2021], // Ferrari Daytona SP3
  Q56669338: [810, 1500, 300, 2019], // Ferrari Monza SP1
  Q107324636: [830, 1470, 330, 2021], // Ferrari 296 GTB
  Q830375: [390, 1506, 290, 1984], // Ferrari Testarossa
  Q1146729: [380, 1350, 295, 1994], // Ferrari F355
  Q830381: [800, 1155, 345, 2005], // Ferrari FXX
  Q18605558: [1050, 1165, 350, 2014], // Ferrari FXX K
  Q744792: [460, 1735, 310, 2008], // Ferrari California
  Q943299: [660, 1880, 335, 2011], // Ferrari FF
  Q22673219: [690, 1790, 335, 2016], // Ferrari GTC4Lusso
  Q37806207: [600, 1664, 320, 2017], // Ferrari Portofino
  Q74955156: [620, 1570, 320, 2019], // Ferrari Roma
  Q850536: [385, 1180, 280, 1966], // Lamborghini Miura
  Q863812: [455, 1490, 295, 1974], // Lamborghini Countach
  Q462223: [492, 1576, 325, 1990], // Lamborghini Diablo
  Q216757: [580, 1650, 330, 2001], // Lamborghini Murciélago
  Q152917: [520, 1430, 315, 2003], // Lamborghini Gallardo
  Q842432: [650, 1665, 340, 2007], // Lamborghini Reventón
  Q318094: [700, 1575, 350, 2011], // Lamborghini Aventador
  Q6362826: [750, 1450, 355, 2013], // Lamborghini Veneno
  Q15396270: [610, 1422, 325, 2014], // Lamborghini Huracán
  Q108082919: [814, 1595, 355, 2021], // Lamborghini Countach LPI 800-4
  Q126102024: [920, 1690, 343, 2024], // Lamborghini Temerario
  Q849607: [627, 1138, 386, 1993], // McLaren F1
  Q6407533: [916, 1450, 350, 2013], // McLaren P1
  Q45304944: [800, 1198, 335, 2018], // McLaren Senna
  Q57831546: [1070, 1430, 403, 2019], // McLaren Speedtail
  Q75234729: [815, 1148, 326, 2020], // McLaren Elva
  Q113579330: [840, 1000, 320, 2022], // McLaren Solus GT
  Q130375472: [1275, 1399, 350, 2025], // McLaren W1
  Q28913682: [720, 1419, 341, 2017], // McLaren 720S
  Q15770155: [650, 1428, 333, 2014], // McLaren 650S
  Q19759816: [570, 1313, 328, 2015], // McLaren 570S
  Q1130427: [625, 1301, 333, 2011], // McLaren MP4-12C
  Q63968564: [620, 1530, 326, 2019], // McLaren GT
  Q102562479: [680, 1498, 330, 2021], // McLaren Artura
  Q748454: [612, 1380, 330, 2003], // Porsche Carrera GT
  Q962317: [887, 1642, 345, 2013], // Porsche 918 Spyder
  Q575937: [450, 1450, 317, 1986], // Porsche 959
  Q848965: [650, 1250, 350, 1999], // Pagani Zonda
  Q1414821: [730, 1350, 383, 2011], // Pagani Huayra
  Q113960878: [864, 1280, 350, 2022], // Pagani Utopia
  Q499109: [570, 1740, 315, 2007], // Nissan GT-R R35
  Q647404: [330, 1510, 250, 1993], // Toyota Supra
  Q1341985: [560, 1480, 325, 2010], // Lexus LFA
  Q748126: [280, 1370, 270, 1990], // Honda NSX
  Q861634: [280, 1280, 250, 1992], // Mazda RX-7
  Q750015: [760, 1630, 354, 2009], // Aston Martin One-77
  Q28402601: [1160, 1030, 355, 2021], // Aston Martin Valkyrie
  Q19394726: [831, 1350, 320, 2015], // Aston Martin Vulcan
  Q28669404: [1063, 1695, 352, 2022], // Mercedes-AMG One
  Q207624: [626, 1768, 334, 2003], // Mercedes-Benz SLR McLaren
  Q745023: [215, 1295, 260, 1954], // Mercedes-Benz 300 SL
  Q521044: [549, 1470, 342, 1992], // Jaguar XJ220
  Q389575: [630, 1335, 330, 2004], // Maserati MC12
  Q85846574: [630, 1500, 325, 2020], // Maserati MC20
  Q758778: [540, 1595, 320, 2006], // Audi R8
  Q2626290: [1244, 1244, 435, 2011], // Hennessey Venom GT
  Q30588296: [1817, 1385, 437, 2021], // Hennessey Venom F5
  Q848954: [1183, 1247, 412, 2006], // SSC Ultimate Aero
  Q535957: [1750, 1247, 455, 2020], // SSC Tuatara
  Q893186: [1224, 1900, 355, 2013], // Rimac Concept One
  Q65054542: [2000, 1680, 350, 2021], // Lotus Evija
  Q110820578: [1020, 798, 355, 2022], // Ferrari F1-75
  Q116627474: [1020, 798, 355, 2023], // Mercedes-AMG F1 W14
  Q110588567: [1010, 798, 352, 2022], // McLaren MCL36
  Q132291693: [1030, 798, 355, 2025], // McLaren MCL39
  Q796756: [207, 197, 303, 2009], // BMW S1000RR
  Q604551: [200, 199, 299, 1998], // Yamaha YZF-R1
  Q1854043: [120, 190, 262, 1999], // Yamaha YZF-R6
  Q1462612: [15, 142, 125, 2008], // Yamaha YZF-R125
  Q20873582: [42, 169, 180, 2015], // Yamaha YZF-R3
  Q4022458: [19, 136, 136, 2008], // Yamaha YZF-R15
  Q1124041: [197, 220, 312, 1999], // Suzuki Hayabusa
  Q1626501: [120, 194, 260, 2003], // Honda CBR600RR
  Q2733256: [192, 196, 299, 2004], // Honda CBR1000RR
  Q1626503: [13, 127, 115, 2004], // Honda CBR125R
  Q1626496: [26, 161, 145, 2011], // Honda CBR250R
  Q26046126: [41, 165, 175, 2016], // Honda CBR250RR
  Q1737325: [203, 207, 299, 2004], // Kawasaki ZX-10R
  Q1737326: [130, 196, 265, 1995], // Kawasaki ZX-6R
  Q116620201: [77, 189, 240, 2023], // Kawasaki Ninja ZX-4R
  Q1755865: [202, 202, 299, 2001], // Suzuki GSX-R 1000
  Q1747291: [217, 202, 305, 2009], // Aprilia RSV4
  Q106974405: [100, 183, 230, 2020], // Aprilia RS 660
  Q5780728: [170, 171, 299, 2009], // Ducati 1198
  Q18755645: [205, 190, 299, 2015], // Ducati 1299 Panigale
  Q1263357: [114, 195, 260, 1994], // Ducati 916
  Q1263348: [134, 194, 256, 2008], // Ducati 848
  Q1263363: [140, 199, 270, 2003], // Ducati 999
};

// Corrections de noms Wikidata vandalisés.
const NAME_FIX = {
  Q4022458: "Yamaha YZF-R15",
  Q915512: "Nissan S-Cargo",
  Q598404: "Volvo 145",
  Q7923270: "Vespa Sprint 1967",
};

// Puissance / vitesse / masse tirées de l'infobox Wikipédia ou du résumé.
const num = (s) => Number(s.replace(/[\s  .]/g, "").replace(",", "."));
function textStats(it) {
  const t = it.extract || "";
  const hp = t.match(/(\d[\d\s  .]{0,6}\d|\d)\s?(?:ch\b|chevaux|cv\b|hp\b|bhp\b|PS\b|horsepower)/i);
  const kw = t.match(/(\d[\d\s  ]{0,5}\d|\d)\s?kW\b/i);
  const kmh = t.match(/(\d[\d\s  ]{0,4}\d)\s?km\/h/i);
  const kg = t.match(/(\d{3,4})\s?kg\b/i);
  return {
    hp: it.info?.hp ?? (hp ? num(hp[1]) : kw ? num(kw[1]) * 1.3596 : null),
    kmh: it.info?.kmh ?? (kmh ? num(kmh[1]) : null),
    kg: it.info?.kg ?? (kg ? num(kg[1]) : null),
  };
}
const prestige = (it) => {
  const segs = segmentsOf(it);
  const seg = segs.length ? Math.max(...segs.map((s) => s.prestige)) : 0;
  return seg + brandTier(it.brand || it.name) + (KEYWORDS.test(it.name) ? 1 : 0);
};
// Année : Wikidata, infobox Wikipédia, résumé, nom puis description.
function guessYear(it) {
  if (it.year && it.year >= 1885) return it.year;
  if (it.info?.year) return it.info.year;
  const now = new Date().getFullYear() + 1;
  for (const text of [it.extract, it.name, it.desc]) {
    const m = String(text || "").match(/(?<!\d)(18[89]\d|19\d\d|20\d\d)(?!\d)/);
    if (m && Number(m[1]) <= now) return Number(m[1]);
  }
  return null;
}
// Cylindrée lue dans le nom d'une moto (« YBR 125 », « YZF-R125 », « CBR600RR », « ZX-10R »).
function displacement(it) {
  const n = NAME_FIX[it.qid] || it.name;
  if (/\b(?:YZF-R1|R1M|S\s?1000\s?RR|ZX-10R|CBR1000|GSX-R\s?1000|RSV4)\b/i.test(n)) return 1000;
  if (/\b(?:YZF-R6|ZX-6R|CBR600|GSX-R\s?600|Daytona\s?675)\b/i.test(n)) return 600;
  if (/\b(?:YZF-R3|Ninja\s?300|CBR300)\b/i.test(n)) return 300;
  if (/\b(?:YZF-R15|CBR150)\b/i.test(n)) return 150;
  if (/\b(?:YZF-R125|CBR125|NSR125|RS\s?125|MT-125|Duke\s?125)\b/i.test(n)) return 125;
  const m =
    n.match(/(?<![\w.])(\d{2,4})(?:\s?cc)?(?![\w])/i) ||
    n.match(/[A-Z-](50|80|100|110|125|150|175|200|250|300|350|390|400|450|500|600|650|660|700|750|800|850|900|950|1000|1050|1100|1200|1250|1300|1400)(?:[A-Z]{0,2})\b/i);
  const cc = m && Number(m[1]);
  return cc >= 49 && cc <= 2500 && !(cc >= 1885 && cc <= 2030) ? cc : null;
}
// Rareté maximale : un SUV ou un scooter ne devient pas légendaire.
function rarityCap(it) {
  const segs = segmentsOf(it);
  const seg = segs.length ? Math.max(...segs.map((s) => s.prestige)) : 0;
  const cc = it.division === "Moto" ? displacement(it) : null;
  if (seg <= -2 || (cc && cc <= 250 && seg < 3)) return "Rare";
  if (seg === -1) return "Epic";
  return "Mythic";
}
const PALETTE = ["#ef4444", "#f59e0b", "#3b82f6", "#22c55e", "#a855f7", "#64748b", "#f97316", "#0ea5e9", "#dc2626", "#84cc16", "#eab308", "#94a3b8"];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(url, init = {}, tries = 5) {
  for (let i = 0; ; i++) {
    let res;
    try {
      res = await fetch(url, { ...init, headers: { "User-Agent": UA, ...init.headers } });
    } catch (e) {
      // Coupure réseau (ECONNRESET, timeout…) : même politique de nouvel essai.
      if (i >= tries) throw e;
      await sleep(2000 * 2 ** i);
      continue;
    }
    if (res.ok) return res.json();
    if (i >= tries || ![429, 500, 502, 503, 504].includes(res.status))
      throw Error(`${res.status} ${url.slice(0, 120)}`);
    await sleep(2000 * 2 ** i);
  }
}
const sparql = (query) =>
  get("https://query.wikidata.org/sparql", {
    method: "POST",
    headers: {
      Accept: "application/sparql-results+json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ query }),
  }).then((r) => r.results.bindings);

// Générateur pseudo-aléatoire déterministe par QID : stats stables d'une synchro à l'autre.
function seeded(key) {
  let h = 2166136261;
  for (const ch of key) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const fileName = (url) =>
  decodeURIComponent(url.split("/Special:FilePath/")[1] || "").replace(/ /g, "_");
// URL CDN directe : Special:FilePath est limité en débit (429 en rafale).
const imageUrl = (file) => {
  const f = file.replace(/ /g, "_");
  const h = createHash("md5").update(f).digest("hex");
  return `https://upload.wikimedia.org/wikipedia/commons/thumb/${h[0]}/${h.slice(0, 2)}/${encodeURIComponent(f)}/960px-${encodeURIComponent(f)}`;
};
const v = (b, k) => b[k]?.value;

async function fetchClass(qid, division) {
  const rows = await sparql(`
    SELECT ?m ?img ?sl ?fr ?en ?dfr ?den ?brand ?year ?mass ?power ?speed ?enwiki ?frwiki ?seg WHERE {
      ?m wdt:P31 wd:${qid} ; wdt:P18 ?img ; wikibase:sitelinks ?sl .
      FILTER(?sl >= ${MIN_SITELINKS[division]})
      OPTIONAL { ?m rdfs:label ?fr FILTER(lang(?fr) = "fr") }
      OPTIONAL { ?m rdfs:label ?en FILTER(lang(?en) = "en") }
      OPTIONAL { ?m schema:description ?dfr FILTER(lang(?dfr) = "fr") }
      OPTIONAL { ?m schema:description ?den FILTER(lang(?den) = "en") }
      OPTIONAL { ?m wdt:P176 ?b . ?b rdfs:label ?brand FILTER(lang(?brand) = "en") }
      OPTIONAL { ?m wdt:P571|wdt:P577|wdt:P580|wdt:P729 ?date . BIND(YEAR(?date) AS ?year) }
      OPTIONAL { ?m wdt:P279 ?seg }
      OPTIONAL { ?m p:P2067/psn:P2067/wikibase:quantityAmount ?mass }
      OPTIONAL { ?m p:P2109/psn:P2109/wikibase:quantityAmount ?power }
      OPTIONAL { ?m p:P2052/psn:P2052/wikibase:quantityAmount ?speed }
      OPTIONAL { ?enwiki schema:about ?m ; schema:isPartOf <https://en.wikipedia.org/> }
      OPTIONAL { ?frwiki schema:about ?m ; schema:isPartOf <https://fr.wikipedia.org/> }
    }`);
  const items = new Map();
  for (const b of rows) {
    const id = v(b, "m").split("/").pop();
    const it = items.get(id) || { qid: id, division, classes: [] };
    const seg = v(b, "seg")?.split("/").pop();
    if (seg && !it.classes.includes(seg)) it.classes.push(seg);
    it.file ??= fileName(v(b, "img"));
    it.sitelinks = Number(v(b, "sl"));
    it.name ??= v(b, "fr") || v(b, "en");
    it.desc ??= v(b, "dfr") || v(b, "den");
    it.descFr ??= v(b, "dfr");
    it.brand ??= v(b, "brand");
    const y = Number(v(b, "year"));
    if (y > 1880 && y <= new Date().getFullYear() + 1) it.year = Math.min(it.year ?? y, y);
    it.mass ??= v(b, "mass") && Number(v(b, "mass")); // kg
    it.power ??= v(b, "power") && Number(v(b, "power")); // W
    it.speed ??= v(b, "speed") && Number(v(b, "speed")); // m/s
    it.enwiki ??= v(b, "enwiki");
    it.frwiki ??= v(b, "frwiki");
    items.set(id, it);
  }
  if (qid === "Q1002954") for (const it of items.values()) it.classes.push(qid);
  return [...items.values()].filter((it) => it.name && !/^Q\d+$/.test(it.name));
}

// Résumé Wikipédia (FR de préférence, sinon EN) : description de carte + année.
// API Action par lots de 20 titres (limite de prop=extracts), séquentiel et
// espacé : quelques centaines de requêtes au lieu d'une par modèle.
async function addSummaries(items) {
  for (const lang of ["fr", "en"]) {
    const key = lang === "fr" ? "frwiki" : "enwiki";
    const todo = items.filter((i) => i[key] && !i.extract);
    const byTitle = new Map(
      todo.map((i) => [decodeURIComponent(i[key].split("/wiki/")[1]).replace(/_/g, " "), i]),
    );
    const titles = [...byTitle.keys()];
    for (let n = 0; n < titles.length; n += 20) {
      const batch = titles.slice(n, n + 20);
      const r = await get(
        `https://${lang}.wikipedia.org/w/api.php?` +
          new URLSearchParams({
            action: "query",
            format: "json",
            formatversion: "2",
            prop: "extracts",
            exintro: "1",
            explaintext: "1",
            exsentences: "3",
            exlimit: "20",
            redirects: "1",
            titles: batch.join("|"),
          }),
      );
      // Titres normalisés / redirigés → titre demandé.
      const back = new Map();
      for (const x of [...(r.query?.normalized || []), ...(r.query?.redirects || [])])
        back.set(x.to, back.get(x.from) || x.from);
      for (const page of r.query?.pages || []) {
        const it = byTitle.get(back.get(page.title) || page.title);
        if (!it || !page.extract) continue;
        it.extract = page.extract;
        if (lang === "fr") it.extractFr = page.extract;
      }
      if (n % 1000 === 0) console.log(`  résumés ${lang} : ${n}/${titles.length}`);
      await sleep(400);
    }
  }
}

async function addPageviews(items) {
  const end = new Date();
  end.setDate(1);
  const start = new Date(end);
  start.setMonth(start.getMonth() - 3);
  const fmt = (d) => d.toISOString().slice(0, 7).replace("-", "") + "01";
  let done = 0;
  const queue = items.filter((i) => i.enwiki);
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      for (let it; (it = queue.shift()); ) {
        const title = decodeURIComponent(it.enwiki.split("/wiki/")[1]);
        try {
          const r = await get(
            `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/${encodeURIComponent(title)}/monthly/${fmt(start)}/${fmt(end)}`,
            {},
            2,
          );
          it.views = r.items.reduce((s, x) => s + x.views, 0) / r.items.length;
        } catch {
          it.views = 0;
        }
        if (++done % 250 === 0) console.log(`  vues : ${done}`);
      }
    }),
  );
}

// Auteur + licence + existence réelle du fichier, par lots de 50.
async function addCredits(items) {
  const byFile = new Map(items.map((i) => [i.file, i]));
  const files = [...byFile.keys()];
  for (let i = 0; i < files.length; i += 50) {
    const batch = files.slice(i, i + 50);
    const r = await get(
      "https://commons.wikimedia.org/w/api.php?" +
        new URLSearchParams({
          action: "query",
          format: "json",
          prop: "imageinfo",
          iiprop: "extmetadata",
          iiextmetadatafilter: "Artist|LicenseShortName",
          titles: batch.map((f) => "File:" + f).join("|"),
        }),
    );
    const norm = Object.fromEntries((r.query.normalized || []).map((n) => [n.to, n.from]));
    for (const page of Object.values(r.query.pages)) {
      const file = (norm[page.title] || page.title).replace(/^File:/, "").replace(/ /g, "_");
      const it = byFile.get(file);
      if (!it) continue;
      if (page.missing !== undefined || !page.imageinfo) {
        it.missing = true;
        continue;
      }
      const m = page.imageinfo[0].extmetadata || {};
      let artist = (m.Artist?.value || "")
        .replace(/<[^>]+>/g, "")
        .replace(/\s+/g, " ")
        .trim();
      if (!artist || artist.length > 70 || /use outside|credit/i.test(artist))
        artist = "Auteur : voir Commons";
      it.credit = `${artist} · ${m.LicenseShortName?.value || "Wikimedia Commons"}`;
    }
    if (i % 1000 === 0) console.log(`  crédits : ${i}/${files.length}`);
    await sleep(300);
  }
}

// Stats réelles (table constructeur → Wikidata → Infobox/résumé Wikipédia), sinon estimation.
function stats(it, rarity) {
  const rnd = seeded(it.qid);
  const noise = (a) => 1 - a + rnd() * 2 * a;
  const tier = RARITIES.length - 1 - RARITIES.indexOf(rarity); // 0 Common … 4 Mythic
  const exact = REAL_SPECS[it.qid];
  const year = exact?.[3] ?? guessYear(it) ?? 1995;
  const era = Math.max(0, year - 1950);
  const fromText = textStats(it);
  // Priorité : 1) REAL_SPECS constructeur, 2) Wikidata, 3) Infobox Wikipédia, 4) résumé Wikipédia cohérent, 5) estimation.
  const pick = (ex, wd, info, text, est, lo, hi) =>
    ex > lo && ex < hi
      ? ex
      : wd > lo && wd < hi
        ? wd
        : info > lo && info < hi && info > est * 0.25 && info < est * 3.5
          ? info
          : text > lo && text < hi && text > est * 0.4 && text < est * 2.5
            ? text
            : est;
  // Profil du segment le plus prestigieux, sinon profil moyen de la division.
  const seg = segmentsOf(it).sort((a, b) => b.prestige - a.prestige)[0] ?? {
    Route: { power: 1, kg: 1250, handling: 64 },
    Compétition: { power: 1.2, kg: 850, handling: 80 },
    Moto: { power: 1, kg: 180, handling: 75 },
  }[it.division];
  const bt = brandTier(it.brand || it.name);
  const race = it.division === "Compétition";
  const boost = (race ? [1, 1.03, 1.08, 1.15] : [1, 1.05, 1.15, 1.3])[bt] * (1 + tier * (race ? 0.03 : 0.05));
  const handling =
    seg.handling +
    tier * 1.5 +
    bt -
    (race ? Math.max(0, 1990 - year) * 0.15 : 0) +
    (rnd() - 0.5) * 8;
  const wdHp = it.power && it.power / 745.7,
    wdKmh = it.speed && it.speed * 3.6;
  const inf = it.info || {};
  let hp, kg, kmh;
  if (it.division === "Moto") {
    const cc = displacement(it);
    const hpEst = cc
      ? cc * (seg.prestige >= 2 ? 0.17 : 0.1) * (0.8 + Math.min(era, 70) / 175)
      : (15 + era * 1.1) * seg.power * boost;
    hp = pick(exact?.[0], wdHp, inf.hp, fromText.hp, clamp(hpEst * noise(0.12), 3, 300), 2, 400);
    kg = pick(exact?.[1], it.mass, inf.kg, fromText.kg, clamp(seg.kg * noise(0.12), 60, 400), 40, 500);
    kmh = pick(exact?.[2], wdKmh, inf.kmh, fromText.kmh, clamp(55 + 15 * Math.sqrt(hp) * noise(0.05), 45, 360), 30, 450);
  } else if (race) {
    hp = pick(exact?.[0], wdHp, inf.hp, fromText.hp, clamp((100 + era * 4.5) * seg.power * boost * noise(0.12), 60, 1100), 40, 2000);
    kg = pick(exact?.[1], it.mass, inf.kg, fromText.kg, clamp(seg.kg * (year < 1975 ? 0.8 : 1) * noise(0.12), 400, 1500), 300, 2500);
    kmh = pick(exact?.[2], wdKmh, inf.kmh, fromText.kmh, clamp(80 + 10.5 * Math.sqrt(hp) * noise(0.05), 150, 400), 100, 500);
  } else {
    hp = pick(exact?.[0], wdHp, inf.hp, fromText.hp, clamp((40 + era * 1.4) * seg.power * boost * noise(0.12), 25, 1600), 10, 2100);
    kg = pick(exact?.[1], it.mass, inf.kg, fromText.kg, clamp((seg.kg + Math.max(0, year - 1990) * 4) * noise(0.12), 450, 3000), 300, 4000);
    kmh = pick(exact?.[2], wdKmh, inf.kmh, fromText.kmh, clamp(60 + 11.5 * Math.sqrt(hp) * noise(0.05), 90, 420), 40, 500);
  }
  return {
    power_hp: Math.round(hp),
    weight_kg: Math.round(kg),
    top_speed_kmh: Math.round(kmh),
    handling_score: Math.round(clamp(handling, 30, 99)),
    year,
  };
}

const GENERIC_DESC = /^(mod[eè]le (d'|d’|de )?(automobile|voiture|moto)s?|car model|automobile model|motorcycle model|racing automobile( model)?|voiture de course|automobile|motocyclette|moto)\.?$/i;
// Les premières phrases du résumé Wikipédia FR, coupées proprement (~260 car.).
function excerpt(text, max = 260) {
  const clean = text.replace(/\s*\([^()]*\)/g, "").replace(/\s+/g, " ").trim();
  let out = "";
  for (const s of clean.match(/[^.!?]+[.!?]+/g) || [clean]) {
    if ((out + s).length > max) break;
    out += s;
  }
  return (out || clean.slice(0, max - 1) + "…").trim();
}
function lore(it) {
  if (it.extractFr) return excerpt(it.extractFr);
  const seg = segmentsOf(it).sort((a, b) => b.prestige - a.prestige)[0];
  const kind =
    seg?.label ?? { Route: "Modèle de route", Compétition: "Voiture de course", Moto: "Moto" }[it.division];
  const who = it.brand ? ` signée ${it.brand}` : "";
  const when = it.year ? `, apparue en ${it.year}` : "";
  const fr = it.descFr && !GENERIC_DESC.test(it.descFr.trim()) ? it.descFr : null;
  return [
    `${kind}${who}${when}.`,
    fr && `${fr.charAt(0).toUpperCase()}${fr.slice(1).replace(/\.$/, "")}.`,
  ]
    .filter(Boolean)
    .join(" ");
}

async function legacyCards() {
  const qids = LEGACY.filter((l) => l[1]).map((l) => `wd:${l[1]}`).join(" ");
  const rows = await sparql(`SELECT ?m ?img WHERE { VALUES ?m { ${qids} } ?m wdt:P18 ?img }`);
  const imgs = Object.fromEntries(rows.map((b) => [v(b, "m").split("/").pop(), fileName(v(b, "img"))]));
  return LEGACY.map(([id, qid, name, rarity, power_hp, weight_kg, top_speed_kmh, handling_score, year, market_value, division, color, shape, text]) => ({
    id,
    qid: qid || `legacy-${id}`,
    file: LEGACY_FILES[id] || imgs[qid],
    card: { id, name, rarity, power_hp, weight_kg, top_speed_kmh, handling_score, year, market_value, division, color, shape, lore: text, category: CATEGORY[division] },
  }));
}

async function download() {
  console.log("Cartes d’origine…");
  const legacy = await legacyCards();
  const taken = new Set(legacy.map((l) => l.qid));
  const fetched = [];
  for (const [qid, division] of CLASSES) {
    console.log(`Wikidata ${qid} (${division})…`);
    const items = await fetchClass(qid, division);
    for (const it of items) if (!taken.has(it.qid)) (taken.add(it.qid), fetched.push(it));
    console.log(`  ${items.length} modèles`);
    await sleep(1500);
  }
  // Une photo = une carte ; un nom = une carte.
  const seenFile = new Set(legacy.map((l) => l.file)),
    seenName = new Set(legacy.map((l) => l.card.name.toLowerCase()));
  const unique = fetched.filter((it) => {
    const key = it.name.toLowerCase();
    if (seenFile.has(it.file) || seenName.has(key)) return false;
    seenFile.add(it.file);
    seenName.add(key);
    return true;
  });
  if (args.pageviews) {
    console.log(`Vues Wikipédia pour ${unique.length} modèles…`);
    await addPageviews(unique);
  }
  console.log(`Résumés Wikipédia pour ${unique.length} modèles…`);
  await addSummaries(unique);
  for (const it of unique) it.year = guessYear(it);
  console.log("Crédits Commons…");
  await addCredits([...unique, ...legacy]);
  return { legacy, unique };
}

async function main() {
  const previous = existsSync(JSON_OUT) ? JSON.parse(readFileSync(JSON_OUT, "utf8")) : [];
  const known = new Map(previous.filter((c) => c.wikidata_id).map((c) => [c.wikidata_id, c]));

  // --cache : réutilise les données brutes déjà téléchargées (réglage de l'équilibrage).
  const CACHE = new URL("node_modules/.cache/apex-catalog-raw.json", ROOT);
  const { legacy, unique } =
    args.cache && existsSync(CACHE)
      ? JSON.parse(readFileSync(CACHE, "utf8"))
      : await download();
  mkdirSync(new URL("node_modules/.cache/", ROOT), { recursive: true });
  writeFileSync(CACHE, JSON.stringify({ legacy, unique }));

  // Rareté = notoriété (rang percentile) + prestige (segment, marque, finition),
  // en percentiles au sein de chaque catégorie : un SUV très connu ne devient
  // pas mythique, une supercar confidentielle ne reste pas commune.
  const popularity = (it) => it.sitelinks + (it.views ? Math.log10(1 + it.views) * 6 : 0);
  for (const division of Object.keys(CATEGORY)) {
    const group = unique.filter((it) => it.division === division && !it.missing);
    const byPop = [...group].sort((a, b) => popularity(a) - popularity(b));
    byPop.forEach((it, i) => (it.popRank = (i + 1) / byPop.length));
    const score = (it) => it.popRank + 0.22 * prestige(it);
    group.sort((a, b) => score(b) - score(a) || a.qid.localeCompare(b.qid));
    group.forEach((it, i) => {
      const q = (i + 1) / group.length;
      const r = RARITY_CUT.findIndex((cut) => q <= cut);
      it.rarity = RARITIES[Math.max(r, RARITIES.indexOf(rarityCap(it)))];
      // Position dans la bande de rareté → cote.
      const lo = r ? RARITY_CUT[r - 1] : 0;
      it.bandPos = 1 - (q - lo) / (RARITY_CUT[r] - lo);
    });
  }

  let nextId = Math.max(24, ...previous.map((c) => c.id)) + 1;
  const cards = legacy.map((l) => ({
    ...l.card,
    wikidata_id: l.qid.startsWith("Q") ? l.qid : null,
    brand: null,
    image_url: l.file ? imageUrl(l.file) : "",
    image_page: l.file ? `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(l.file)}` : null,
    image_credit: l.credit ?? null,
  }));
  for (const it of unique) {
    if (it.missing || !it.rarity) continue;
    const old = known.get(it.qid);
    const rnd = seeded(it.qid + ":look");
    // Corrige aussi la rareté d'une 125/150/250cc qui avait échappé au plafond.
    const cap = rarityCap(it);
    const rarity = RARITIES[Math.max(RARITIES.indexOf(old?.rarity ?? it.rarity), RARITIES.indexOf(cap))];
    const [lo, hi] = VALUE_BAND[rarity];
    const cleanName = (NAME_FIX[it.qid] || it.name).slice(0, 80);
    const computedStats = stats(it, rarity);
    cards.push({
      id: old?.id ?? nextId++,
      name: cleanName,
      rarity,
      ...computedStats,
      market_value:
        old && old.rarity === rarity
          ? old.market_value
          : Math.round((lo + (hi - lo) * (it.bandPos ?? 0.5)) / 100) * 100,
      division: it.division,
      color: old?.color ?? PALETTE[Math.floor(rnd() * PALETTE.length)],
      shape: it.division === "Moto" ? "moto" : it.division === "Compétition" ? "race" : RARITIES.indexOf(rarity) <= 2 ? "coupe" : "hatch",
      lore: lore(it),
      category: CATEGORY[it.division],
      wikidata_id: it.qid,
      brand: it.brand ?? null,
      image_url: imageUrl(it.file),
      image_page: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(it.file)}`,
      image_credit: it.credit ?? null,
    });
  }
  // Les cartes publiées disparues de Wikidata restent jouables (inventaires).
  const present = new Set(cards.map((c) => c.id));
  for (const c of previous) if (!present.has(c.id)) cards.push(c);
  cards.sort((a, b) => a.id - b.id);

  mkdirSync(new URL("src/data/", ROOT), { recursive: true });
  writeFileSync(JSON_OUT, JSON.stringify(cards));
  writeFileSync(SQL_OUT, toSql(cards));
  // Parties de ~1 400 cartes pour le SQL Editor web de Supabase (limite ~1 Mo).
  const CHUNK = 900;
  for (let i = 0, part = 0; i < cards.length; i += CHUNK, part++) {
    const letter = String.fromCharCode(97 + part);
    const slice = cards.slice(i, i + CHUNK);
    writeFileSync(
      new URL(`supabase/migrations/006${letter}_catalog_part${part + 1}.sql`, ROOT),
      toSql(slice, i + CHUNK >= cards.length),
    );
  }
  const count = (k, val) => cards.filter((c) => c[k] === val).length;
  console.log(`\n${cards.length} cartes écrites.`);
  console.log("  " + Object.keys(CATEGORY).map((d) => `${d} ${count("division", d)}`).join(" · "));
  console.log("  " + RARITIES.map((r) => `${r} ${count("rarity", r)}`).join(" · "));
}

function toSql(cards, finalize = true) {
  const q = (s) => (s == null ? "NULL" : `'${String(s).replace(/'/g, "''")}'`);
  const cols = "id,name,category,rarity,power_hp,weight_kg,top_speed_kmh,handling_score,year,market_value,image_url,lore,division,color,shape,wikidata_id,brand,image_page,image_credit";
  const rows = cards.map(
    (c) =>
      `(${c.id},${q(c.name)},${q(c.category)},${q(c.rarity)},${c.power_hp},${c.weight_kg},${c.top_speed_kmh},${c.handling_score},${c.year},${c.market_value},${q(c.image_url)},${q(c.lore)},${q(c.division)},${q(c.color)},${q(c.shape)},${q(c.wikidata_id)},${q(c.brand)},${q(c.image_page)},${q(c.image_credit)})`,
  );
  const set = cols
    .split(",")
    .slice(1)
    .map((c) => `${c}=excluded.${c}`)
    .join(",");
  return `-- GÉNÉRÉ par scripts/build-catalog.mjs — ne pas éditer à la main.
-- Idempotent : ré-exécutable après chaque synchronisation du catalogue.
BEGIN;
INSERT INTO public.cards(${cols}) VALUES
${rows.join(",\n")}
ON CONFLICT(id) DO UPDATE SET ${set};
${finalize ? `SELECT setval(pg_get_serial_sequence('public.cards','id'),(SELECT max(id) FROM public.cards));\nUPDATE public.profiles p SET collection_score=(SELECT coalesce(sum(c.market_value::bigint*u.quantity*CASE WHEN u.is_foil THEN 2.5 ELSE 1 END),0)::bigint FROM public.user_cards u JOIN public.cards c ON c.id=u.card_id WHERE u.user_id=p.id);\n` : ""}COMMIT;
`;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
