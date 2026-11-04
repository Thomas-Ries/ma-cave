/* Validateur de template : extrait TOUTES les expressions des .vue
   (interpolations {{ }} et bindings :x="…") et vérifie qu'elles parsent
   comme du JavaScript. Il aurait attrapé en 2 s le bug « passée(s) l'apogée »
   (apostrophe brute fermant la chaîne d'une interpolation, v2.9.56).
   — node test/template.test.js */
import { readdirSync, readFileSync, statSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const racine = join(dirname(fileURLToPath(import.meta.url)), "..");
const vues = readdirSync(join(racine, "src", "views")).map(f => join(racine, "src", "views", f));
const comps = readdirSync(join(racine, "src", "components")).map(f => join(racine, "src", "components", f));

let ok = 0, ko = 0;
const erreurs = [];

/* Certains bindings ne sont pas des expressions JS pures (v-for source,
   arguments @x="…"). On ne teste pas : @, v-, aria non-bindé. */
const INTERP = /\{\{([\s\S]*?)\}\}/g;
const BIND = /\s:([a-zA-Z\-\.]+)="([^"]*)"/g;

for (const fichier of [...vues, ...comps]) {
  if (!fichier.endsWith(".vue") || !statSync(fichier).isFile()) continue;
  const src = readFileSync(fichier, "utf8");
  const tpl = src.match(/<template>[\s\S]*<\/template>/)?.[0] || "";
  const nom = fichier.split("/").pop();

  for (const m of tpl.matchAll(INTERP)) {
    ok++;
    try { new Function("return (" + m[1] + ")"); }
    catch (e) { ko++; erreurs.push(`❌ ${nom} {{ ${m[1].trim().slice(0, 80)} }} → ${e.message}`); }
  }
  for (const m of tpl.matchAll(BIND)) {
    /* :key="p.id" etc. — expressions ; on saute v-bind dynamiques vides */
    if (!m[2].trim()) continue;
    ok++;
    try { new Function("return (" + m[2] + ")"); }
    catch (e) { ko++; erreurs.push(`❌ ${nom} :${m[1]}="${m[2].trim().slice(0, 80)}" → ${e.message}`); }
  }
}

console.log("Validateur de template — expressions des .vue");
if (erreurs.length) for (const e of erreurs) console.log(e);
console.log(`\n${ok} expressions vérifiées dans ${vues.length + comps.length} fichiers — ${ok - ko} valides${ko ? ", " + ko + " INVALIDES" : ""}`);
process.exit(ko ? 1 : 0);
