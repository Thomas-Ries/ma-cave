/* Partage d'une fiche : carte visuelle PNG générée en canvas (photo, identité,
   apogée, note, commentaire, 2-3 accords) — SANS le nombre de bouteilles.
   Export : Web Share API si dispo (native share iOS), sinon téléchargement.
   Tout se passe dans le navigateur, aucune donnée envoyée. */

const C = { cream: "#FAF6F1", ink: "#2B2724", accent: "#7A2E3E", muted: "#8A7F75", hairline: "#EAE3DA", riesling: "#D9C589", gold: "#A8842C" };

function chargePhoto(src) {
  return new Promise(res => {
    if (!src) return res(null);
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => res(null);
    img.src = src;
  });
}

function texteRoupe(ctx, txt, x, y, w, police, couleur, lh = 30) {
  /* découpe et dessine un paragraphe multi-lignes, renvoie le y final */
  ctx.font = police;
  ctx.fillStyle = couleur;
  const mots = String(txt || "").split(/\s+/);
  let ligne = "", yy = y;
  for (const m of mots) {
    const essai = ligne ? ligne + " " + m : m;
    if (ctx.measureText(essai).width > w && ligne) { ctx.fillText(ligne, x, yy); yy += lh; ligne = m; }
    else ligne = essai;
  }
  if (ligne) { ctx.fillText(ligne, x, yy); yy += lh; }
  return yy;
}

/* Génère la carte (Blob PNG) d'une bouteille. accords = [{ plat: { nom } }] */
export async function carteBouteillePNG(b, accords) {
  const W = 800, H = 1000;
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d");

  /* fond + cadre riesling */
  ctx.fillStyle = C.cream;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = C.riesling;
  ctx.fillRect(0, 0, W, 10);

  let y = 54;
  /* photo (carré centré, ou pastille verre) */
  const photo = await chargePhoto(b.photo);
  if (photo) {
    const s = 300, x = (W - s) / 2;
    ctx.save();
    const r = 24, xx = x, yy = y;
    ctx.beginPath();
    ctx.moveTo(xx + r, yy);
    ctx.arcTo(xx + s, yy, xx + s, yy + s, r);
    ctx.arcTo(xx + s, yy + s, xx, yy + s, r);
    ctx.arcTo(xx, yy + s, xx, yy, r);
    ctx.arcTo(xx, yy, xx + s, yy, r);
    ctx.closePath();
    ctx.clip();
    const ratio = Math.max(s / photo.width, s / photo.height);
    ctx.drawImage(photo, xx - (photo.width * ratio - s) / 2, yy - (photo.height * ratio - s) / 2, photo.width * ratio, photo.height * ratio);
    ctx.restore();
    y += s + 34;
  } else {
    ctx.fillStyle = C.accent;
    ctx.beginPath();
    ctx.arc(W / 2, y + 60, 60, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "54px serif";
    ctx.textAlign = "center";
    ctx.fillText(String(b.nom || "?").slice(0, 1).toUpperCase(), W / 2, y + 80);
    ctx.textAlign = "left";
    y += 154;
  }

  /* identité : nom, millésime · catégorie · région */
  y = texteRoupe(ctx, b.nom || "Bouteille", 56, y, W - 112, "600 46px serif", C.ink, 54);
  const ligne2 = [b.millesime, b.categorie, b.region].filter(Boolean).join(" · ");
  if (ligne2) { ctx.font = "28px sans-serif"; ctx.fillStyle = C.accent; ctx.fillText(ligne2, 56, y); y += 44; }
  if (b.appellation) { ctx.font = "italic 24px sans-serif"; ctx.fillStyle = C.muted; ctx.fillText(b.appellation, 56, y); y += 36; }
  y += 12;

  /* apogée (fenêtre) + note */
  const d = b.apoDebut ?? b.apoAuto?.debut, f = b.apoFin ?? b.apoDebut ?? b.apoAuto?.fin;
  const tags = [];
  if (d != null) tags.push("Apogée " + d + (f && f !== d ? "–" + f : ""));
  if (b.note != null) tags.push("Note " + b.note + "/100");
  if (tags.length) {
    ctx.font = "24px sans-serif";
    let x = 56;
    for (const t of tags) {
      const w = ctx.measureText(t).width + 36;
      ctx.fillStyle = "#FFFFFF";
      ctx.beginPath();
      ctx.roundRect(x, y, w, 46, 23);
      ctx.fill();
      ctx.strokeStyle = C.riesling; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = C.ink;
      ctx.fillText(t, x + 18, y + 31);
      x += w + 14;
    }
    y += 66;
  }

  /* commentaire */
  if (b.commentaire) {
    y = texteRoupe(ctx, b.commentaire, 56, y + 4, W - 112, "26px sans-serif", C.muted, 36) + 10;
  }

  /* accords (2-3) */
  const top = (accords || []).slice(0, 3).map(a => a.plat?.nom || a.plat).filter(Boolean);
  if (top.length) {
    y += 16;
    ctx.fillStyle = C.hairline;
    ctx.fillRect(56, y, W - 112, 2);
    y += 40;
    ctx.font = "600 22px sans-serif";
    ctx.fillStyle = C.gold;
    ctx.fillText("À BOIRE AVEC", 56, y);
    y += 40;
    ctx.font = "28px serif";
    ctx.fillStyle = C.ink;
    for (const p of top) { ctx.fillText("•  " + p, 56, y); y += 42; }
  }

  /* pied : Ma Cave */
  ctx.fillStyle = C.muted;
  ctx.font = "italic 24px sans-serif";
  ctx.fillText("Ma Cave · ma-cave.pages", 56, H - 48);
  ctx.fillStyle = C.riesling;
  ctx.fillRect(0, H - 10, W, 10);

  return new Promise(res => cv.toBlob(res, "image/png", 0.92));
}

/* Partage : native si possible (iOS), sinon téléchargement du PNG */
export async function partagerBouteille(b, accords) {
  const blob = await carteBouteillePNG(b, accords);
  if (!blob) throw new Error("carte impossible");
  const fichier = new File([blob], "ma-cave-" + String(b.nom || "bouteille").toLowerCase().replace(/[^a-z0-9]+/g, "-") + ".png", { type: "image/png" });
  if (navigator.canShare && navigator.canShare({ files: [fichier] })) {
    try { await navigator.share({ files: [fichier], title: b.nom || "Ma Cave" }); return "partage"; } catch { return "annule"; }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = fichier.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  return "telecharge";
}
