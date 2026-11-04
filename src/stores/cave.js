/* Ma Cave — store Pinia : modèle, persistance, profils, synchro Notion (cave + avatars + listes) */
import { defineStore } from "pinia";
import { PROFILS, FORMATS, CATS, CAT_COLORS, uid } from "../config.js";
import { estimeApogee } from "../lib/apogee.js";
import { importKey, previewImport, applyImportRows, parseImportFile } from "../lib/import.js";
import { ilYA } from "../util.js";
import { notifie, planifieRappel, rattrapeRappels } from "../lib/notifs.js";

/* File unique des appels Notion (voir sendNotion) */
let _notionChain = Promise.resolve();

const PROFIL_KEY = "ma-cave-profil";
const ADMIN_PIN_HASH = 3785925479; /* djb2 du code admin de secours (débloque n'importe quel profil) */
function pinHash(s) { let x = 5381; for (const c of s) x = ((x * 33) ^ c.charCodeAt(0)) >>> 0; return x; }

export const useCave = defineStore("cave", {
  state: () => ({
    PROFIL: "thomas",
    db: { bouteilles: [], bues: [], buesSuppr: [], listes: [], filters: { q: "", cat: "Toutes", cave: "Toutes", region: "Toutes", tri: "", etage: "Tout" } },
    denseOn: false,
    TAB: "cave",
    cavePage: 1,
    apoAlerte: null,        /* null | "boire" | "bientot" | "passe" (onglet Apogées) */
    apogeeFiltre: false,    /* filtre « à boire cette année » (bandeau Cave) */
    derniereRaison: null, /* raison humaine du dernier échec de synchro */
    soirVersion: 0,         /* incrémenté quand les préférences du soir changent */
    fichesOuvertes: [],
    ficheEdit: false,
    ficheAccord: false,
    ficheRetour: null,      /* route d'origine quand la fiche est ouverte depuis Accords/Bues */
    buesFiche: null,        /* index dans db.bues de la fiche « bue » ouverte */
    askConf: null,          /* popin de confirmation maison */
    enviePrefill: null,     /* article d'envie → pré-remplir le formulaire d'ajout au retour sur la Cave */
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
      ? { db: "ma-cave-v1", queue: "ma-cave-queue", pull: "ma-cave-lastpull" }
      : { db: "ma-cave-v1-" + this.PROFIL, queue: "ma-cave-queue-" + this.PROFIL, pull: "ma-cave-lastpull-" + this.PROFIL }; },
    listes() { if (!Array.isArray(this.db.listes)) this.db.listes = []; return this.db.listes; },
    listesDe: (s) => (b) => s.listes.filter(l => (l.ids || []).includes(b.id)),
    nbReservees: (s) => s.listes.reduce((n, l) => n + (l.ids || []).length, 0),
    /* Envies d'achat : bouteilles notées mais pas encore achetées */
    nbEnvies: (s) => (s.db.envies || []).reduce((n, e) => n + (e.items || []).filter(i => !i.ajouteLe).length, 0),
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
    save() { try { localStorage.setItem(this.pKeys.db, JSON.stringify(this.db)); } catch {} },

    load() {
      let db = null;
      try { const raw = localStorage.getItem(this.pKeys.db); db = raw ? JSON.parse(raw) : null; } catch { db = null; }
      if (!db || !Array.isArray(db.bouteilles)) db = { bouteilles: [], bues: [], buesSuppr: [], listes: [], filters: { q: "", cat: "Toutes", cave: "Toutes", region: "Toutes", tri: "", etage: "Tout" } };
      db.filters = db.filters || { q: "", cat: "Toutes", cave: "Toutes", region: "Toutes", tri: "", etage: "Tout" };
      db.filters.tri = db.filters.tri || "";
      db.filters.region = db.filters.region || "Toutes";
      db.filters.etage = db.filters.etage || "Tout"; /* étage de cave : Vin / Spiritueux / Tout */
      if (!Array.isArray(db.listes)) db.listes = [];
      for (const l of db.listes) { l.qtes = l.qtes || {}; l.ids = l.ids || []; l.ext = l.ext || []; }
      db.envies = db.envies || [];
      for (const e of db.envies) { e.items = e.items || []; }
      db.bues = db.bues || [];
      db.bues.forEach(h => { if (!h.id) h.id = uid(); });   /* id unique : l'historique affiché est trié par date, l'index ne suffit plus */
      db.buesSuppr = db.buesSuppr || [];   /* clés des bues supprimées (propagées via Notion) */
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
    setPin(code, id) { try { localStorage.setItem(this.pinKeyOf(id), String(pinHash(code))); return true; } catch { return false; } },
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
      this.apoAlerte = null; this.buesFiche = null; this.TAB = "cave"; this.apogeeFiltre = false; this.cavePage = 1;
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

    /* ---------- Fiches ---------- */
    openFiche(id, retour) { this.fichesOuvertes = [id]; this.ficheEdit = false; this.ficheAccord = false; if (retour) this.ficheRetour = retour; if (this.TAB !== "cave") this.TAB = "cave"; },
    closeFiche() {
      this.fichesOuvertes = []; this.ficheEdit = false; this.ficheAccord = false;
      this.ficheRetour = null;
    },

    /* ---------- Boire / supprimer ---------- */
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
      this.syncBues();
      if (!silent) { this.toast(`${b.nom} — santé ! Note ton verdict dans le carnet`); this.syncNotion({ action: "drink", bouteille: b }); this.buesFiche = e.id; }
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
        if (twin) { twin.quantite++; twin.modifLe = now; this.syncNotion({ action: "drink", bouteille: twin }); }
        else {
          const nb = { ...src, id: uid(), cave: "Frigo", quantite: 1, statut: "En cave", modifLe: now };
          this.db.bouteilles.push(nb);
          this.syncNotion({ action: "add", bouteille: nb });
        }
        this.save();
        this.syncNotion({ action: "drink", bouteille: src });
      } else {
        src.cave = "Frigo"; src.modifLe = now; this.save();
        this.syncNotion({ action: "move", bouteille: src, ancienneCave: "Principale" });
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
      this.syncNotion({ action: "add", bouteille: b });
      this.syncBues();   /* pousse la liste sans l'entrée annulée + les tombstones */
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
      this.syncBues();
    },

    /* ---------- Listes d'envie ---------- */
    toggleListe(listeId, b) {
      const l = this.listes.find(x => x.id === listeId);
      if (!l || !b) return false;
      l.ids = l.ids || [];
      const i = l.ids.indexOf(b.id);
      if (i > -1) { l.ids.splice(i, 1); delete l.qtes[b.id]; this.save(); this.syncListes(); this.toast(`Sortie de « ${l.nom} »`); return true; }
      const autres = this.listesDe(b).filter(x => x.id !== listeId);
      if (b.quantite === 1 && autres.length) {
        const autre = autres[0], dest = l;
        this.askConfirm(`Il ne t'en reste qu'une — elle est déjà dans « ${autre.nom} ». La déplacer vers « ${dest.nom} » ?`, "Déplacer", () => {
          autre.ids = autre.ids.filter(x => x !== b.id); delete autre.qtes[b.id];
          dest.ids.push(b.id); dest.qtes[b.id] = 1; this.save(); this.syncListes(); this.toast(`Déplacée vers « ${dest.nom} »`);
        });
        return false;
      }
      l.ids.push(b.id); l.qtes[b.id] = 1; this.save(); this.syncListes(); this.toast(`Réservée dans « ${l.nom} »`); return true;
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
      this.save(); this.syncListes();
      this.toast(n ? `${n} bouteille${n > 1 ? "s" : ""} notée${n > 1 ? "s" : ""} bu${n > 1 ? "es" : "e"} — santé ! (retrouvables dans Bues)` : "Rien à signaler — déjà bues");
    },
    listeGarde(l) { l.postEvent = l.date; this.save(); this.syncListes(); this.toast("Bouteilles gardées en cave — la liste reste de côté tant que tu veux"); },

    /* ---------- Synchro Notion : cave (au fil de l'eau + file d'attente) ---------- */
    queueAdd(payload) {
      try {
        const q = JSON.parse(localStorage.getItem(this.pKeys.queue) || "[]");
        q.push(payload);
        if (q.length > 100) q.splice(0, q.length - 100);
        localStorage.setItem(this.pKeys.queue, JSON.stringify(q));
      } catch {}
    },
    queueLen() { try { return JSON.parse(localStorage.getItem(this.pKeys.queue) || "[]").length; } catch { return 0; } },
    markSync() { try { localStorage.setItem(this.pKeys.db + "-synclast", String(Date.now())); } catch {} },
    syncLastTxt() { const l = +(localStorage.getItem(this.pKeys.db + "-synclast") || 0); return l ? "il y a " + ilYA(l) : "jamais"; },

    /* Tous les appels Notion passent ici : sérialisés et espacés pour éviter
       le 429 « Too many requests by a single worker » de Cloudflare,
       avec une relance après pause si 429 quand même. */
    sendNotion(payload) {
      const url = "/api/sync-notion";
      const opts = { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) };
      const run = async () => {
        await new Promise(r => setTimeout(r, 300));
        try {
          let res = await fetch(url, opts);
          if (res.status === 429) { await new Promise(r => setTimeout(r, 2500)); res = await fetch(url, opts); }
          if (!res.ok) { this.derniereRaison = this.raisonSync(res, null); return false; }
          await res.json();
          this.markSync();
          return true;
        } catch (e) { this.derniereRaison = this.raisonSync(null, null); return false; }
      };
      const p = _notionChain.then(run, run);
      _notionChain = p;
      return p;
    },

    /* Traduction des échecs de synchro en phrase humaine (pas de jargon dev) */
    raisonSync(res, j) {
      if (typeof navigator !== "undefined" && !navigator.onLine) return "tu es hors ligne — rien n’a pu partir";
      const s = res ? res.status : 0;
      const err = ((j && j.error) || "") + " " + ((j && j.code) || "");
      /* Codes Notion réels (renvoyés par le worker) → phrases humaines exactes */
      if (/unauthorized|expired_token/i.test(err)) return "Notion refuse l'accès — reconnecte la connexion Ma Cave vers Notion (intégration à réautoriser)";
      if (/object_not_found/i.test(err)) return "la base Notion n'est plus accessible — vérifie qu'elle est toujours partagée avec l'intégration";
      if (s === 429 || /rate_limited|rate limit/i.test(err)) return "Notion ralentit les appels (limite de débit) — ça repart tout seul en général dans la minute";
      if (/conflict/i.test(err)) return "deux appareils ont modifié la même chose en même temps — réessaie";
      if (/token|config|non configuré/i.test(err)) return "la synchro n'est pas configurée côté serveur (variables Cloudflare)";
      if (s === 413 || /volumineuse|too large|charge/i.test(err)) return "les données sont trop lourdes pour être envoyées";
      if (s === 404 || /non déployé|Function/i.test(err)) return "le serveur de synchro n'est pas encore déployé — recharge la dernière version sur Cloudflare";
      if (s >= 500 || /Notion [0-9]/.test(err)) return "Notion a renvoyé une erreur (" + (err.trim() || s) + ") — copie ce message si ça persiste";
      if (/validation_error/i.test(err) || s === 400 || /format|invalide/i.test(err)) return "une donnée a un format que Notion refuse (champ trop long ou valeur interdite)";
      return "problème de connexion au serveur — réessaie plus tard";
    },

    syncNotion(payload) {
      /* la photo (base64) reste locale : jamais envoyée à Notion ni à l'API */
      const strip = o => o && typeof o === "object" ? (({ photo, ...rest }) => rest)(o) : o;
      const clean = { ...payload, profil: this.PROFIL, bouteille: strip(payload.bouteille), bouteilles: payload.bouteilles && payload.bouteilles.map(strip) };
      this.sendNotion(clean).then(ok => {
        if (!ok) { this.queueAdd(clean); this.toast("Hors ligne — l'action partira vers Notion au retour du réseau"); }
      });
    },

    async flushQueue() {
      if (!navigator.onLine) return;
      let q = [];
      try { q = JSON.parse(localStorage.getItem(this.pKeys.queue) || "[]"); } catch {}
      if (!q.length) return;
      const rest = [];
      let sent = 0;
      for (const p of q) { if (await this.sendNotion(p)) sent++; else { rest.push(p); rest.push(...q.slice(q.indexOf(p) + 1)); break; } } /* stop dès le 1er échec : ne brûle pas le quota pour rien */
      try { localStorage.setItem(this.pKeys.queue, JSON.stringify(rest)); } catch {}
      if (sent) this.toast(`${sent} action${sent > 1 ? "s" : ""} renvoyée${sent > 1 ? "s" : ""} vers Notion`);
      else if (rest.length) this.toast(`${rest.length} action${rest.length > 1 ? "s" : ""} toujours en attente : ${this.derniereRaison || "réessaie plus tard"}`);
    },

    async syncAll() {
      this.syncBusy(true);
      const stock = this.db.bouteilles.filter(b => b.quantite > 0).map(b => { const { photo, ...rest } = b; return rest; });
      try {
        const res = await fetch("/api/sync-notion", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "sync", bouteilles: stock, profil: this.PROFIL }) });
        const j = await res.json();
        if (j.ok) { this.markSync(); this.toast(`Cave sauvegardée sur Notion — ${j.created || 0} créée(s), ${j.updated || 0} mise(s) à jour${j.failed ? ", " + j.failed + " en échec" : ""}${j.failedDetail ? " (" + j.failedDetail + ")" : ""}`); this.flushQueue(); this.syncBues(); }
        else { this.derniereRaison = this.raisonSync(res, j); this.toast("Synchro impossible : " + this.derniereRaison); }
      } catch (e) { this.derniereRaison = this.raisonSync(null, null); this.toast("Synchro impossible : " + this.derniereRaison + " — ta cave reste intacte en local"); }
      finally { this.syncBusy(false); }
    },

    async pullAll() {
      this.syncBusy(true);
      try {
        /* Le serveur peut répondre par intermittence (connexion coupée) : 2 tentatives */
        let res = null, j = null;
        for (let essai = 0; essai < 2 && !j; essai++) {
          try {
            res = await fetch("/api/sync-notion", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "pull", profil: this.PROFIL }) });
            j = await res.json();
          } catch (e) { this.derniereRaison = this.raisonSync(null, null); if (essai === 0) await new Promise(r => setTimeout(r, 3000)); }
        }
        if (!j) { this.toast("Récupération impossible : " + (this.derniereRaison || "coupe réseau — réessaie")); return; }
        if (!j.ok) { this.derniereRaison = this.raisonSync(res, j); this.toast("Récupération impossible : " + this.derniereRaison); return; }
        const r = this.mergePull(j.bouteilles || []);
        this.markSync();
        this.save();
        this.toast(`Récupéré : ${r.added} ajoutée(s), ${r.updated} mise(s) à jour, ${r.kept} conservée(s)`);
        this.flushQueue();
        await this.pullBues();   /* ATTENDRE la fusion distante AVANT de pousser : sinon le push écrase les bues de l'autre appareil */
        this.syncBues();
      } catch { this.toast("Récupération impossible : " + (this.derniereRaison || "réessaie plus tard")); }
      finally { this.syncBusy(false); }
    },

    async autoPull() {
      if (!navigator.onLine) return "offline";
      const last = +(localStorage.getItem(this.pKeys.pull) || 0);
      if (Date.now() - last < 15 * 60 * 1000) return "fresh";
      localStorage.setItem(this.pKeys.pull, String(Date.now()));
      try {
        let res = null, j = null;
        for (let essai = 0; essai < 2 && !j; essai++) {
          try {
            res = await fetch("/api/sync-notion", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "pull", profil: this.PROFIL }) });
            j = await res.json();
          } catch (e) { this.derniereRaison = this.raisonSync(null, null); if (essai === 0) await new Promise(r => setTimeout(r, 3000)); }
        }
        if (!j) return "fail";
        if (!j.ok) { this.derniereRaison = this.raisonSync(res, j); return "fail"; }
        const r = this.mergePull(j.bouteilles || []);
        this.markSync();
        if (r.added || r.updated) { this.save(); this.toast(`Cave rafraîchie depuis Notion — ${r.added} ajoutée${r.added > 1 ? "s" : ""}, ${r.updated} modifiée${r.updated > 1 ? "s" : ""}`); }
        return "ok";
      } catch (e) { /* hors ligne : la cave locale reste la référence */ this.derniereRaison = this.raisonSync(null, null); return "fail"; }
    },

    mergePull(list) {
      let added = 0, updated = 0, kept = 0;
      for (const nb of list) {
        if (!nb || !nb.nom) continue;
        const local = this.db.bouteilles.find(b => importKey(b) === importKey(nb));
        if (!local) {
          const b = { id: uid(), nom: nb.nom, type: nb.type || "Vin", categorie: nb.categorie || "Rouge", cepage: nb.cepage || "", region: nb.region || "", pays: nb.pays || "", millesime: nb.millesime ?? null, quantite: nb.quantite ?? 1, prix: nb.prix ?? null, cave: nb.cave || "Principale", cuvee: nb.cuvee || "", appellation: nb.appellation || "", specificite: nb.specificite || "", format: nb.format || "Bouteille (75 cl)", commentaire: nb.commentaire || "", statut: nb.statut || "En cave", bues: 0, note: null, photo: null, apoDebut: null, apoFin: null, apoAuto: null, apoRegle: null, buLe: null, modifLe: nb.lastEdited || new Date().toISOString() };
          const est = estimeApogee(b);
          if (est) { b.apoAuto = est; b.apoRegle = est.regle; }
          this.db.bouteilles.push(b);
          added++;
        } else {
          const notionT = nb.lastEdited || "";
          const localT = local.modifLe || "";
          if (notionT && (!localT || notionT > localT)) {
            ["quantite", "prix", "categorie", "region", "pays", "cepage", "cuvee", "appellation", "format", "commentaire", "statut", "millesime", "specificite"].forEach(f => { if (nb[f] != null && nb[f] !== "") local[f] = nb[f]; });
            local.modifLe = notionT;
            updated++;
          } else kept++;
        }
      }
      return { added, updated, kept };
    },

    /* ---------- Avatar de profil (v2.4) : Notion, le plus récent gagne ---------- */
    setAvatar(data, ts) {
      try {
        const k = "ma-cave-avatar-" + this.PROFIL;
        if (data) { localStorage.setItem(k, data); localStorage.setItem(k + "-ts", ts || new Date().toISOString()); }
        else { localStorage.removeItem(k); localStorage.removeItem(k + "-ts"); }
      } catch {}
    },
    avatarDe(id) { try { return localStorage.getItem("ma-cave-avatar-" + id) || null; } catch { return null; } },
    avatarTs(id) { try { return localStorage.getItem("ma-cave-avatar-" + id + "-ts") || null; } catch { return null; } },
    async pullAvatar() {
      try {
        const res = await fetch("/api/avatar?profil=" + this.PROFIL);
        const j = await res.json();
        if (!j.ok || !j.data) return;
        const local = this.avatarDe(this.PROFIL);
        const lts = this.avatarTs(this.PROFIL);
        if (local === j.data) { if (!lts && j.edited) this.setAvatar(j.data, j.edited); return; }
        if (!local || !lts || !j.edited || j.edited > lts) this.setAvatar(j.data, j.edited);
      } catch {}
    },
    async syncAvatar() {
      const data = this.avatarDe(this.PROFIL);
      try {
        const res = await fetch("/api/avatar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profil: this.PROFIL, data }) });
        const j = await res.json();
        if (j.ok) { this.setAvatar(data, j.edited || new Date().toISOString()); return true; }
        this.toast((data ? "Avatar non envoyé" : "Suppression non propagée") + " : " + this.raisonSync(res, j));
        return false;
      } catch (e) { this.toast("Avatar non envoyé : " + this.raisonSync(null, null)); return false; }
    },

    /* ---------- Listes d'envie + Envies d'achat : synchro Notion PARTAGÉE ----------
       Une seule page Notion centrale : toutes les modifs (captures d'écran comprises)
       sont visibles de tous les profils et de tous les appareils.
       Les photos partent en miniatures, dans la limite d'un budget de caractères
       (les pages méta Notion sont plafonnées à ~180 Ko). */
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

    /* ---------- Historique des bues : partagé entre appareils (page méta Notion) ----------
       Push = liste complète (auto-réparant : un échec d'envoi est comblé par le push suivant),
       pull = fusion par clé (date|nom|millésime), les entrées des deux appareils se complètent. */
    async pullBues() {
      try {
        const res = await fetch("/api/bues?profil=" + this.PROFIL);
        const j = await res.json();
        if (!j.ok || !j.data) return;
        const raw = JSON.parse(j.data);
        if (!Array.isArray(raw) && !Array.isArray(raw.bues)) return;
        const remote = Array.isArray(raw) ? raw : raw.bues;
        const rSuppr = Array.isArray(raw) ? [] : (raw.suppr || []);   /* clés supprimées sur un autre appareil */
        const ts = localStorage.getItem(this.buesTsKey());
        if (ts && j.edited && j.edited <= ts) return;
        const k = x => (x.date || "") + "|" + (x.nom || "") + "|" + (x.millesime ?? "");
        const loc = new Map((this.db.bues || []).map(x => [k(x), x]));
        let changed = 0, suppr = 0;
        for (const s of rSuppr) { if (loc.delete(s)) { changed++; suppr++; } }   /* appliquer les suppressions distantes */
        for (const r of remote) {
          const kk = k(r);
          if (!loc.has(kk) || JSON.stringify(loc.get(kk)) !== JSON.stringify(r)) { loc.set(kk, { ...(loc.get(kk) || {}), ...r }); changed++; }
        }
        if (changed) {
          this.db.bues = [...loc.values()].sort((a, b) => (a.date || "") < (b.date || "") ? -1 : 1);
          /* Les entrées du serveur (ancien format) n'ont pas d'id : sans id, la fiche
             « bue » ne s'ouvre pas (bueOuverte cherche par id) et les :key explosent. */
          this.db.bues.forEach(h => { if (!h.id) h.id = uid(); });
          this.buesFiche = null;
          this.save();
          this.toast((suppr && changed === suppr) ? (suppr > 1 ? suppr + " bouteilles bues supprimées" : "1 bouteille bue supprimée") : changed > 1 ? changed + " bouteilles bues récupérée(s) de l’autre appareil" : "1 bouteille bue récupérée de l’autre appareil");
        }
        try { localStorage.setItem(this.buesTsKey(), j.edited || new Date().toISOString()); } catch {}
      } catch {}
    },
    async syncBues() {
      try {
        const data = JSON.stringify({ bues: (this.db.bues || []).slice(-1000), suppr: (this.db.buesSuppr || []).slice(-300) });
        const res = await fetch("/api/bues", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profil: this.PROFIL, data }) });
        const j = await res.json();
        if (j.ok) { try { localStorage.setItem(this.buesTsKey(), j.edited || new Date().toISOString()); } catch {} return true; }
        return false;
      } catch { return false; }
    },

    async pullListes() {
      try {
        const res = await fetch("/api/listes");
        const j = await res.json();
        if (!j.ok || !j.data) return;
        const remote = JSON.parse(j.data);
        if (!Array.isArray(remote)) return;
        const lts = localStorage.getItem(this.listesTsKey());
        if (!lts || !j.edited || j.edited > lts) {
          this.db.listes = remote.map(l => ({ ...l, ids: l.ids || [], qtes: l.qtes || {}, ext: l.ext || [] }));
          this.save();
          localStorage.setItem(this.listesTsKey(), j.edited || new Date().toISOString());
        }
      } catch {}
    },
    async syncListes() {
      try {
        const p = this.listesPourSync();
        const res = await fetch("/api/listes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: p.data }) });
        const j = await res.json();
        if (j.ok) {
          localStorage.setItem(this.listesTsKey(), j.edited || new Date().toISOString());
          if (p.coupe) this.toast("Listes envoyées — certaines captures trop lourdes restent locales");
          return true;
        }
        this.toast("Listes non envoyées : " + this.raisonSync(res, j));
        return false;
      } catch (e) { this.toast("Listes non envoyées : " + this.raisonSync(null, null)); return false; }
    },

    async pullEnvies() {
      try {
        const res = await fetch("/api/envies");
        const j = await res.json();
        if (!j.ok || !j.data) return;
        const remote = JSON.parse(j.data);
        if (!Array.isArray(remote)) return;
        const ts = localStorage.getItem(this.enviesTsKey());
        if (!ts || !j.edited || j.edited > ts) {
          this.db.envies = remote.map(e => ({ ...e, items: e.items || [] }));
          this.save();
          localStorage.setItem(this.enviesTsKey(), j.edited || new Date().toISOString());
        }
      } catch {}
    },
    async syncEnvies() {
      try {
        const p = this.enviesPourSync();
        const res = await fetch("/api/envies", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: p.data }) });
        const j = await res.json();
        if (j.ok) {
          localStorage.setItem(this.enviesTsKey(), j.edited || new Date().toISOString());
          if (p.coupe) this.toast("Envies envoyées — certaines photos trop lourdes restent locales");
          return true;
        }
        this.toast("Envies non envoyées : " + this.raisonSync(res, j));
        return false;
      } catch (e) { this.toast("Envies non envoyées : " + this.raisonSync(null, null)); return false; }
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
    /* ---------- Préférences du soir (météo, saison, apogée) ---------- */
    SOIR_DEFAUT: { meteo: true, saison: true, apogee: true, bandeauSoir: true, bandeauApogee: true, voyage: false, lat: null, lon: null, ville: "" },
    soirPrefs() {
      const d = this.SOIR_DEFAUT;
      try { return { ...d, ...JSON.parse(localStorage.getItem(this.pKeys.db + "-soir-prefs") || "{}") }; } catch { return { ...d }; }
    },
    setSoirPrefs(p) { try { localStorage.setItem(this.pKeys.db + "-soir-prefs", JSON.stringify(p)); } catch {} this.soirVersion++; },
    soirPrefsTs() { try { return localStorage.getItem(this.pKeys.db + "-soir-prefs-ts") || null; } catch { return null; } },
    /* Préférences du soir : sauvegardées dans Notion (page méta « Préférences soir » du profil),
       pour les retrouver après réinstallation de la PWA ou sur un autre appareil. */
    async pullSoirPrefs() {
      try {
        const res = await fetch("/api/prefs-soir?profil=" + this.PROFIL);
        const j = await res.json();
        if (!j.ok || !j.data) return;
        const lts = this.soirPrefsTs();
        if (lts && j.edited && j.edited <= lts) return; /* local plus récent → on pousse à la prochaine modif */
        const p = JSON.parse(j.data);
        localStorage.setItem(this.pKeys.db + "-soir-prefs", JSON.stringify(p));
        localStorage.setItem(this.pKeys.db + "-soir-prefs-ts", j.edited || new Date().toISOString());
        this.soirVersion++;
      } catch {}
    },
    async syncSoirPrefs() {
      const data = JSON.stringify(this.soirPrefs());
      try {
        const res = await fetch("/api/prefs-soir", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profil: this.PROFIL, data }) });
        const j = await res.json();
        if (j.ok) { try { localStorage.setItem(this.pKeys.db + "-soir-prefs-ts", j.edited || new Date().toISOString()); } catch {} return true; }
        this.toast("Préférences non sauvegardées : " + this.raisonSync(res, j));
        return false;
      } catch (e) { this.toast("Préférences non sauvegardées : " + this.raisonSync(null, null)); return false; }
    },

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
      if (obj.avatar) { try { this.setAvatar(obj.avatar); this.syncAvatar(); } catch {} }
      this.save();
      return { ajoutes, maj };
    },

    /* ---------- Rappels (notifications locales) ---------- */
    notifAutorisees() { return typeof Notification !== "undefined" && Notification.permission === "granted"; },
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
      if (corps) notifie("Ma Cave — apogées", corps + ". Ouvre l'onglet Apogées.", "ma-cave-apogee");
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
