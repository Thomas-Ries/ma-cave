/* Livre de cave : page A4 imprimable via iframe invisible (jamais window.open :
   en PWA installée, window.open remplace la vue de la cave sans retour possible).
   Portage fidèle de la v1 (v26/v64). */

export function exportLivreCave(bouteilles, profilNom, toast) {
  const stock = bouteilles.filter(b => b.quantite > 0);
  if (!stock.length) { if (toast) toast("Cave vide — rien à imprimer"); return; }
  const CATS_ORDRE = ["Rouge", "Blanc", "Rosé", "Champagne", "Crémant", "Effervescent", "Moelleux", "Spiritueux"];
  const caves = [...new Set(stock.map(b => b.cave || "Principale"))];
  const nbB = stock.reduce((s, b) => s + b.quantite, 0);
  const valeur = stock.reduce((s, b) => s + (b.prix ?? 0) * b.quantite, 0);
  const escH = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const dateTxt = new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  const catDe = b => b.type === "Spiritueux" ? "Spiritueux" : b.categorie;
  const regionDe = b => (b.region || "").trim() || "Autres provenances";

  let body = "";
  for (const cave of caves) {
    const caveStock = stock.filter(b => (b.cave || "Principale") === cave);
    const nCave = caveStock.reduce((s, b) => s + b.quantite, 0);
    body += `<h2 class="cave">${escH(cave)} <span class="cnt">${caveStock.length} réf. · ${nCave} btl</span></h2>`;
    const regions = [...new Set(caveStock.map(regionDe))].sort((a, b) => a.localeCompare(b, "fr"));
    for (const reg of regions) {
      const list = caveStock.filter(b => regionDe(b) === reg).sort((a, b) => (a.nom || "").localeCompare(b.nom || "", "fr"));
      if (!list.length) continue;
      body += `<h3>${escH(reg)}</h3><table><thead><tr><th></th><th class="c">Mil.</th><th>Cépage</th><th>Appellation</th><th>Format</th><th class="c">Qté</th><th class="r">Prix</th></tr></thead><tbody>`;
      const cats = [...new Set(list.map(catDe))].sort((a, b) => CATS_ORDRE.indexOf(a) - CATS_ORDRE.indexOf(b));
      for (const cat of cats) {
        body += `<tr class="grp"><td colspan="7">${escH(cat)}</td></tr>`;
        for (const b of list.filter(x => catDe(x) === cat)) {
          const nom = escH(b.nom) + (b.cuvee ? ` <em class="cv">${escH(b.cuvee)}</em>` : "");
          const fmt = b.format && b.format !== "Bouteille (75 cl)" ? escH(b.format) : "75 cl";
          body += `<tr><td>${nom}</td><td class="c">${b.millesime ?? "—"}</td><td>${escH(b.cepage) || "—"}</td><td>${escH(b.appellation) || "—"}</td><td>${fmt}</td><td class="c">${b.quantite}</td><td class="r">${b.prix != null ? b.prix + " €" : "—"}</td></tr>`;
        }
      }
      body += "</tbody></table>";
    }
  }

  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Cave de ${escH(profilNom)} — livre de cave</title><style>
    @page { size: A4; margin: 16mm 14mm; }
    body { font-family: Georgia, "Times New Roman", serif; color: #2B2724; margin: 0; }
    h1 { font-size: 22pt; margin: 0 0 2mm; color: #7A2E3E; }
    .soustitre { font-size: 9pt; color: #8A7F75; border-bottom: 1.5pt solid #A8842C; padding-bottom: 3mm; margin-bottom: 6mm; }
    .resume { font-size: 10pt; margin: 0 0 6mm; }
    h2.cave { font-size: 14pt; color: #7A2E3E; border-bottom: 0.75pt solid #A8842C; padding-bottom: 1mm; margin: 8mm 0 3mm; page-break-after: avoid; }
    h2.cave .cnt { font-size: 8.5pt; color: #8A7F75; font-weight: normal; }
    h3 { font-size: 10.5pt; color: #A8842C; margin: 4mm 0 1.5mm; letter-spacing: 0.5pt; text-transform: uppercase; page-break-after: avoid; }
    table { width: 100%; border-collapse: collapse; font-size: 9pt; }
    th { text-align: left; font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.5pt; color: #8A7F75; border-bottom: 0.75pt solid #EAE3DA; padding: 1.2mm 1.5mm; }
    td { border-bottom: 0.5pt solid #EAE3DA; padding: 1.6mm 1.5mm; vertical-align: top; }
    tr { page-break-inside: avoid; }
    .c { text-align: center; } .r { text-align: right; }
    tr.grp td { color: #7A2E3E; font-size: 8pt; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5pt; padding: 2.5mm 1.5mm 1mm; border-bottom: 0.5pt solid #EAE3DA; }
    em.cv { color: #8A7F75; font-style: italic; }
    footer { margin-top: 8mm; font-size: 8.5pt; color: #8A7F75; text-align: center; border-top: 0.75pt solid #EAE3DA; padding-top: 3mm; }
  </style></head><body>
    <h1>Cave de ${escH(profilNom)}</h1>
    <div class="soustitre">Livre de cave — ${escH(dateTxt)}</div>
    <p class="resume">${stock.length} référence${stock.length > 1 ? "s" : ""} · ${nbB} bouteille${nbB > 1 ? "s" : ""}${valeur > 0 ? ` · valeur estimée ${Math.round(valeur)} €` : ""}</p>
    ${body}
    <footer>Ma Cave — PWA · imprimé le ${escH(dateTxt)} · les prix ne sont jamais partagés en ligne, ce document reste chez toi</footer>
  </body></html>`;

  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:1px;height:1px;opacity:0;border:0;pointer-events:none;";
  document.body.appendChild(iframe);
  const idoc = iframe.contentDocument;
  idoc.open(); idoc.write(html); idoc.close();
  const pw = iframe.contentWindow;
  pw.onafterprint = () => setTimeout(() => iframe.remove(), 500);
  setTimeout(() => { try { pw.focus(); pw.print(); } catch { iframe.remove(); } }, 250);
  setTimeout(() => { if (document.body.contains(iframe)) iframe.remove(); }, 60000);
  if (toast) toast("Livre de cave prêt — choisis « Enregistrer en PDF » dans la boîte d'impression");
}
