/* Backend D1 : pousse/pull/photo/jeton, dernier-qui-écrit-gagne, docs partagés.
   Le binding D1 est simulé par node:sqlite (mêmes requêtes SQL que le worker).
   — node test/d1.test.js */
import { DatabaseSync } from "node:sqlite";

let ok = 0, ko = 0;
function check(nom, cond) { if (cond) { ok++; } else { ko++; console.error("ECHEC:", nom); } }

function mockDB() {
  const d = new DatabaseSync(":memory:");
  return {
    exec: sql => d.exec(sql),
    prepare: sql => { const st = d.prepare(sql); return { sql, bind: (...p) => ({ all: () => ({ results: st.all(...p) }), run: () => st.run(...p) }) }; },
    batch: async stmts => { for (const s of stmts) { if (s && s.sql != null && !s.bind) d.prepare(s.sql).run(...(s.params || [])); else if (s && s.sql != null) d.prepare(s.sql).run(...(s.params || [])); } }
  };
}
function mockKV() {
  const m = new Map();
  return { get: async k => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); }, delete: async k => { m.delete(k); }, _m: m };
}

const worker = (await import("../public/_worker.js")).default;
const TOKEN = "jeton-secret";
const env = { DB: mockDB(), PHOTOS: mockKV(), MA_CAVE_TOKEN: TOKEN };
const H = { "Content-Type": "application/json", "Authorization": "Bearer " + TOKEN };

async function req(url, method, headers, body) {
  return await worker.fetch(new Request("https://app.test" + url, { method, headers: headers || {}, body: body ? JSON.stringify(body) : undefined }), env);
}
const pull = async profil => (await (await req("/api/db/pull?profil=" + profil, "GET", H)).json());

/* 1. Jeton : 401 sans jeton, 401 mauvais jeton, ok avec le bon */
const r1 = await req("/api/db/pull?profil=thomas", "GET");
check("401 sans jeton", r1.status === 401);
const r2 = await req("/api/db/pull?profil=thomas", "GET", { Authorization: "Bearer faux" });
check("401 mauvais jeton", r2.status === 401);
const r3 = await req("/api/db/pull?profil=thomas", "GET", H);
check("200 bon jeton", r3.status === 200 && (await r3.json()).ok === true);

/* 2. Push : 2 bouteilles (photo détachée), doc bues, doc listes partagé (thomas) */
const p1 = await (await req("/api/db/push", "POST", H, {
  profil: "thomas",
  actions: [
    { t: "b", b: { id: "b1", nom: "Riesling", modifLe: "2026-11-01T10:00:00.000Z", quantite: 3, photo: "data:image/jpeg;base64,AAA" } },
    { t: "b", b: { id: "b2", nom: "Gewurz", modifLe: "2026-11-02T10:00:00.000Z", quantite: 1 } },
    { t: "p", k: "p/thomas/b1", data: "data:image/jpeg;base64,AAA" },
    { t: "d", k: "bues", profil: "thomas", data: [{ id: "e1", nom: "Riesling" }], maj: "2026-11-02T12:00:00.000Z" },
    { t: "d", k: "listes", profil: "thomas", data: [{ id: "l1", nom: "Noel" }], maj: "2026-11-02T12:00:00.000Z" }
  ]
})).json();
check("push ok", p1.ok && p1.n === 4 && p1.photos === 1);

const j1 = await pull("thomas");
check("pull bouteilles", j1.bouteilles.length === 2 && j1.bouteilles.find(b => b.id === "b1").nom === "Riesling");
check("photo detachée du data", j1.bouteilles.find(b => b.id === "b1").ph === 1 && !j1.bouteilles.find(b => b.id === "b1").photo);
check("docs bues", Array.isArray(j1.docs.bues.data) && j1.docs.bues.data[0].id === "e1");
check("marqueur photo", j1.bouteilles.find(b => b.id === "b1").ph === 1);

/* 3. Photo GET : renvoie le base64, 404 pour une clé inconnue */
const rph = await req("/api/db/photo?k=p/thomas/b1", "GET", H);
check("photo lisible", rph.ok && (await rph.text()) === "data:image/jpeg;base64,AAA");
const rph2 = await req("/api/db/photo?k=p/thomas/zz", "GET", H);
check("photo inconnue 404", rph2.status === 404);

/* 4. Dernier qui écrit gagne : modifLe plus ancien n'écrase pas */
await req("/api/db/push", "POST", H, { profil: "thomas", actions: [
  { t: "b", b: { id: "b1", nom: "Riesling ANCIEN", modifLe: "2026-10-01T10:00:00.000Z", quantite: 9 } }
] });
const j2 = await pull("thomas");
check("LWW ancien ignoré", j2.bouteilles.find(b => b.id === "b1").nom === "Riesling");
await req("/api/db/push", "POST", H, { profil: "thomas", actions: [
  { t: "b", b: { id: "b1", nom: "Riesling nouveau", modifLe: "2026-11-05T10:00:00.000Z", quantite: 2 } }
] });
const j3 = await pull("thomas");
check("LWW récent appliqué", j3.bouteilles.find(b => b.id === "b1").nom === "Riesling nouveau");

/* 5. Suppression b- (et photo KV associée) */
await req("/api/db/push", "POST", H, { profil: "thomas", actions: [{ t: "b-", id: "b2" }] });
const j4 = await pull("thomas");
check("suppression propagée", j4.bouteilles.length === 1 && !j4.bouteilles.find(b => b.id === "b2"));

/* 6. Docs partagés : marc voit les listes stockées sous thomas */
const jm = await pull("marc");
check("listes partagées vues par marc", jm.docs.listes && jm.docs.listes.data[0].id === "l1");
check("bouteilles thomas invisibles pour marc", jm.bouteilles.length === 0);

/* 7. Profils séparés : bouteille marc */
await req("/api/db/push", "POST", H, { profil: "marc", actions: [
  { t: "b", b: { id: "m1", nom: "Tokaji", modifLe: "2026-11-03T10:00:00.000Z", quantite: 1 } }
] });
check("profil marc isolé", (await pull("marc")).bouteilles.length === 1 && (await pull("thomas")).bouteilles.length === 1);

/* 8. Sans binding DB : message clair plutôt que crash */
const r8 = await worker.fetch(new Request("https://app.test/api/db/pull?profil=thomas", { method: "GET", headers: H }), { MA_CAVE_TOKEN: TOKEN });
check("binding absent 500 explicite", r8.status === 500 && /D1/.test((await r8.json()).error));

console.log(`d1.test.js : ${ok} OK, ${ko} ECHEC${ko ? " — FIXE AVANT DE POUSSER" : ""}`);
process.exit(ko ? 1 : 0);
