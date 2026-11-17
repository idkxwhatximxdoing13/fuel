/* Fuel – personal calorie / weight app. All data stays on this device (IndexedDB). */
"use strict";
// Stamped by _build/stamp.sh before every release (same value as VERSION in sw.js) – do not edit by hand.
const APP_VERSION = "2026.11.17-155549";

// ---------- tiny helpers ----------
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const r0 = (n) => Math.round(n || 0);
const r1 = (n) => Math.round((n || 0) * 10) / 10;
const num = (v) => { if (v === null || v === undefined || v === "") return null; const n = parseFloat(String(v).replace(",", ".")); return isFinite(n) ? n : null; };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const dkey = (d = new Date()) => { const z = new Date(d); return `${z.getFullYear()}-${String(z.getMonth() + 1).padStart(2, "0")}-${String(z.getDate()).padStart(2, "0")}`; };
const parseDkey = (k) => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (k, n) => { const d = parseDkey(k); d.setDate(d.getDate() + n); return dkey(d); };
const daysBetween = (a, b) => Math.round((parseDkey(b) - parseDkey(a)) / 86400000);
const fold = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); // "brânză" → "branza"
const LOC = "en-GB"; // the app is in English, so dates are too (whatever language the phone is set to)
const WD = ["S", "M", "T", "W", "T", "F", "S"], MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const shortDate = (k) => parseDkey(k).toLocaleDateString(LOC, { day: "numeric", month: "short" });
const longDate = (k) => parseDkey(k).toLocaleDateString(LOC, { weekday: "short", day: "numeric", month: "short" });
// "2 large eggs", "3 tomatoes", but "2 tbsp" and "2 cup (244 ml)" stay as they are
const plural = (lbl, n) => {
  if (n === 1 || /\)$/.test(lbl) || /(^|\s)(tbsp|tsp|ml|g|kg|oz|buc)$/i.test(lbl)) return lbl;
  if (/(s|x|ch|sh)$/i.test(lbl)) return lbl + "es";
  if (/[^aeiou]y$/i.test(lbl)) return lbl.slice(0, -1) + "ies";
  if (/(tomato|potato)$/i.test(lbl)) return lbl + "es";
  return lbl + "s";
};
const unitOf = (basis) => (basis === "ml" ? "ml" : "g");
const fmtL = (ml) => String(Math.round(ml / 10) / 100); // 250 ml → "0.25", 1500 → "1.5"
const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const svg = (d, cls = "") => `<svg class="i${cls ? " " + cls : ""}" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const I = {
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  minus: svg('<path d="M5 12h14"/>'),
  x: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  more: svg('<circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/>', "fill"),
  star: svg('<path d="M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.6 9.7l5.8-.8z"/>'),
  chev: svg('<path d="M6 9l6 6 6-6"/>'),
  search: svg('<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>'),
  scan: svg('<path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16"/><path d="M8 8v8M11 8v8M14 8v8M16.5 8v8"/>'),
  spark: svg('<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>'),
  bolt: svg('<path d="M13 3L5 13.5h6L10 21l8-10.5h-6z"/>'),
  camera: svg('<path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1.4-2h6.2l1.4 2h2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z"/><circle cx="12" cy="13" r="3.4"/>'),
  meal: svg('<path d="M7 4h10a1 1 0 0 1 1 1v15l-6-3.5L6 20V5a1 1 0 0 1 1-1z"/>'),
  check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  bag: svg('<path d="M6.5 8.5h11l1 10.9a1 1 0 0 1-1 1.1h-11a1 1 0 0 1-1-1.1z"/><path d="M9 11.5V7a3 3 0 0 1 6 0v4.5"/>'),
  image: svg('<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><circle cx="8.6" cy="9.8" r="1.5"/><path d="M4.5 17l4.6-4.6 3.2 3.2 2.6-2.6 4.6 4.6"/>'),
};

// toast with an optional action button (UNDO etc). Uses the top layer so it shows above open sheets.
function toast(msg, opts = {}) {
  const t = $("#toast"); clearTimeout(toast._t);
  t.innerHTML = `<span>${esc(msg)}</span>${opts.action ? `<button>${esc(opts.action)}</button>` : ""}`;
  if (opts.action) $("button", t).onclick = () => { hideToast(); opts.onAction(); };
  t.classList.remove("hidden");
  if (t.showPopover) { try { if (t.matches(":popover-open")) t.hidePopover(); t.showPopover(); } catch {} }
  toast._t = setTimeout(hideToast, opts.ms || (opts.action ? 5000 : 2600));
}
function hideToast() { const t = $("#toast"); t.classList.add("hidden"); if (t.hidePopover) { try { t.hidePopover(); } catch {} } }

// ---------- storage (IndexedDB key/value) ----------
const DB = {
  db: null,
  open() {
    return new Promise((res, rej) => {
      const rq = indexedDB.open("fuel", 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore("kv");
      rq.onsuccess = () => { this.db = rq.result; res(); };
      rq.onerror = () => rej(rq.error);
    });
  },
  get(k) { return new Promise((res, rej) => { const rq = this.db.transaction("kv").objectStore("kv").get(k); rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); }); },
  set(k, v) { return new Promise((res, rej) => { const tx = this.db.transaction("kv", "readwrite"); tx.objectStore("kv").put(v, k); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); }); },
};
// Everything the app stores. "ai" (the API key) and "meta" (this phone's own notes, e.g. last backup) never go into a backup file.
const DEFAULTS = () => ({ profile: {}, weights: [], log: {}, products: {}, myfoods: {}, favs: {}, meals: {}, water: {} });
const DATA_KEYS = Object.keys(DEFAULTS());
const KEYS = [...DATA_KEYS, "ai", "meta"];
const S = { ...DEFAULTS(), ai: { model: "claude-opus-5-5" }, meta: {} };
async function loadAll() { for (const k of KEYS) { const v = await DB.get(k); if (v !== undefined && v !== null) S[k] = v; } }
function save(...keys) { return Promise.all(keys.map((k) => DB.set(k, S[k]))).catch((e) => toast("Save failed: " + e.message)); }

// ---------- nutrition maths ----------
const GOALS = { lose: "Lose fat", recomp: "Recomp", gain: "Build muscle" };
const sortedW = () => [...S.weights].sort((a, b) => a.date.localeCompare(b.date));
function latestWeight() { const w = sortedW(); return w.length ? w[w.length - 1].kg : null; }
function trendWeight() {
  // average of weigh-ins in the 7 days up to the latest one (smooths water swings)
  const w = sortedW(); if (!w.length) return null;
  const last = w[w.length - 1].date, recent = w.filter((x) => daysBetween(x.date, last) <= 7);
  return recent.reduce((s, x) => s + x.kg, 0) / recent.length;
}
function targets() {
  const p = S.profile, kg = trendWeight();
  if (!p.height || !p.birthYear || !p.sex || !kg) return null;
  const age = new Date().getFullYear() - p.birthYear;
  const h = p.height, act = parseFloat(p.activity || "1.375");
  const bmr = 10 * kg + 6.25 * h - 5 * age + (p.sex === "f" ? -161 : 5); // Mifflin-St Jeor
  const formulaTdee = bmr * act;
  const tdee = p.tdeeOverride || formulaTdee;
  const bmi = kg / Math.pow(h / 100, 2);
  const suggested = bmi >= 25 ? "lose" : bmi < 20 ? "gain" : "recomp";
  const goal = p.goal && p.goal !== "auto" ? p.goal : suggested;
  const factor = { lose: 0.8, recomp: 0.9, gain: 1.1 }[goal];
  const kcal = p.kcalOverride || Math.round((tdee * factor) / 10) * 10;
  const refKg = Math.min(kg, 25 * Math.pow(h / 100, 2)); // protein on weight at BMI 25 if above it
  const prot = Math.round(1.8 * refKg);
  const fat = Math.round((kcal * 0.25) / 9);
  const carbs = Math.max(0, Math.round((kcal - prot * 4 - fat * 9) / 4));
  return { kg, age, bmr: r0(bmr), formulaTdee: r0(formulaTdee), tdee: r0(tdee), bmi: r1(bmi), suggested, goal, kcal: r0(kcal), prot, fat, carbs, auto: !p.goal || p.goal === "auto" };
}
function dayTotals(k) {
  const t = { kcal: 0, p: 0, c: 0, f: 0 };
  for (const e of S.log[k] || []) { t.kcal += e.kcal; t.p += e.p; t.c += e.c; t.f += e.f; }
  return t;
}
const LOGGED = 300; // a day counts as "logged" above this many kcal (streaks, medals, burn estimate)
const isLogged = (k) => dayTotals(k).kcal > LOGGED;
function dayStatus(k, T) {
  const t = dayTotals(k).kcal; if (t <= LOGGED) return "";
  if (!T) return "logged";
  if (t > T.kcal * 1.1) return "over";
  return t >= T.kcal * 0.85 ? "hit" : "logged";
}
function streak() {
  let k = dkey(); if (!isLogged(k)) k = addDays(k, -1); // today not logged yet doesn't break it
  let n = 0; while (isLogged(k)) { n++; k = addDays(k, -1); }
  return n;
}
function bestStreak() {
  const days = Object.keys(S.log).filter(isLogged).sort(); let best = 0, run = 0, prev = null;
  for (const k of days) { run = prev && daysBetween(prev, k) === 1 ? run + 1 : 1; best = Math.max(best, run); prev = k; }
  return best;
}
// slope of weight in kg/day over the last `days` days (linear fit), or null
function weightSlope(days = 35) {
  const from = addDays(dkey(), -days), w = sortedW().filter((x) => x.date >= from);
  if (w.length < 2 || daysBetween(w[0].date, w[w.length - 1].date) < 10) return null;
  const x0 = parseDkey(w[0].date), xs = w.map((p) => (parseDkey(p.date) - x0) / 86400000), ys = w.map((p) => p.kg);
  const mx = xs.reduce((a, b) => a + b) / xs.length, my = ys.reduce((a, b) => a + b) / ys.length;
  let n_ = 0, d_ = 0; xs.forEach((x, i) => { n_ += (x - mx) * (ys[i] - my); d_ += (x - mx) ** 2; });
  return d_ ? n_ / d_ : null;
}
// Real-world burn from logged food vs weight change (needs ≥14 days span, ≥10 logged days)
function adaptiveEstimate() {
  const from = addDays(dkey(), -35);
  const w = sortedW().filter((x) => x.date >= from);
  if (w.length < 2 || daysBetween(w[0].date, w[w.length - 1].date) < 14) return { ok: false, why: "Needs 2+ weigh-ins at least 2 weeks apart." };
  const slope = weightSlope(35);
  const days = []; for (let k = w[0].date; k <= w[w.length - 1].date; k = addDays(k, 1)) { const t = dayTotals(k); if (t.kcal > LOGGED) days.push(t.kcal); }
  if (days.length < 10) return { ok: false, why: `Needs 10 logged days in that time (have ${days.length}).` };
  const avgIn = days.reduce((a, b) => a + b) / days.length;
  return { ok: true, est: r0(avgIn - slope * 7700), avgIn: r0(avgIn), perWeek: r1(slope * 7), loggedDays: days.length };
}

// ---------- foods / products ----------
// product: {id, name, brand, barcode, basis:'g'|'ml', per100:{kcal,p,c,f}, packG, servingG, pieceG, piecesPerPack, pieceLabel, source}
function pieceG(prod) { if (prod.pieceG) return prod.pieceG; if (prod.packG && prod.piecesPerPack) return prod.packG / prod.piecesPerPack; return null; }
let _builtin = null;
function builtinFoods() { return (_builtin ||= (window.BUILTIN_FOODS || []).map((f) => ({ id: "usda:" + f.fdc, name: f.name, basis: "g", per100: f.per100, pieceG: f.unit?.g || null, pieceLabel: f.unit?.label || null, source: "usda" }))); }
function allFoods() { return [...Object.values(S.myfoods), ...Object.values(S.products), ...builtinFoods()]; }
function findFood(id) { if (!id) return null; if (S.products[id]) return S.products[id]; if (S.myfoods[id]) return S.myfoods[id]; for (const p of Object.values(S.products)) if (p.id === id) return p; return builtinFoods().find((f) => f.id === id) || null; }
function saveProduct(prod) {
  if (prod.barcode) { S.products[prod.barcode] = prod; return save("products"); }
  S.myfoods[prod.id] = prod; return save("myfoods");
}

async function lookupOFF(code) {
  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=product_name,product_name_ro,product_name_en,brands,quantity,product_quantity,product_quantity_unit,serving_size,serving_quantity,nutriments`;
  let r;
  try { r = await fetch(url); } catch { const e = new Error("offline"); e.offline = true; throw e; }
  if (r.status === 404) return null;
  if (!r.ok) throw new Error("Food database error " + r.status);
  const j = await r.json();
  if (j.status !== 1 || !j.product) return null;
  const P = j.product, n = P.nutriments || {};
  let kcal = num(n["energy-kcal_100g"]);
  if (kcal === null && num(n["energy-kj_100g"]) !== null) kcal = num(n["energy-kj_100g"]) / 4.184;
  const unit = (P.product_quantity_unit || "").toLowerCase();
  return {
    id: "bc:" + code, barcode: code, source: "openfoodfacts",
    name: P.product_name_ro || P.product_name || P.product_name_en || "Unnamed product",
    brand: (P.brands || "").split(",")[0].trim(),
    basis: unit === "ml" || unit === "l" ? "ml" : "g",
    per100: { kcal: kcal === null ? null : r1(kcal), p: num(n.proteins_100g), c: num(n.carbohydrates_100g), f: num(n.fat_100g) },
    packG: num(P.product_quantity), servingG: num(P.serving_quantity), piecesPerPack: null, pieceG: null,
    quantityText: P.quantity || "",
  };
}
const complete = (p) => p && p.per100 && [p.per100.kcal, p.per100.p, p.per100.c, p.per100.f].every((v) => v !== null && v !== undefined);

