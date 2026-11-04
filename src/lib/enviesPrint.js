/* Export PDF des notes d'envies d'achat — page A4 imprimable via iframe invisible,
   exactement le mécanisme et le style du livre de cave (src/lib/livre.js). */

export function exportEnviesPDF(notes, toast) {
  const avecItems = notes.filter(e => (e.items || []).length);
  if (!avecItems.length) { if (toast) toast("Aucune bouteille dans la sélection — rien à imprimer"); return; }
  const escH = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const dateTxt = new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  const nbItems = avecItems.reduce((s, e) => s + (e.items || []).filter(i => !i.ajouteLe).length, 0);

  let body = "";
  for (const e of avecItems) {
    const items = (e.items || []).filter(i => !i.ajouteLe);
    if (!items.length) continue;
    const total = items.reduce((s, i) => s + (i.prix ?? 0), 0);
    body += `<h2 class="cave">${escH(e.nom)}<span class="cnt">${e.caviste ? escH(e.caviste) + " · " : ""}${items.length} bouteille${items.length > 1 ? "s" : ""}${total > 0 ? " · " + Math.round(total * 100) / 100 + " €" : ""}</span></h2>`;
    body += `<table><thead><tr><th></th><th>Bouteille</th><th class="c">Mil.</th><th class="r">Prix</th></tr></thead><tbody>`;
    for (const it of items) {
      const thumb = it.photos && it.photos.length ? `<img src="${it.photos[0]}" alt="" />` : "";
      const desc = escH(it.nom || "Sans nom") + (it.cuvee ? `<br /><span class="cv">${escH(it.cuvee)}</span>` : "") + (it.commentaire ? `<br /><em class="cv">${escH(it.commentaire)}</em>` : "");
      body += `<tr><td class="ph">${thumb}</td><td>${desc}</td><td class="c">${it.millesime ?? "—"}</td><td class="r">${it.prix != null ? it.prix + " €" : "—"}</td></tr>`;
    }
    body += "</tbody></table>";
  }

  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Mes envies d'achat</title><style>
    @page { size: A4; margin: 16mm 14mm; }
    body { font-family: Georgia, "Times New Roman", serif; color: #2B2724; margin: 0; }
    h1 { font-size: 22pt; margin: 0 0 2mm; color: #7A2E3E; }
    .soustitre { font-size: 9pt; color: #8A7F75; border-bottom: 1.5pt solid #A8842C; padding-bottom: 3mm; margin-bottom: 6mm; }
    .resume { font-size: 10pt; margin: 0 0 6mm; }
    h2.cave { font-size: 14pt; color: #7A2E3E; border-bottom: 0.75pt solid #A8842C; padding-bottom: 1mm; margin: 8mm 0 3mm; page-break-after: avoid; }
    h2.cave .cnt { font-size: 8.5pt; color: #8A7F75; font-weight: normal; }
    table { width: 100%; border-collapse: collapse; font-size: 9pt; }
    th { text-align: left; font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.5pt; color: #8A7F75; border-bottom: 0.75pt solid #EAE3DA; padding: 1.2mm 1.5mm; }
    td { border-bottom: 0.5pt solid #EAE3DA; padding: 1.6mm 1.5mm; vertical-align: top; }
    tr { page-break-inside: avoid; }
    .c { text-align: center; } .r { text-align: right; }
    td.ph { width: 16mm; } td.ph img { width: 13mm; height: auto; border-radius: 1.5mm; }
    em.cv { color: #8A7F75; font-style: italic; }
    footer { margin-top: 8mm; font-size: 8.5pt; color: #8A7F75; text-align: center; border-top: 0.75pt solid #EAE3DA; padding-top: 3mm; }
  </style></head><body>
    <h1>Mes envies d'achat</h1>
    <div class="soustitre">Liste de courses — ${escH(dateTxt)}</div>
    <p class="resume">${avecItems.length} note${avecItems.length > 1 ? "s" : ""} · ${nbItems} bouteille${nbItems > 1 ? "s" : ""} à acheter</p>
    ${body}
    <footer>Ma Cave — PWA · imprimé le ${escH(dateTxt)}</footer>
  </body></html>`;

  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:1px;height:1px;opacity:0;border:0;pointer-events:none;";
  document.body.appendChild(iframe);
  const idoc = iframe.contentDocument;
  idoc.open(); idoc.write(html); idoc.close();
  const pw = iframe.contentWindow;
  pw.onafterprint = () => setTimeout(() => iframe.remove(), 500);
  setTimeout(() => { try { pw.focus(); pw.print(); } catch { iframe.remove(); } }, 350);
  setTimeout(() => { if (document.body.contains(iframe)) iframe.remove(); }, 60000);
  if (toast) toast("Liste prête — choisis « Enregistrer en PDF » dans la boîte d'impression");
}
