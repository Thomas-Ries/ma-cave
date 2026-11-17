/* Ma Cave — store Pinia : modèle, persistance, profils, synchro BDD D1 (v2.22 : Notion retiré) */
import { defineStore } from "pinia";
import { PROFILS, FORMATS, CATS, CAT_COLORS, uid } from "../config.js";
import { estimeApogee } from "../lib/apogee.js";
import { importKey, previewImport, applyImportRows, parseImportFile } from "../lib/import.js";
import { ilYA } from "../util.js";
import { notifie, planifieRappel, rattrapeRappels } from "../lib/notifs.js";
import { pushEtat, pushActiver, pushDesactiver, pushMajDigest } from "../lib/push.js";



const PROFIL_KEY = "ma-cave-profil";
const ADMIN_PIN_HASH = 3785925479; /* djb2 du code admin de secours (débloque n'importe quel profil) */
function pinHash(s) { let x = 5381; for (const c of s) x = ((x * 33) ^ c.charCodeAt(0)) >>> 0; return x; }

export const useCave = defineStore("cave", {
  state: () => ({
    PROFIL: "thomas",
    db: { bouteilles: [], bues: [], buesSuppr: [], coeurs: [], listes: [], filters: { q: "", cat: "Toutes", cave: "Toutes", region: "Toutes", tri: "", etage: "Tout", apogee: "" } },
    denseOn: false,
    TAB: "cave",
    cavePage: 1,
    apoAlerte: null,        /* null | "boire" | "bientot" | "passe" (onglet Apogées) */
    apogeeFiltre: false,    /* filtre « à boire cette année » (bandeau Cave) */
    d1PullTs: 0,           /* horodatage du dernier pull BDD réussi (pastille de synchro) */
    d1Nb: null,            /* nb de bouteilles que la BDD renvoie (décompte Profil) */
    d1Log: [],             /* journal des événements BDD notables (suppressions, renvois…) */
    pushNotifEtat: "inconnu", /* "on" | "pret" | "refuse" | "non-demandee" | "incompatible" (push arrière-plan) */
    combien: null,          /* question « tu sors combien ? » quand quantité > 1 */
    actu: null,             /* dernière actu du vin (RSS via le worker) */
    actuErreur: false,
    soirVersion: 0,         /* incrémenté quand les préférences du soir changent */
    fichesOuvertes: [],
    ficheEdit: false,
    ficheAccord: false,
    ficheRetour: null,      /* route d'origine quand la fiche est ouverte depuis Accords/Bues */
    buesFiche: null,        /* index dans db.bues de la fiche « bue » ouverte */
    askConf: null,          /* popin de confirmation maison */
    enviePrefill: null,     /* article d'envie → pré-remplir le formulaire d'ajout au retour sur la Cave */
    ouvrirAjout: false,     /* demande d'ouverture du formulaire d'ajout depuis l'onglet Ce soir */
    toasts: [],
    busy: 0,                /* synchro en cours (pastille loader) */
    darkOn: false,          /* mode sombre « cave » (persisté par appareil) */
    overlays: [],           /* ids des modales/feuilles ouvertes → verrouillage du scroll de fond */
    _scrollY: 0,
  }),

  getters: {
    PROFILS: () => PROFILS,
    FORMATS: () => FORMATS,
    CATS: () => CATS,
    CAT_COLORS: () => CAT_COLORS,
    pKeys() { return this.PROFIL === "thomas"
      ? { db: "ma-cave-v1" }
      : { db: "ma-cave-v1-" + this.PROFIL }; },
    listes() { if (!Array.isArray(this.db.listes)) this.db.listes = []; return this.db.listes; },
    listesDe: (s) => (b) => s.listes.filter(l => (l.ids || []).includes(b.id)),
    nbReservees: (s) => s.listes.reduce((n, l) => n + (l.ids || []).length, 0),
    /* Envies d'achat : bouteilles notées mais pas encore achetées */
    nbEnvies: (s) => (s.db.envies || []).reduce((n, e) => n + (e.items || []).filter(i => !i.ajouteLe).length, 0),

    /* Spiritueux du soir (onglet Ce soir) : les plus rares d'abord —
       on met en avant ce qu'il ne faudrait pas oublier, pas le fond de rayon. */
    spiritueuxDuSoir(s) {
      return s.db.bouteilles
        .filter(b => b.quantite > 0 && s.estSpiritueux(b))
        .slice()
        .sort((a, z) => a.quantite - z.quantite || (a.nom || "").localeCompare(z.nom || "", "fr"))
        .slice(0, 2);
    },
    listeQ: () => (l, bid) => { const q = (l.qtes || {})[bid]; return q > 1 ? q : 1; },
    /* Caves déjà saisies, pour les suggestions du formulaire d'ajout */
    cavesConnues() {
      const s = new Set(["Principale"]);
      for (const b of this.db.bouteilles) { const c = (b.cave || "").trim(); if (c) s.add(c); }
      return [...s];
    },

    /* Un spiritueux : type marqué OU catégorie Spiritueux (sécurité import/données anciennes).
       Getter currifié (param → sous-fonction) : un getter Pinia à argument direct
       serait évalué UNE fois comme un computed avec b=undefined, pas comme une fonction. */
    estSpiritueux: () => (b) => !!(b && (b.type === "Spiritueux" || b.categorie === "Spiritueux")),

    /* Compteurs par étage (références en stock) — pour les pastilles du sélecteur */
    etageCounts() {
      let vins = 0, spirit = 0;
      for (const b of this.db.bouteilles) {
        if (!(b.quantite > 0)) continue;
        if (this.estSpiritueux(b)) spirit++; else vins++;
      }
      return { vins, spirit, tout: vins + spirit };
    },

    /* Liste visible (filtres + tri + pagination) */
    visible() {
      const f = this.db.filters;
      const year = new Date().getFullYear();
      let list = this.db.bouteilles.filter(b => b.quantite > 0);
      if (f.etage === "Vin") list = list.filter(b => !this.estSpiritueux(b));
      else if (f.etage === "Spiritueux") list = list.filter(b => this.estSpiritueux(b));
      if (f.cat !== "Toutes") list = list.filter(b => (b.type === "Spiritueux" ? "Spiritueux" : b.categorie) === f.cat || b.categorie === f.cat);
      if (f.cave && f.cave !== "Toutes") list = list.filter(b => (b.cave || "") === f.cave);
      if (this.apogeeFiltre) list = list.filter(b => this.enApogee(b, year));
      if (f.apogee && f.apogee !== "Toutes") list = list.filter(b => this.statutApo(b, year) === f.apogee);
      if (f.region && f.region !== "Toutes") list = list.filter(b => (b.region || "") === f.region);
      if (f.q) {
        const q = f.q.toLowerCase();
        list = list.filter(b => [b.nom, b.cepage, b.region, b.cuvee, b.appellation, b.pays].some(v => (v || "").toLowerCase().includes(q)));
      }
      const tri = f.tri || "";
      if (tri === "apogee") list.sort((a, b) => (a.apoDebut ?? a.apoAuto?.debut ?? Infinity) - (b.apoDebut ?? b.apoAuto?.debut ?? Infinity));
      else if (tri === "recent") list.sort((a, b) => ((b.creeLe || b.modifLe || "") > (a.creeLe || a.modifLe || "") ? 1 : -1));
      else if (tri === "nom") list.sort((a, b) => (a.nom || "").localeCompare(b.nom || "", "fr"));
      else if (tri === "millesime") list.sort((a, b) => (b.millesime ?? -1) - (a.millesime ?? -1));
      else if (tri === "millesime_asc") list.sort((a, b) => (a.millesime ?? 9999) - (b.millesime ?? 9999));
      else if (tri === "prix") list.sort((a, b) => (b.prix ?? 0) - (a.prix ?? 0));
      else if (tri === "format") list.sort((a, b) => (FORMATS.indexOf(a.format || "Bouteille (75 cl)") - FORMATS.indexOf(b.format || "Bouteille (75 cl)")) || (a.nom || "").localeCompare(b.nom || "", "fr"));
      else if (tri === "region") list.sort((a, b) => (a.region || "").localeCompare(b.region || "", "fr") || (a.nom || "").localeCompare(b.nom || "", "fr"));
      return list;
    },

    /* « Ce soir, sers plutôt… » : urgence 0 = passée (à boire sans attendre),
       1 = en apogée, 2 = apogée dans 1 an max. Trier par urgence puis rareté
       (quantité la plus faible d'abord : on libère les fonds de rayon). */
    soirItems() {
      const year = new Date().getFullYear();
      return this.db.bouteilles.filter(b => b.quantite > 0 && b.type !== "Spiritueux").map(b => {
        const d = b.apoDebut ?? b.apoAuto?.debut;
        const f = b.apoFin ?? (b.apoDebut != null ? b.apoDebut : b.apoAuto?.fin);
        if (d == null) return null;
        if (year > (f ?? d)) return { b, u: 0, t: "sans attendre" };
        if (year >= d) return { b, u: 1, t: "en apogée" };
        if (d <= year + 1) return { b, u: 2, t: "bientôt prête" };
        return null;
      }).filter(Boolean).sort((a, z) => a.u - z.u || a.b.quantite - z.b.quantite || (a.b.nom || "").localeCompare(z.b.nom || ""));
    },

    apogeeStats() {
      const year = new Date().getFullYear();
      const stats = { boire: 0, bientot: 0, passe: 0 };
      for (const b of this.db.bouteilles) {
        if (!(b.quantite > 0) || b.type === "Spiritueux") continue;
        const d = b.apoDebut ?? b.apoAuto?.debut;
        const f = b.apoFin ?? (b.apoDebut != null ? b.apoDebut : b.apoAuto?.fin);
        if (d == null) continue;
        if (year > (f ?? d)) stats.passe++;
        else if (year >= d) stats.boire++;
        else if (d <= year + 2) stats.bientot++;
      }
      return stats;
    },

    apoItems() {
      return this.db.bouteilles.filter(b => b.quantite > 0).map(b => {
        const est = b.apoDebut != null ? { debut: b.apoDebut, fin: b.apoFin ?? b.apoDebut, mine: true } : b.apoAuto ? { ...b.apoAuto, mine: false } : null;
        return { b, est };
      }).filter(x => x.est).sort((a, z) => (a.est.debut ?? Infinity) - (z.est.debut ?? Infinity));
    },

    bouteilleOuverte() { const id = this.fichesOuvertes[0]; return id ? this.db.bouteilles.find(b => b.id === id) || null : null; },
    bueOuverte() { return this.buesFiche != null ? (this.db.bues || []).find(x => x.id === this.buesFiche) || null : null; },
    stats() {
      const stock = this.db.bouteilles.filter(b => b.quantite > 0);
      const totalB = stock.reduce((s, b) => s + b.quantite, 0);
      const valeur = stock.reduce((s, b) => s + (b.prix ?? 0) * b.quantite, 0);
      const parCat = {};
      stock.forEach(b => { const k = b.type === "Spiritueux" ? "Spiritueux" : b.categorie; parCat[k] = (parCat[k] || 0) + b.quantite; });
      const buesCount = (this.db.bues || []).length;
      const notes = (this.db.bues || []).map(b => b.note).filter(n => n != null);
      const avgNote = notes.length ? (notes.reduce((s, n) => s + n, 0) / notes.length).toFixed(1) : null;
      const buesPrix = stock.reduce((s, b) => s + ((b.prix ?? 0) * (b.bues || 0)), 0);
      return { stock, totalB, valeur, parCat, buesCount, avgNote, refs: stock.length, buesPrix };
    },
  },

  actions: {
    /* ---------- Persistance ---------- */
    save() { try { localStorage.setItem(this.pKeys.db, JSON.stringify(this.db)); } catch {} this.d1Plan(); },

    load() {
      let db = null;
      try { const raw = localStorage.getItem(this.pKeys.db); db = raw ? JSON.parse(raw) : null; } catch { db = null; }
      if (!db || !Array.isArray(db.bouteilles)) db = { bouteilles: [], bues: [], buesSuppr: [], coeurs: [], listes: [], filters: { q: "", cat: "Toutes", cave: "Toutes", region: "Toutes", tri: "", etage: "Tout", apogee: "" } };
      db.filters = db.filters || { q: "", cat: "Toutes", cave: "Toutes", region: "Toutes", tri: "", etage: "Tout", apogee: "" };
      db.filters.tri = db.filters.tri || "";
      db.filters.region = db.filters.region || "Toutes";
      db.filters.etage = db.filters.etage || "Tout"; /* étage de cave : Vin / Spiritueux / Tout */
      db.filters.apogee = db.filters.apogee || ""; /* filtre apogée : "" / boire / bientot / passe */
      if (!Array.isArray(db.listes)) db.listes = [];
      for (const l of db.listes) { l.qtes = l.qtes || {}; l.ids = l.ids || []; l.ext = l.ext || []; }
      db.envies = db.envies || [];
      for (const e of db.envies) { e.items = e.items || []; }
      db.bues = db.bues || [];
      db.bues.forEach(h => { if (!h.id) h.id = uid(); });   /* id unique : l'historique affiché est trié par date, l'index ne suffit plus */
      db.buesSuppr = db.buesSuppr || [];   /* clés des bues supprimées (propagées via Notion) */
      db.coeurs = db.coeurs || [];         /* clés « nom|millésime » des coups de cœur */
      /* v32 : appellation extraite de l'ancien commentaire */
      db.bouteilles.forEach(b => {
        if (b.appellation) return;
        const m = (b.commentaire || "").match(/^\s*Appellation\s*:\s*([^\n]*?)\s*(?:\n|$)/i);
        if (m) { b.appellation = m[1].trim(); b.commentaire = b.commentaire.replace(m[0], "").trim(); }
      });
      /* v31 : migration Effervescent → Champagne/Crémant */
      let mig = false;
      db.bouteilles.forEach(b => {
        if (b.categorie !== "Effervescent") return;
        const t = ((b.nom || "") + " " + (b.cuvee || "") + " " + (b.region || "")).toLowerCase();
        if (/champagne/.test(t)) { b.categorie = "Champagne"; mig = true; }
        else if (/crémant|cremant/.test(t)) { b.categorie = "Crémant"; mig = true; }
      });
      /* v33 : « Cave principale » → « Principale » */
      db.bouteilles.forEach(b => { if (b.cave === "Cave principale") { b.cave = "Principale"; mig = true; } });
      if (db.filters && db.filters.cave === "Cave principale") { db.filters.cave = "Principale"; mig = true; }
      /* v35 : caves harmonisées avec Notion (nettoyage du 2026-11-03) — il n'existe
         plus que « Principale » et « Frigo ». Toute autre valeur (Bar, Cave 1, vide…)
         est ramenée à « Principale » pour que le dédoublonnage v34 les fusionne. */
      db.bouteilles.forEach(b => { if (b.cave !== "Frigo" && b.cave !== "Principale") { b.cave = "Principale"; mig = true; } });
      if (db.filters && db.filters.cave && db.filters.cave !== "Toutes" && db.filters.cave !== "Principale" && db.filters.cave !== "Frigo") { db.filters.cave = "Toutes"; mig = true; }
      /* v36 : « Moelleux » n'est plus une catégorie (couleur) — les fiches deviennent
         Blanc + spécificité « Moelleux / Liquoreux ». La clé Nom+Millésime+Cave ne
         change pas : la sync met à jour les pages Notion existantes, AUCUN doublon.
         modifLe bumpé → le push vers Notion propagera Categorie=Blanc + Spécificité. */
      db.bouteilles.forEach(b => {
        if (b.categorie !== "Moelleux") return;
        b.categorie = "Blanc";
        if (!b.specificite) b.specificite = "Moelleux / Liquoreux";
        b.modifLe = new Date().toISOString();
        mig = true;
      });
      if (db.filters && db.filters.cat === "Moelleux") { db.filters.cat = "Toutes"; mig = true; }
      /* v34 : dédoublonnage — des « Récupérer » ont dupliqué la cave quand la clé
         cave différait (« Cave principale » vs « Principale »). Même clé importKey
         = même bouteille : on garde la plus ancienne et on récupère les champs
         de la copie si elle est plus récente. */
      const vues = new Map();
      const garde = [];
      let dup = false;
      for (const b of db.bouteilles) {
        const k = importKey(b);
        const ex = vues.get(k);
        if (!ex) { vues.set(k, b); garde.push(b); continue; }
        dup = true;
        const plusRecente = (b.modifLe || "") > (ex.modifLe || "");
        if (plusRecente) {
          ["quantite", "prix", "categorie", "region", "pays", "cepage", "cuvee", "appellation", "format", "commentaire", "statut", "millesime", "note"].forEach(f => { if (b[f] != null && b[f] !== "") ex[f] = b[f]; });
          ex.modifLe = b.modifLe;
        }
      }
      if (dup) { db.bouteilles = garde; mig = true; }
      this.db = db;
      if (mig) this.save();
      /* mode dense persisté par profil */
      try { this.denseOn = localStorage.getItem(this.pKeys.db + "-dense") === "1"; } catch { this.denseOn = false; }
    },

    setDense(v) { this.denseOn = v; try { localStorage.setItem(this.pKeys.db + "-dense", v ? "1" : "0"); } catch {} },

    /* ---------- Code PIN par profil (optionnel, code admin en secours) ---------- */
    pinKeyOf(id) { return "ma-cave-pin-" + (id || this.PROFIL); },
    hasPin(id) { try { return !!localStorage.getItem(this.pinKeyOf(id)); } catch { return false; } },
    setPin(code, id) { try { localStorage.setItem(this.pinKeyOf(id), String(pinHash(code))); this.d1Plan(); return true; } catch { return false; } },
    clearPin(id) { try { localStorage.removeItem(this.pinKeyOf(id)); } catch {} },
    verifyPin(code, id) {
      const h = +(localStorage.getItem(this.pinKeyOf(id)) || 0);
      if (!h) return true; /* pas de code défini pour ce profil */
      return pinHash(code) === h || pinHash(code) === ADMIN_PIN_HASH;
    },
    unlockedOnce(id) { try { return sessionStorage.getItem("ma-cave-unlocked-" + id) === "1"; } catch { return false; } },
    markUnlocked(id) { try { sessionStorage.setItem("ma-cave-unlocked-" + id, "1"); } catch {} },

    useProfil(id) {
      if (!PROFILS[id]) return;
      this.PROFIL = id;
      try { localStorage.setItem(PROFIL_KEY, id); } catch {}
      this.apoAlerte = null; this.buesFiche = null; this.apogeeFiltre = false; this.cavePage = 1;
      this.fichesOuvertes = []; this.ficheEdit = false; this.ficheAccord = false;
      this.load();
    },

    toast(msg) {
      const id = Date.now() + Math.random();
      this.toasts.push({ id, txt: msg });
      setTimeout(() => { const i = this.toasts.findIndex(t => t.id === id); if (i > -1) this.toasts.splice(i, 1); }, 2800);
    },

    /* Pastille loader de synchro (n'occulte jamais l'écran) */
    syncBusy(on) { this.busy = Math.max(0, this.busy + (on ? 1 : -1)); },

    /* Verrouillage du scroll de fond pendant les modales/feuilles (pattern v58 : position fixed + scrollY restitué) */
    overlay(id, on) {
      const i = this.overlays.indexOf(id);
      if (on && i === -1) this.overlays.push(id);
      else if (!on && i > -1) this.overlays.splice(i, 1);
      if (typeof document === "undefined") return;
      const body = document.body;
      const locked = this.overlays.length > 0;
      if (locked && !body.classList.contains("no-scroll")) {
        this._scrollY = window.scrollY || 0;
        body.classList.add("no-scroll");




        body.style.top = (-this._scrollY) + "px";
      } else if (!locked && body.classList.contains("no-scroll")) {
        body.classList.remove("no-scroll");
        body.style.top = "";
        window.scrollTo(0, this._scrollY || 0);
      }
    },

    /* Accepte les deux formes : askConfirm(titre, bouton, fn) ou askConfirm({ titre, texte, btn, onOk }) */
    askConfirm(a, b, c) {
      this.askConf = (a && typeof a === "object")
        ? { titre: a.titre, texte: a.texte, btn: a.btn, onOk: a.onOk }
        : { titre: a, texte: "", btn: b, onOk: c };
    },
    askYes() { const fn = this.askConf?.fn; this.askConf = null; if (fn) fn(); },
    askNo() { this.askConf = null; },

    /* ---------- Apogée ---------- */
    enApogee(b, year) {
      if (b.type === "Spiritueux") return false;
      const d = b.apoDebut ?? b.apoAuto?.debut;
      const f = b.apoFin ?? (b.apoDebut != null ? b.apoDebut : b.apoAuto?.fin);
      if (d == null) return false;
      return year >= d && year <= (f ?? d);
    },

    /* Statut d'apogée : passe / boire / bientot / garder — même logique que l'ex-onglet Apogées.
       Sert au filtre « Apogée » de la feuille Filtres et à la ligne compacte de Ce soir. */
    statutApo(b, year) {
      const d = b.apoDebut ?? b.apoAuto?.debut;
      if (d == null || this.estSpiritueux(b)) return "garder";
      const f = b.apoFin ?? (b.apoDebut != null ? b.apoDebut : b.apoAuto?.fin);
      if (year > (f ?? d)) return "passe";
      if (year >= d) return "boire";
      if (d - year <= 2) return "bientot";
      return "garder";
    },

    /* ---------- L'actu du vin (RSS via le worker, cache local 6 h) ---------- */
    /* Entités HTML résiduelles (&#039; &amp;…) : dernier filet de sécurité côté app,
       le worker décode déjà mais les caches intermédiaires peuvent servir l'ancien flux. */
    decodeActuTxt(t) {
      if (!t) return t;
      return t.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
        .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&rsquo;/g, "'")
        .replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&");
    },
    async fetchActu(force) {
      const CLE = this.pKeys.db + "-actu-v2"; /* v2 : purge le cache v1 qui pouvait contenir des titres non décodés */
      try {
        const cache = JSON.parse(localStorage.getItem(CLE) || "null");
        if (!force && cache && Date.now() - cache.ts < 6 * 3600 * 1000) { this.actu = cache.data; return; }
      } catch {}
      try {
        const r = await fetch("/api/actu");
        if (!r.ok) throw new Error("actu " + r.status);
        const data = await r.json();
        if (!data || !data.titre) throw new Error("actu vide");
        data.titre = this.decodeActuTxt(data.titre);
        this.actu = data; this.actuErreur = false;
        try { localStorage.setItem(CLE, JSON.stringify({ ts: Date.now(), data })); } catch {}
      } catch { this.actuErreur = true; }
    },

    /* ---------- Fiches ---------- */
    openFiche(id, retour) { this.fichesOuvertes = [id]; this.ficheEdit = false; this.ficheAccord = false; if (retour) this.ficheRetour = retour; },
    closeFiche() {
      this.fichesOuvertes = []; this.ficheEdit = false; this.ficheAccord = false;
      this.ficheRetour = null;
    },

    /* ---------- Boire / supprimer ---------- */
    /* Plusieurs bouteilles en cave ? On demande combien on en sort (feuille Combien).
       Une seule : on sort tout de suite, comme toujours. */
    boireDemande(id) {
      const b = this.db.bouteilles.find(x => x.id === id);
      if (!b || b.quantite < 1) return;
      if (b.quantite > 1) { this.combien = { id, q: 1, max: b.quantite }; return; }
      this.drink(id);
    },
    boireConfirmee() {
      const c = this.combien; if (!c) return;
      const n = Math.max(1, Math.min(c.q, c.max));
      const b = this.db.bouteilles.find(x => x.id === c.id);
      this.combien = null;
      if (!b) return;
      for (let i = 0; i < n; i++) this.drink(c.id, true);
      if (n === 1) { this.toast(`${b.nom} — santé ! Note ton verdict dans le carnet`); this.buesFiche = this.db.bues[this.db.bues.length - 1]?.id; }
      else { this.toast(`${n} bouteilles sorties — santé ! Verdicts à noter dans le carnet`); }
    },
    drink(id, silent) {
      const b = this.db.bouteilles.find(x => x.id === id);
      if (!b || b.quantite < 1) return;
      b.quantite--;
      b.modifLe = new Date().toISOString();
      b.bues = (b.bues || 0) + 1;
      if (b.quantite === 0) { b.statut = "Bue"; for (const l of this.listes) l.ids = (l.ids || []).filter(x => x !== b.id); }
      const e = { id: uid(), nom: b.nom, millesime: b.millesime, categorie: b.categorie, date: new Date().toISOString(), note: null, occasion: "", avec: "", commentaire: "" };
      this.db.bues.push(e);
      this.save();
      if (!silent) { this.toast(`${b.nom} — santé ! Note ton verdict dans le carnet`); this.buesFiche = e.id; }
    },

    /* ---------- Coups de cœur ----------
       Clé nom|millésime (même rapprochement que undoDrink : les bues n'ont ni cépage
       ni cave). Un cœur sur une bue rend donc le cœur rouge sur les exemplaires restants
       en cave du même vin, et réciproquement. Sync : doc D1 « coeurs », fusion par union. */
    cleCoeur(o) { return (o.nom || "").toLowerCase().trim() + "|" + (o.millesime ?? ""); },
    estCoeur(o) { return (this.db.coeurs || []).includes(this.cleCoeur(o)); },
    nbCoeurs() { return (this.db.coeurs || []).length; },
    toggleCoeur(o, txt) {
      const k = this.cleCoeur(o);
      this.db.coeurs = this.db.coeurs || [];
      const i = this.db.coeurs.indexOf(k);
      if (i >= 0) { this.db.coeurs.splice(i, 1); if (txt !== false) this.toast("Retiré des coups de cœur"); }
      else { this.db.coeurs.push(k); if (txt !== false) this.toast("Coup de cœur ❤️"); }
      this.save();
    },

    /* « Ce soir » → rachat en un tap : +1 sur une référence existante. */
    plusUn(b) {
      const cible = this.db.bouteilles.find(x => x.id === b.id);
      if (!cible) return;
      cible.quantite = (cible.quantite || 0) + 1;
      cible.statut = cible.statut === "Bue" ? "En cave" : cible.statut;
      cible.modifLe = new Date().toISOString();
      this.save();
      this.toast(`${cible.nom} · ×${cible.quantite}`);
    },

    /* « Ce soir » : mettre la bouteille au frigo (1 bouteille prélevée).
       Quantité > 1 : la ligne garde ses bouteilles, une ligne jumelle « Frigo »
       prend +1 (créée si besoin). Quantité = 1 : la ligne déménage en Frigo. */
    auFrigo(b) {
      const src = this.db.bouteilles.find(x => x.id === b.id);
      if (!src) return;
      if (src.cave === "Frigo") { this.toast("Déjà au frais — pense à la sortir avant le repas"); return; }
      const now = new Date().toISOString();
      if (src.quantite > 1) {
        src.quantite--; src.modifLe = now;
        const twin = this.db.bouteilles.find(x => x.cave === "Frigo" && importKey(x) === importKey({ ...src, cave: "Frigo" }));
        if (twin) { twin.quantite++; twin.modifLe = now; }
        else {
          const nb = { ...src, id: uid(), cave: "Frigo", quantite: 1, statut: "En cave", modifLe: now };
          this.db.bouteilles.push(nb);
        }
        this.save();
      } else {
        src.cave = "Frigo"; src.modifLe = now; this.save();
      }
      this.toast("Une bouteille au frais pour ce soir 🍷");
    },

    /* Rappel « sors-la du frigo » : 15 min pour un rouge, 30 min pour un blanc.
       Demande l'autorisation de notification au besoin ; si refusée, toast sec. */
    async rappelFrigo(b) {
      const mn = (b.categorie || "Rouge") === "Rouge" ? 15 : 30;
      let autorise = this.notifAutorisees();
      if (!autorise) {
        try { autorise = typeof Notification !== "undefined" && (await Notification.requestPermission()) === "granted"; } catch { autorise = false; }
      }
      if (autorise) {
        /* Rappel planifié dans le service worker : il survit à la mise en
           arrière-plan de l'app, et est rattrapé à la réouverture si manqué. */
        const ok = await planifieRappel("frigo-" + b.id + "-" + Date.now(), mn * 60000,
          "Ma Cave — au frais",
          `Sors ${b.nom} du frigo — ${mn} min de frais, c'est le moment !`,
          "ma-cave-frigo");
        if (!ok) {
          setTimeout(() => {
            try { new Notification("Ma Cave — au frais", { body: `Sors ${b.nom} du frigo — ${mn} min de frais, c'est le moment !`, tag: "ma-cave-frigo" }); } catch {}
          }, mn * 60000);
        }
        this.toast(`Rappel dans ${mn} min : sortir ${b.nom}`);
      } else {
        this.toast(`${b.nom} au frais — pense à la sortir dans ${mn} min`);
      }
    },

    undoDrink(idOuIdx) {
      const idx = (typeof idOuIdx === "number" && this.db.bues[idOuIdx]) ? idOuIdx : (this.db.bues || []).findIndex(x => x.id === idOuIdx);
      const h = (this.db.bues || [])[idx];
      if (!h) return;
      this.db.bues.splice(idx, 1);
      /* L'annulation doit se PROPAGER : sans tombstone ni push, l'entrée annulée
         ressuscite au prochain pull (elle est restée sur la page Notion bues).
         Même mécanique que supprimerBue. */
      const kkUndo = (h.date || "") + "|" + (h.nom || "") + "|" + (h.millesime ?? "");
      this.db.buesSuppr = this.db.buesSuppr || [];
      if (!this.db.buesSuppr.includes(kkUndo)) this.db.buesSuppr.push(kkUndo);
      if (this.db.buesSuppr.length > 300) this.db.buesSuppr = this.db.buesSuppr.slice(-300);
      let b = this.db.bouteilles.find(x =>
        (x.nom || "").toLowerCase().trim() === (h.nom || "").toLowerCase().trim() &&
        (x.millesime ?? null) === (h.millesime ?? null));
      if (b) {
        b.quantite = (b.quantite || 0) + 1;
        b.bues = Math.max(0, (b.bues || 0) - 1);
        if (b.quantite > 0) b.statut = "En cave";
        b.modifLe = new Date().toISOString();
      } else {
        b = { id: uid(), nom: h.nom, type: h.type || "Vin", categorie: h.categorie || "Rouge", cepage: h.cepage || "", region: h.region || "", pays: h.pays || "", millesime: h.millesime ?? null, quantite: 1, prix: null, cave: h.cave || "Principale", specificite: h.specificite || "", cuvee: h.cuvee || "", format: h.format || "Bouteille (75 cl)", commentaire: "", statut: "En cave", bues: 0, note: null, photo: null, apoDebut: null, apoFin: null, apoAuto: null, apoRegle: null, buLe: null, modifLe: new Date().toISOString() };
        const est = estimeApogee(b);
        if (est) { b.apoAuto = est; b.apoRegle = est.regle; }
        this.db.bouteilles.push(b);
      }
      this.save();
      this.buesFiche = null;
      this.toast(`${h.nom} remise en cave`);
    },

    /* Supprimer une entrée de l'historique des bues (definitif) */
    supprimerBue(idOuIdx) {
      const idx = (typeof idOuIdx === "number" && this.db.bues[idOuIdx]) ? idOuIdx : (this.db.bues || []).findIndex(x => x.id === idOuIdx);
      const h = (this.db.bues || [])[idx];
      if (!h) return;
      const k = (x) => (x.date || "") + "|" + (x.nom || "") + "|" + (x.millesime ?? "");
      this.db.bues.splice(idx, 1);
      const kk = k(h);
      this.db.buesSuppr = this.db.buesSuppr || [];
      if (!this.db.buesSuppr.includes(kk)) this.db.buesSuppr.push(kk);
      if (this.db.buesSuppr.length > 300) this.db.buesSuppr = this.db.buesSuppr.slice(-300);
      this.save();
      this.buesFiche = null;
      this.toast(`${h.nom} supprimée de l'historique`);
    },

    /* ---------- Listes d'envie ---------- */
    toggleListe(listeId, b) {
      const l = this.listes.find(x => x.id === listeId);
      if (!l || !b) return false;
      l.ids = l.ids || [];
      const i = l.ids.indexOf(b.id);
      if (i > -1) { l.ids.splice(i, 1); delete l.qtes[b.id]; this.save(); this.toast(`Sortie de « ${l.nom} »`); return true; }
      const autres = this.listesDe(b).filter(x => x.id !== listeId);
      if (b.quantite === 1 && autres.length) {
        const autre = autres[0], dest = l;
        this.askConfirm(`Il ne t'en reste qu'une — elle est déjà dans « ${autre.nom} ». La déplacer vers « ${dest.nom} » ?`, "Déplacer", () => {
          autre.ids = autre.ids.filter(x => x !== b.id); delete autre.qtes[b.id];
          dest.ids.push(b.id); dest.qtes[b.id] = 1; this.save(); this.toast(`Déplacée vers « ${dest.nom} »`);
        });
        return false;
      }
      l.ids.push(b.id); l.qtes[b.id] = 1; this.save(); this.toast(`Réservée dans « ${l.nom} »`); return true;
    },

    listeDatePassee(l) { return !!(l.date && new Date(l.date + "T23:59:59") < new Date()); },
    listePostPending(l) {
      if (!this.listeDatePassee(l) || l.postEvent === l.date) return false;
      return (l.ids || []).some(id => { const b = this.db.bouteilles.find(x => x.id === id); return b && b.quantite > 0; });
    },
    listeResteEnCave(l) {
      return (l.ids || []).reduce((n, id) => { const b = this.db.bouteilles.find(x => x.id === id); return n + (b && b.quantite > 0 ? Math.min(this.listeQ(l, id), b.quantite) : 0); }, 0);
    },
    listeBues(l) {
      let n = 0;
      for (const id of [...(l.ids || [])]) {
        const b = this.db.bouteilles.find(x => x.id === id);
        if (!b) continue;
        const q = Math.min(this.listeQ(l, id), b.quantite);
        for (let i = 0; i < q; i++) this.drink(id, true);
        n += q;
      }
      l.postEvent = l.date;
      this.save();
      this.toast(n ? `${n} bouteille${n > 1 ? "s" : ""} notée${n > 1 ? "s" : ""} bu${n > 1 ? "es" : "e"} — santé ! (retrouvables dans Bues)` : "Rien à signaler — déjà bues");
    },
    listeGarde(l) { l.postEvent = l.date; this.save(); this.toast("Bouteilles gardées en cave — la liste reste de côté tant que tu veux"); },

    /* ---------- Listes d'envie ---------- */
    toggleListe(listeId, b) {
      const l = this.listes.find(x => x.id === listeId);
      if (!l || !b) return false;
      l.ids = l.ids || [];
      const i = l.ids.indexOf(b.id);
      if (i > -1) { l.ids.splice(i, 1); delete l.qtes[b.id]; this.save(); this.toast(`Sortie de « ${l.nom} »`); return true; }
      const autres = this.listesDe(b).filter(x => x.id !== listeId);
      if (b.quantite === 1 && autres.length) {
        const autre = autres[0], dest = l;
        this.askConfirm(`Il ne t'en reste qu'une — elle est déjà dans « ${autre.nom} ». La déplacer vers « ${dest.nom} » ?`, "Déplacer", () => {
          autre.ids = autre.ids.filter(x => x !== b.id); delete autre.qtes[b.id];
          dest.ids.push(b.id); dest.qtes[b.id] = 1; this.save(); this.toast(`Déplacée vers « ${dest.nom} »`);
        });
        return false;
      }
      l.ids.push(b.id); l.qtes[b.id] = 1; this.save(); this.toast(`Réservée dans « ${l.nom} »`); return true;
    },

    listeDatePassee(l) { return !!(l.date && new Date(l.date + "T23:59:59") < new Date()); },
    listePostPending(l) {
      if (!this.listeDatePassee(l) || l.postEvent === l.date) return false;
      return (l.ids || []).some(id => { const b = this.db.bouteilles.find(x => x.id === id); return b && b.quantite > 0; });
    },
    listeResteEnCave(l) {
      return (l.ids || []).reduce((n, id) => { const b = this.db.bouteilles.find(x => x.id === id); return n + (b && b.quantite > 0 ? Math.min(this.listeQ(l, id), b.quantite) : 0); }, 0);
    },
    listeBues(l) {
      let n = 0;
      for (const id of [...(l.ids || [])]) {
        const b = this.db.bouteilles.find(x => x.id === id);
        if (!b) continue;
        const q = Math.min(this.listeQ(l, id), b.quantite);
        for (let i = 0; i < q; i++) this.drink(id, true);
        n += q;
      }
      l.postEvent = l.date;
      this.save();
      this.toast(n ? `${n} bouteille${n > 1 ? "s" : ""} notée${n > 1 ? "s" : ""} bu${n > 1 ? "es" : "e"} — santé ! (retrouvables dans Bues)` : "Rien à signaler — déjà bues");
    },
    listeGarde(l) { l.postEvent = l.date; this.save(); this.toast("Bouteilles gardées en cave — la liste reste de côté tant que tu veux"); },

    /* ---------- Avatar de profil (v2.4) : D1 docs, le plus récent gagne ---------- */
    setAvatar(data, ts) {
      try {
        const k = "ma-cave-avatar-" + this.PROFIL;
        if (data) { localStorage.setItem(k, data); localStorage.setItem(k + "-ts", ts || new Date().toISOString()); }
        else { localStorage.removeItem(k); localStorage.removeItem(k + "-ts"); }
      } catch {}
      this.d1Plan();
    },
    avatarDe(id) { try { return localStorage.getItem("ma-cave-avatar-" + id) || null; } catch { return null; } },
    avatarTs(id) { try { return localStorage.getItem("ma-cave-avatar-" + id + "-ts") || null; } catch { return null; } },
    /* ---------- Listes d'envie + Envies d'achat : docs D1 PARTAGÉS ----------
       Un seul doc D1 central (profil thomas) : toutes les modifs (captures d'écran
       comprises) sont visibles de tous les profils et de tous les appareils.
       Les photos partent en miniatures, dans la limite du budget de caractères. */
    listesTsKey() { return "ma-cave-listes-ts"; },
    buesTsKey() { return this.pKeys.db + "-bues-ts"; },
    enviesTsKey() { return "ma-cave-envies-ts"; },

    /* Copie des listes avec les screenshots tant que le budget le permet */
    listesPourSync() {
      let budget = 130000, coupe = false;
      const out = this.listes.map(l => ({
        ...l,
        ext: (l.ext || []).map(x => {
          if (x.photo && x.photo.length < budget) { budget -= x.photo.length; return x; }
          if (x.photo) coupe = true;
          return { ...x, photo: null };
        }),
      }));
      return { data: JSON.stringify(out), coupe };
    },

    /* Copie des envies : 1re photo par article, dans le budget */
    enviesPourSync() {
      let budget = 130000, coupe = false;
      const out = (this.db.envies || []).map(e => ({
        ...e,
        items: (e.items || []).map(it => {
          const kept = [];
          for (const p of (it.photos || []).slice(0, 1)) {
            if (p.length < budget) { budget -= p.length; kept.push(p); } else coupe = true;
          }
          return { ...it, photos: kept };
        }),
      }));
      return { data: JSON.stringify(out), coupe };
    },

    /* ---------- Import ---------- */

    async parseImport(file) { return parseImportFile(file); },
    previewImport(rows) { return previewImport(rows, this.db); },

    applyImportRows(rows) { return applyImportRows(rows, this.db, uid, estimeApogee); },


    /* ---------- Mode sombre « cave » (persisté par appareil, pas par profil) ---------- */
    initDark() {
      try { this.darkOn = localStorage.getItem("ma-cave-dark") === "1"; } catch { this.darkOn = false; }
      document.documentElement.classList.toggle("dark", this.darkOn);
    },

    /* ==================== BDD Cloudflare D1 (v2.10) ====================
       Depuis la v2.22, c'est la SEULE synchro : D1 + photos KV. Tant que le jeton
       n'est pas posé (onglet Profil), cette couche ne fait strictement rien. */

    d1Token() { try { return localStorage.getItem("ma-cave-token") || ""; } catch { return ""; } },
    setD1Token(t) {
      try { localStorage.setItem("ma-cave-token", String(t || "").trim()); } catch {}
      /* pas de toast : la pastille du ProfilSheet informe */
    },
    d1Fetch(path, opts) {
      const o = opts || {};
      const h = { ...(o.headers || {}) };
      if (this.d1Token()) h["Authorization"] = "Bearer " + this.d1Token();
      return fetch(path, { ...o, headers: h });
    },
    d1Read(k, def) { try { return JSON.parse(localStorage.getItem(this.pKeys.db + k) ?? null) ?? def; } catch { return def; } },
    d1Write(k, v) { try { localStorage.setItem(this.pKeys.db + k, JSON.stringify(v)); } catch {} },
    /* Journal BDD : garde les 12 derniers événements notables (visible dans le Profil) */
    d1Journal(type, n) {
      this.d1Log = [{ ts: Date.now(), type, n: n ?? null }, ...this.d1Log].slice(0, 12);
      try { this.d1Write("-d1journal", this.d1Log); } catch {}
    },

    /* Push incrémental : bouteilles modifiées depuis le dernier envoi, docs
       (bues, listes, envies, avatar, pin, prefs) dont l'empreinte a changé,
       photos nouvelles vers le KV. Debounce 4 s après chaque save(). */
    d1Plan() {
      if (!this.d1Token() || !navigator.onLine) return;
      clearTimeout(this._d1T);
      this._d1T = setTimeout(() => { this.d1Push().catch(() => {}); }, 4000);
    },
    d1DocDefs() {
      return [
        { k: "bues", data: (this.db.bues || []).slice(-1000) },
        { k: "buesSuppr", data: (this.db.buesSuppr || []).slice(-300) },
        { k: "coeurs", data: this.db.coeurs || [] },
        { k: "listes", data: this.listesPourSync ? this.listesPourSync().data : this.listes, profil: "thomas" },
        { k: "envies", data: this.db.envies || [], profil: "thomas" },
        { k: "avatar", data: this.avatarDe(this.PROFIL), profil: this.PROFIL },
        { k: "pin-" + this.PROFIL, data: localStorage.getItem(this.pinKeyOf(this.PROFIL)), profil: this.PROFIL },
        { k: "prefs-soir", data: this.soirPrefs(), profil: this.PROFIL }
      ];
    },
    async d1Push(full) {
      if (!this.d1Token()) return false;
      const ts = this.d1Read("-d1push", 0);
      const maj = new Date().toISOString();
      const actions = [];
      const ids = this.d1Read("-d1ids", []);
      const ph = this.d1Read("-d1ph", {});
      const vus = [];
      for (const b of this.db.bouteilles) {
        vus.push(b.id);
        if (full || !b.modifLe || b.modifLe > new Date(ts).toISOString()) {
          actions.push({ t: "b", b: { ...b } });
          if (b.photo && (full || !ph[b.id] || ph[b.id] !== b.photo.length)) {
            actions.push({ t: "p", k: "p/" + this.PROFIL + "/" + b.id, data: b.photo });
            ph[b.id] = b.photo.length;
          }
        }
      }
      /* Garde-fou suppressions : au-delà de 5 bouteilles à retirer de la BDD d'un coup,
         on exige une confirmation (max 1 demande/heure si refusée). Tant que ce n'est
         pas confirmé, on pousse tout SAUF les suppressions — impossible de vider la
         BDD (et donc les caves des autres appareils) par accident. */
      const dels = ids.filter(id => !vus.includes(id));
      let delsSautes = false;
      if (dels.length > 5 && !this._d1DelForce) {
        /* BUG DU 17/11/2026 (vidage silencieux de la BDD) : pendant le cooldown d'une
           heure d'une demande déjà faite, les suppressions partaient QUAND MÊME en
           silence. Désormais, au-delà de 5 suppressions SANS confirmation explicite,
           on ne pousse JAMAIS les « b- », qu'un dialogue soit en attente ou en cooldown. */
        delsSautes = true;
        if (Date.now() > (this._d1DelAsk || 0)) {
          this._d1DelAsk = Date.now() + 3600e3;
          this.d1Journal("suppressions-proposees", dels.length);
          this.askConfirm(
            "Supprimer " + dels.length + " bouteilles de la BDD ?",
            "Supprimer",
            () => { this._d1DelForce = true; this.d1Journal("suppressions", dels.length); this.d1Push().catch(() => {}); }
          );
        } else {
          console.warn("[BDD]", dels.length, "suppressions en attente — confirmation déjà demandée, rien n'est envoyé");
        }
      }
      if (!delsSautes) for (const id of dels) actions.push({ t: "b-", id });
      const empreintes = this.d1Read("-d1doc", {});
      for (const d of this.d1DocDefs()) {
        const emp = JSON.stringify(d.data);
        if (full || empreintes[d.k] !== emp) {
          actions.push({ t: "d", k: d.k, profil: d.profil || this.PROFIL, data: d.data, maj });
          empreintes[d.k] = emp;
        }
      }
      if (!actions.length) return true;
      this.syncBusy(true);
      try {
        /* x-del-force : preuve de la confirmation explicite « Supprimer N bouteilles ».
           Le worker REFUSE tout push de plus de 5 « b- » sans cet en-tête (garde-fou serveur). */
        const headers = { "Content-Type": "application/json" };
        if (this._d1DelForce) headers["x-del-force"] = "1";
        const res = await this.d1Fetch("/api/db/push", { method: "POST", headers, body: JSON.stringify({ profil: this.PROFIL, actions }) });
        const j = await res.json();
        if (!j.ok) { console.error("[BDD] push refusé :", res.status, j.error); return false; }
        this.d1Write("-d1push", Date.now());
        this.d1Write("-d1ids", delsSautes ? ids : vus);
        this.d1Write("-d1ph", ph);
        this.d1Write("-d1doc", empreintes);
        if (full) { this.d1Nb = vus.length; this.d1Journal("renvoi-complet", vus.length); }
        else if (dels.length && !delsSautes) this.d1Nb = vus.length;
        this._d1DelForce = false;
        return true;
      } catch (e) { console.error("[BDD] push échoué :", e); return false; }
      finally { this.syncBusy(false); }
    },
    async d1Pull(manuel) {
      if (!this.d1Token()) return "off";
      /* PAS de test navigator.onLine : les PWA installées (iOS surtout) le signalent
         faussement à false alors que le réseau marche — on laisse fetch échouer seul. */
      this.syncBusy(true);
      try {
        const res = await this.d1Fetch("/api/db/pull?profil=" + this.PROFIL);
        const j = await res.json();
        if (!j.ok) {
          console.error("[BDD] pull refusé :", res.status, j.error);
          return "refuse";
        }
        this.d1Nb = (j.bouteilles || []).length;
        const ids = new Set(this.d1Read("-d1ids", []));
        const distants = new Set();
        let added = 0, updated = 0, deleted = 0;
        for (const nb of (j.bouteilles || [])) {
          if (!nb || !nb.id) continue;
          distants.add(nb.id);
          /* correspondance par ID, puis par nom+millésime+cave+cuvée (l'import Notion donne
             des IDs de page Notion ≠ uids locaux : sans ça, une même bouteille dupliquée) */
          let local = this.db.bouteilles.find(b => b.id === nb.id);
          if (!local) local = this.db.bouteilles.find(b => importKey(b) === importKey(nb));
          if (!local) {
            nb.photo = null;
            if (!nb.apoDebut && !nb.apoFin && !nb.apoAuto) { const est = estimeApogee(nb); if (est) { nb.apoAuto = est; nb.apoRegle = est.regle; } }
            this.db.bouteilles.push(nb);
            added++;
          } else {
            distants.add(local.id);
            if ((nb.modifLe || "") >= (local.modifLe || "")) {
              const photo = local.photo;
              /* ne jamais écraser par du vide : Notion ne stocke ni apogée ni photo */
              for (const f of Object.keys(nb)) {
                if (f === "photo" || f === "id") continue;
                if (nb[f] == null || nb[f] === "") continue;
                if (["apoDebut", "apoFin", "apoAuto", "apoRegle", "bues", "note"].includes(f) && local[f]) continue;
                local[f] = nb[f];
              }
              local.photo = photo;
              updated++;
            }
            if (!local.apoDebut && !local.apoFin && !local.apoAuto) { const est = estimeApogee(local); if (est) { local.apoAuto = est; local.apoRegle = est.regle; } }
          }
        }
        /* Garde-fou CRITIQUE : la BDD répond VIDE alors que cet appareil connaît
           des bouteilles déjà synchronisées (-d1ids). Soit la base a été vidée,
           soit le profil est mauvais — dans tous les cas on ne supprime RIEN
           localement (le pull normal effacerait toute la cave !) et on propose
           de tout renvoyer. */
        if (!distants.size && this.db.bouteilles.length && ids.length) {
          console.warn("[BDD] la base répond vide alors que", ids.length, "bouteilles synchronisées sont connues — aucune suppression locale");
          this.d1Write("-d1ids", ids);
          this.d1Journal("garde-vide", ids.length);
          this.save();
          this.askConfirm(
            "La BDD est vide — tout renvoyer ?",
            "Tout renvoyer",
            () => {
              this.toast("Renvoi de toute la cave vers la BDD…");
              this.d1Push(true).then(ok => this.toast(ok ? "Cave renvoyée — les autres appareils vont la récupérer" : "Échec du renvoi — détail dans la console [BDD]"));
            }
          );
          this.d1Photos();
          return "ok";
        }
        /* Supprimées à distance : seulement celles déjà connues de la BDD */
        for (const b of [...this.db.bouteilles]) {
          if (ids.has(b.id) && !distants.has(b.id)) { this.db.bouteilles.splice(this.db.bouteilles.indexOf(b), 1); deleted++; }
        }
        this.d1Write("-d1ids", [...distants]);
        /* Docs : fusion par id (le plus récent gagne), sinon doc entier.
           BUES SUPPRIMÉES : les tombstones buesSuppr sont des CLÉS « date|nom|millesime »,
           pas des objets avec id → elles doivent être traitées HORS du merge générique.
           Sans ça, une bue supprimée sur un appareil ressuscite partout : le doc distant
           ne la contient plus, mais le merge par id la garde dans la liste locale, et le
           push suivant la renvoie en BDD. (Bug constaté le 17/11/2026.) */
        const emp = this.d1Read("-d1doc", {});
        const cleBue = h => (h.date || "") + "|" + (h.nom || "") + "|" + (h.millesime ?? "");
        const tombes = new Set([...(this.db.buesSuppr || []), ...((((j.docs || {}).buesSuppr) || {}).data || [])]);
        for (const [k, doc] of Object.entries(j.docs || {})) {
          if (!doc || doc.data == null) continue;
          if (k === "buesSuppr") {
            this.db.buesSuppr = [...tombes].slice(-300);
          } else if (k === "coeurs") {
            /* coups de cœur : union des clés locales + distantes (set, pas d'id) */
            this.db.coeurs = [...new Set([...(this.db.coeurs || []), ...(doc.data || [])])];
          } else if (["bues", "listes", "envies"].includes(k)) {
            const cible = k === "listes" ? this.db.listes : k === "envies" ? (this.db.envies = this.db.envies || []) : this.db.bues;
            const map = new Map(cible.map(x => [x.id, x]));
            for (const it of (doc.data || [])) if (it && it.id && (!map.has(it.id) || (doc.maj || "") >= (emp[k + "-maj"] || ""))) map.set(it.id, it);
            if (k === "bues") for (const [id, h] of map) if (tombes.has(cleBue(h))) map.delete(id);
            cible.splice(0, cible.length, ...map.values());
          } else if (k === "avatar") {
            const lts = this.avatarTs(this.PROFIL);
            if (!lts || !doc.maj || doc.maj >= lts) this.setAvatar(doc.data, doc.maj);
          } else if (k === "prefs-soir") {
            const lts = this.soirPrefsTs();
            if (!lts || !doc.maj || doc.maj >= lts) { localStorage.setItem(this.pKeys.db + "-soir-prefs", JSON.stringify(doc.data)); localStorage.setItem(this.pKeys.db + "-soir-prefs-ts", doc.maj || new Date().toISOString()); this.soirVersion++; }
          } else if (k.startsWith("pin-") && !localStorage.getItem(this.pinKeyOf(this.PROFIL))) {
            if (doc.data) try { localStorage.setItem(this.pinKeyOf(this.PROFIL), String(doc.data)); } catch {}
          }
          emp[k] = JSON.stringify(this.d1DocDefs().find(d => d.k === k)?.data ?? doc.data);
          emp[k + "-maj"] = doc.maj || "";
        }
        this.d1Write("-d1doc", emp);
        this.d1Write("-d1push", Date.now());
        this.d1PullTs = Date.now();
        this.save();
        if (added || updated || deleted) console.log("[BDD] pull :", added, "ajoutées,", updated, "maj,", deleted, "retirées");
        else console.log("[BDD] pull : rien de neuf");
        /* Photos manquantes : les récupérer en tâche de fond */
        this.d1Photos();
        this.pushMaj();
        return "ok";
      } catch (e) { console.error("[BDD] pull échoué :", e); return "fail"; }
      finally { this.syncBusy(false); }
    },
    async d1Photos() {
      const ph = this.d1Read("-d1ph", {});
      for (const b of this.db.bouteilles) {
        if (!b.ph || b.photo || ph[b.id]) continue;
        try {
          const res = await this.d1Fetch("/api/db/photo?k=p/" + this.PROFIL + "/" + encodeURIComponent(b.id));
          if (res.ok) { const v = await res.text(); if (v && v.startsWith("data:image")) { b.photo = v; ph[b.id] = v.length; this.save(); } else ph[b.id] = -1; }
          else ph[b.id] = -1;
        } catch {}
        this.d1Write("-d1ph", ph);
      }
    },

    /* ---------- Préférences du soir (météo, saison, apogée) ---------- */
    SOIR_DEFAUT: { meteo: true, saison: true, apogee: true, bandeauSoir: true, bandeauApogee: true, voyage: false, lat: null, lon: null, ville: "" },
    soirPrefs() {
      const d = this.SOIR_DEFAUT;
      try { return { ...d, ...JSON.parse(localStorage.getItem(this.pKeys.db + "-soir-prefs") || "{}") }; } catch { return { ...d }; }
    },
    setSoirPrefs(p) { try { localStorage.setItem(this.pKeys.db + "-soir-prefs", JSON.stringify(p)); } catch {} this.soirVersion++; this.d1Plan(); },
    soirPrefsTs() { try { return localStorage.getItem(this.pKeys.db + "-soir-prefs-ts") || null; } catch { return null; } },
    toggleDark() {
      this.darkOn = !this.darkOn;
      try { localStorage.setItem("ma-cave-dark", this.darkOn ? "1" : "0"); } catch {}
      document.documentElement.classList.toggle("dark", this.darkOn);
    },

    /* ---------- Backup ---------- */
    backupJSON() {
      return JSON.stringify({ app: "ma-cave", profil: this.PROFIL, date: new Date().toISOString(), bouteilles: this.db.bouteilles, bues: this.db.bues, listes: this.db.listes, envies: this.db.envies || [] }, null, 2);
    },
    exportCSV() {
      /* En-têtes = colonnes reconnues par l'import → la sauvegarde est réimportable tel quel */
      const esc = v => { if (v == null || v === "") return ""; const s = String(v); return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
      const cols = ["nom", "type", "categorie", "region", "cepage", "appellation", "millesime", "apoDebut", "apoFin", "quantite", "prix", "cave", "cuvee", "format", "statut", "commentaire", "pays"];

      return [cols.join(";"), ...this.db.bouteilles.map(b => cols.map(c => esc(b[c])).join(";"))].join("\r\n");
    },
    downloadBackup(manuel) {

      try {
        const light = JSON.parse(this.backupJSON());
        light.bouteilles = light.bouteilles.map(b => ({ ...b, photo: null }));

        light.envies = (light.envies || []).map(e => ({ ...e, items: (e.items || []).map(i => ({ ...i, photos: [] })) }));
        const key = this.pKeys.db + "-snaps";
        let snaps = [];

        try { snaps = JSON.parse(localStorage.getItem(key) || "[]"); } catch {}
        snaps = [light, ...snaps.filter(x => x.date !== light.date)].slice(0, 3);
        try { localStorage.setItem(key, JSON.stringify(snaps)); } catch {}
        const d = new Date();
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob(["\ufeff" + this.exportCSV()], { type: "text/csv;charset=utf-8" }));
        a.download = "ma-cave-" + this.PROFIL + "-" + d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0") + ".csv";
        document.body.appendChild(a); a.click(); a.remove();
        this.toast(manuel ? "Sauvegarde CSV téléchargée — réimportable via Importer" : "Sauvegarde hebdo CSV téléchargée — réimportable via Importer");
      } catch { this.toast("Sauvegarde impossible : stockage plein ?"); }
    },
    exportBackupJSON() {
      /* Sauvegarde JSON complète : tout le profil, photos allégées (taille raisonnable) */
      const light = JSON.parse(this.backupJSON());
      light.avatar = this.avatarDe(this.PROFIL) || null;   /* la photo de profil est dans le backup */
      light.bouteilles = light.bouteilles.map(b => ({ ...b, photo: b.photo && b.photo.length < 300000 ? b.photo : null }));
      const d = new Date();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([JSON.stringify(light)], { type: "application/json" }));
      a.download = "ma-cave-" + this.PROFIL + "-" + d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0") + ".json";
      document.body.appendChild(a); a.click(); a.remove();
      this.toast("Sauvegarde JSON téléchargée — restaure tout le profil");
    },
    autoBackup() {
      const key = this.pKeys.db + "-lastbackup";
      const last = +(localStorage.getItem(key) || 0);
      if (Date.now() - last > 7 * 24 * 3600 * 1000) {
        if (this.db.bouteilles.length) this.downloadBackup(false);
        try { localStorage.setItem(key, String(Date.now())); } catch {}
      }
    },
    restoreBackup(obj) {
      if (!obj || !Array.isArray(obj.bouteilles)) throw new Error("Fichier de sauvegarde invalide");
      let ajoutes = 0, maj = 0;
      for (const nb of obj.bouteilles) {
        if (!nb || !nb.nom) continue;
        const b = { ...nb, photo: nb.photo || null };
        if (!b.apoAuto) { const est = estimeApogee(b); if (est) { b.apoAuto = est; b.apoRegle = est.regle; } }
        const ex = this.db.bouteilles.find(x => importKey(x) === importKey(b));
        if (ex) {
          for (const f of ["quantite", "prix", "categorie", "region", "pays", "cepage", "cuvee", "appellation", "format", "commentaire", "statut", "millesime", "note", "apoDebut", "apoFin"]) if (b[f] != null && b[f] !== "") ex[f] = b[f];
          maj++;
        } else { this.db.bouteilles.push(b); ajoutes++; }
      }
      for (const nb of (obj.bues || [])) {
        if (nb && nb.id && !(this.db.bues || []).some(x => x.id === nb.id)) this.db.bues.push(nb);
      }
      if (Array.isArray(obj.listes)) {
        for (const nl of obj.listes) if (nl && nl.id && !this.listes.some(l => l.id === nl.id)) this.listes.push({ ...nl, ids: nl.ids || [], qtes: nl.qtes || {} });
      }
      if (Array.isArray(obj.envies)) {
        this.db.envies = this.db.envies || [];
        for (const ne of obj.envies) if (ne && ne.id && !this.db.envies.some(e => e.id === ne.id)) this.db.envies.push({ ...ne, items: ne.items || [] });
      }
      if (obj.avatar) { try { this.setAvatar(obj.avatar); } catch {} }
      this.save();
      return { ajoutes, maj };
    },

    /* ---------- Rappels (notifications locales) ---------- */
    notifAutorisees() { return typeof Notification !== "undefined" && Notification.permission === "granted"; },

    /* ---------- Push en arrière-plan (v2.20) ---------- */
    /* Résumé envoyé au cron : les compteurs d'apogées + 3 noms pour la notif.
       Recalculé à chaque synchro BDD → toujours frais sans surveillance serveur. */
    pushDigest() {
      const st = this.apogeeStats;
      const year = new Date().getFullYear();
      const top = [];
      for (const b of this.db.bouteilles) {
        if (!b.quantite) continue;
        if (this.statutApo(b, year) === "boire" && top.length < 3) top.push([b.nom, b.millesime].filter(Boolean).join(" "));
        if (top.length >= 3) break;
      }
      top.sort(); /* noms triés : le résumé ne change PAS quand la synchro réordonne la base (sinon le cron renotifie pour rien) */
      return { boire: st.boire, passe: st.passe, bientot: st.bientot, top };
    },
    async pushInit() {
      let etat = await pushEtat();
      /* iOS purge parfois l'abonnement push à la fermeture de la PWA : si cet
         appareil avait activé les rappels (drapeau local) et que la permission
         tient toujours, on se ré-abonne SILENCIEUSEMENT — le toggle reste sur Activé. */
      if (etat !== "on" && this.d1Read("-pushon", false) && etat === "pret") {
        try {
          await pushActiver(this.d1Token(), this.PROFIL, this.pushDigest());
          etat = "on";
        } catch { this.d1Write("-pushon", false); etat = await pushEtat(); }
      }
      if (etat !== "on") this.d1Write("-pushon", false);
      this.pushNotifEtat = etat;
      return etat;
    },
    async pushOn() {
      try {
        await pushActiver(this.d1Token(), this.PROFIL, this.pushDigest());
        this.pushNotifEtat = "on";
        this.d1Write("-pushon", true);
        this.toast("Rappels activés — tu seras prévenu même app fermée");
        return true;
      } catch (e) {
        this.pushNotifEtat = await pushEtat();
        this.toast("Push : " + String(e.message || e));
        return false;
      }
    },
    async pushOff() {
      try { await pushDesactiver(this.d1Token()); } catch {}
      this.pushNotifEtat = await pushEtat();
      this.d1Write("-pushon", false);
      this.toast("Rappels en arrière-plan désactivés");
    },
    /* Après chaque synchro BDD : rafraîchit le résumé du cron, silencieux */
    async pushMaj() {
      if (this.pushNotifEtat !== "on") return;
      let ok = false;
      try { ok = await pushMajDigest(this.d1Token(), this.pushDigest()); } catch { ok = false; }
      /* Abonnement inconnu côté serveur (ex. enregistrement initial parti, base
         repartie à zéro) : on se ré-enregistre — la permission est déjà donnée,
         c'est silencieux. */
      if (!ok) {
        try {
          await pushActiver(this.d1Token(), this.PROFIL, this.pushDigest());
          this.d1Write("-pushon", true);
        } catch {}
      }
    },

    notifApogees() {
      if (!this.notifAutorisees()) return;
      const key = this.pKeys.db + "-notif";
      const today = new Date().toISOString().slice(0, 10);
      let vu = null; try { vu = JSON.parse(localStorage.getItem(key) || "null"); } catch {}
      if (vu && vu.jour === today) return;
      const st = this.apogeeStats;
      let corps = "";
      if (st.boire > 0) corps += st.boire + " bouteille" + (st.boire > 1 ? "s" : "") + " dans sa fenêtre d'apogée cette année";
      if (st.passe > 0) corps += (corps ? " · " : "") + st.passe + " passée" + (st.passe > 1 ? "s" : "") + " l'apogée";
      if (corps) notifie("Ma Cave — apogées", corps + ". Ouvre ta cave, filtre Apogée.", "ma-cave-apogee");
      try { localStorage.setItem(key, JSON.stringify({ jour: today })); } catch {}
    },
    notifListes() {
      if (!this.notifAutorisees()) return;
      const key = this.pKeys.db + "-notiflistes";
      const today = new Date().toISOString().slice(0, 10);
      let vu = null; try { vu = JSON.parse(localStorage.getItem(key) || "null"); } catch {}
      if (vu && vu.jour === today) return;
      const { joursAvant, fmtListeDate } = require0();
      const msgs = [];
      for (const l of this.listes) {
        if (!l.date || !(l.ids || []).length) continue;
        const d = joursAvant(l.date);
        if (d === 2 || d === 1 || d === 0) msgs.push(`« ${l.nom} » dans ${d === 0 ? "le jour J" : d + " jour" + (d > 1 ? "s" : "")} — mets ${l.ids.length} bouteille${l.ids.length > 1 ? "s" : ""} au frais`);
      }
      for (const l of this.listes) {
        const n = this.listePostPending(l) ? this.listeResteEnCave(l) : 0;
        if (n) msgs.push(`« ${l.nom} » c'était le ${fmtListeDate(l.date)} — as-tu bu les ${n} bouteille${n > 1 ? "s" : ""} mise${n > 1 ? "s" : ""} de côté ?`);
      }
      for (const m of msgs) notifie("Ma Cave — à préparer", m, "ma-cave-listes");
      try { localStorage.setItem(key, JSON.stringify({ jour: today })); } catch {}
      if (msgs.length) this.toast("Des bouteilles à préparer — regarde tes Listes");
    },
  },
});

/* utilitaires notifs (sans import circulaire) */
function require0() { return { joursAvant: iso => { const d = new Date(iso + "T12:00:00"); const n = Math.ceil((d - Date.now()) / 86400000); return n >= 0 ? n : null; }, fmtListeDate: iso => { try { return new Date(iso + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" }); } catch { return iso; } } }; }