// ---------- AI (Claude) ----------
function aiClient() {
  if (!S.ai.apiKey) throw new Error("No API key yet. Add one in Me → AI.");
  return new Vendor.Anthropic({ apiKey: S.ai.apiKey, dangerouslyAllowBrowser: true, maxRetries: 2 });
}
async function askClaude(content, schema) {
  const model = S.ai.model || "claude-opus-5-5";
  const req = {
    model, max_tokens: 16000,
    output_config: { effort: "low", format: { type: "json_schema", schema } },
    messages: [{ role: "user", content }],
  };
  // Server-side fallback if a safety filter wrongly declines (Opus/Sonnet only)
  if (!model.includes("haiku")) { req.betas = ["server-side-fallback-2026-07-01"]; req.fallbacks = "default"; }
  let msg;
  try { msg = await aiClient().beta.messages.create(req); }
  catch (e) {
    if (e instanceof Vendor.Anthropic.AuthenticationError) throw new Error("API key was rejected. Check it in Me → AI.");
    if (e instanceof Vendor.Anthropic.RateLimitError) throw new Error("Too many requests right now – try again in a minute.");
    if (e instanceof Vendor.Anthropic.APIConnectionError) throw new Error("No connection to the AI service.");
    if (e instanceof Vendor.Anthropic.APIError) throw new Error("AI error: " + (e.message || e.status));
    throw e;
  }
  if (msg.stop_reason === "refusal") throw new Error("The AI declined this one. Enter the values by hand.");
  if (msg.stop_reason === "max_tokens") throw new Error("The AI answer got cut off. Try again.");
  const text = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  try { return JSON.parse(text); } catch { throw new Error("Couldn't understand the AI answer. Try again."); }
}
const nn = (t) => ({ anyOf: [{ type: t }, { type: "null" }] });
const LABEL_SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["name", "brand", "basis", "kcal_100", "protein_100", "carbs_100", "fat_100", "serving_g", "pack_g", "pieces_per_pack", "piece_name", "notes"],
  properties: {
    name: { type: "string" }, brand: nn("string"), basis: { type: "string", enum: ["g", "ml"] },
    kcal_100: nn("number"), protein_100: nn("number"), carbs_100: nn("number"), fat_100: nn("number"),
    serving_g: nn("number"), pack_g: nn("number"), pieces_per_pack: nn("number"), piece_name: nn("string"), notes: { type: "string" },
  },
};
const LABEL_PROMPT = `These photos show a food package (nutrition table and maybe the front). Labels are often Romanian or another European language and use commas as decimals (e.g. "12,5 g").
Read the values PER 100 g (or per 100 ml for drinks). Rules:
- kcal_100: energy in kcal per 100 g/ml. If only kJ is shown, divide by 4.184.
- If only per-serving values are shown, convert to per 100 using the serving size.
- carbs_100 is total carbohydrates ("glucide"), not sugars ("din care zaharuri"). fat_100 is total fat ("grăsimi").
- pack_g: net weight/volume of the whole pack ("masa netă", "e" mark). serving_g: one serving if stated.
- pieces_per_pack: number of pieces in the pack if stated or clearly visible (e.g. "8 tortillas", "6 buc", "10 felii"); piece_name: what one piece is called in English (e.g. "tortilla", "slice").
- name: short product name in the label's language; brand if visible.
- Use null for anything you cannot read with confidence. Never guess numbers. Put any doubts in notes (one short sentence, English).`;
const MEAL_SCHEMA = {
  type: "object", additionalProperties: false, required: ["items", "note"],
  properties: {
    items: { type: "array", items: { type: "object", additionalProperties: false, required: ["name", "grams", "kcal", "protein", "carbs", "fat"],
      properties: { name: { type: "string" }, grams: { type: "number" }, kcal: { type: "number" }, protein: { type: "number" }, carbs: { type: "number" }, fat: { type: "number" } } } },
    note: { type: "string" },
  },
};
const MEAL_RULES = `Split it into separate ingredients/items. For each item give the eaten amount in grams and total kcal, protein, carbs, fat (grams) FOR THAT AMOUNT. Count cooking fat (oil, butter) as its own item when it's mentioned or clearly implied (e.g. "fried"). Use typical European portion sizes when no amount is given, and say what you assumed in note (one short sentence, English).`;
const MEAL_PROMPT = (txt) => `Estimate the nutrition of this meal someone ate. ${MEAL_RULES} Meal: """${txt}"""`;
const PLATE_PROMPT = (txt) => `The photo shows a meal someone is about to eat. Identify the foods and estimate the portion sizes from the plate, cutlery and packaging you can see, then estimate the nutrition. ${MEAL_RULES}${txt ? ` Extra info from the person: """${txt}"""` : ""}`;
// A delivery or restaurant order: one line per dish (not per ingredient), with how many were ordered, so the amount eaten can be changed in portions.
const ORDER_SCHEMA = {
  type: "object", additionalProperties: false, required: ["restaurant", "items", "note"],
  properties: {
    restaurant: nn("string"),
    items: { type: "array", items: { type: "object", additionalProperties: false, required: ["name", "count", "basis", "grams", "kcal", "protein", "carbs", "fat", "source"],
      properties: { name: { type: "string" }, count: { type: "number" }, basis: { type: "string", enum: ["g", "ml"] }, grams: { type: "number" }, kcal: { type: "number" }, protein: { type: "number" }, carbs: { type: "number" }, fat: { type: "number" }, source: { type: "string", enum: ["shown", "estimate"] } } } },
    note: { type: "string" },
  },
};
const ORDER_RULES = `List what was ordered: one item per dish or drink, as written on the order. Do not split a dish into ingredients. A combo or menu ("meniu") becomes its parts (burger, fries, drink), each its own item. Extras chosen for a dish (extra cheese, a sauce inside it) count into that dish. Leave out everything that is not food or drink: delivery and service fees, tips, bags, cutlery, discounts, bottle deposits ("garanție").
For each item:
- name: short, as on the menu, in the menu's language.
- count: how many were ordered ("2x" means 2; 1 if not shown). If the person says they ate only part of something, use that share instead (half a pizza is 0.5).
- grams, kcal, protein, carbs, fat: for ONE of it, never for the whole line. Example: "2x Cheeseburger" gives count 2 and the weight and nutrition of one cheeseburger.
- basis: "ml" for drinks (grams is then the volume in ml), otherwise "g".
- If a weight, volume or nutrition values are shown for the item, use them; convert values given per 100 g/ml with the portion weight. Romanian text uses commas as decimals; if energy is in kJ only, divide by 4.184.
- Otherwise estimate: for a well-known chain use that chain's usual values for the item; for any other place assume a typical restaurant portion (larger and richer than home cooking).
- grams is never 0: give your best estimate of the weight of one portion.
- source: "shown" only when the kcal of this item is printed in what you were given, otherwise "estimate".
restaurant: the short name of the place (e.g. "KFC"), no branch or address; null if unknown.
note: one short sentence in English on what you assumed, or "" if nothing.
If there is no food order here, return no items and say so in note.`;
const ORDER_PROMPT = (txt, shots) => (shots
  ? `${shots > 1 ? "These screenshots show" : "This screenshot shows"} a food order from a delivery app or a restaurant (basket, order summary, receipt or a dish page), often in Romanian.${shots > 1 ? " They may overlap: count each ordered line once." : ""}\n${ORDER_RULES}${txt ? `\nExtra info from the person: """${txt}"""` : ""}`
  : `Someone ordered food from a delivery app or a restaurant and describes it like this: """${txt}"""\n${ORDER_RULES}`);

async function fileToImageBlock(file) {
  const bmp = await createImageBitmap(file).catch(() => null);
  let w, h, src;
  if (bmp) { w = bmp.width; h = bmp.height; src = bmp; }
  else { const img = new Image(); img.src = URL.createObjectURL(file); await img.decode(); w = img.naturalWidth; h = img.naturalHeight; src = img; }
  const scale = Math.min(1, 1568 / Math.max(w, h));
  const c = document.createElement("canvas"); c.width = Math.round(w * scale); c.height = Math.round(h * scale);
  c.getContext("2d").drawImage(src, 0, 0, c.width, c.height);
  const data = c.toDataURL("image/jpeg", 0.85).split(",")[1];
  return { type: "image", source: { type: "base64", media_type: "image/jpeg", data } };
}

// ---------- log helpers (add / delete with undo) ----------
let curDay = dkey(), lastToday = dkey(), curTab = "today";
const MEALS = [["breakfast", "Breakfast"], ["lunch", "Lunch"], ["dinner", "Dinner"], ["snacks", "Snacks"]];
const MEAL_NAME = Object.fromEntries(MEALS);
let addMeal = null; // set when adding from one meal's own "+": every route inside that sheet then logs to this meal
function defaultMeal() { if (addMeal) return addMeal; const h = new Date().getHours(); return h < 11 ? "breakfast" : h < 16 ? "lunch" : h < 21 ? "dinner" : "snacks"; }
const mealFor = (last) => addMeal || (curDay === dkey() || !last?.meal ? defaultMeal() : last.meal);
const entryKey = (e) => e.ref || "n:" + fold(e.name);
const dayLabel = () => (curDay === dkey() ? "today" : shortDate(curDay));
const cleanEntry = (e) => { const { id, ts, ...rest } = e; return rest; };
const sum4 = (list) => list.reduce((s, e) => ({ kcal: s.kcal + e.kcal, p: s.p + e.p, c: s.c + e.c, f: s.f + e.f }), { kcal: 0, p: 0, c: 0, f: 0 });
const four = (t, dec = r1) => `<div><b>${r0(t.kcal)}</b><span>kcal</span></div><div><b>${dec(t.p)}</b><span>protein</span></div><div><b>${dec(t.c)}</b><span>carbs</span></div><div><b>${dec(t.f)}</b><span>fat</span></div>`;
const nItems = (n) => `${n} item${n === 1 ? "" : "s"}`;

async function addEntries(list, msg) {
  if (!list.length) return;
  const key = curDay, day = (S.log[key] ||= []), ids = [];
  for (const e of list) { const x = { ...e, id: uid(), ts: Date.now() }; day.push(x); ids.push(x.id); }
  await save("log");
  if (curTab !== "today") goTab("today"); else renderToday();
  for (const id of ids) $(`#meals [data-entry="${id}"]`)?.classList.add("new");
  toast(msg || `Added ${r0(sum4(list).kcal)} kcal`, { action: "Undo", onAction: async () => { S.log[key] = (S.log[key] || []).filter((x) => !ids.includes(x.id)); await save("log"); renderToday(); } });
}
async function deleteEntry(id) {
  const key = curDay, day = S.log[key] || [], i = day.findIndex((x) => x.id === id); if (i < 0) return;
  const [gone] = day.splice(i, 1); await save("log"); renderToday();
  toast(`Deleted ${gone.name}`, { action: "Undo", onAction: async () => { (S.log[key] ||= []).splice(i, 0, gone); await save("log"); renderToday(); } });
}
// one tap per action: blocks double taps on "Add" buttons
function guard(btn, fn) { return async (...a) => { if (btn.disabled) return; btn.disabled = true; try { await fn(...a); } finally { btn.disabled = false; } }; }
async function toggleFav(key, btn) {
  if (S.favs[key]) delete S.favs[key]; else S.favs[key] = true;
  btn?.classList.toggle("on", !!S.favs[key]);
  await save("favs"); renderMeals();
}

// foods eaten before (newest first), each with the last amount used
function history() {
  const map = new Map(), from = addDays(dkey(), -60);
  for (const k of Object.keys(S.log).sort().reverse()) for (const e of [...S.log[k]].reverse()) {
    const key = entryKey(e); const h = map.get(key);
    if (!h) map.set(key, { key, last: e, n: k >= from ? 1 : 0, lastDay: k });
    else if (k >= from) h.n++;
  }
  return [...map.values()];
}

// ---------- Today ----------
function setBar(el, val, max) { const pct = max ? Math.min(100, (val / max) * 100) : 0; el.style.width = pct + "%"; el.classList.toggle("over", !!max && val > max * 1.03); }

// Calorie ring: a 270° instrument dial. Drawn once; afterwards only the dash offset, the tick colours and the bead move,
// so changes animate. Deliberately plain techniques (dashed strokes + an HTML bead), which every iPhone draws the same way.
const RING = { len: 2 * Math.PI * 98 * 0.75, f: 0 };
function buildRing() {
  const C = 120, pt = (deg, r) => { const a = (deg * Math.PI) / 180; return [(C + r * Math.cos(a)).toFixed(2), (C + r * Math.sin(a)).toFixed(2)]; };
  const [x1, y1] = pt(135, 98), [x2, y2] = pt(405, 98), A = `M${x1},${y1}A98,98 0 1 1 ${x2},${y2}`, L = RING.len.toFixed(2);
  let ticks = "";
  for (let i = 0; i <= 54; i++) { const d = 135 + i * 5, M = i % 9 === 0, [a1, b1] = pt(d, 117), [a2, b2] = pt(d, M ? 109.5 : 112.5); ticks += `<line x1="${a1}" y1="${b1}" x2="${a2}" y2="${b2}"${M ? ' class="M"' : ""}/>`; }
  const dash = `stroke-dasharray="${L} ${L}" stroke-dashoffset="${L}"`;
  $("#ring").insertAdjacentHTML("afterbegin", `<svg viewBox="0 0 240 240" aria-hidden="true">
    <defs><linearGradient id="rg" gradientUnits="userSpaceOnUse" x1="30" y1="200" x2="210" y2="50"><stop offset="0" stop-color="#e8871c"/><stop offset="1" stop-color="#ffd494"/></linearGradient></defs>
    <g class="tk">${ticks}</g>
    <path class="track" d="${A}"/>
    <path class="fill g2" d="${A}" ${dash}/><path class="fill g1" d="${A}" ${dash}/><path class="fill arc" id="ringArc" d="${A}" stroke="url(#rg)" ${dash}/>
  </svg><div class="hand" id="ringHand"><i></i></div>`);
  $("#ringNum")._v = 0;
  void $("#ringArc").getBoundingClientRect(); // settle the empty state first, so the first real value sweeps in
}
function setRing(frac, over) {
  const f = Math.max(0, Math.min(1, frac || 0)), ring = $("#ring"), was = RING.f; RING.f = f;
  for (const p of $$(".fill", ring)) p.style.strokeDashoffset = (RING.len * (1 - f)).toFixed(2);
  $$(".tk line", ring).forEach((l, i) => { l.style.transitionDelay = (Math.abs(i / 54 - was) * 0.7).toFixed(2) + "s"; l.classList.toggle("lit", f > 0 && i / 54 <= f + 0.001); }); // ticks light up as the arc passes them
  $("#ringHand").style.transform = `rotate(${270 * f}deg)`;
  $("#ringArc").setAttribute("stroke", over ? "#ff6b4f" : "url(#rg)");
  ring.classList.toggle("over", !!over); ring.classList.toggle("empty", f === 0);
}
// numbers roll to their new value instead of jumping
function countTo(el, to) {
  to = Math.round(to || 0);
  const from = el._v ?? to; el._v = to;
  cancelAnimationFrame(el._raf); clearTimeout(el._to);
  if (from === to || reduceMotion() || document.hidden) { el.textContent = to; return; }
  const t0 = performance.now(), dur = 650;
  const step = (now) => { const p = Math.min(1, (now - t0) / dur); el.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3))); if (p < 1) el._raf = requestAnimationFrame(step); };
  el._raf = requestAnimationFrame(step);
  el._to = setTimeout(() => { cancelAnimationFrame(el._raf); el.textContent = to; }, dur + 200); // safety net if frames are throttled
}

