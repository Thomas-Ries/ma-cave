# Ma Cave — v2.7

PWA de gestion de cave à vin & spiritueux. Vue 3 + Vite + Pinia + vue-router.
Charte Tailwind (cream / ink / accent / riesling), zéro emoji dans l'UI.

## Fonctionnalités

- Cave multi-profils (Thomas / Marc) avec verrou 4 chiffres et « Qui boit ce soir ? »
- Fiches bouteilles : photo locale, apogée (saisie ou estimée), note /100, commentaires
- Apogées : à boire / bientôt / passées, notifications
- Accords mets-vins : occasions, recherche de plat, top 3 de ta cave, moteur inverse par bouteille
- Bues : historique, notes, remise en cave
- Stats : compteurs, valeur (prix connus), répartition par catégorie
- Listes d'envies & réservations avec dates d'événement, quantités, **synchro Notion**
- Mode dense avec **en-têtes collants par région**
- Import Excel/CSV (fusion, rien n'est effacé), sauvegarde/restauration JSON
- Synchro Notion (cave + avatar + listes) via worker Cloudflare

## Développement

```bash
npm install
npm run dev      # serveur local
npm run build   # build de production dans dist/
npm test        # tests unitaires (apogée)
```

## Déploiement (Cloudflare Pages, Direct Upload)

1. `npm run build`
2. Glisser-déposer le dossier `dist/` sur https://dash.cloudflare.com → Pages → ma-cave
3. Le `_worker.js` est inclus dans `dist/` (mode avancé) : synchro Notion, avatar, listes.

## Structure

- `src/lib/` — logique pure (apogée, accords, import) + tests
- `src/stores/cave.js` — store Pinia central
- `src/views/` — Cave, Apogées, Accords, Bues, Stats
- `src/components/` — fiches, feuilles filtres/listes, import
- `public/_worker.js` — worker Cloudflare (Notion, avatar, listes)

## Configuration Notion

Variables d'environnement (Cloudflare Pages) :
- `NOTION_TOKEN` — token d'intégration
- `NOTION_DB` — id de la base « Dégustations »
- `NOTION_DB_AVATAR` — id de la base méta « Profil (avatar) »
- `NOTION_DB_LISTES` — id de la base méta « Listes d'envie »

## v2.6 — Profils autonomes (02/11/2026)
- Fin du code global : splash → « Qui boit ce soir ? » → (code du profil s'il en a un) → cave.
- Gestion du profil (menu avatar → « Gérer mon profil ») : photo (ajout/changement/retrait, synchro Notion) et code à 4 chiffres optionnel (activer, modifier, désactiver). Code admin de secours accepté sur tous les pavés.
- Code couleur apogée sur les cartes : rouge plein = passée l'apogée, riesling = à boire, or = bientôt prête, crème = à garder (idem onglet Apogées, chiffres des compteurs colorés).
- Nav basse plus haute (icônes 28 px, libellés 11 px).

## v2.7 — Vague de retours design & UX (02/11/2026)
- Fiche : fonds de sections accentués (apogée riesling, note rosé bordeaux, listes or).
- Notation 70–100 vivante : valeur + libellé (Passable → Exceptionnel) en direct sous le curseur + légende dégradée (fiche et fiche bue).
- Splashscreen fun (bulles riesling, pop, 4 s) : « Ma cave · Mes bouteilles · Mon rythme ».
- Ajout vin : France par défaut, sélect Cave avec suggestions (datalist) mais saisie libre, photo au premier écran, prix déplacé dans « plus d'infos », sélect statut retiré, pastille verte « Bouteille bien ajoutée » + fermeture auto.
- Scroll de fond verrouillé dès qu'une modale/feuille est ouverte (position fixed + restitution du scroll).
- Tri « Récemment ajoutées » (remplace « À boire en premier »), tri Région retiré (le filtre reste).
- Badge de chargement discret en haut pendant les synchros (plus de pastille sombre en bas).
- Mode dense : en-tête région plus grand/lisible, cuvée sur sa propre ligne.
