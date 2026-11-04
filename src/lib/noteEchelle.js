/* Échelle de notation 70–100 — reprise telle quelle de « Dégustations entre amis »
   (l'identité du projet) : ne pas reformuler les paliers. */
const PALIERS = [
  [75, "70–74", "On boit une gorgée pour ne pas vexer."],
  [80, "75–79", "Un verre, pour faire plaisir à un vieux copain."],
  [85, "80–84", "Intéressant, mais pas encore digne de la cave."],
  [90, "85–89", "Un bon vin avec du caractère : on commence à l'acheter."],
  [94, "90–93", "Très bon, il mérite d'être en cave."],
  [95, "94–95", "Superbe, mémorable : prêt à faire des centaines de km."],
  [98, "96–97", "Vin d'exception, expérience unique."],
  [100, "98–99", "Qui l'ouvre sans nous ne nous adressera plus la parole."],
  [Infinity, "100", "La licorne : nous la cherchons toujours."],
];

/* { palier: "85–89", texte: "Un bon vin avec du caractère…" } pour la note v */
export function notePalier(v) {
  const n = parseInt(v) || 0;
  const p = PALIERS.find(([max]) => n < max);
  return { palier: p[1], texte: p[2] };
}