function renderToday() {
  const today = dkey(), isToday = curDay === today, T = targets(), t = dayTotals(curDay);
  $("#dayTitle").textContent = isToday ? "Today" : curDay === addDays(today, -1) ? "Yesterday" : parseDkey(curDay).toLocaleDateString(LOC, { weekday: "long" });
  $("#daySub").textContent = longDate(curDay);
  const pick = $("#dayPick"); pick.max = today; pick.value = curDay;
  $("#backToday").classList.toggle("hidden", isToday);
  $("#streak").classList.toggle("hidden", !isToday);
  renderStrip(T);
  $("#setupHint").classList.toggle("hidden", !!T);
  const left = T ? T.kcal - t.kcal : 0, over = !!T && left < 0;
  setRing(T ? t.kcal / T.kcal : 0, over);
  const n = $("#ringNum"); countTo(n, T ? Math.abs(left) : t.kcal); n.classList.toggle("over", over);
  $("#ringLbl").textContent = T ? (over ? "kcal over" : "kcal left") : "kcal eaten";
  $("#pair").classList.toggle("hidden", !T);
  if (T) { countTo($("#eatenNum"), t.kcal); $("#targetNum").textContent = T.kcal; }
  const m = (v, tg) => `${r0(v)}<small>${tg ? ` / ${tg}g` : "g"}</small>`;
  $("#mP").innerHTML = m(t.p, T?.prot); setBar($("#bP"), t.p, T?.prot);
  $("#mC").innerHTML = m(t.c, T?.carbs); setBar($("#bC"), t.c, T?.carbs);
  $("#mF").innerHTML = m(t.f, T?.fat); setBar($("#bF"), t.f, T?.fat);
  renderMeals(); renderWater(); renderPill(); renderInstallHint();
}

// Day strip: the last five weeks (more if an older day is open), scrollable; newest on the right
let stripKey = "";
function renderStrip(T) {
  const strip = $("#dayStrip"), today = dkey();
  const back = Math.max(34, daysBetween(curDay, today) + 3);
  const key = addDays(today, -back) + ">" + today, keep = strip.scrollLeft, same = key === stripKey;
  let html = "";
  for (let i = back; i >= 0; i--) {
    const k = addDays(today, -i), d = parseDkey(k), first = d.getDate() === 1;
    html += `<button type="button" data-day="${k}" class="${dayStatus(k, T)}${k === curDay ? " cur" : ""}${k === today ? " today" : ""}"><span${first ? ' class="mo"' : ""}>${first ? MON[d.getMonth()].toUpperCase() : WD[d.getDay()]}</span><b>${d.getDate()}</b><i></i></button>`;
  }
  strip.innerHTML = html; stripKey = key;
  if (!strip.clientWidth) { stripKey = ""; return; } // tab not on screen: position it when it is shown
  if (same) strip.scrollLeft = keep;
  const b = $(".cur", strip); if (!b) return;
  const l = b.offsetLeft, r = l + b.offsetWidth;
  if (!same || l < strip.scrollLeft - 1 || r > strip.scrollLeft + strip.clientWidth + 1)
    strip.scrollLeft = daysBetween(curDay, today) <= 6 ? strip.scrollWidth : l - (strip.clientWidth - b.offsetWidth) / 2;
}

function renderMeals() {
  const today = dkey(), entries = S.log[curDay] || [], prev = S.log[addDays(curDay, -1)] || [];
  let html = "";
  if (!entries.length && prev.length) html += `<button class="copyday" id="copyDay">Repeat ${curDay === today ? "yesterday" : "the day before"} · ${nItems(prev.length)} · ${r0(sum4(prev).kcal)} kcal</button>`;
  html += `<div class="card meal">` + MEALS.map(([k, label]) => {
    const es = entries.filter((e) => e.meal === k);
    return `<div class="mhead"><span class="t">${label}</span>${es.length ? `<span class="k">${r0(sum4(es).kcal)}</span><button class="ib quiet" data-mealmenu="${k}" aria-label="${label} options">${I.more}</button>` : ""}<button class="ib" data-addto="${k}" aria-label="Add to ${label.toLowerCase()}">${I.plus}</button></div>
      ${es.length ? `<ul class="list">${es.map((e) => `<li class="tap" data-entry="${e.id}"><div class="name">${S.favs[entryKey(e)] ? '<span class="star">★</span> ' : ""}${esc(e.name)}<small>${esc(e.amountText || r0(e.grams) + " g")}</small></div><div class="kcal">${r0(e.kcal)}</div></li>`).join("")}</ul>` : ""}`;
  }).join(`<div class="msep"></div>`) + `</div>`;
  $("#meals").innerHTML = html;
}

function renderWater() {
  const ml = S.water[curDay] || 0, goal = S.profile.waterGoal || 2500;
  $("#waterNum").textContent = fmtL(ml);
  $("#waterGoal").textContent = ` / ${fmtL(goal)} L`;
  $("#waterBar").style.width = Math.min(100, (ml / goal) * 100) + "%";
}

function renderPill() {
  $("#streak").classList.toggle("on", isLogged(dkey())); // the flame lights up once today is logged
  $("#streakTxt").textContent = streak();
}

// Shown only in Safari on an iPhone: the app is meant to run from its Home Screen icon
function renderInstallHint() {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent), installed = navigator.standalone === true || matchMedia("(display-mode: standalone)").matches;
  $("#installHint").classList.toggle("hidden", !ios || installed || !!S.meta.hideInstall);
}

