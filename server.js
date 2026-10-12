// ============================================================
//  Ravitail — mini-serveur proxy Gemini
//  L'app envoie son stock → ce serveur appelle Gemini avec TA clé
//  (jamais exposée) → renvoie la recette. Quota par appareil + clé d'app.
// ============================================================
//
//  Variables d'environnement à définir (voir README) :
//   - GEMINI_API_KEY : ta clé Google Gemini (secret, jamais dans l'app)
//   - APP_SECRET     : un mot de passe partagé avec l'app (anti-accès direct)
//   - QUOTA_MOIS     : nb de recettes/mois/appareil (défaut 40)
//   - MODELE         : modèle Gemini (défaut gemini-2.5-flash)
//   - PORT           : port d'écoute (défaut 8080)
// ============================================================

const http = require("http");

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const APP_SECRET = process.env.APP_SECRET || "";
const QUOTA_MOIS = parseInt(process.env.QUOTA_MOIS || "40", 10);
const MODELE = process.env.MODELE || "gemini-2.5-flash";
const PORT = parseInt(process.env.PORT || "8080", 10);

// ============================================================
//  CAMPAGNES SAISONNIÈRES (pilotées ici, sans republier l'app)
//  Pour changer la campagne : édite ce tableau et redéploie le serveur.
//  - id      : identifiant unique (sert à ne montrer l'affiche qu'une fois)
//  - du / au : période d'activité, format "MM-JJ" (mois-jour), comparé chaque année
//  - titre, texte : contenu de l'affiche
//  - image   : URL d'une image (ex. GitHub), ou "" pour une affiche texte
//  - promo   : texte de la promo (ou "")
//  - couleur : accent de l'affiche (hex)
//  La 1re campagne dont la période contient la date du jour est renvoyée.
// ============================================================
// Chaque campagne peut porter :
//  - vedette  : la recette mise en avant (ouvrable en entier)
//               { titre, image, accroche, temps, personnes, ingredients:[...], etapes:[...] }
//  - recettes : les autres recettes "à venir / à débloquer" (titre, image, accroche, verrouillées)
// Pour l'IMAGE : mets l'URL d'une image hébergée (ex. GitHub), ou "" pour un dégradé.
//   ex. "https://nayuno.github.io/ravitail-legal/recettes/butternut.jpg"
const CAMPAGNES = [
  {
    id: "automne-2026",
    du: "09-21", au: "12-20",
    titre: "L'automne arrive",
    texte: "3 nouvelles recettes de saison rien que pour vous — courges, champignons et douceurs réconfortantes.",
    image: "https://nayuno.github.io/ravitail-legal/recettes/veloutedecourgerotie.jpg", // ex. "https://nayuno.github.io/ravitail-legal/campagnes/automne.jpg"
    promo: "Offre d'automne : -30% sur le Premium pendant tout octobre.",
    couleur: "#b5622a",
    vedette: {
      titre: "Velouté de butternut rôtie",
      image: "https://github.com/NAYUNO/ravitail-serveur/blob/main/veloutecourgerotie.jpg",
      accroche: "Onctueux et réconfortant, le plat d'automne par excellence.",
      temps: "40 min", personnes: 4,
      ingredients: [
        "1 courge butternut (environ 1 kg)",
        "1 oignon",
        "2 gousses d'ail",
        "40 cl de bouillon de légumes",
        "10 cl de crème fraîche",
        "2 c. à soupe d'huile d'olive",
        "Sel, poivre, muscade",
      ],
      etapes: [
        "Épluchez la butternut, coupez-la en cubes. Émincez l'oignon et l'ail.",
        "Faites rôtir les cubes de courge 20 min au four à 200 °C avec un filet d'huile.",
        "Dans une casserole, faites revenir l'oignon et l'ail, ajoutez la courge rôtie et le bouillon.",
        "Laissez mijoter 10 min, puis mixez jusqu'à obtenir une texture lisse.",
        "Ajoutez la crème, assaisonnez (sel, poivre, muscade) et servez bien chaud.",
      ],
    },
    recettes: [
      { titre: "Risotto aux champignons", image: "", accroche: "Crémeux, parfumé, parfait pour les soirées fraîches." },
      { titre: "Tarte aux pommes & cannelle", image: "", accroche: "La douceur d'automne qui embaume toute la maison." },
    ],
  },
  {
    id: "halloween-2026",
    du: "10-25", au: "11-02",
    titre: "Halloween gourmand 🎃",
    texte: "3 recettes effrayamment bonnes pour la soirée — à base de citrouille et de douceurs d'automne.",
    image: "",
    promo: "Soirée Halloween : -30% sur le Premium pour l'occasion.",
    couleur: "#8a3a12",
    vedette: {
      titre: "Soupe de potiron des sorcières",
      image: "",
      accroche: "Une soupe orange et fumante, à servir dans un potiron évidé pour l'effet.",
      temps: "35 min", personnes: 4,
      ingredients: [
        "800 g de potiron",
        "1 oignon",
        "1 pomme de terre",
        "50 cl de bouillon de volaille",
        "10 cl de crème",
        "1 c. à café de cumin",
        "Sel, poivre, graines de courge",
      ],
      etapes: [
        "Épluchez et coupez le potiron et la pomme de terre en morceaux. Émincez l'oignon.",
        "Faites revenir l'oignon, ajoutez les légumes et le bouillon. Laissez cuire 20 min.",
        "Mixez finement, ajoutez la crème et le cumin, rectifiez l'assaisonnement.",
        "Servez dans des bols (ou un potiron évidé), parsemez de graines de courge grillées.",
      ],
    },
    recettes: [
      { titre: "Doigts de sorcière (sablés)", image: "", accroche: "Des biscuits amusants et croquants pour effrayer les gourmands." },
      { titre: "Pommes d'amour caramel", image: "", accroche: "Le classique brillant et croquant des fêtes d'automne." },
    ],
  },
  {
    id: "noel-2026",
    du: "12-10", au: "12-27",
    titre: "Un Noël plein de saveurs ✨",
    texte: "3 recettes de fête pour régaler toute la tablée, sans rien oublier grâce à vos stocks.",
    image: "",
    promo: "Offre de Noël : le Premium à prix réduit jusqu'au 25 décembre.",
    couleur: "#9a7635",
    vedette: {
      titre: "Suprêmes de volaille, sauce aux marrons",
      image: "",
      accroche: "Un plat de fête tendre et parfumé, simple à réussir.",
      temps: "50 min", personnes: 4,
      ingredients: [
        "4 suprêmes de volaille",
        "200 g de marrons cuits",
        "2 échalotes",
        "20 cl de crème",
        "10 cl de vin blanc",
        "1 noix de beurre",
        "Sel, poivre, thym",
      ],
      etapes: [
        "Faites dorer les suprêmes au beurre, réservez-les.",
        "Dans la même poêle, faites suer les échalotes, déglacez au vin blanc.",
        "Ajoutez les marrons et la crème, laissez réduire 5 min.",
        "Remettez la volaille, couvrez et laissez mijoter 15 min. Assaisonnez et servez.",
      ],
    },
    recettes: [
      { titre: "Bûche chocolat-praliné", image: "", accroche: "Le dessert de Noël incontournable, fondant à souhait." },
      { titre: "Verrines saumon-avocat", image: "", accroche: "Une entrée fraîche et élégante pour ouvrir le repas." },
    ],
  },
];