// ---------- Progress ----------
let chartRange = "3m";
function renderWeight() {
  const today = dkey(), w = sortedW(), T = targets();
  const tw = trendWeight(), goal = S.profile.goalKg, slope = weightSlope();
  let h;
  if (tw) {
    const first = w[0], ch = r1(tw - first.kg), wk = slope !== null ? r1(slope * 7) : 0;
    const wantDown = goal ? goal < tw : !T || T.goal !== "gain"; // which direction counts as progress
    h = `<div class="sec"><h3>Weight · 7-day average</h3>${wk ? `<span class="delta ${wk < 0 === wantDown ? "good" : "bad"}">${wk > 0 ? "+" : "−"}${Math.abs(wk)} kg / week</span>` : ""}</div>
      <div class="whero"><div class="num">${r1(tw).toFixed(1)}<small>KG</small></div><div class="since">${w.length > 1 ? `${ch > 0 ? "+" : ch < 0 ? "−" : ""}${Math.abs(ch)} kg<br>since ${shortDate(first.date)}` : "First weigh-in"}</div></div>`;
    if (goal) {
      const start = first.kg, done = start === goal ? 1 : Math.max(0, Math.min(1, (start - tw) / (start - goal)));
      const left = r1(Math.abs(tw - goal));
      let eta = "";
      if (left < 0.3) eta = "Goal reached";
      else if (slope && Math.sign(goal - tw) === Math.sign(slope) && Math.abs(slope) > 0.005) {
        const d = new Date(); d.setDate(d.getDate() + (goal - tw) / slope);
        eta = "On pace for " + d.toLocaleDateString(LOC, { month: "short", year: "numeric" });
      } else if (slope !== null) eta = "Off pace lately";
      h += `<div class="goal"><div class="bar"><div style="width:${r0(done * 100)}%"></div></div><div class="gl"><span>${left < 0.3 ? `Goal ${goal} kg` : `${left} kg to ${goal} kg`}</span><span>${eta}</span></div></div>`;
    }
  } else h = `<div class="sec"><h3>Weight</h3></div><div class="empty">No weigh-ins yet.</div>`;
  $("#wHead").innerHTML = h + `<button class="tint wide" id="logW">${I.plus}Log weight</button>`;

  $("#wList").innerHTML = w.length ? [...w].reverse().map((x) => `<li><div class="name">${parseDkey(x.date).toLocaleDateString(LOC, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</div><div class="kcal">${Number(x.kg).toFixed(1)}</div><button class="ib quiet" data-delw="${x.date}" aria-label="Delete this weigh-in">${I.x}</button></li>`).join("") : `<li class="empty">No weigh-ins yet.</li>`;

  // chart: weigh-ins as dim dots, the 7-day average as the bright line, the goal as a dashed line
  if (w.length >= 2) {
    const from = chartRange === "1m" ? addDays(today, -31) : chartRange === "3m" ? addDays(today, -92) : "";
    let pts = w.filter((x) => x.date >= from); if (pts.length < 2) pts = w.slice(-2);
    const trend = w.map((p) => { const near = w.filter((q) => q.date <= p.date && daysBetween(q.date, p.date) <= 6); return { date: p.date, kg: near.reduce((s, q) => s + q.kg, 0) / near.length }; }).filter((p) => p.date >= pts[0].date);
    const W = 520, H = 220, padL = 52, padR = 14, padY = 28;
    const t0 = parseDkey(pts[0].date), t1 = parseDkey(pts[pts.length - 1].date), span = Math.max(1, (t1 - t0) / 86400000);
    const ys = [...pts.map((p) => p.kg), ...trend.map((p) => p.kg)]; if (goal && Math.abs(goal - pts[pts.length - 1].kg) < 15) ys.push(goal);
    const lo = Math.floor(Math.min(...ys) - 0.5), hi = Math.ceil(Math.max(...ys) + 0.5);
    const X = (d) => padL + ((parseDkey(d) - t0) / 86400000 / span) * (W - padL - padR);
    const Y = (kg) => H - padY - ((kg - lo) / (hi - lo)) * (H - padY * 2);
    const line = trend.map((p, i) => `${i ? "L" : "M"}${X(p.date).toFixed(1)},${Y(p.kg).toFixed(1)}`).join(" ");
    const area = `${line} L${X(trend[trend.length - 1].date).toFixed(1)},${H - padY} L${X(trend[0].date).toFixed(1)},${H - padY} Z`;
    const grid = [lo, (lo + hi) / 2, hi].map((v) => `<line x1="${padL}" x2="${W - padR}" y1="${Y(v)}" y2="${Y(v)}" stroke="rgba(255,220,180,.06)"/><text x="2" y="${Y(v) + 6}">${r1(v)}</text>`).join("");
    const lastT = trend[trend.length - 1];
    $("#wChart").innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Weight chart">
      <defs><linearGradient id="wa" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f5a83c" stop-opacity=".28"/><stop offset="1" stop-color="#f5a83c" stop-opacity="0"/></linearGradient></defs>${grid}
      ${goal && goal >= lo && goal <= hi ? `<line x1="${padL}" x2="${W - padR}" y1="${Y(goal)}" y2="${Y(goal)}" stroke="#9fe07a" stroke-opacity=".7" stroke-dasharray="4 6"/><text x="${W - padR}" y="${Y(goal) - 7}" text-anchor="end" style="fill:#9fe07a">GOAL ${goal}</text>` : ""}
      <path d="${area}" fill="url(#wa)"/>
      ${pts.map((p) => `<circle cx="${X(p.date).toFixed(1)}" cy="${Y(p.kg).toFixed(1)}" r="3" fill="#6e6457"/>`).join("")}
      <path d="${line}" fill="none" stroke="#f5a83c" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/>
      <circle cx="${X(lastT.date).toFixed(1)}" cy="${Y(lastT.kg).toFixed(1)}" r="6" fill="#fff3e0" stroke="#f5a83c" stroke-width="3.5"/>
      <text x="${padL}" y="${H - 2}">${shortDate(pts[0].date)}</text><text x="${W - padR}" y="${H - 2}" text-anchor="end">${shortDate(pts[pts.length - 1].date)}</text></svg>`;
  } else $("#wChart").innerHTML = `<div class="empty">The chart appears after two weigh-ins.</div>`;

  renderWeekCard(T);
  renderMedals();

  const A = adaptiveEstimate();
  let html = `<div class="sec"><h3>Real burn</h3>${A.ok ? `<small>last ${A.loggedDays} logged days</small>` : ""}</div>`;
  if (!A.ok) html += `<div class="empty">${esc(A.why)}</div>`;
  else {
    html += `<div class="stats3" style="margin-top:0"><div><span class="lbl">Ate / day</span><strong>${A.avgIn}</strong></div><div><span class="lbl">Kg / week</span><strong>${A.perWeek > 0 ? "+" : ""}${A.perWeek}</strong></div><div><span class="lbl">Burn</span><strong style="color:var(--hi)">${A.est}</strong></div></div>
      <p class="muted small" style="margin:12px 0 0">Worked out from what you ate and how your weight moved. The formula guessed ${T ? T.formulaTdee : "—"}.</p>`;
    if (T) html += `<div class="btnrow"><button class="primary" id="useAdaptive">Use ${A.est}</button>${S.profile.tdeeOverride ? `<button id="clearAdaptive">Back to formula</button>` : ""}</div>`;
  }
  $("#adaptCard").innerHTML = html;
}

function renderWeekCard(T) {
  const today = dkey(), days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const tot = days.map(dayTotals), logged = tot.filter((t) => t.kcal > LOGGED);
  const max = Math.max(T?.kcal || 0, ...tot.map((t) => t.kcal), 1) * 1.08;
  const avg = (f) => (logged.length ? r0(logged.reduce((s, t) => s + t[f], 0) / logged.length) : "—");
  $("#weekCard").innerHTML = `<div class="sec"><h3>Last 7 days</h3><small>${logged.length} of 7 logged</small></div>
    <div class="weekbars">${T ? `<div class="tgt" style="bottom:${(T.kcal / max) * 100}%"></div>` : ""}${days.map((k, i) => `<div class="c ${dayStatus(k, T) === "over" ? "over" : tot[i].kcal > 0 ? "logged" : ""}${k === today ? " today" : ""}" data-day="${k}"><i style="height:${(tot[i].kcal / max) * 100}%"></i></div>`).join("")}</div>
    <div class="axis7">${days.map((k) => `<span>${WD[parseDkey(k).getDay()]}</span>`).join("")}</div>
    <div class="stats3"><div><span class="lbl">Avg kcal</span><strong>${avg("kcal")}</strong></div><div><span class="lbl">Protein</span><strong>${avg("p")}${logged.length ? "<small>g</small>" : ""}</strong></div><div><span class="lbl">On target</span><strong>${days.filter((k) => dayStatus(k, T) === "hit").length}<small>/7</small></strong></div></div>`;
}

function medals() {
  const st = bestStreak(), w = sortedW(), T = targets();
  const lost = w.length ? w[0].kg - (trendWeight() || w[0].kg) : 0;
  const days = Object.keys(S.log), allEntries = days.flatMap((k) => S.log[k]);
  const protDays = T ? days.filter((k) => dayTotals(k).p >= T.prot * 0.95).length : 0;
  const scans = Object.keys(S.products).length;
  return [
    ["First log", allEntries.length > 0, "1"], ["3-day streak", st >= 3, "3"], ["Week streak", st >= 7, "7"], ["30 days", st >= 30, "30"],
    ["First scan", scans >= 1, "▦"], ["25 products", scans >= 25, "25"], ["Protein ×10", protDays >= 10, "P"], ["10 weigh-ins", w.length >= 10, "10"],
    ["−1 kg", lost >= 1, "1"], ["−5 kg", lost >= 5, "5"], ["−10 kg", lost >= 10, "10"], ["Goal hit", !!S.profile.goalKg && w.length > 1 && Math.abs((trendWeight() || 0) - S.profile.goalKg) < 0.3, "★"],
  ];
}
function renderMedals() {
  const m = medals(), got = m.filter((x) => x[1]).length;
  $("#medalCard").innerHTML = `<div class="sec"><h3>Medals</h3><small>${got} of ${m.length} · best streak ${bestStreak()}</small></div>
    <div class="medals">${m.map(([n, ok, g]) => `<div class="medal${ok ? " got" : ""}"><i>${ok ? g : ""}</i>${n}</div>`).join("")}</div>`;
}

// ---------- Me ----------
function renderMe() {
  const f = $("#profileForm"), p = S.profile;
  for (const k of ["sex", "birthYear", "height", "activity", "goal", "kcalOverride", "goalKg", "waterGoal"]) if (document.activeElement !== f.elements[k]) f.elements[k].value = p[k] ?? (f.elements[k].tagName === "SELECT" ? f.elements[k].options[k === "activity" ? 1 : 0].value : "");
  const a = $("#aiForm");
  if (document.activeElement !== a.elements.apiKey) a.elements.apiKey.value = S.ai.apiKey || "";
  a.elements.model.value = S.ai.model || "claude-opus-5-5";
  const T = targets();
  $("#targetsCard").innerHTML = T ? `<div class="sec"><h3>Daily targets</h3><small>${GOALS[T.goal]}${T.auto ? " · suggested" : ""}</small></div>
    <div class="tgt4"><div><b>${T.kcal}</b><span>kcal</span></div><div><b>${T.prot}</b><span>protein</span></div><div><b>${T.carbs}</b><span>carbs</span></div><div><b>${T.fat}</b><span>fat</span></div></div>
    <details><summary>How it's worked out</summary><p class="muted small" style="margin:0">Weight ${r1(T.kg)} kg (7-day average), age ${T.age}, BMI ${T.bmi}${T.auto ? ` (${T.suggested === "lose" ? "25 or more, so lose fat first" : T.suggested === "gain" ? "under 20, so build muscle" : "20 to 25, so recomp"})` : ""}. Resting burn ${T.bmr} kcal × activity = ${T.formulaTdee} kcal a day${S.profile.tdeeOverride ? `; using your measured burn of ${S.profile.tdeeOverride} instead` : ""}. Lose fat is 20% below that, recomp 10% below, build muscle 10% above. Protein 1.8 g per kg${T.kg > 25 * (S.profile.height / 100) ** 2 ? " of your weight at BMI 25" : ""}, fat 25% of calories, carbs the rest. Not medical advice.</p></details>`
    : `<div class="sec"><h3>Daily targets</h3></div><div class="empty">Fill in your profile and log one weigh-in.</div>`;
  const lb = S.meta.lastBackup, ago = lb ? Math.floor((Date.now() - lb) / 86400000) : null;
  const overdue = Object.keys(S.log).length >= 7 && (!lb || ago > 14);
  const bi = $("#backupInfo");
  bi.textContent = !lb ? "No backup yet" : ago <= 0 ? "Backed up today" : ago === 1 ? "Backed up yesterday" : `Backed up ${ago} days ago`;
  bi.classList.toggle("amber", overdue);
  $("#meDot").classList.toggle("hidden", !overdue);
  $("#verTxt").textContent = "Version " + APP_VERSION;
  if (navigator.storage?.persisted) navigator.storage.persisted().then((ok) => { $("#storageInfo").textContent = ok ? "" : "Open Fuel from its Home Screen icon so the phone keeps your data."; }).catch(() => {});
}

function renderAll() { renderToday(); renderWeight(); renderMe(); }

// ---------- sheets ----------
const sheet = $("#sheet"), sheetBody = $("#sheetBody");
let sheetCleanup = null, closeTimer = null, sheetStep = null, sheetGen = 0;
function runCleanup() { if (!sheetCleanup) return; const c = sheetCleanup; sheetCleanup = null; try { c(); } catch {} }
function openSheet(html, opts = {}) {
  if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
  sheet.classList.remove("closing", "dragout");
  runCleanup(); sheetCleanup = opts.onClose || null; sheetStep = null; sheetGen++;
  sheetBody.onclick = null;
  sheetBody.innerHTML = html;
  sheet.classList.toggle("tall", !!opts.tall);
  sheet.style.transform = ""; sheet.style.transition = "";
  if (!sheet.open) { sheet.showModal(); document.documentElement.classList.add("lock"); }
  else { sheetBody.classList.remove("swap"); void sheetBody.offsetWidth; sheetBody.classList.add("swap"); }
  sheetBody.scrollTop = 0;
  return sheetBody;
}
function closeSheet(instant) {
  addMeal = null; sheetStep = null; sheetGen++;
  runCleanup();
  if (!sheet.open || closeTimer) return;
  if (instant === true || reduceMotion()) return finishClose();
  sheet.classList.add("closing");
  closeTimer = setTimeout(finishClose, 190);
}
function finishClose() {
  clearTimeout(closeTimer); closeTimer = null;
  if (sheet.open) sheet.close();
  sheet.classList.remove("closing", "dragout", "tall"); sheet.style.transform = ""; sheet.style.transition = "";
  sheetBody.onclick = null; sheetBody.innerHTML = ""; sheetBody.classList.remove("swap");
  document.documentElement.classList.remove("lock");
}
sheet.addEventListener("click", (e) => { if (e.target === sheet || e.target.closest("[data-close]")) closeSheet(); });
sheet.addEventListener("cancel", (e) => { e.preventDefault(); closeSheet(); });
sheet.addEventListener("touchmove", (e) => { if (e.target === sheet) e.preventDefault(); }, { passive: false }); // dragging on the dimmed area must not scroll the page behind

// drag the handle or the title bar down to close
(() => {
  let y0 = null, t0 = 0, dy = 0, dragging = false;
  sheet.addEventListener("touchstart", (e) => {
    y0 = null;
    if (closeTimer || e.touches.length !== 1 || !e.target.closest(".grab, .sheethead")) return;
    y0 = e.touches[0].clientY; t0 = Date.now(); dy = 0; dragging = false;
  }, { passive: true });
  sheet.addEventListener("touchmove", (e) => {
    if (y0 === null) return;
    dy = e.touches[0].clientY - y0;
    if (!dragging && Math.abs(dy) < 8) return;
    dragging = true; e.preventDefault();
    sheet.style.transition = "none"; sheet.style.transform = `translateY(${Math.max(0, dy)}px)`;
  }, { passive: false });
  const end = () => {
    if (y0 === null) return;
    const v = dy / Math.max(1, Date.now() - t0); y0 = null;
    if (!dragging) return;
    dragging = false; sheet.style.transition = "transform .2s ease-out";
    if (dy > 110 || (dy > 40 && v > 0.6)) {
      sheet.style.transform = "translateY(105%)"; sheet.classList.add("dragout");
      addMeal = null; sheetStep = null; sheetGen++; runCleanup();
      closeTimer = setTimeout(finishClose, 200);
    } else sheet.style.transform = "";
  };
  sheet.addEventListener("touchend", end); sheet.addEventListener("touchcancel", end);
})();

// − / + buttons: one tap = one step; hold = keep stepping. Each sheet that has a stepper sets sheetStep.
(() => {
  let holdT = null, holdI = null, held = false;
  const stop = () => { clearTimeout(holdT); clearInterval(holdI); holdT = holdI = null; };
  sheetBody.addEventListener("pointerdown", (e) => {
    const b = e.target.closest("[data-step]"); if (!b) return;
    stop(); held = false;
    holdT = setTimeout(() => { held = true; holdI = setInterval(() => sheetStep?.(+b.dataset.step), 90); }, 420);
  });
  for (const ev of ["pointerup", "pointercancel", "blur"]) addEventListener(ev, stop);
  sheetBody.addEventListener("pointerout", (e) => { if (e.target.closest?.("[data-step]") && !e.relatedTarget?.closest?.("[data-step]")) stop(); });
  sheetBody.addEventListener("click", (e) => {
    const b = e.target.closest("[data-step]"); if (!b) return;
    if (held) { held = false; return; }
    sheetStep?.(+b.dataset.step);
  });
})();

const head = (title, o = {}) => `<div class="sheethead"><h2>${esc(title)}</h2>${o.star !== undefined ? `<button type="button" class="ib star${o.star ? " on" : ""}" data-star aria-label="Favourite">${I.star}</button>` : ""}<button type="button" class="ib x" data-close aria-label="Close">${I.x}</button></div>`;
const mealSeg = (sel) => `<div class="seg" data-mealseg>${MEALS.map(([k, l]) => `<button type="button" data-meal="${k}"${k === sel ? ' class="on"' : ""}>${l}</button>`).join("")}</div>`;
function wireMealSeg(body, set) {
  const seg = $("[data-mealseg]", body);
  seg.onclick = (e) => { const b = e.target.closest("[data-meal]"); if (!b) return; set(b.dataset.meal); $$("button", seg).forEach((x) => x.classList.toggle("on", x === b)); };
}
const stepper = (value, ph = "") => `<div class="stepper"><button type="button" data-step="-1" aria-label="Less">${I.minus}</button><input id="amt" type="text" inputmode="decimal" autocomplete="off" value="${esc(value)}" placeholder="${ph}"><button type="button" data-step="1" aria-label="More">${I.plus}</button></div>`;
const selectOnFocus = (el) => el.addEventListener("focus", () => setTimeout(() => { try { el.setSelectionRange(0, 99); } catch {} }, 0));

// a one-field sheet (used instead of the browser's own pop-up boxes)
function openNameSheet(title, value, onSave) {
  const body = openSheet(`${head(title)}<form id="nf" class="form" novalidate><input name="v" value="${esc(value)}" maxlength="40" autocomplete="off" enterkeyhint="done"><button class="primary wide" type="submit" style="margin-top:12px">Save</button></form>`);
  const f = $("#nf", body), inp = f.elements.v;
  f.onsubmit = (e) => { e.preventDefault(); const v = inp.value.trim(); if (!v) return toast("Type a name"); onSave(v); };
  inp.focus(); try { inp.setSelectionRange(0, 99); } catch {}
}

// ---------- Add: one sheet for every way of logging ----------
function openAdd(meal) {
  addMeal = meal && MEAL_NAME[meal] ? meal : null;
  const body = openSheet(`${head(addMeal ? `Add to ${MEAL_NAME[addMeal].toLowerCase()}` : "Add food")}
    <div class="searchbox">${I.search}<input id="q" type="search" placeholder="Search foods" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="search"><button type="button" class="ib clr hidden" id="qClr" aria-label="Clear search">${I.x}</button></div>
    <div class="tiles" id="tiles">
      <button type="button" class="primary" data-act="scan">${I.scan}<span>Scan</span></button>
      <button type="button" data-act="describe">${I.spark}<span>Describe</span></button>
      <button type="button" data-act="order">${I.bag}<span>Delivery</span></button>
      <button type="button" data-act="quick">${I.bolt}<span>Quick add</span></button>
    </div>
    <ul class="list" id="addList"></ul>`, { tall: true });
  const q$ = $("#q", body), list = $("#addList", body), H = history();
  let browse = false;
  const addNow = `<button type="button" class="ib add" data-quick aria-label="Add now">${I.plus}</button>`;
  const starred = (k) => (S.favs[k] ? '<span class="star">★</span> ' : "");
  const hRow = (x) => `<li class="tap" data-h="${esc(x.key)}"><div class="name">${starred(x.key)}${esc(x.last.name)}<small>${esc(x.last.amountText || "")}</small></div><div class="kcal">${r0(x.last.kcal)}</div>${addNow}</li>`;
  const mRow = (m) => `<li class="tap" data-qm="${esc(m.id)}"><div class="name">${esc(m.name)}<small>${nItems(m.items.length)}</small></div><div class="kcal">${r0(sum4(m.items).kcal)}</div>${addNow}</li>`;
  const fRow = (f) => { const k = f.barcode || f.id, pg = pieceG(f), U = unitOf(f.basis); return `<li class="tap" data-food="${esc(k)}"><div class="name">${starred(k)}${esc(f.name)}<small>${esc(f.brand || (f.source === "usda" ? "Basic food" : f.barcode ? "Scanned" : "My food"))}${pg ? ` · 1 ${esc(f.pieceLabel || "piece")} = ${r0(pg)} ${U}` : ""}</small></div><div class="kcal">${r0(f.per100.kcal)}<small>/100${U}</small></div></li>`; };
  const draw = () => {
    const raw = q$.value.trim(), q = fold(raw);
    $("#qClr", body).classList.toggle("hidden", !raw);
    $("#tiles", body).classList.toggle("hidden", !!raw || browse);
    let html = "";
    if (raw) {
      const words = q.split(/\s+/).filter(Boolean);
      const startsWord = (n, w) => n.startsWith(w) || n.includes(" " + w) || n.includes("(" + w);
      const found = allFoods().filter(complete).map((f) => ({ f, n: fold(f.name + " " + (f.brand || "")) })).filter((x) => words.every((w) => x.n.includes(w)));
      const rank = (x) => (x.n.startsWith(q) ? 0 : words.every((w) => startsWord(x.n, w)) ? 1 : 2);
      found.sort((a, b) => rank(a) - rank(b));
      html = found.slice(0, 60).map((x) => fRow(x.f)).join("") + `<li class="tap act" data-new>${I.plus}Create “${esc(raw)}”</li>`;
    } else if (browse) {
      const mine = [...Object.values(S.myfoods), ...Object.values(S.products)].filter(complete);
      html = `<li class="tap act" data-unbrowse>${I.chev}Back</li>` + (mine.length ? `<li class="secrow">My foods and scans</li>${mine.map(fRow).join("")}` : "") + `<li class="secrow">Basic foods</li>${builtinFoods().map(fRow).join("")}`;
    } else {
      const meals = Object.values(S.meals), favs = H.filter((x) => S.favs[x.key]), recent = H.filter((x) => !S.favs[x.key]).slice(0, 8);
      const pv = addMeal ? (S.log[addDays(curDay, -1)] || []).filter((e) => e.meal === addMeal) : [];
      if (pv.length) html += `<li class="tap" data-yday><div class="name">${curDay === dkey() ? "Yesterday’s" : "The day before’s"} ${MEAL_NAME[addMeal].toLowerCase()}<small>${nItems(pv.length)}</small></div><div class="kcal">${r0(sum4(pv).kcal)}</div>${addNow}</li>`;
      if (meals.length) html += `<li class="secrow">Saved meals</li>${meals.map(mRow).join("")}`;
      if (favs.length) html += `<li class="secrow">Favourites</li>${favs.map(hRow).join("")}`;
      if (recent.length) html += `<li class="secrow">Recent</li>${recent.map(hRow).join("")}`;
      if (!html) html = `<li class="secrow">Basic foods</li>${builtinFoods().slice(0, 12).map(fRow).join("")}`; // nothing eaten yet: show something to pick from
      html += `<li class="tap act" data-browse>${I.search}Browse all foods</li>`;
    }
    list.innerHTML = html;
  };
  q$.oninput = () => { browse = false; draw(); };
  q$.onkeydown = (e) => { if (e.key === "Enter") q$.blur(); };
  list.ontouchmove = () => { if (document.activeElement === q$) q$.blur(); }; // scrolling the results puts the keyboard away
  body.onclick = async (e) => {
    const t = e.target, act = t.closest("[data-act]")?.dataset.act;
    if (act) return ({ scan: openScanner, describe: openDescribe, order: openOrder, quick: openQuick })[act]?.();
    if (t.closest("#qClr")) { q$.value = ""; browse = false; draw(); q$.focus(); return; }
    if (t.closest("[data-browse]")) { browse = true; draw(); sheetBody.scrollTop = 0; return; }
    if (t.closest("[data-unbrowse]")) { browse = false; draw(); sheetBody.scrollTop = 0; return; }
    if (t.closest("[data-new]")) return openProductForm({ id: "my:" + uid(), basis: "g", per100: {}, source: "manual", name: q$.value.trim() });
    const quick = !!t.closest("[data-quick]");
    if (t.closest("[data-yday]")) {
      const pv = (S.log[addDays(curDay, -1)] || []).filter((x) => x.meal === addMeal);
      closeSheet(); return addEntries(pv.map(cleanEntry), `Added ${nItems(pv.length)}`);
    }
    const qm = t.closest("[data-qm]");
    if (qm) {
      const m = S.meals[qm.dataset.qm]; if (!m) return;
      if (!quick) return openSavedMeal(m);
      const to = mealFor(); closeSheet(); return addEntries(m.items.map((i) => ({ ...i, meal: to })), `Added ${m.name}`);
    }
    const h = t.closest("[data-h]");
    if (h) {
      const x = H.find((y) => y.key === h.dataset.h); if (!x) return;
      if (!quick) return openFromHistory(x.last);
      const to = mealFor(x.last); closeSheet(); return addEntries([{ ...cleanEntry(x.last), meal: to }], `Added ${x.last.name}`);
    }
    const f = t.closest("[data-food]");
    if (f) { const food = findFood(f.dataset.food); if (food) openPortion(food); }
  };
  draw();
}
// a food eaten before: open it with the amount used last time
function openFromHistory(e) {
  const food = findFood(e.ref);
  if (food && complete(food)) return openPortion(food, { unit: e.unit || "g", amount: e.qty, grams: e.grams });
  openEntry(null, { template: e });
}

// ---------- Scan ----------
async function openScanner() {
  let controls = null, done = false, closed = false;
  const body = openSheet(`${head("Scan a barcode")}
    <div class="video-wrap"><video id="scanVideo" playsinline muted autoplay></video><div class="aim"></div></div>
    <p class="lbl status" id="scanMsg"><span class="blink">Looking for a barcode</span></p>
    <div class="row"><input id="bcManual" inputmode="numeric" autocomplete="off" enterkeyhint="go" placeholder="Or type the number"><button type="button" id="bcGo">Go</button></div>
    <label class="filebtn wide" style="margin-top:8px">${I.camera}Use a photo instead<input type="file" accept="image/*" id="bcPhoto" hidden></label>`,
    { onClose: () => { closed = true; try { controls?.stop(); } catch {} } });
  const hints = new Map();
  const F = Vendor.BarcodeFormat;
  hints.set(Vendor.DecodeHintType.POSSIBLE_FORMATS, [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E]);
  const reader = new Vendor.BrowserMultiFormatReader(hints);
  const got = (code) => { if (done || closed) return; done = true; try { controls?.stop(); } catch {} handleBarcode(code); };
  $("#bcGo", body).onclick = () => { const v = $("#bcManual", body).value.replace(/\D/g, ""); if (v.length >= 6) got(v); else toast("That doesn't look like a barcode"); };
  $("#bcManual", body).onkeydown = (e) => { if (e.key === "Enter") $("#bcGo", body).click(); };
  $("#bcPhoto", body).onchange = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    $("#scanMsg", body).textContent = "Reading the photo…";
    const url = URL.createObjectURL(file);
    try { const res = await reader.decodeFromImageUrl(url); got(res.getText()); }
    catch { $("#scanMsg", body).textContent = "No barcode found in that photo. Try closer, or type the number."; }
    finally { URL.revokeObjectURL(url); }
  };
  try {
    const c = await reader.decodeFromConstraints({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } } }, $("#scanVideo", body), (res) => { if (res) got(res.getText()); });
    if (closed || done) { try { c.stop(); } catch {} } else controls = c; // the sheet was closed while the camera was still starting
  } catch (err) {
    if (closed) return;
    $(".video-wrap", body).classList.add("hidden");
    $("#scanMsg", body).textContent = (err.name === "NotAllowedError" ? "Fuel isn't allowed to use the camera." : "The camera didn't start.") + " Type the number or use a photo.";
  }
}

async function handleBarcode(code) {
  if (S.products[code] && complete(S.products[code])) return openPortion(S.products[code]);
  openSheet(`${head("Looking it up")}<p class="lbl status"><span class="spinner"></span>Barcode ${esc(code)}</p>`);
  const gen = sheetGen;
  let prod = null, reason = null;
  try { prod = await lookupOFF(code); }
  catch (e) { reason = e.offline ? "No connection, so the food database couldn't be checked." : e.message; }
  if (gen !== sheetGen) return; // closed or moved on while it was loading
  if (prod && complete(prod)) { await saveProduct(prod); return openPortion(prod, { fresh: true }); }
  openProductForm(prod || { id: "bc:" + code, barcode: code, basis: "g", per100: {} }, {
    reason: reason || (prod ? "Found it, but its nutrition info is incomplete." : "Not in the food database yet."),
    retry: reason ? () => handleBarcode(code) : null,
  });
}

// ---------- Product form (new / edit / read the label with AI) ----------
function openProductForm(prod, opts = {}) {
  const p = prod.per100 || {};
  const v = (x) => (x === null || x === undefined ? "" : x);
  const known = !!(S.products[prod.barcode] || S.myfoods[prod.id]);
  const body = openSheet(`${head(known ? "Edit food" : "New food")}
    ${prod.barcode ? `<div class="meta">Barcode ${esc(prod.barcode)}</div>` : ""}
    ${opts.reason ? `<div class="note${opts.retry ? " warn" : ""}">${esc(opts.reason)}${opts.retry ? ` <button type="button" class="link" id="retry">Try again</button>` : ""}</div>` : ""}
    ${S.ai.apiKey ? `<label class="filebtn wide tint">${I.camera}Fill in from a label photo<input type="file" accept="image/*" multiple id="labelPhotos" hidden></label>
    <p class="lbl status" id="aiMsg">Nutrition table, plus the front of the pack</p>` : ""}
    <form id="prodForm" class="form" novalidate>
      <label>Name <input name="name" value="${esc(v(prod.name))}" autocomplete="off" required></label>
      <div class="grid2">
        <label>Brand <input name="brand" value="${esc(v(prod.brand))}" autocomplete="off"></label>
        <label>Values per 100 <select name="basis"><option value="g">g</option><option value="ml">ml</option></select></label>
      </div>
      <div class="grid4">
        <label>kcal <input name="kcal" inputmode="decimal" autocomplete="off" value="${v(p.kcal)}" required></label>
        <label>Protein <input name="p" inputmode="decimal" autocomplete="off" value="${v(p.p)}" required></label>
        <label>Carbs <input name="c" inputmode="decimal" autocomplete="off" value="${v(p.c)}" required></label>
        <label>Fat <input name="f" inputmode="decimal" autocomplete="off" value="${v(p.f)}" required></label>
      </div>
      <div class="grid2">
        <label>Pack size g/ml <input name="packG" inputmode="decimal" autocomplete="off" value="${v(prod.packG)}"></label>
        <label>Pieces in pack <input name="piecesPerPack" inputmode="decimal" autocomplete="off" value="${v(prod.piecesPerPack)}" placeholder="8"></label>
      </div>
      <details${prod.pieceG || prod.servingG || prod.pieceLabel ? " open" : ""}><summary>More</summary>
        <div class="grid2">
          <label>A piece is a <input name="pieceLabel" value="${esc(v(prod.pieceLabel))}" autocomplete="off" autocapitalize="off" placeholder="tortilla"></label>
          <label>One piece g <input name="pieceG" inputmode="decimal" autocomplete="off" value="${v(prod.pieceG)}"></label>
          <label>Serving g/ml <input name="servingG" inputmode="decimal" autocomplete="off" value="${v(prod.servingG)}"></label>
        </div>
      </details>
      <div class="btnrow"><button class="primary" type="submit">Save</button>${known ? `<button type="button" class="danger" id="delProd">Delete</button>` : ""}</div>
    </form>`);
  const form = $("#prodForm", body);
  form.elements.basis.value = prod.basis || "g";
  const rt = $("#retry", body); if (rt) rt.onclick = opts.retry;
  const photos = $("#labelPhotos", body);
  if (photos) photos.onchange = async (e) => {
    const files = [...e.target.files].slice(0, 3); if (!files.length) return;
    const msg = $("#aiMsg", body); msg.innerHTML = `<span class="spinner"></span><span class="blink">Reading the label</span>`;
    try {
      const imgs = await Promise.all(files.map(fileToImageBlock));
      const r = await askClaude([...imgs, { type: "text", text: LABEL_PROMPT }], LABEL_SCHEMA);
      const set = (k, val) => { if (val !== null && val !== undefined && val !== "") form.elements[k].value = val; };
      set("name", r.name); set("brand", r.brand); form.elements.basis.value = r.basis || "g";
      set("kcal", r.kcal_100 !== null ? r1(r.kcal_100) : null); set("p", r.protein_100); set("c", r.carbs_100); set("f", r.fat_100);
      set("packG", r.pack_g); set("piecesPerPack", r.pieces_per_pack); set("pieceLabel", r.piece_name); set("servingG", r.serving_g);
      const missing = ["kcal", "p", "c", "f"].filter((k) => !form.elements[k].value);
      msg.textContent = (missing.length ? "Couldn't read: " + missing.map((k) => ({ kcal: "kcal", p: "protein", c: "carbs", f: "fat" }[k])).join(", ") + ". " : "Filled in. Check it against the label. ") + (r.notes || "");
    } catch (err) { msg.textContent = err.message; }
    e.target.value = "";
  };
  form.onsubmit = guard(form.querySelector("[type=submit]"), async (e) => {
    e.preventDefault();
    const g = (k) => num(form.elements[k].value);
    const per100 = { kcal: g("kcal"), p: g("p"), c: g("c"), f: g("f") };
    if (Object.values(per100).some((x) => x === null)) return toast("Fill in kcal, protein, carbs and fat");
    const out = { ...prod, id: prod.id || "my:" + uid(), name: form.elements.name.value.trim() || "Unnamed", brand: form.elements.brand.value.trim(), basis: form.elements.basis.value,
      per100, packG: g("packG"), piecesPerPack: g("piecesPerPack"), pieceG: g("pieceG"), pieceLabel: form.elements.pieceLabel.value.trim() || null, servingG: g("servingG"),
      source: prod.source === "openfoodfacts" ? "openfoodfacts+edited" : prod.source || "manual" };
    await saveProduct(out);
    toast(out.barcode ? "Saved. The next scan will know it." : "Saved to your foods");
    if (opts.afterSave) opts.afterSave(out); else openPortion(out);
  });
  const del = $("#delProd", body);
  if (del) del.onclick = async () => {
    if (prod.barcode) { delete S.products[prod.barcode]; await save("products"); } else { delete S.myfoods[prod.id]; await save("myfoods"); }
    closeSheet();
    toast(`Deleted ${prod.name || "food"}`, { action: "Undo", onAction: async () => { await saveProduct(prod); toast("Restored"); } });
  };
}