// ============================================================
//  RECETTES PERMANENTES — le catalogue qui s'enrichit saison après saison.
//  Quand une campagne se termine, copie ici ses recettes pour qu'elles restent
//  dans la bibliothèque. Même format que la vedette (ouvrables en entier).
//  Pilotable à distance : édite cette liste et redéploie le serveur.
// ============================================================
const RECETTES_PERMANENTES = [
  // Exemple (décommente / adapte quand une campagne finit) :
  // {
  //   titre: "Velouté de butternut rôtie",
  //   image: "https://nayuno.github.io/ravitail-legal/recettes/butternut.jpg",
  //   accroche: "Onctueux et réconfortant.",
  //   temps: "40 min", personnes: 4,
  //   ingredients: ["1 courge butternut", "1 oignon", "..."],
  //   etapes: ["Épluchez la courge…", "..."],
  // },
];

function campagneActive(d = new Date()) {
  const mmjj = String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  const dans = (x, a, b) => (a <= b ? (x >= a && x <= b) : (x >= a || x <= b)); // gère le passage d'année
  const duree = (a, b) => { const n = (s) => (+s.slice(0,2)) * 31 + (+s.slice(3)); let x = n(b) - n(a); if (x < 0) x += 372; return x; };
  // parmi les campagnes actives, la plus SPÉCIFIQUE (période la plus courte) prime :
  // un événement comme Halloween l'emporte sur la campagne de fond "automne".
  const actives = CAMPAGNES.filter((c) => dans(mmjj, c.du, c.au));
  if (!actives.length) return null;
  return actives.sort((a, b) => duree(a.du, a.au) - duree(b.du, b.au))[0];
}

// --- Quota par appareil, en mémoire (remis à zéro chaque mois civil) ---
// Suffisant pour démarrer. Pour un quota durable au redémarrage, brancher
// un petit stockage (Firestore, Redis…) plus tard.
const compteur = new Map(); // deviceId -> { mois: "2026-10", n: 3 }

function moisCourant() {
  const d = new Date();
  return d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0");
}

function quotaRestant(deviceId) {
  const m = moisCourant();
  const e = compteur.get(deviceId);
  if (!e || e.mois !== m) return QUOTA_MOIS;
  return Math.max(0, QUOTA_MOIS - e.n);
}
function incrementer(deviceId) {
  const m = moisCourant();
  const e = compteur.get(deviceId);
  if (!e || e.mois !== m) compteur.set(deviceId, { mois: m, n: 1 });
  else e.n += 1;
}

function lireCorps(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => { data += c; if (data.length > 1e6) req.destroy(); });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, X-App-Secret, X-Device-Id",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  });
  res.end(body);
}