// ---------- Portion: how much did you eat ----------
function openPortion(prod, opts = {}) {
  const pg = pieceG(prod), U = unitOf(prod.basis), UN = U === "ml" ? "millilitres" : "grams";
  const units = [["g", U, 1]];
  if (pg) units.push(["piece", prod.pieceLabel || "piece", pg]);
  if (prod.servingG) units.push(["serving", "serving", prod.servingG]);
  if (prod.packG) units.push(["pack", "whole pack", prod.packG]);
  const key = prod.barcode || prod.id;
  let unit = pg ? "piece" : "g", start = pg ? 1 : 100, meal = opts.meal || defaultMeal();
  if (opts.unit) { // opened from history: start from the amount used last time
    if (units.some((u) => u[0] === opts.unit) && opts.amount > 0) { unit = opts.unit; start = opts.amount; }
    else if (opts.grams > 0) { unit = "g"; start = r0(opts.grams); }
  }
  const src = prod.source === "usda" ? "USDA" : String(prod.source || "").startsWith("openfoodfacts") ? "Open Food Facts" : "";
  const body = openSheet(`${head(prod.name, { star: !!S.favs[key] })}
    <div class="meta">${prod.brand ? esc(prod.brand) + " · " : ""}${r0(prod.per100.kcal)} kcal per 100 ${U}${src ? " · " + src : ""}</div>
    ${opts.fresh ? `<div class="note">Found it, and saved it for next time.</div>` : ""}
    ${stepper(start)}
    <div class="unitlbl" id="unitLbl"></div>
    <div class="chips center" id="unitChips"></div>
    <div class="chips center" id="fastAmts"></div>
    <div class="preview" id="pv"></div>
    ${mealSeg(meal)}
    <button class="primary wide" id="addBtn">Add to ${dayLabel()}</button>
    <div class="btnrow">
      ${prod.packG && !pg ? `<button type="button" class="quietbtn" id="setPieces">Set pieces per pack</button>` : ""}
      ${prod.source !== "usda" ? `<button type="button" class="quietbtn" id="editProd">Edit food</button>` : `<button type="button" class="quietbtn" id="copyProd">Make my own version</button>`}
    </div>`);
  const amt = $("#amt", body);
  const calc = () => {
    const u = units.find((x) => x[0] === unit), q = num(amt.value) || 0, grams = q * u[2], k = grams / 100;
    return { q, grams, u, kcal: prod.per100.kcal * k, p: prod.per100.p * k, c: prod.per100.c * k, f: prod.per100.f * k };
  };
  const draw = () => {
    const c = calc();
    $("#unitChips", body).innerHTML = units.length > 1 ? units.map(([k, l]) => `<button type="button" data-unit="${k}"${k === unit ? ' class="on"' : ""}>${esc(k === "g" ? UN : l)}</button>`).join("") : "";
    $("#fastAmts", body).innerHTML = unit === "g" ? [50, 100, 150, 200, 250].map((n) => `<button type="button" data-amt="${n}"${c.q === n ? ' class="on"' : ""}>${n}</button>`).join("") : "";
    $("#unitLbl", body).textContent = unit === "g" ? UN : `${plural(c.u[1], c.q)} · ${r0(c.grams)} ${U}`;
    $("#pv", body).innerHTML = four(c);
  };
  sheetStep = (dir) => { amt.value = r1(Math.max(0, (num(amt.value) || 0) + dir * (unit === "g" ? 10 : unit === "piece" ? 1 : 0.5))); draw(); };
  body.onclick = (e) => {
    const u = e.target.closest("[data-unit]"); if (u) { unit = u.dataset.unit; amt.value = unit === "g" ? 100 : 1; return draw(); }
    const a = e.target.closest("[data-amt]"); if (a) { amt.value = a.dataset.amt; return draw(); }
    const s = e.target.closest("[data-star]"); if (s) toggleFav(key, s);
  };
  amt.oninput = draw; selectOnFocus(amt);
  wireMealSeg(body, (m) => (meal = m));
  const addBtn = $("#addBtn", body);
  addBtn.onclick = guard(addBtn, async () => {
    const c = calc(); if (!(c.grams > 0)) return toast("Enter an amount");
    const amountText = unit === "g" ? `${r0(c.grams)} ${U}` : `${c.q} ${plural(c.u[1], c.q)} · ${r0(c.grams)} ${U}`;
    closeSheet();
    await addEntries([{ ref: key, name: prod.name, grams: c.grams, unit, unitG: c.u[2], qty: c.q, unitLabel: c.u[1], basis: prod.basis, amountText, kcal: c.kcal, p: c.p, c: c.c, f: c.f, meal }]);
  });
  const sp = $("#setPieces", body); if (sp) sp.onclick = () => openPiecesForm(prod, meal);
  const ed = $("#editProd", body); if (ed) ed.onclick = () => openProductForm(prod);
  const cp = $("#copyProd", body); if (cp) cp.onclick = () => openProductForm({ ...prod, id: "my:" + uid(), source: "manual", name: prod.name + " (mine)" });
  draw();
}
// "one tortilla out of a pack of 8"
function openPiecesForm(prod, meal) {
  const body = openSheet(`${head("Pieces per pack")}
    <div class="meta">${esc(prod.name)} · ${r0(prod.packG)} ${unitOf(prod.basis)} pack</div>
    <form id="pcForm" class="form" novalidate>
      <div class="grid2">
        <label>Pieces in the pack <input name="n" inputmode="decimal" autocomplete="off" placeholder="8"></label>
        <label>One piece is a <input name="lbl" autocomplete="off" autocapitalize="off" placeholder="tortilla"></label>
      </div>
      <div class="btnrow"><button type="button" id="pcBack">Back</button><button class="primary" type="submit">Save</button></div>
    </form>`);
  const f = $("#pcForm", body);
  $("#pcBack", body).onclick = () => openPortion(prod, { meal });
  f.onsubmit = async (e) => {
    e.preventDefault();
    const n = num(f.elements.n.value); if (!(n > 0)) return toast("How many pieces are in the pack?");
    const upd = { ...prod, piecesPerPack: n, pieceLabel: f.elements.lbl.value.trim() || "piece" };
    await saveProduct(upd); openPortion(upd, { meal });
  };
  f.elements.n.focus();
}

// ---------- Describe a meal / photo of the plate (AI) ----------
function openDescribe() {
  const has = !!S.ai.apiKey;
  let meal = defaultMeal(), items = [];
  const body = openSheet(`${head("Describe a meal")}
    ${has ? "" : `<div class="note warn">This needs your Anthropic API key. <button type="button" class="link" data-goto="me">Add it in Me</button></div>`}
    <textarea id="mealTxt" placeholder="3 eggs fried in butter, 2 slices of toast, coffee with milk"></textarea>
    ${mealSeg(meal)}
    <div class="btnrow">
      <button type="button" class="primary" id="estBtn"${has ? "" : " disabled"}>Estimate</button>
      <label class="filebtn"${has ? "" : ' style="opacity:.35;pointer-events:none"'}>${I.camera}Plate photo<input type="file" accept="image/*" id="plate" hidden></label>
    </div>
    <div id="estOut"></div>`);
  wireMealSeg(body, (m) => (meal = m));
  const out = $("#estOut", body);
  const run = async (content, label) => {
    out.innerHTML = `<p class="lbl status"><span class="spinner"></span><span class="blink">${label}</span></p>`;
    try {
      const r = await askClaude(content, MEAL_SCHEMA);
      items = r.items.map((i) => ({ ...i, on: true }));
      const drawItems = () => {
        const on = items.filter((i) => i.on), t = on.reduce((s, i) => ({ kcal: s.kcal + i.kcal, p: s.p + i.protein, c: s.c + i.carbs, f: s.f + i.fat }), { kcal: 0, p: 0, c: 0, f: 0 });
        out.innerHTML = `<ul class="list" style="margin-top:12px">${items.map((i, n) => `<li class="tap" data-i="${n}"><span class="chk${i.on ? " on" : ""}">${i.on ? I.check : ""}</span><div class="name">${esc(i.name)}<small>${r0(i.grams)} g · P${r0(i.protein)} C${r0(i.carbs)} F${r0(i.fat)}</small></div><div class="kcal">${r0(i.kcal)}</div></li>`).join("")}</ul>
          ${r.note ? `<div class="note">${esc(r.note)}</div>` : ""}
          <div class="preview">${four(t, r0)}</div>
          <button type="button" class="primary wide" id="addAll"${on.length ? "" : " disabled"}>Add ${nItems(on.length)}</button>`;
        const b = $("#addAll", out);
        b.onclick = guard(b, async () => {
          closeSheet();
          await addEntries(items.filter((x) => x.on).map((i) => ({ name: i.name, grams: i.grams, amountText: `${r0(i.grams)} g · AI`, ai: true, kcal: i.kcal, p: i.protein, c: i.carbs, f: i.fat, meal })));
        });
      };
      out.onclick = (e) => { const li = e.target.closest("[data-i]"); if (li) { items[li.dataset.i].on = !items[li.dataset.i].on; drawItems(); } };
      drawItems();
    } catch (err) { out.innerHTML = `<div class="note warn">${esc(err.message)}</div>`; }
  };
  $("#estBtn", body).onclick = () => { const txt = $("#mealTxt", body).value.trim(); if (!txt) return toast("Type what you ate first"); $("#mealTxt", body).blur(); run([{ type: "text", text: MEAL_PROMPT(txt) }], "Estimating"); };
  $("#plate", body).onchange = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    const img = await fileToImageBlock(file);
    run([img, { type: "text", text: PLATE_PROMPT($("#mealTxt", body).value.trim()) }], "Looking at your plate");
    e.target.value = "";
  };
}

// ---------- Delivery order: screenshots of the order (or a few typed words) → the dishes, shown like a basket (AI) ----------
function openOrder() {
  const has = !!S.ai.apiKey, TITLE = "Delivery order", off = has ? "" : ' style="opacity:.35;pointer-events:none"';
  let meal = defaultMeal(), content = null, thumbs = "";
  const body = openSheet(`${head(TITLE)}
    ${has ? "" : `<div class="note warn">This needs your Anthropic API key. <button type="button" class="link" data-goto="me">Add it in Me</button></div>`}
    <label class="filebtn primary wide"${off}>${I.image}Choose screenshots<input type="file" accept="image/*" multiple id="shots" hidden></label>
    <textarea id="ordTxt" class="short" enterkeyhint="go" placeholder="Or type it: 2 shaorma mare, cartofi, Pepsi – Dristor"${has ? "" : " disabled"}${off}></textarea>
    <button type="button" class="tint wide hidden" id="ordGo">Estimate</button>`);
  const txt$ = $("#ordTxt", body), go = $("#ordGo", body);

  const loading = () => { openSheet(`${head(TITLE)}<div class="shots" id="shotRow">${thumbs}</div><p class="lbl status"><span class="spinner"></span><span class="blink">Reading your order</span></p>`); return sheetGen; };
  // the pictures stay in memory, so "Try again" needs no second trip to the photo library
  const ask = async (gen = loading()) => {
    try { const r = await askClaude(content, ORDER_SCHEMA); if (gen === sheetGen) show(r); }
    catch (err) { if (gen === sheetGen) fail(err.message, true); }
  };
  const fail = (msg, retry) => {
    const b = openSheet(`${head(TITLE)}<div class="shots">${thumbs}</div><div class="note warn">${esc(msg)}</div>
      <div class="btnrow"><button type="button" class="${retry ? "quietbtn" : "primary"}" id="ordBack">Start over</button>${retry ? `<button type="button" class="primary" id="ordRetry">Try again</button>` : ""}</div>`);
    $("#ordBack", b).onclick = () => openOrder();
    if (retry) $("#ordRetry", b).onclick = () => ask();
  };
  const show = (r) => {
    const place = String(r.restaurant || "").trim(), pos = (v) => Math.max(0, +v || 0);
    const items = (Array.isArray(r.items) ? r.items : []).filter((i) => i && String(i.name || "").trim()).map((i) => {
      const kcal = pos(i.kcal);
      return { name: String(i.name).trim(), U: i.basis === "ml" ? "ml" : "g", kcal, p: pos(i.protein), c: pos(i.carbs), f: pos(i.fat), est: i.source !== "shown",
        g: i.grams > 0 ? i.grams : kcal ? Math.max(30, Math.round(kcal / 2)) : 250, // never 0: an entry without a weight could not be changed in portions later
        n: Math.min(20, Math.max(0.5, Math.round(pos(i.count || 1) * 2) / 2)) }; // n = portions eaten, starts at what was ordered
    });
    if (!items.length) return fail(String(r.note || "").trim() || "No food order found in that.", false);
    const b = openSheet(`${head(place || TITLE)}
      <ul class="list basket" id="ordList">${items.map((i, k) => `<li data-k="${k}"><div class="name">${esc(i.name)}<small></small></div><div class="qty"><button type="button" data-q="-1" aria-label="Less">${I.minus}</button><b></b><button type="button" data-q="1" aria-label="More">${I.plus}</button></div></li>`).join("")}</ul>
      ${String(r.note || "").trim() ? `<div class="note">${esc(r.note)}</div>` : ""}
      <div class="preview" id="ordPv"></div>
      ${mealSeg(meal)}
      <button type="button" class="primary wide" id="ordAdd"></button>`);
    const list = $("#ordList", b), add = $("#ordAdd", b);
    const paint = () => {
      $$("li", list).forEach((li, k) => {
        const i = items[k], m = i.n || 1; // a dish set to 0 keeps showing what one portion is
        li.classList.toggle("off", !i.n); $("b", li).textContent = i.n;
        $("small", li).textContent = `${i.est ? "≈ " : ""}${r0(i.kcal * m)} kcal · ${r0(i.g * m)} ${i.U}`;
      });
      const on = items.filter((i) => i.n > 0);
      $("#ordPv", b).innerHTML = four(on.reduce((s, i) => ({ kcal: s.kcal + i.kcal * i.n, p: s.p + i.p * i.n, c: s.c + i.c * i.n, f: s.f + i.f * i.n }), { kcal: 0, p: 0, c: 0, f: 0 }), r0);
      add.textContent = on.length ? `Add ${nItems(on.length)}` : "Nothing to add"; add.disabled = !on.length;
    };
    list.onclick = (e) => {
      const q = e.target.closest("[data-q]"); if (!q) return;
      const i = items[+q.closest("li").dataset.k]; i.n = Math.min(20, Math.max(0, i.n + q.dataset.q * 0.5)); paint();
    };
    wireMealSeg(b, (m) => (meal = m));
    add.onclick = guard(add, async () => {
      // logged in portions, the same shape as a food eaten "by the piece": tap it later to change how much, add it again from Recent
      const out = items.filter((i) => i.n > 0).map((i) => {
        const g = i.g * i.n, where = place && !fold(i.name).includes(fold(place)) ? ` · ${place}` : "";
        return { name: i.name + where, grams: g, unit: "serving", unitG: i.g, qty: i.n, unitLabel: "portion", basis: i.U, amountText: `${i.n} ${plural("portion", i.n)} · ${r0(g)} ${i.U}`, ai: true,
          kcal: i.kcal * i.n, p: i.p * i.n, c: i.c * i.n, f: i.f * i.n, meal };
      });
      closeSheet(); await addEntries(out);
    });
    paint();
  };

  txt$.oninput = () => go.classList.toggle("hidden", !txt$.value.trim());
  txt$.onkeydown = (e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); go.click(); } }; // the keyboard can cover the button, so Return sends it too
  go.onclick = () => { const t = txt$.value.trim(); if (!t) return; txt$.blur(); thumbs = ""; content = [{ type: "text", text: ORDER_PROMPT(t, 0) }]; ask(); };
  $("#shots", body).onchange = async (e) => {
    const picked = [...e.target.files], files = picked.slice(0, 6), extra = txt$.value.trim(); e.target.value = "";
    if (!files.length) return;
    if (picked.length > files.length) toast("Using the first 6 pictures");
    thumbs = ""; const gen = loading();
    try {
      const imgs = []; for (const f of files) imgs.push(await fileToImageBlock(f));
      if (gen !== sheetGen) return;
      thumbs = imgs.map((x) => `<img src="data:image/jpeg;base64,${x.source.data}" alt="">`).join("");
      $("#shotRow").innerHTML = thumbs;
      content = [...imgs, { type: "text", text: ORDER_PROMPT(extra, imgs.length) }];
    } catch { if (gen === sheetGen) fail("Couldn’t open that picture.", false); return; }
    ask(gen);
  };
}

// ---------- Quick add ----------
function openQuick() {
  let meal = defaultMeal();
  const body = openSheet(`${head("Quick add")}
    <form id="qf" class="form" novalidate>
      <label>What was it <input name="name" autocomplete="off" placeholder="Coffee with milk"></label>
      <div class="grid4">
        <label>kcal <input name="kcal" inputmode="decimal" autocomplete="off" required></label>
        <label>Protein <input name="p" inputmode="decimal" autocomplete="off"></label>
        <label>Carbs <input name="c" inputmode="decimal" autocomplete="off"></label>
        <label>Fat <input name="f" inputmode="decimal" autocomplete="off"></label>
      </div>
      ${mealSeg(meal)}
      <button class="primary wide" type="submit">Add to ${dayLabel()}</button>
    </form>`);
  wireMealSeg(body, (m) => (meal = m));
  const form = $("#qf", body);
  form.onsubmit = guard(form.querySelector("[type=submit]"), async (e) => {
    e.preventDefault(); const f = form.elements, kcal = num(f.kcal.value); if (kcal === null || kcal < 0) return toast("Enter the kcal");
    closeSheet();
    await addEntries([{ name: f.name.value.trim() || "Quick add", grams: 0, amountText: "quick add", kcal, p: num(f.p.value) || 0, c: num(f.c.value) || 0, f: num(f.f.value) || 0, meal }]);
  });
}

// ---------- One entry: change the amount, move it, favourite it, delete it. Also used to re-add something from history. ----------
function openEntry(id, opts = {}) {
  const isNew = !!opts.template;
  const e = isNew ? cleanEntry(opts.template) : (S.log[curDay] || []).find((x) => x.id === id);
  if (!e) return;
  const key = entryKey(e), food = findFood(e.ref), U = unitOf(e.basis);
  // what the number means: pieces/servings, grams, or plain kcal for quick adds
  const mode = e.unitG && e.unit && e.unit !== "g" && e.qty > 0 ? "qty" : e.grams > 0 ? "grams" : "kcal";
  const start = mode === "qty" ? e.qty : mode === "grams" ? r0(e.grams) : r0(e.kcal);
  let meal = isNew ? mealFor(e) : e.meal;
  const body = openSheet(`${head(e.name, { star: !!S.favs[key] })}
    ${stepper(start)}
    <div class="unitlbl" id="unitLbl"></div>
    <div class="preview" id="pv"></div>
    ${mealSeg(meal)}
    <button type="button" class="primary wide" id="saveE">${isNew ? `Add to ${dayLabel()}` : "Save"}</button>
    ${isNew ? "" : `<div class="btnrow"><button type="button" class="quietbtn" id="again">Add again</button>${food && complete(food) ? `<button type="button" class="quietbtn" id="openFood">Food details</button>` : ""}<button type="button" class="danger" id="del">Delete</button></div>`}`);
  const amt = $("#amt", body);
  const scaled = () => {
    const v = num(amt.value) || 0, k = start ? v / start : mode === "kcal" ? 1 : 0;
    const out = { ...e, kcal: mode === "kcal" ? v : e.kcal * k, p: e.p * k, c: e.c * k, f: e.f * k, grams: (e.grams || 0) * k, meal };
    if (mode === "qty") { out.qty = v; out.amountText = `${v} ${plural(e.unitLabel || "piece", v)} · ${r0(out.grams)} ${U}`; }
    else if (mode === "grams") { if (e.unit === "g") out.qty = v; out.amountText = `${r0(out.grams)} ${U}${e.ai ? " · AI" : ""}`; }
    return out;
  };
  const draw = () => {
    const s = scaled();
    $("#unitLbl", body).textContent = (mode === "qty" ? `${plural(e.unitLabel || "piece", num(amt.value) || 0)} · ${r0(s.grams)} ${U}` : mode === "grams" ? (U === "ml" ? "millilitres" : "grams") : "kcal") + (e.ai ? " · AI estimate" : "");
    $("#pv", body).innerHTML = four(s);
  };
  sheetStep = (dir) => { amt.value = r1(Math.max(0, (num(amt.value) || 0) + dir * (mode === "qty" ? (e.unit === "piece" ? 1 : 0.5) : mode === "grams" ? 10 : 25))); draw(); };
  amt.oninput = draw; selectOnFocus(amt);
  wireMealSeg(body, (m) => (meal = m));
  body.onclick = (ev) => { const s = ev.target.closest("[data-star]"); if (s) toggleFav(key, s); };
  const saveBtn = $("#saveE", body);
  saveBtn.onclick = guard(saveBtn, async () => {
    const v = num(amt.value);
    if (v === null || v < 0 || (mode !== "kcal" && !(v > 0))) return toast(mode === "kcal" ? "Enter the kcal" : "Enter an amount");
    const out = scaled();
    closeSheet();
    if (isNew) return addEntries([out]);
    Object.assign(e, out); await save("log"); renderToday(); toast("Updated");
  });
  if (!isNew) {
    $("#del", body).onclick = () => { closeSheet(); deleteEntry(id); };
    const ag = $("#again", body);
    ag.onclick = guard(ag, async () => { closeSheet(); await addEntries([cleanEntry(e)], "Added again"); });
    const of = $("#openFood", body); if (of) of.onclick = () => openPortion(food, { meal });
  }
  draw();
}

// ---------- Saved meals ----------
function openSavedMeal(m) {
  let meal = mealFor();
  const body = openSheet(`${head(m.name)}
    <ul class="list">${m.items.map((e) => `<li><div class="name">${esc(e.name)}<small>${esc(e.amountText || "")}</small></div><div class="kcal">${r0(e.kcal)}</div></li>`).join("")}</ul>
    <div class="preview">${four(sum4(m.items), r0)}</div>
    ${mealSeg(meal)}
    <button type="button" class="primary wide" id="addM">Add all to ${dayLabel()}</button>
    <div class="btnrow"><button type="button" class="quietbtn" id="renM">Rename</button><button type="button" class="danger" id="delM">Delete</button></div>`);
  wireMealSeg(body, (x) => (meal = x));
  const b = $("#addM", body);
  b.onclick = guard(b, async () => { closeSheet(); await addEntries(m.items.map((e) => ({ ...e, meal })), `Added ${m.name}`); });
  $("#renM", body).onclick = () => openNameSheet("Rename meal", m.name, async (name) => { m.name = name; await save("meals"); openSavedMeal(m); });
  $("#delM", body).onclick = async () => {
    delete S.meals[m.id]; await save("meals"); closeSheet();
    toast(`Deleted ${m.name}`, { action: "Undo", onAction: async () => { S.meals[m.id] = m; await save("meals"); } });
  };
}
// a meal's "..." menu: its totals, save it as a one-tap meal, or clear it
function openMealMenu(k) {
  const label = MEAL_NAME[k], es = (S.log[curDay] || []).filter((x) => x.meal === k);
  if (!es.length) return openAdd(k);
  const body = openSheet(`${head(label)}
    <div class="preview">${four(sum4(es), r0)}</div>
    <div class="btnrow"><button type="button" id="mmSave">${I.meal}Save as a meal</button><button type="button" class="danger" id="mmClear">Clear</button></div>`);
  $("#mmSave", body).onclick = () => openNameSheet("Name this meal", `My ${label.toLowerCase()}`, async (name) => {
    const id = uid(); S.meals[id] = { id, name, items: es.map(cleanEntry) }; await save("meals"); closeSheet(); toast(`Saved “${name}”. Find it under Add.`);
  });
  $("#mmClear", body).onclick = async () => {
    const key = curDay;
    S.log[key] = (S.log[key] || []).filter((x) => x.meal !== k); await save("log"); closeSheet(); renderToday();
    toast(`Cleared ${label.toLowerCase()}`, { action: "Undo", onAction: async () => { S.log[key] = [...(S.log[key] || []), ...es]; await save("log"); renderToday(); } });
  };
}

// ---------- Log weight ----------
function openWeigh() {
  const today = dkey(), last = latestWeight(), at = (d) => S.weights.find((w) => w.date === d);
  const fmt = (n) => (Math.round(n * 10) / 10).toFixed(1);
  let date = today;
  const first = at(date)?.kg ?? last;
  const body = openSheet(`${head("Log weight")}
    ${stepper(first ? fmt(first) : "", "0.0")}
    <div class="unitlbl">kg</div>
    <label class="datechip"><span id="wDateTxt">Today</span>${I.chev}<input type="date" id="wDate" max="${today}" value="${today}" aria-label="Date of this weigh-in"></label>
    <button type="button" class="primary wide" id="wSave">Save</button>`);
  const amt = $("#amt", body), wd = $("#wDate", body);
  sheetStep = (dir) => { amt.value = fmt(Math.max(0, (num(amt.value) ?? last ?? 70) + dir * 0.1)); };
  selectOnFocus(amt);
  wd.onclick = () => { if (!matchMedia("(pointer: coarse)").matches) { try { wd.showPicker(); } catch {} } };
  wd.onchange = () => {
    if (!wd.value || wd.value > today) wd.value = date;
    date = wd.value;
    $("#wDateTxt", body).textContent = date === today ? "Today" : date === addDays(today, -1) ? "Yesterday" : longDate(date);
    const ex = at(date); if (ex) amt.value = fmt(ex.kg);
  };
  const b = $("#wSave", body);
  b.onclick = guard(b, async () => {
    const kg = num(amt.value);
    if (!kg || kg < 30 || kg > 300) return toast("Enter your weight in kg");
    const old = at(date), had = old ? { ...old } : null, d = date;
    S.weights = S.weights.filter((w) => w.date !== d); S.weights.push({ date: d, kg: r1(kg) });
    await save("weights"); closeSheet(); renderAll();
    toast(had ? `Updated ${shortDate(d)} to ${fmt(kg)} kg` : `Saved ${fmt(kg)} kg`, { action: "Undo", onAction: async () => { S.weights = S.weights.filter((w) => w.date !== d); if (had) S.weights.push(had); await save("weights"); renderAll(); } });
  });
}