function construirePrompt({ stock, personnes, envie }) {
  return `Tu es un chef qui propose une recette réalisable avec les ingrédients disponibles.

STOCK DISPONIBLE (nom : quantité unité) :
${stock}

CONTRAINTES :
- Recette pour ${personnes} personne(s).
${envie ? `- Envie particulière : ${envie}.` : ""}
- PRIORITÉ : utilise en premier les produits marqués [PÉRIMÉ], [à utiliser vite] ou dont la péremption est la plus proche, pour éviter le gaspillage.
- Privilégie les ingrédients du stock. Tu peux ajouter des ingrédients courants manquants (indique-les séparément).
- Donne des quantités réalistes pour ${personnes} personne(s).

Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour, sans balises markdown, au format EXACT :
{
  "titre": "Nom de la recette",
  "personnes": ${personnes},
  "temps": "30 min",
  "ingredientsUtilises": [ { "nom": "...", "quantite": 200, "unite": "g" } ],
  "ingredientsManquants": [ { "nom": "...", "quantite": 1, "unite": "pièce" } ],
  "etapes": [ "Étape 1...", "Étape 2..." ]
}
Les "nom" des ingredientsUtilises doivent correspondre EXACTEMENT aux noms du stock ci-dessus.`;
}

const server = http.createServer(async (req, res) => {
  // Préflight CORS
  if (req.method === "OPTIONS") return json(res, 204, {});

  // Santé
  if (req.method === "GET" && req.url === "/") {
    return json(res, 200, { ok: true, service: "ravitail-gemini", modele: MODELE });
  }

  // Campagne saisonnière active + recettes permanentes (consultable par l'app)
  if (req.method === "GET" && req.url === "/campagne") {
    const c = campagneActive();
    return json(res, 200, { campagne: c, permanentes: RECETTES_PERMANENTES });
  }

  // Diagnostic : liste les modèles disponibles POUR TA CLÉ (ouvre /modeles dans le navigateur)
  if (req.method === "GET" && req.url === "/modeles") {
    if (!GEMINI_API_KEY) return json(res, 500, { erreur: "Clé manquante." });
    try {
      const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models", {
        headers: { "x-goog-api-key": GEMINI_API_KEY },
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) return json(res, r.status, { erreur: "Erreur Google", detail: data });
      // on ne renvoie que les noms utiles pour la génération de recettes
      const noms = (data.models || [])
        .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
        .map((m) => (m.name || "").replace(/^models\//, ""));
      return json(res, 200, { modeleActuel: MODELE, modelesDisponibles: noms });
    } catch (e) {
      return json(res, 500, { erreur: "Impossible de lister", detail: String(e) });
    }
  }

  if (req.method !== "POST" || req.url !== "/recette") {
    return json(res, 404, { erreur: "Route inconnue." });
  }

  // Vérif configuration serveur
  if (!GEMINI_API_KEY) return json(res, 500, { erreur: "Serveur mal configuré (clé manquante)." });

  // Vérif clé d'app
  const secret = req.headers["x-app-secret"] || "";
  if (APP_SECRET && secret !== APP_SECRET) {
    return json(res, 401, { erreur: "Accès refusé." });
  }

  // Identifiant d'appareil (pour le quota)
  const deviceId = (req.headers["x-device-id"] || "").toString().slice(0, 100) || "inconnu";

  // Quota
  if (quotaRestant(deviceId) <= 0) {
    return json(res, 429, { erreur: "Quota de recettes atteint pour ce mois.", quotaRestant: 0 });
  }

  let corps;
  try { corps = JSON.parse(await lireCorps(req)); }
  catch { return json(res, 400, { erreur: "Requête invalide." }); }

  const stock = (corps.stock || "").toString().trim();
  const personnes = Math.max(1, Math.min(12, parseInt(corps.personnes || 2, 10) || 2));
  const envie = (corps.envie || "").toString().slice(0, 300);
  if (!stock) return json(res, 400, { erreur: "Stock vide." });

  const prompt = construirePrompt({ stock, personnes, envie });
  // La clé est envoyée dans l'en-tête x-goog-api-key : compatible avec les deux
  // formats de clé Gemini (ancien "AIza…" et nouveau "AQ…").
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODELE}:generateContent`;

  try {
    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": GEMINI_API_KEY,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, responseMimeType: "application/json" },
      }),
    });
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      return json(res, 502, { erreur: "Erreur Gemini (" + r.status + ").", detail: t.slice(0, 160) });
    }
    const data = await r.json();
    const texte = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    // On ne consomme le quota que si la génération a réussi
    incrementer(deviceId);

    // On renvoie le texte brut : l'app le parse déjà (parseRecette)
    return json(res, 200, { texte, quotaRestant: quotaRestant(deviceId) });
  } catch (e) {
    return json(res, 500, { erreur: "Erreur serveur.", detail: String(e).slice(0, 160) });
  }
});

server.listen(PORT, () => {
  console.log(`Ravitail Gemini proxy en écoute sur :${PORT} (modèle ${MODELE}, quota ${QUOTA_MOIS}/mois)`);
});