// ---------- backup ----------
function buildBackup() { return { app: "fuel", version: 3, exported: new Date().toISOString(), ...Object.fromEntries(DATA_KEYS.map((k) => [k, S[k]])) }; }
// replaces everything; anything the file doesn't have (older backups) becomes empty rather than keeping what was there
function applyBackup(d) {
  const def = DEFAULTS();
  for (const k of DATA_KEYS) { const v = d[k]; S[k] = (k === "weights" ? Array.isArray(v) : v && typeof v === "object" && !Array.isArray(v)) ? v : def[k]; }
  return save(...DATA_KEYS);
}

// ---------- wiring ----------
function goTab(name, opts = {}) {
  if (!$("#tab-" + name)) name = "today";
  const same = name === curTab; curTab = name;
  if (!same) document.activeElement?.blur?.(); // a field on the tab being left must not keep the focus (and the keyboard)
  $$(".dock [data-tab]").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
  $$(".tab").forEach((t) => t.classList.toggle("active", t.id === "tab-" + name));
  closeSheet(); renderAll();
  if (!opts.stay) window.scrollTo({ top: 0, behavior: same && !reduceMotion() ? "smooth" : "auto" });
}
function wire() {
  document.addEventListener("touchstart", () => {}, { passive: true }); // makes pressed-button styles work on iOS
  // no pinch zoom (Safari's own gesture events); double-tap zoom is switched off in the CSS
  for (const ev of ["gesturestart", "gesturechange", "gestureend"]) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });

  $$(".dock [data-tab]").forEach((b) => (b.onclick = () => goTab(b.dataset.tab)));
  document.addEventListener("click", (e) => { const g = e.target.closest("[data-goto]"); if (g) goTab(g.dataset.goto); });
  $("#fab").onclick = () => openAdd();

  // Today
  $("#dayStrip").onclick = (e) => { const b = e.target.closest("[data-day]"); if (b) { curDay = b.dataset.day; renderToday(); } };
  const pick = $("#dayPick");
  pick.onclick = () => { if (!matchMedia("(pointer: coarse)").matches) { try { pick.showPicker(); } catch {} } };
  pick.onchange = () => { if (pick.value && pick.value <= dkey()) { curDay = pick.value; renderToday(); } else pick.value = curDay; pick.blur(); };
  $("#backToday").onclick = () => { curDay = dkey(); renderToday(); };
  $("#hideInstall").onclick = async () => { S.meta.hideInstall = true; await save("meta"); renderInstallHint(); };
  $("#meals").onclick = (e) => {
    const li = e.target.closest("[data-entry]"); if (li) return openEntry(li.dataset.entry);
    const ad = e.target.closest("[data-addto]"); if (ad) return openAdd(ad.dataset.addto);
    const mm = e.target.closest("[data-mealmenu]"); if (mm) return openMealMenu(mm.dataset.mealmenu);
    if (e.target.closest("#copyDay") && !(S.log[curDay] || []).length) { const prev = S.log[addDays(curDay, -1)] || []; return addEntries(prev.map(cleanEntry), `Copied ${nItems(prev.length)}`); }
  };
  $("#waterCard").onclick = (e) => {
    const b = e.target.closest("[data-water]"); if (!b) return;
    const ml = Math.max(0, (S.water[curDay] || 0) + Number(b.dataset.water));
    if (ml) S.water[curDay] = ml; else delete S.water[curDay];
    renderWater(); save("water");
  };

  // Progress
  $("#wHead").onclick = (e) => { if (e.target.closest("#logW")) openWeigh(); };
  $("#rangeSeg").onclick = (e) => { const b = e.target.closest("[data-range]"); if (!b) return; chartRange = b.dataset.range; $$("#rangeSeg button").forEach((x) => x.classList.toggle("on", x === b)); renderWeight(); };
  $("#weekCard").onclick = (e) => { const b = e.target.closest("[data-day]"); if (b) { curDay = b.dataset.day; goTab("today"); } };
  $("#wList").onclick = async (e) => {
    const b = e.target.closest("[data-delw]"); if (!b) return;
    const gone = S.weights.find((w) => w.date === b.dataset.delw); if (!gone) return;
    S.weights = S.weights.filter((w) => w !== gone); await save("weights"); renderAll();
    toast(`Deleted ${gone.kg} kg`, { action: "Undo", onAction: async () => { S.weights.push(gone); await save("weights"); renderAll(); } });
  };
  $("#adaptCard").onclick = async (e) => {
    if (e.target.id === "useAdaptive") { S.profile.tdeeOverride = adaptiveEstimate().est; await save("profile"); renderAll(); toast("Targets now use your measured burn"); }
    if (e.target.id === "clearAdaptive") { delete S.profile.tdeeOverride; await save("profile"); renderAll(); toast("Back to the formula"); }
  };

  // Me
  $("#profileForm").onsubmit = async (e) => {
    e.preventDefault(); const f = e.target.elements; document.activeElement?.blur?.();
    Object.assign(S.profile, { sex: f.sex.value, birthYear: num(f.birthYear.value), height: num(f.height.value), activity: f.activity.value, goal: f.goal.value,
      kcalOverride: num(f.kcalOverride.value), goalKg: num(f.goalKg.value), waterGoal: num(f.waterGoal.value) });
    await save("profile"); renderAll(); toast(latestWeight() ? "Profile saved" : "Saved. Now log a weigh-in in Progress.");
  };
  $("#aiForm").onsubmit = async (e) => {
    e.preventDefault(); const f = e.target.elements; document.activeElement?.blur?.();
    S.ai.apiKey = f.apiKey.value.trim(); S.ai.model = f.model.value; await save("ai"); toast("AI settings saved");
  };
  $("#aiTest").onclick = async () => {
    const f = $("#aiForm").elements; S.ai.apiKey = f.apiKey.value.trim(); S.ai.model = f.model.value; await save("ai");
    document.activeElement?.blur?.();
    if (!S.ai.apiKey) return toast("Paste your API key first");
    toast("Testing…", { ms: 20000 });
    try { const r = await askClaude([{ type: "text", text: "Reply with ok=true." }], { type: "object", additionalProperties: false, required: ["ok"], properties: { ok: { type: "boolean" } } }); toast(r.ok ? "The key works" : "Unexpected answer"); }
    catch (err) { toast(err.message, { ms: 6000 }); }
  };
  $("#exportBtn").onclick = async () => {
    const blob = new Blob([JSON.stringify(buildBackup())], { type: "application/json" });
    const file = new File([blob], `fuel-backup-${dkey()}.json`, { type: "application/json" });
    const done = async () => { S.meta.lastBackup = Date.now(); await save("meta"); renderMe(); };
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: "Fuel backup" }); return done(); }
      catch (err) { if (err.name === "AbortError") return; }
    }
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = file.name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    done();
  };
  $("#importFile").onchange = async (e) => {
    const file = e.target.files[0]; e.target.value = ""; if (!file) return;
    let d;
    try { d = JSON.parse(await file.text()); if (!d || d.app !== "fuel") throw new Error(); } catch { return toast("That isn't a Fuel backup file"); }
    const days = Object.keys(d.log || {}).length, ws = Array.isArray(d.weights) ? d.weights.length : 0;
    const when = d.exported ? new Date(d.exported).toLocaleDateString(LOC, { day: "numeric", month: "short", year: "numeric" }) : "an unknown date";
    const body = openSheet(`${head("Restore this backup?")}
      <div class="meta">Saved on ${esc(when)} · ${days} day${days === 1 ? "" : "s"} of food · ${ws} weigh-in${ws === 1 ? "" : "s"}</div>
      <div class="note warn">It replaces everything that is on this phone now.</div>
      <div class="btnrow"><button type="button" data-close>Cancel</button><button type="button" class="danger" id="doImport">Replace</button></div>`);
    const go = $("#doImport", body);
    go.onclick = guard(go, async () => {
      const before = buildBackup();
      await applyBackup(d); closeSheet(); renderAll();
      toast("Backup restored", { action: "Undo", ms: 8000, onAction: async () => { await applyBackup(before); renderAll(); } });
    });
  };
  $("#updBtn").onclick = async () => {
    if (!swReg) return toast("Updates arrive by themselves once Fuel is on your Home Screen");
    toast("Checking…", { ms: 10000 });
    UPD.now = true; // asked for by hand: restart as soon as the new version is ready
    try { await checkForUpdate(true); } catch { UPD.now = false; return toast("No connection"); }
    if (swReg.installing || swReg.waiting) return toast("Downloading the new version…", { ms: 8000 });
    UPD.now = false;
    if (!UPD.want) toast("You have the latest version");
  };

  // App reopened on a new day: move on to the new today
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    const now = dkey(); if (now === lastToday) return;
    if (curDay === lastToday) curDay = now;
    lastToday = now; renderAll();
  });
}

// ---------- offline + updates (service worker) ----------
// The app's files are kept on the phone, so it opens instantly and without signal.
// Updates need nothing from the user: every time the app comes back to the front it asks the server for a newer
// version, downloads it in the background, and restarts into it at the first quiet moment (never with a sheet open,
// in the middle of typing, or while an Undo is on screen) or when the app is put away. iOS usually resumes a Home
// Screen app without reloading it, so waiting for "the next start" would leave an old version on screen for days.
let swReg = null;
const UPD = { want: null, reloading: false, now: false, lastCheck: 0, lastTouch: 0 };
function swAsk(msg) {
  return new Promise((res) => {
    const c = navigator.serviceWorker?.controller; if (!c) return res(null);
    const ch = new MessageChannel(); ch.port1.onmessage = (e) => res(e.data);
    c.postMessage(msg, [ch.port2]); setTimeout(() => res(null), 1500);
  });
}
// restart into the new files and come back to the same tab, day and scroll position
function softReload() {
  UPD.reloading = true;
  try {
    sessionStorage.setItem("fuel-update-tried", UPD.want || "");
    sessionStorage.setItem("fuel-resume", JSON.stringify({ tab: curTab, day: curDay, y: window.scrollY, updated: !!UPD.want, at: Date.now() }));
  } catch {}
  location.reload();
}
// Is something being typed that a restart would throw away? Only text fields that are actually on screen count:
// a date picker or a drop-down that merely kept the focus (iOS often leaves it there) must not hold an update back.
function typing() {
  const el = document.activeElement;
  if (!el || !el.getClientRects().length) return false;
  return el.tagName === "TEXTAREA" || (el.tagName === "INPUT" && /^(text|search|number|password|tel|email|url)$/.test(el.type));
}
function busy() {
  if (sheet.open || typing()) return true;
  const t = $("#toast"); return !t.classList.contains("hidden") && !!$("button", t); // an Undo is still on offer
}
function applyUpdate() {
  if (!UPD.want || UPD.reloading || busy()) return;
  if (document.visibilityState === "hidden" || UPD.now || Date.now() - UPD.lastTouch > 4000) softReload();
}
// Is a newer version than this page already in charge? Then restart into it (once per version: never loop).
async function noteVersion() {
  const v = await swAsk("version");
  if (!v || v === APP_VERSION) return;
  let tried = null; try { tried = sessionStorage.getItem("fuel-update-tried"); } catch {}
  if (tried === v) return;
  UPD.want = v; applyUpdate();
}
function checkForUpdate(force) {
  if (!swReg || (!force && Date.now() - UPD.lastCheck < 60e3)) return Promise.resolve();
  UPD.lastCheck = Date.now();
  noteVersion();
  return swReg.update();
}
function setupSW() {
  if (!("serviceWorker" in navigator)) return;
  const local = ["localhost", "127.0.0.1"].includes(location.hostname);
  if (location.protocol !== "https:" && !(local && new URLSearchParams(location.search).has("sw"))) return; // on the Mac only with ?sw (for testing)
  UPD.lastCheck = Date.now(); // the browser checks by itself while the page loads
  navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).then((reg) => { swReg = reg; }).catch(() => {});
  navigator.serviceWorker.addEventListener("controllerchange", noteVersion);
  for (const ev of ["pointerdown", "touchmove", "scroll", "keydown"]) addEventListener(ev, () => { UPD.lastTouch = Date.now(); }, { passive: true, capture: true }); // "in use" = touched, scrolled or typed just now
  const back = () => { if (document.visibilityState === "visible") checkForUpdate().catch(() => {}); };
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") applyUpdate(); else back(); });
  for (const ev of ["pageshow", "focus", "online"]) addEventListener(ev, back);
  setInterval(applyUpdate, 1500);
}

(async function init() {
  buildRing();
  try { await DB.open(); await loadAll(); } catch (e) { toast("Storage error: " + e.message, { ms: 6000 }); }
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
  let resumed = null; // set after an update restart: come back to the same tab, day and scroll position
  try { resumed = JSON.parse(sessionStorage.getItem("fuel-resume") || "null"); sessionStorage.removeItem("fuel-resume"); } catch {}
  if (resumed && Date.now() - resumed.at < 20000) { if (resumed.day && resumed.day <= dkey()) curDay = resumed.day; if (resumed.tab) curTab = resumed.tab; } else resumed = null;
  wire();
  if (curTab !== "today") goTab(curTab, { stay: true }); else renderAll();
  if (resumed) { if (resumed.y) window.scrollTo(0, resumed.y); if (resumed.updated) toast("Updated to the latest version"); }
  setupSW();
})();
