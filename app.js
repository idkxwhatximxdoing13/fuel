/* Fuel – personal calorie / weight app. All data stays on this device (IndexedDB). */
"use strict";

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
const fold = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); // "brânză" → "branza"
const shortDate = (k) => parseDkey(k).toLocaleDateString(undefined, { day: "numeric", month: "short" });
const plural = (lbl, n) => (n === 1 || /\)$/.test(lbl) ? lbl : lbl + "s");
const unitOf = (basis) => (basis === "ml" ? "ml" : "g");

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
const KEYS = ["profile", "weights", "log", "products", "myfoods", "ai", "favs", "meals", "water"];
const S = { profile: {}, weights: [], log: {}, products: {}, myfoods: {}, ai: { model: "claude-opus-5-5" }, favs: {}, meals: {}, water: {} };
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
let curDay = dkey(), lastToday = dkey();
const MEALS = [["breakfast", "Breakfast"], ["lunch", "Lunch"], ["dinner", "Dinner"], ["snacks", "Snacks"]];
const MEAL_NAME = Object.fromEntries(MEALS);
function defaultMeal() { const h = new Date().getHours(); return h < 11 ? "breakfast" : h < 16 ? "lunch" : h < 21 ? "dinner" : "snacks"; }
const entryKey = (e) => e.ref || "n:" + fold(e.name);
const dayLabel = () => (curDay === dkey() ? "today" : shortDate(curDay));

async function addEntries(list, msg) {
  const day = (S.log[curDay] ||= []), ids = [];
  for (const e of list) { const x = { ...e, id: uid(), ts: Date.now() }; day.push(x); ids.push(x.id); }
  await save("log"); renderToday();
  const key = curDay;
  toast(msg || `Added ${r0(list.reduce((s, e) => s + e.kcal, 0))} kcal`, { action: "Undo", onAction: async () => { S.log[key] = (S.log[key] || []).filter((x) => !ids.includes(x.id)); await save("log"); renderToday(); } });
}
async function deleteEntry(id) {
  const key = curDay, day = S.log[key] || [], i = day.findIndex((x) => x.id === id); if (i < 0) return;
  const [gone] = day.splice(i, 1); await save("log"); renderToday();
  toast(`Deleted ${gone.name}`, { action: "Undo", onAction: async () => { (S.log[key] ||= []).splice(i, 0, gone); await save("log"); renderToday(); } });
}
// one tap per action: blocks double taps on "Add" buttons
function guard(btn, fn) { return async (...a) => { if (btn.disabled) return; btn.disabled = true; try { await fn(...a); } finally { btn.disabled = false; } }; }

// recent foods (newest first), with the last amount used; counts for "frequent"
function history() {
  const map = new Map(), from = addDays(dkey(), -60);
  for (const k of Object.keys(S.log).sort().reverse()) for (const e of [...S.log[k]].reverse()) {
    const key = entryKey(e); const h = map.get(key);
    if (!h) map.set(key, { key, last: e, n: k >= from ? 1 : 0, lastDay: k });
    else if (k >= from) h.n++;
  }
  return [...map.values()];
}
const cleanEntry = (e) => { const { id, ts, ...rest } = e; return rest; };

// ---------- rendering: header pill ----------
function renderPill() {
  const st = streak(), today = isLogged(dkey());
  $("#led").className = "led" + (today ? "" : " warn");
  $("#pillTxt").textContent = st ? `STREAK ${st}D` : today ? "LOGGED" : "NOT LOGGED";
}

// ---------- rendering: Today ----------
function setBar(el, val, max) { const pct = max ? Math.min(100, (val / max) * 100) : 0; el.style.width = pct + "%"; el.classList.toggle("over", !!max && val > max * 1.03); }

function renderToday() {
  const today = dkey();
  $("#dayTitle").textContent = curDay === today ? "Today" : curDay === addDays(today, -1) ? "Yesterday" : parseDkey(curDay).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  $("#dayNext").disabled = curDay >= today;
  const T = targets(), t = dayTotals(curDay);
  // week strip: the 7 days ending today (or the picked day if older)
  const end = curDay > addDays(today, -7) ? today : addDays(curDay, 3) > today ? today : addDays(curDay, 3);
  $("#weekStrip").innerHTML = Array.from({ length: 7 }, (_, i) => addDays(end, i - 6)).map((k) => {
    const d = parseDkey(k);
    return `<button data-day="${k}" class="${dayStatus(k, T)}${k === curDay ? " cur" : ""}${k === today ? " today" : ""}">${d.toLocaleDateString(undefined, { weekday: "narrow" })}<b>${d.getDate()}</b><i></i></button>`;
  }).join("");
  $("#setupHint").classList.toggle("hidden", !!T);
  const big = $("#kcalLeft");
  if (T) {
    const left = T.kcal - t.kcal;
    big.textContent = r0(Math.abs(left)); big.classList.toggle("over", left < 0);
    $("#kcalLeftLabel").textContent = left >= 0 ? "kcal left" : "kcal over";
    $("#kcalEaten").innerHTML = `<span class="lbl">eaten</span><br>${r0(t.kcal)}<br><span class="lbl">target</span><br>${T.kcal}`;
  } else { big.textContent = r0(t.kcal); big.classList.remove("over"); $("#kcalLeftLabel").textContent = "kcal eaten"; $("#kcalEaten").textContent = ""; }
  setBar($("#kcalBar"), t.kcal, T?.kcal);
  const m = (v, tg) => `${r0(v)}${tg ? `<small> /${tg}g</small>` : "<small>g</small>"}`;
  $("#mP").innerHTML = m(t.p, T?.prot); setBar($("#bP"), t.p, T?.prot);
  $("#mC").innerHTML = m(t.c, T?.carbs); setBar($("#bC"), t.c, T?.carbs);
  $("#mF").innerHTML = m(t.f, T?.fat); setBar($("#bF"), t.f, T?.fat);
  renderQuick();
  const entries = S.log[curDay] || [], prev = S.log[addDays(curDay, -1)] || [];
  let html = "";
  if (!entries.length && prev.length) html += `<button class="wide" id="copyDay" style="margin-bottom:12px">⧉ Same as ${curDay === today ? "yesterday" : "day before"} · ${prev.length} items · ${r0(prev.reduce((s, e) => s + e.kcal, 0))} kcal</button>`;
  html += MEALS.map(([k, label]) => {
    const es = entries.filter((e) => e.meal === k), pv = prev.filter((e) => e.meal === k);
    const sum = es.reduce((s, e) => s + e.kcal, 0);
    const acts = [];
    if (!es.length && pv.length && entries.length) acts.push(`<button data-copymeal="${k}">⧉ Yesterday's ${label.toLowerCase()} · ${r0(pv.reduce((s, e) => s + e.kcal, 0))}</button>`);
    if (es.length >= 2) acts.push(`<button data-savemeal="${k}">▣ Save as meal</button>`);
    return `<div class="card meal"><div class="ph"><h3>${label}</h3><small>${es.length ? `<b class="amber">${r0(sum)}</b> kcal` : ""}</small></div>
      ${es.length ? `<ul class="list">${es.map((e) => `<li class="tap" data-entry="${e.id}"><div class="name">${S.favs[entryKey(e)] ? '<span class="amber">★</span> ' : ""}${esc(e.name)}<small>${esc(e.amountText || r0(e.grams) + " g")} · P${r0(e.p)} C${r0(e.c)} F${r0(e.f)}</small></div><div class="kcal">${r0(e.kcal)}</div></li>`).join("")}</ul>` : `<div class="empty">— empty —</div>`}
      ${acts.length ? `<div class="acts">${acts.join("")}</div>` : ""}</div>`;
  }).join("");
  $("#meals").innerHTML = html;
  renderWater();
  renderPill();
}

function renderQuick() {
  const h = history();
  const favs = h.filter((x) => S.favs[x.key]);
  const meals = Object.values(S.meals);
  const recent = h.filter((x) => !S.favs[x.key]).slice(0, 10);
  const chip = (x) => `<button data-q="${esc(x.key)}">${S.favs[x.key] ? '<span><span class="star">★</span> ' : "<span>"}${esc(x.last.name)}</span><small>${esc(x.last.amountText || "")} · ${r0(x.last.kcal)}</small></button>`;
  const mchip = (m) => `<button data-qm="${m.id}"><span><span class="star">▣</span> ${esc(m.name)}</span><small>${m.items.length} items · ${r0(m.items.reduce((s, e) => s + e.kcal, 0))}</small></button>`;
  const html = [...meals.map(mchip), ...favs.map(chip), ...recent.map(chip)].join("");
  $("#quickStrip").innerHTML = html;
  $("#quickStrip").classList.toggle("hidden", !html);
}

function renderWater() {
  const ml = S.water[curDay] || 0, goal = S.profile.waterGoal || 2500, cups = Math.max(1, Math.round(goal / 250));
  $("#waterCard").innerHTML = `<div class="ph"><h3>Water</h3><small><b class="${ml >= goal ? "ok" : "amber"}">${r1(ml / 1000)}</b> / ${r1(goal / 1000)} L</small></div>
    <div class="cups">${Array.from({ length: cups }, (_, i) => `<i class="${i < Math.round(ml / 250) ? "on" : ""}"></i>`).join("")}</div>
    <div class="btnrow"><button data-water="-250">−</button><button data-water="250" class="primary">+ glass</button><button data-water="500">+ 0.5 L</button></div>`;
}

// ---------- rendering: Progress ----------
function renderWeight() {
  const today = dkey();
  const wd = $("#wDate"); wd.max = today; if (!wd.value || wd.value > today) wd.value = today;
  const w = sortedW(), T = targets();
  // headline
  const tw = trendWeight(), goal = S.profile.goalKg, slope = weightSlope();
  let head = "";
  if (tw) {
    const first = w[0];
    const ch = r1(tw - first.kg);
    head = `<div class="wbig"><div class="big">${r1(tw)}<small class="lbl"> kg</small></div><div class="sub">7-day average<br>${w.length > 1 ? `${ch > 0 ? "+" : ""}${ch} kg since ${shortDate(first.date)}` : "first weigh-in"}${slope !== null ? `<br>${slope * 7 > 0 ? "+" : ""}${r1(slope * 7)} kg / week lately` : ""}</div></div>`;
    if (goal) {
      const start = first.kg, done = start === goal ? 1 : Math.max(0, Math.min(1, (start - tw) / (start - goal)));
      const left = r1(Math.abs(tw - goal));
      let eta = "";
      if (left < 0.3) eta = "Goal reached ✓";
      else if (slope && Math.sign(goal - tw) === Math.sign(slope) && Math.abs(slope) > 0.005) {
        const days = (goal - tw) / slope, d = new Date(); d.setDate(d.getDate() + days);
        eta = `At this pace: ${d.toLocaleDateString(undefined, { month: "short", year: "numeric" })}`;
      } else if (slope !== null) eta = "Not moving towards the goal lately";
      head += `<div class="prog"><i style="width:${r0(done * 100)}%"></i></div><div class="small muted" style="font-family:var(--mono);font-size:11.5px">${left} kg to ${goal} kg${eta ? " · " + eta : ""}</div>`;
    }
  } else head = `<div class="empty">No weigh-ins yet.</div>`;
  $("#wHead").innerHTML = head;

  $("#wList").innerHTML = w.length ? [...w].reverse().map((x) => `<li><div class="name">${parseDkey(x.date).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</div><div class="kcal">${x.kg}</div><button class="danger" data-delw="${x.date}" aria-label="Delete">✕</button></li>`).join("") : `<li class="empty">No weigh-ins yet</li>`;

  // chart: raw dots dim, 7-day trend line bright, dashed goal line
  if (w.length >= 2) {
    const W = 520, H = 190, padL = 40, padR = 12, padY = 22;
    const t0 = parseDkey(w[0].date), t1 = parseDkey(w[w.length - 1].date), span = Math.max(1, (t1 - t0) / 86400000);
    const ys = w.map((p) => p.kg); if (goal && Math.abs(goal - ys[ys.length - 1]) < 15) ys.push(goal);
    const lo = Math.floor(Math.min(...ys) - 0.5), hi = Math.ceil(Math.max(...ys) + 0.5);
    const X = (d) => padL + ((parseDkey(d) - t0) / 86400000 / span) * (W - padL - padR);
    const Y = (kg) => H - padY - ((kg - lo) / (hi - lo)) * (H - padY * 2);
    const trend = w.map((p) => { const near = w.filter((q) => q.date <= p.date && daysBetween(q.date, p.date) <= 6); return { date: p.date, kg: near.reduce((s, q) => s + q.kg, 0) / near.length }; });
    const line = trend.map((p, i) => `${i ? "L" : "M"}${X(p.date).toFixed(1)},${Y(p.kg).toFixed(1)}`).join(" ");
    const grid = [lo, (lo + hi) / 2, hi].map((v) => `<line x1="${padL}" x2="${W - padR}" y1="${Y(v)}" y2="${Y(v)}" stroke="rgba(240,160,60,.12)"/><text x="2" y="${Y(v) + 4}">${r1(v)}</text>`).join("");
    $("#wChart").innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Weight chart">${grid}
      ${goal && goal >= lo && goal <= hi ? `<line x1="${padL}" x2="${W - padR}" y1="${Y(goal)}" y2="${Y(goal)}" stroke="#a6e37a" stroke-dasharray="5 5"/><text x="${W - padR}" y="${Y(goal) - 4}" text-anchor="end" style="fill:#a6e37a">GOAL</text>` : ""}
      ${w.map((p) => `<rect x="${X(p.date) - 2.5}" y="${Y(p.kg) - 2.5}" width="5" height="5" fill="#8a7a62"/>`).join("")}
      <path d="${line}" fill="none" stroke="#f2a33a" stroke-width="2.5" stroke-linejoin="round" style="filter:drop-shadow(0 0 4px rgba(242,163,58,.6))"/>
      <text x="${padL}" y="${H - 4}">${shortDate(w[0].date)}</text><text x="${W - padR}" y="${H - 4}" text-anchor="end">${shortDate(w[w.length - 1].date)}</text></svg>`;
    $("#wLegend").innerHTML = `<span class="amber">━</span> trend · <span style="color:var(--faint)">■</span> weigh-ins`;
  } else { $("#wChart").innerHTML = `<div class="empty">Chart appears after 2 weigh-ins.</div>`; $("#wLegend").textContent = ""; }
  $("#wStats").innerHTML = "";

  renderWeekCard(T);
  renderMedals();

  const A = adaptiveEstimate();
  let html = `<h3>Real burn check</h3>`;
  if (!A.ok) html += `<div class="empty">${esc(A.why)}</div>`;
  else {
    html += `<div class="big3"><div><span class="lbl">ate / day</span><strong>${A.avgIn}</strong></div><div><span class="lbl">kg / week</span><strong>${A.perWeek > 0 ? "+" : ""}${A.perWeek}</strong></div><div><span class="lbl">real burn</span><strong>${A.est}</strong></div></div>
      <p class="small muted" style="font-family:var(--mono);font-size:11.5px">Formula guessed ${T ? T.formulaTdee : "—"} kcal.</p>`;
    if (T) html += `<div class="btnrow"><button class="primary" id="useAdaptive">Use ${A.est}</button>${S.profile.tdeeOverride ? `<button id="clearAdaptive">Back to formula</button>` : ""}</div>`;
  }
  $("#adaptCard").innerHTML = html;
}

function renderWeekCard(T) {
  const today = dkey(), days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const tot = days.map(dayTotals), logged = tot.filter((t) => t.kcal > LOGGED);
  const max = Math.max(T?.kcal || 0, ...tot.map((t) => t.kcal), 1) * 1.08;
  const avg = (f) => (logged.length ? r0(logged.reduce((s, t) => s + t[f], 0) / logged.length) : "—");
  $("#weekCard").innerHTML = `<div class="ph"><h3>Last 7 days</h3><small>${logged.length}/7 logged</small></div>
    <div class="weekbars">${T ? `<div class="tgt" style="bottom:${(T.kcal / max) * 100}%"></div>` : ""}${days.map((k, i) => `<div class="c ${dayStatus(k, T) === "over" ? "over" : ""} ${k === today ? "today" : ""}" data-day="${k}"><i style="height:${(tot[i].kcal / max) * 100}%"></i></div>`).join("")}</div>
    <div class="axis7">${days.map((k) => `<span>${parseDkey(k).toLocaleDateString(undefined, { weekday: "narrow" })}</span>`).join("")}</div>
    <div class="big3"><div><span class="lbl">avg kcal</span><strong>${avg("kcal")}</strong></div><div><span class="lbl">avg protein</span><strong>${avg("p")}${logged.length ? "<small class='lbl'>g</small>" : ""}</strong></div><div><span class="lbl">on target</span><strong>${days.filter((k) => dayStatus(k, T) === "hit").length}<small class="lbl">/7</small></strong></div></div>`;
}

function medals() {
  const st = bestStreak(), w = sortedW(), T = targets();
  const lost = w.length ? w[0].kg - (trendWeight() || w[0].kg) : 0;
  const days = Object.keys(S.log), allEntries = days.flatMap((k) => S.log[k]);
  const protDays = T ? days.filter((k) => dayTotals(k).p >= T.prot * 0.95).length : 0;
  const scans = Object.keys(S.products).length;
  return [
    ["FIRST LOG", allEntries.length > 0], ["3-DAY STREAK", st >= 3], ["WEEK STREAK", st >= 7], ["30-DAY STREAK", st >= 30], ["100 DAYS", st >= 100],
    ["FIRST SCAN", scans >= 1], ["25 PRODUCTS", scans >= 25], ["PROTEIN ×10", protDays >= 10], ["10 WEIGH-INS", w.length >= 10],
    ["−1 KG", lost >= 1], ["−5 KG", lost >= 5], ["−10 KG", lost >= 10], ["GOAL HIT", !!S.profile.goalKg && w.length > 1 && Math.abs((trendWeight() || 0) - S.profile.goalKg) < 0.3],
  ];
}
function renderMedals() {
  const m = medals(), got = m.filter((x) => x[1]).length;
  $("#medalCard").innerHTML = `<div class="ph"><h3>Medals</h3><small>${got}/${m.length} · best streak ${bestStreak()}d</small></div>
    <div class="medals">${m.map(([n, ok]) => `<span class="medal ${ok ? "got" : ""}">${ok ? "◆" : "◇"} ${n}</span>`).join("")}</div>`;
}

// ---------- rendering: Me ----------
function renderMe() {
  const f = $("#profileForm"), p = S.profile;
  for (const k of ["sex", "birthYear", "height", "activity", "goal", "kcalOverride", "goalKg", "waterGoal"]) if (p[k] !== undefined && p[k] !== null) f.elements[k].value = p[k];
  const a = $("#aiForm"); a.elements.apiKey.value = S.ai.apiKey || ""; a.elements.model.value = S.ai.model || "claude-opus-5-5";
  const T = targets();
  $("#targetsCard").innerHTML = T ? `<div class="ph"><h3>Daily targets</h3><small>${GOALS[T.goal]}${T.auto ? " · suggested" : ""}</small></div>
    <div class="preview"><div><b>${T.kcal}</b><span>kcal</span></div><div><b>${T.prot}</b><span>protein</span></div><div><b>${T.carbs}</b><span>carbs</span></div><div><b>${T.fat}</b><span>fat</span></div></div>
    <details><summary>How it's worked out</summary><p class="muted small">Weight ${r1(T.kg)} kg (7-day average), age ${T.age}, BMI ${T.bmi}${T.auto ? ` (${T.suggested === "lose" ? "25+ → lose fat first" : T.suggested === "gain" ? "under 20 → build muscle" : "20–25 → recomp"})` : ""}. Resting burn ${T.bmr} kcal × activity = ${T.formulaTdee} kcal/day${S.profile.tdeeOverride ? `; using your measured burn ${S.profile.tdeeOverride}` : ""}. Lose fat −20%, recomp −10%, build muscle +10%. Protein 1.8 g/kg${T.kg > 25 * (S.profile.height / 100) ** 2 ? " of your weight at BMI 25" : ""}, fat 25% of calories, carbs the rest. Not medical advice.</p></details>`
    : `<h3>Daily targets</h3><div class="empty">Fill in the profile and add a weigh-in.</div>`;
  if (navigator.storage?.persisted) navigator.storage.persisted().then((ok) => { $("#storageInfo").textContent = ok ? "Storage protected ✓" : "Open from the Home Screen icon so iOS keeps your data."; });
}

function renderAll() { renderToday(); renderWeight(); renderMe(); }

// ---------- sheet helpers ----------
const sheet = $("#sheet");
let sheetCleanup = null;
function openSheet(html, onClose) {
  if (sheetCleanup) { try { sheetCleanup(); } catch {} }
  sheetCleanup = onClose || null;
  const body = $("#sheetBody");
  body.onclick = null; // drop handlers from the previous sheet
  body.innerHTML = html;
  if (!sheet.open) sheet.showModal();
  sheet.scrollTop = 0;
  return body;
}
function closeSheet() { if (sheetCleanup) { try { sheetCleanup(); } catch {} sheetCleanup = null; } if (sheet.open) sheet.close(); }
sheet.addEventListener("click", (e) => { if (e.target === sheet) closeSheet(); if (e.target.closest("[data-close]")) closeSheet(); });
sheet.addEventListener("cancel", (e) => { e.preventDefault(); closeSheet(); });
const head = (title) => `<div class="sheethead"><h2>${esc(title)}</h2><button class="icon" data-close aria-label="Close">×</button></div>`;
const mealChips = (sel) => `<div class="chips" id="mealChips">${MEALS.map(([k, l]) => `<button type="button" data-meal="${k}" class="${k === sel ? "on" : ""}">${l}</button>`).join("")}</div>`;
function wireMealChips(body, get, set) {
  $("#mealChips", body).addEventListener("click", (e) => { const m = e.target.closest("[data-meal]"); if (!m) return; set(m.dataset.meal); $$("#mealChips button", body).forEach((b) => b.classList.toggle("on", b.dataset.meal === get())); });
}
const selectOnFocus = (el) => { el.addEventListener("focus", () => setTimeout(() => el.select(), 0)); };

// ---------- Scan ----------
async function openScanner() {
  let controls = null, done = false, closed = false;
  const body = openSheet(`${head("Scan barcode")}
    <div class="video-wrap"><video id="scanVideo" playsinline muted autoplay></video><div class="aim"></div></div>
    <p class="lbl" id="scanMsg" style="margin:8px 0"><span class="blink">Searching for barcode</span></p>
    <div class="row"><input id="bcManual" inputmode="numeric" placeholder="or type the number"><button id="bcGo">Go</button></div>
    <label class="filebtn wide" style="margin-top:8px">📷 Photo of barcode<input type="file" accept="image/*" id="bcPhoto" hidden></label>`,
    () => { closed = true; try { controls?.stop(); } catch {} });
  const hints = new Map();
  const F = Vendor.BarcodeFormat;
  hints.set(Vendor.DecodeHintType.POSSIBLE_FORMATS, [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E]);
  const reader = new Vendor.BrowserMultiFormatReader(hints);
  const got = (code) => { if (done) return; done = true; try { controls?.stop(); } catch {} handleBarcode(code); };
  $("#bcGo", body).onclick = () => { const v = $("#bcManual", body).value.replace(/\D/g, ""); if (v.length >= 6) got(v); else toast("That doesn't look like a barcode"); };
  $("#bcManual", body).onkeydown = (e) => { if (e.key === "Enter") $("#bcGo", body).click(); };
  $("#bcPhoto", body).onchange = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    $("#scanMsg", body).textContent = "Reading photo…";
    const url = URL.createObjectURL(file);
    try { const res = await reader.decodeFromImageUrl(url); got(res.getText()); }
    catch { $("#scanMsg", body).textContent = "No barcode found in that photo. Try closer, or type it."; }
    finally { URL.revokeObjectURL(url); }
  };
  try {
    const c = await reader.decodeFromConstraints({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } } }, $("#scanVideo", body), (res) => { if (res) got(res.getText()); });
    if (closed || done) { try { c.stop(); } catch {} } else controls = c; // sheet closed while the camera was starting
  } catch (err) {
    if (!closed) $("#scanMsg", body).textContent = "Camera not available (" + (err.name || err.message) + "). Type the number or use a photo.";
  }
}

async function handleBarcode(code) {
  if (S.products[code] && complete(S.products[code])) return openPortion(S.products[code]);
  openSheet(`${head("Looking up…")}<p class="lbl"><span class="spinner"></span>Barcode ${esc(code)}</p>`);
  let prod = null, reason = null;
  try { prod = await lookupOFF(code); }
  catch (e) { reason = e.offline ? "No connection – couldn't check the food database." : e.message; }
  if (prod && complete(prod)) { await saveProduct(prod); return openPortion(prod, { fresh: true }); }
  openProductForm(prod || { id: "bc:" + code, barcode: code, basis: "g", per100: {} }, {
    reason: reason || (prod ? "Found it, but the nutrition info is incomplete." : "Not in the food database yet."),
    retry: reason ? () => handleBarcode(code) : null,
  });
}

// ---------- Product form (new / edit / AI label) ----------
function openProductForm(prod, opts = {}) {
  const p = prod.per100 || {};
  const v = (x) => (x === null || x === undefined ? "" : x);
  const body = openSheet(`${head(prod.barcode ? "Product " + prod.barcode : prod.name || "My food")}
    ${opts.reason ? `<div class="note${opts.retry ? " warn" : ""}">${esc(opts.reason)}${opts.retry ? ` <button class="link" id="retry">Try again</button>` : ""}</div>` : ""}
    ${S.ai.apiKey ? `<label class="filebtn wide primary" style="margin-bottom:6px;background:var(--accent);color:var(--accent-text)">📷 Read the label with AI<input type="file" accept="image/*" multiple id="labelPhotos" hidden></label>
    <p class="lbl" id="aiMsg" style="margin:4px 0 8px">Nutrition table + front of pack</p>` : ""}
    <form id="prodForm" class="form">
      <label>Name <input name="name" value="${esc(v(prod.name))}" required></label>
      <div class="grid2">
        <label>Brand <input name="brand" value="${esc(v(prod.brand))}"></label>
        <label>Per 100 <select name="basis"><option value="g">g</option><option value="ml">ml</option></select></label>
      </div>
      <div class="grid4">
        <label>kcal <input name="kcal" inputmode="decimal" value="${v(p.kcal)}" required></label>
        <label>Prot <input name="p" inputmode="decimal" value="${v(p.p)}" required></label>
        <label>Carb <input name="c" inputmode="decimal" value="${v(p.c)}" required></label>
        <label>Fat <input name="f" inputmode="decimal" value="${v(p.f)}" required></label>
      </div>
      <div class="grid2">
        <label>Pack g/ml <input name="packG" inputmode="decimal" value="${v(prod.packG)}"></label>
        <label>Pieces in pack <input name="piecesPerPack" inputmode="decimal" value="${v(prod.piecesPerPack)}" placeholder="8"></label>
      </div>
      <details${prod.pieceG || prod.servingG || prod.pieceLabel ? " open" : ""}><summary>More</summary>
        <div class="grid2">
          <label>Piece is a <input name="pieceLabel" value="${esc(v(prod.pieceLabel))}" placeholder="tortilla"></label>
          <label>1 piece g <input name="pieceG" inputmode="decimal" value="${v(prod.pieceG)}"></label>
          <label>Serving g/ml <input name="servingG" inputmode="decimal" value="${v(prod.servingG)}"></label>
        </div>
      </details>
      <div class="btnrow"><button class="primary" type="submit">Save</button>
      ${S.products[prod.barcode] || S.myfoods[prod.id] ? `<button type="button" class="danger" id="delProd">Delete</button>` : ""}</div>
    </form>`);
  const form = $("#prodForm", body);
  form.elements.basis.value = prod.basis || "g";
  const rt = $("#retry", body); if (rt) rt.onclick = opts.retry;
  const photos = $("#labelPhotos", body);
  if (photos) photos.onchange = async (e) => {
    const files = [...e.target.files].slice(0, 3); if (!files.length) return;
    const msg = $("#aiMsg", body); msg.innerHTML = `<span class="spinner"></span><span class="blink">Reading label</span>`;
    try {
      const imgs = await Promise.all(files.map(fileToImageBlock));
      const r = await askClaude([...imgs, { type: "text", text: LABEL_PROMPT }], LABEL_SCHEMA);
      const set = (k, val) => { if (val !== null && val !== undefined && val !== "") form.elements[k].value = val; };
      set("name", r.name); set("brand", r.brand); form.elements.basis.value = r.basis || "g";
      set("kcal", r.kcal_100 !== null ? r1(r.kcal_100) : null); set("p", r.protein_100); set("c", r.carbs_100); set("f", r.fat_100);
      set("packG", r.pack_g); set("piecesPerPack", r.pieces_per_pack); set("pieceLabel", r.piece_name); set("servingG", r.serving_g);
      const missing = ["kcal", "p", "c", "f"].filter((k) => !form.elements[k].value);
      msg.textContent = (missing.length ? "Couldn't read: " + missing.join(", ") + ". " : "✓ Read. Check against the label. ") + (r.notes || "");
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
    toast(out.barcode ? "Saved – next scan knows it" : "Saved to your foods");
    if (opts.afterSave) opts.afterSave(out); else openPortion(out);
  });
  const del = $("#delProd", body);
  if (del) del.onclick = async () => {
    if (!confirm("Delete this product? Logged entries stay.")) return;
    if (prod.barcode) { delete S.products[prod.barcode]; await save("products"); } else { delete S.myfoods[prod.id]; await save("myfoods"); }
    closeSheet(); toast("Deleted");
  };
}

// ---------- Portion (how much did you eat) ----------
function openPortion(prod, opts = {}) {
  const pg = pieceG(prod), U = unitOf(prod.basis);
  const units = [["g", U, 1]];
  if (pg) units.push(["piece", prod.pieceLabel || "piece", pg]);
  if (prod.servingG) units.push(["serving", "serving", prod.servingG]);
  if (prod.packG) units.push(["pack", "whole pack", prod.packG]);
  let unit = pg ? "piece" : "g", meal = opts.meal || defaultMeal();
  const key = prod.barcode || prod.id;
  const body = openSheet(`${head(prod.name)}
    <div class="lbl" style="text-transform:none">${esc(prod.brand || "")}${prod.brand ? " · " : ""}per 100 ${U}: ${r0(prod.per100.kcal)} kcal · P${r1(prod.per100.p)} C${r1(prod.per100.c)} F${r1(prod.per100.f)}${prod.source === "usda" ? " · USDA" : ""}${prod.source === "openfoodfacts" ? " · Open Food Facts" : ""}</div>
    ${opts.fresh ? `<div class="note">New product saved. Numbers look off? Edit it below.</div>` : ""}
    <div class="chips" id="unitChips"></div>
    ${prod.packG && !pg ? `<button class="link" id="setPieces">Comes in pieces? Set pieces per pack</button>` : ""}
    <div class="stepper"><button type="button" data-step="-1">−</button><input id="amt" type="text" inputmode="decimal"><button type="button" data-step="1">+</button></div>
    <div class="unitlbl" id="unitLbl"></div>
    <div class="chips" id="fastAmts"></div>
    <div class="preview" id="pv"></div>
    ${mealChips(meal)}
    <button class="primary wide" id="addBtn">Add to ${dayLabel()}</button>
    <div class="btnrow">
      <button id="favBtn">${S.favs[key] ? "★ Favourite" : "☆ Favourite"}</button>
      ${prod.source !== "usda" ? `<button id="editProd">Edit product</button>` : `<button id="copyProd">Copy to edit</button>`}
    </div>`);
  const amt = $("#amt", body);
  const curU = () => units.find((x) => x[0] === unit);
  const setAmt = (n) => { amt.value = r1(Math.max(0, n)); draw(); };
  const calc = () => {
    const u = curU(), grams = (num(amt.value) || 0) * u[2], k = grams / 100;
    return { grams, kcal: prod.per100.kcal * k, p: prod.per100.p * k, c: prod.per100.c * k, f: prod.per100.f * k, u };
  };
  const draw = () => {
    $("#unitChips", body).innerHTML = units.map(([k, l, g]) => `<button data-unit="${k}" class="${k === unit ? "on" : ""}">${esc(l)}${k !== "g" ? ` · ${r0(g)}${U}` : ""}</button>`).join("");
    const fast = unit === "g" ? [50, 100, 150, 200, 250] : [0.5, 1, 2, 3];
    $("#fastAmts", body).innerHTML = fast.map((n) => `<button data-amt="${n}" class="${num(amt.value) === n ? "on" : ""}">${n}${unit === "g" ? U : "×"}</button>`).join("");
    const c = calc();
    $("#unitLbl", body).textContent = (unit === "g" ? U : plural(c.u[1], num(amt.value))) + (unit !== "g" ? ` · ${r0(c.grams)} ${U}` : "");
    $("#pv", body).innerHTML = `<div><b>${r0(c.kcal)}</b><span>kcal</span></div><div><b>${r1(c.p)}</b><span>protein</span></div><div><b>${r1(c.c)}</b><span>carbs</span></div><div><b>${r1(c.f)}</b><span>fat</span></div>`;
  };
  amt.value = opts.amount ?? (pg ? 1 : 100);
  if (opts.unit && units.some((u) => u[0] === opts.unit)) unit = opts.unit;
  body.onclick = (e) => {
    const u = e.target.closest("[data-unit]"); if (u) { unit = u.dataset.unit; amt.value = unit === "g" ? 100 : 1; draw(); }
    const s = e.target.closest("[data-step]"); if (s) setAmt((num(amt.value) || 0) + s.dataset.step * (unit === "g" ? 10 : unit === "piece" ? 1 : 0.5));
    const a = e.target.closest("[data-amt]"); if (a) setAmt(+a.dataset.amt);
  };
  wireMealChips(body, () => meal, (m) => (meal = m));
  amt.oninput = draw; selectOnFocus(amt);
  const sp = $("#setPieces", body);
  if (sp) sp.onclick = async () => {
    const n = num(prompt(`How many pieces in the ${r0(prod.packG)} ${U} pack?`)); if (!n) return;
    const lbl = prompt("One piece is a… (tortilla, slice)", "piece") || "piece";
    const upd = { ...prod, piecesPerPack: n, pieceLabel: lbl.trim() };
    await saveProduct(upd); openPortion(upd, { meal });
  };
  const addBtn = $("#addBtn", body);
  addBtn.onclick = guard(addBtn, async () => {
    const c = calc(); if (c.grams <= 0) return toast("Enter an amount");
    const q = num(amt.value);
    const amountText = unit === "g" ? `${r0(c.grams)} ${U}` : `${q} ${plural(c.u[1], q)} · ${r0(c.grams)} ${U}`;
    closeSheet();
    await addEntries([{ ref: key, name: prod.name, grams: c.grams, unit, unitG: c.u[2], qty: q, unitLabel: c.u[1], basis: prod.basis, amountText, kcal: c.kcal, p: c.p, c: c.c, f: c.f, meal }]);
  });
  $("#favBtn", body).onclick = async (e) => { if (S.favs[key]) delete S.favs[key]; else S.favs[key] = true; await save("favs"); e.currentTarget.textContent = S.favs[key] ? "★ Favourite" : "☆ Favourite"; renderQuick(); };
  const ed = $("#editProd", body); if (ed) ed.onclick = () => openProductForm(prod);
  const cp = $("#copyProd", body); if (cp) cp.onclick = () => openProductForm({ ...prod, id: "my:" + uid(), source: "manual", name: prod.name + " (mine)" });
  draw();
}

// ---------- Food list search ----------
function openSearch() {
  const body = openSheet(`${head("Foods")}
    <input id="q" type="search" placeholder="Search: egg, rice, brânză…" autocomplete="off">
    <ul class="list" id="results" style="margin-top:8px"></ul>
    <div class="btnrow"><button id="newFood">＋ New food</button></div>`);
  const row = (f) => `<li class="tap" data-food="${esc(f.barcode || f.id)}"><div class="name">${S.favs[f.barcode || f.id] ? '<span class="amber">★</span> ' : ""}${esc(f.name)}<small>${esc(f.brand || (f.source === "usda" ? "basic food" : f.barcode ? "scanned" : "my food"))}${pieceG(f) ? ` · 1 ${esc(f.pieceLabel || "piece")} = ${r0(pieceG(f))} ${unitOf(f.basis)}` : ""}</small></div><div class="kcal">${r0(f.per100.kcal)}<small class="muted">/100</small></div></li>`;
  const draw = () => {
    const q = fold($("#q", body).value.trim());
    let html;
    if (q) {
      const words = q.split(/\s+/);
      const list = allFoods().filter((f) => words.every((w) => fold(f.name + " " + (f.brand || "")).includes(w))).slice(0, 60);
      html = list.length ? list.map(row).join("") : `<li class="empty">Nothing found. Scan it, create it, or use Describe.</li>`;
    } else {
      const seen = new Set(), mine = [];
      for (const h of history()) { const f = findFood(h.last.ref); if (f && !seen.has(f.barcode || f.id)) { seen.add(f.barcode || f.id); mine.push(f); } }
      const favFirst = [...mine.filter((f) => S.favs[f.barcode || f.id]), ...mine.filter((f) => !S.favs[f.barcode || f.id])].slice(0, 15);
      const rest = [...Object.values(S.myfoods), ...Object.values(S.products)].filter((f) => !seen.has(f.barcode || f.id));
      html = (favFirst.length ? `<li class="sec">Recent</li>${favFirst.map(row).join("")}` : "")
        + (rest.length ? `<li class="sec">My foods & scans</li>${rest.map(row).join("")}` : "")
        + `<li class="sec">Basic foods</li>${builtinFoods().map(row).join("")}`;
    }
    $("#results", body).innerHTML = html;
  };
  $("#q", body).oninput = draw;
  $("#results", body).onclick = (e) => { const li = e.target.closest("[data-food]"); if (!li) return; const f = findFood(li.dataset.food); if (f) openPortion(f); };
  $("#newFood", body).onclick = () => openProductForm({ id: "my:" + uid(), basis: "g", per100: {}, source: "manual", name: $("#q", body).value.trim() });
  draw();
}

// ---------- Describe / plate photo with AI ----------
function openDescribe() {
  const body = openSheet(`${head("Describe or snap it")}
    ${S.ai.apiKey ? "" : `<div class="note warn">Needs an API key. <button class="link" data-goto="me">Add one in Me</button></div>`}
    <textarea id="mealTxt" placeholder="3 eggs fried in butter, 2 slices of toast, coffee with milk"></textarea>
    ${mealChips(defaultMeal())}
    <div class="btnrow">
      <button class="primary" id="estBtn" ${S.ai.apiKey ? "" : "disabled"}>Estimate</button>
      <label class="filebtn" style="flex:1${S.ai.apiKey ? "" : ";opacity:.35;pointer-events:none"}">📷 Plate photo<input type="file" accept="image/*" id="plate" hidden></label>
    </div>
    <div id="estOut"></div>`);
  let meal = defaultMeal(), items = [];
  wireMealChips(body, () => meal, (m) => (meal = m));
  const out = $("#estOut", body);
  const run = async (content, label) => {
    out.innerHTML = `<p class="lbl"><span class="spinner"></span><span class="blink">${label}</span></p>`;
    try {
      const r = await askClaude(content, MEAL_SCHEMA);
      items = r.items.map((i) => ({ ...i, on: true }));
      const drawItems = () => {
        const on = items.filter((i) => i.on), t = on.reduce((s, i) => ({ k: s.k + i.kcal, p: s.p + i.protein, c: s.c + i.carbs, f: s.f + i.fat }), { k: 0, p: 0, c: 0, f: 0 });
        out.innerHTML = `<ul class="list">${items.map((i, n) => `<li class="tap" data-i="${n}"><div class="name">${i.on ? '<span class="amber">■</span>' : '<span class="muted">□</span>'} ${esc(i.name)}<small>${r0(i.grams)} g · P${r0(i.protein)} C${r0(i.carbs)} F${r0(i.fat)}</small></div><div class="kcal">${r0(i.kcal)}</div></li>`).join("")}</ul>
          ${r.note ? `<div class="note">${esc(r.note)}</div>` : ""}
          <div class="preview"><div><b>${r0(t.k)}</b><span>kcal</span></div><div><b>${r0(t.p)}</b><span>protein</span></div><div><b>${r0(t.c)}</b><span>carbs</span></div><div><b>${r0(t.f)}</b><span>fat</span></div></div>
          <button class="primary wide" id="addAll" ${on.length ? "" : "disabled"}>Add ${on.length} item${on.length === 1 ? "" : "s"}</button>`;
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
  $("#estBtn", body).onclick = () => { const txt = $("#mealTxt", body).value.trim(); if (!txt) return toast("Type what you ate first"); run([{ type: "text", text: MEAL_PROMPT(txt) }], "Estimating"); };
  $("#plate", body).onchange = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    const img = await fileToImageBlock(file);
    run([img, { type: "text", text: PLATE_PROMPT($("#mealTxt", body).value.trim()) }], "Looking at your plate");
    e.target.value = "";
  };
}

// ---------- Quick add ----------
function openQuick() {
  const body = openSheet(`${head("Quick add")}
    <form id="qf" class="form">
      <label>What <input name="name" placeholder="Coffee with milk"></label>
      <div class="grid4">
        <label>kcal <input name="kcal" inputmode="decimal" required></label>
        <label>Prot <input name="p" inputmode="decimal"></label>
        <label>Carb <input name="c" inputmode="decimal"></label>
        <label>Fat <input name="f" inputmode="decimal"></label>
      </div>
      ${mealChips(defaultMeal())}
      <button class="primary wide" type="submit">Add</button>
    </form>`);
  let meal = defaultMeal();
  wireMealChips(body, () => meal, (m) => (meal = m));
  const form = $("#qf", body);
  form.onsubmit = guard(form.querySelector("[type=submit]"), async (e) => {
    e.preventDefault(); const f = form.elements, kcal = num(f.kcal.value); if (kcal === null) return toast("Enter the kcal");
    closeSheet();
    await addEntries([{ name: f.name.value.trim() || "Quick add", grams: 0, amountText: "quick add", kcal, p: num(f.p.value) || 0, c: num(f.c.value) || 0, f: num(f.f.value) || 0, meal }]);
  });
}

// ---------- Entry: edit amount, move, favourite, delete ----------
function openEntry(id) {
  const day = S.log[curDay] || [], e = day.find((x) => x.id === id); if (!e) return;
  const key = entryKey(e), food = findFood(e.ref);
  // How the amount can be edited: pieces/servings (qty × unitG), grams, or straight kcal for quick adds
  const mode = e.unitG && e.unit && e.unit !== "g" ? "qty" : e.grams > 0 ? "grams" : "kcal";
  const start = mode === "qty" ? e.qty : mode === "grams" ? r0(e.grams) : r0(e.kcal);
  const U = unitOf(e.basis);
  let meal = e.meal;
  const body = openSheet(`${head(e.name)}
    <div class="stepper"><button type="button" data-step="-1">−</button><input id="amt" type="text" inputmode="decimal" value="${start}"><button type="button" data-step="1">+</button></div>
    <div class="unitlbl">${mode === "qty" ? esc(plural(e.unitLabel || "piece", 2)) : mode === "grams" ? U : "kcal"}${e.ai ? " · AI estimate" : ""}</div>
    <div class="preview" id="pv"></div>
    ${mealChips(meal)}
    <button class="primary wide" id="saveE">Save</button>
    <div class="btnrow">
      <button id="again">＋ Again</button>
      <button id="favE">${S.favs[key] ? "★" : "☆"} Fav</button>
      ${food ? `<button id="openFood">Food</button>` : ""}
      <button class="danger" id="del">Delete</button>
    </div>`);
  const amt = $("#amt", body);
  const factor = () => { const v = num(amt.value) || 0; return start ? v / start : 0; };
  const scaled = () => { const k = factor(); return { kcal: e.kcal * k, p: e.p * k, c: e.c * k, f: e.f * k }; };
  const draw = () => { const s = scaled(); $("#pv", body).innerHTML = `<div><b>${r0(s.kcal)}</b><span>kcal</span></div><div><b>${r1(s.p)}</b><span>protein</span></div><div><b>${r1(s.c)}</b><span>carbs</span></div><div><b>${r1(s.f)}</b><span>fat</span></div>`; };
  body.onclick = (ev) => { const s = ev.target.closest("[data-step]"); if (s) { amt.value = r1(Math.max(0, (num(amt.value) || 0) + s.dataset.step * (mode === "qty" ? (e.unit === "piece" ? 1 : 0.5) : mode === "grams" ? 10 : 25))); draw(); } };
  amt.oninput = draw; selectOnFocus(amt);
  wireMealChips(body, () => meal, (m) => (meal = m));
  const saveBtn = $("#saveE", body);
  saveBtn.onclick = guard(saveBtn, async () => {
    const k = factor(); if (k <= 0) return toast("Enter an amount (or Delete)");
    Object.assign(e, scaled(), { meal, grams: e.grams * k });
    if (mode === "qty") { e.qty = num(amt.value); e.amountText = `${e.qty} ${plural(e.unitLabel || "piece", e.qty)} · ${r0(e.grams)} ${U}`; }
    else if (mode === "grams") e.amountText = `${r0(e.grams)} ${U}${e.ai ? " · AI" : ""}`;
    await save("log"); closeSheet(); renderToday(); toast("Updated");
  });
  $("#del", body).onclick = () => { closeSheet(); deleteEntry(id); };
  const ag = $("#again", body);
  ag.onclick = guard(ag, async () => { closeSheet(); await addEntries([cleanEntry(e)], "Added again"); });
  $("#favE", body).onclick = async (ev) => { if (S.favs[key]) delete S.favs[key]; else S.favs[key] = true; await save("favs"); ev.currentTarget.textContent = (S.favs[key] ? "★" : "☆") + " Fav"; renderToday(); };
  const of = $("#openFood", body); if (of) of.onclick = () => openPortion(food, { meal });
  draw();
}

// ---------- Saved meal sheet ----------
function openSavedMeal(m) {
  let meal = defaultMeal();
  const tot = m.items.reduce((s, e) => ({ k: s.k + e.kcal, p: s.p + e.p, c: s.c + e.c, f: s.f + e.f }), { k: 0, p: 0, c: 0, f: 0 });
  const body = openSheet(`${head("▣ " + m.name)}
    <ul class="list">${m.items.map((e) => `<li><div class="name">${esc(e.name)}<small>${esc(e.amountText || "")}</small></div><div class="kcal">${r0(e.kcal)}</div></li>`).join("")}</ul>
    <div class="preview"><div><b>${r0(tot.k)}</b><span>kcal</span></div><div><b>${r0(tot.p)}</b><span>protein</span></div><div><b>${r0(tot.c)}</b><span>carbs</span></div><div><b>${r0(tot.f)}</b><span>fat</span></div></div>
    ${mealChips(meal)}
    <button class="primary wide" id="addM">Add all to ${dayLabel()}</button>
    <div class="btnrow"><button id="renM">Rename</button><button class="danger" id="delM">Delete meal</button></div>`);
  wireMealChips(body, () => meal, (x) => (meal = x));
  const b = $("#addM", body);
  b.onclick = guard(b, async () => { closeSheet(); await addEntries(m.items.map((e) => ({ ...e, meal })), `Added ${m.name}`); });
  $("#renM", body).onclick = async () => { const n = prompt("Name", m.name); if (!n) return; m.name = n.trim(); await save("meals"); openSavedMeal(m); renderQuick(); };
  $("#delM", body).onclick = async () => {
    const gone = S.meals[m.id]; delete S.meals[m.id]; await save("meals"); closeSheet(); renderQuick();
    toast(`Deleted ${m.name}`, { action: "Undo", onAction: async () => { S.meals[gone.id] = gone; await save("meals"); renderQuick(); } });
  };
}

// ---------- wiring ----------
function goTab(name) {
  $$(".tabbar button").forEach((x) => x.classList.toggle("active", x.dataset.tab === name));
  $$(".tab").forEach((t) => t.classList.toggle("active", t.id === "tab-" + name));
  closeSheet(); renderAll(); window.scrollTo(0, 0);
}
function wire() {
  $$(".tabbar button").forEach((b) => (b.onclick = () => goTab(b.dataset.tab)));
  document.addEventListener("click", (e) => { const g = e.target.closest("[data-goto]"); if (g) goTab(g.dataset.goto); });
  $("#dayPrev").onclick = () => { curDay = addDays(curDay, -1); renderToday(); };
  $("#dayNext").onclick = () => { if (curDay < dkey()) { curDay = addDays(curDay, 1); renderToday(); } };
  $("#dayTitle").onclick = () => { if (curDay !== dkey()) { curDay = dkey(); renderToday(); } };
  $("#weekStrip").onclick = (e) => { const b = e.target.closest("[data-day]"); if (b) { curDay = b.dataset.day; renderToday(); } };
  $("#weekCard").onclick = (e) => { const b = e.target.closest("[data-day]"); if (b) { curDay = b.dataset.day; goTab("today"); } };
  $(".addrow").onclick = (e) => { const a = e.target.closest("[data-act]")?.dataset.act; ({ scan: openScanner, search: openSearch, describe: openDescribe, quick: openQuick })[a]?.(); };
  $("#quickStrip").onclick = async (e) => {
    const qm = e.target.closest("[data-qm]"); if (qm) return openSavedMeal(S.meals[qm.dataset.qm]);
    const q = e.target.closest("[data-q]"); if (!q || q.disabled) return;
    const h = history().find((x) => x.key === q.dataset.q); if (!h) return;
    q.disabled = true;
    await addEntries([{ ...cleanEntry(h.last), meal: curDay === dkey() ? defaultMeal() : h.last.meal }], `Added ${h.last.name} · ${r0(h.last.kcal)} kcal`);
  };
  $("#meals").onclick = async (e) => {
    const li = e.target.closest("[data-entry]"); if (li) return openEntry(li.dataset.entry);
    if (e.target.closest("#copyDay")) { const prev = S.log[addDays(curDay, -1)] || []; return addEntries(prev.map(cleanEntry), `Copied ${prev.length} items`); }
    const cm = e.target.closest("[data-copymeal]");
    if (cm) { const prev = (S.log[addDays(curDay, -1)] || []).filter((x) => x.meal === cm.dataset.copymeal); return addEntries(prev.map(cleanEntry)); }
    const sm = e.target.closest("[data-savemeal]");
    if (sm) {
      const es = (S.log[curDay] || []).filter((x) => x.meal === sm.dataset.savemeal);
      const name = prompt("Name this meal", `My ${MEAL_NAME[sm.dataset.savemeal].toLowerCase()}`); if (!name) return;
      const id = uid(); S.meals[id] = { id, name: name.trim(), items: es.map(cleanEntry) }; await save("meals"); renderQuick(); toast(`Saved ▣ ${name.trim()}`);
    }
  };
  $("#waterCard").onclick = async (e) => {
    const b = e.target.closest("[data-water]"); if (!b) return;
    S.water[curDay] = Math.max(0, (S.water[curDay] || 0) + Number(b.dataset.water)); await save("water"); renderWater();
  };

  const wIn = $("#wInput"); selectOnFocus(wIn);
  const wSave = $("#wSave");
  wSave.onclick = guard(wSave, async () => {
    const kg = num(wIn.value), date = $("#wDate").value || dkey();
    if (!kg || kg < 30 || kg > 300) return toast("Enter your weight in kg");
    if (date > dkey()) return toast("That date is in the future");
    const old = S.weights.find((w) => w.date === date);
    S.weights = S.weights.filter((w) => w.date !== date); S.weights.push({ date, kg: r1(kg) });
    await save("weights"); wIn.value = ""; wIn.blur(); renderAll();
    toast(old ? `Updated ${shortDate(date)}: ${r1(kg)} kg` : `Saved ${r1(kg)} kg`);
  });
  wIn.onkeydown = (e) => { if (e.key === "Enter") wSave.click(); };
  $("#wList").onclick = async (e) => {
    const b = e.target.closest("[data-delw]"); if (!b) return;
    const gone = S.weights.find((w) => w.date === b.dataset.delw);
    S.weights = S.weights.filter((w) => w.date !== b.dataset.delw); await save("weights"); renderAll();
    toast(`Deleted ${gone.kg} kg`, { action: "Undo", onAction: async () => { S.weights.push(gone); await save("weights"); renderAll(); } });
  };
  $("#adaptCard").onclick = async (e) => {
    if (e.target.id === "useAdaptive") { S.profile.tdeeOverride = adaptiveEstimate().est; await save("profile"); renderAll(); toast("Target updated from your real data"); }
    if (e.target.id === "clearAdaptive") { delete S.profile.tdeeOverride; await save("profile"); renderAll(); }
  };

  $("#profileForm").onsubmit = async (e) => {
    e.preventDefault(); const f = e.target.elements;
    Object.assign(S.profile, { sex: f.sex.value, birthYear: num(f.birthYear.value), height: num(f.height.value), activity: f.activity.value, goal: f.goal.value,
      kcalOverride: num(f.kcalOverride.value), goalKg: num(f.goalKg.value), waterGoal: num(f.waterGoal.value) });
    await save("profile"); renderAll(); toast(latestWeight() ? "Saved" : "Saved – now add a weigh-in in Progress");
  };
  $("#aiForm").onsubmit = async (e) => {
    e.preventDefault(); const f = e.target.elements;
    S.ai.apiKey = f.apiKey.value.trim(); S.ai.model = f.model.value; await save("ai"); toast("AI settings saved");
  };
  $("#aiTest").onclick = async () => {
    const f = $("#aiForm").elements; S.ai.apiKey = f.apiKey.value.trim(); S.ai.model = f.model.value; await save("ai");
    toast("Testing…", { ms: 15000 });
    try { const r = await askClaude([{ type: "text", text: "Reply with ok=true." }], { type: "object", additionalProperties: false, required: ["ok"], properties: { ok: { type: "boolean" } } }); toast(r.ok ? "Key works ✓" : "Unexpected answer"); }
    catch (err) { toast(err.message, { ms: 5000 }); }
  };
  $("#exportBtn").onclick = async () => {
    const data = { app: "fuel", version: 2, exported: new Date().toISOString(), ...Object.fromEntries(KEYS.filter((k) => k !== "ai").map((k) => [k, S[k]])) };
    const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
    const file = new File([blob], `fuel-backup-${dkey()}.json`, { type: "application/json" });
    if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: "Fuel backup" }); return; } catch (err) { if (err.name === "AbortError") return; } }
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = file.name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };
  $("#importFile").onchange = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    try {
      const d = JSON.parse(await file.text()); if (d.app !== "fuel") throw new Error("Not a Fuel backup");
      if (!confirm("Replace all data on this phone with this backup?")) return;
      for (const k of KEYS) if (k !== "ai" && d[k] !== undefined) S[k] = d[k];
      await save(...KEYS.filter((k) => k !== "ai")); renderAll(); toast("Backup restored");
    } catch (err) { toast("Import failed: " + err.message); }
    e.target.value = "";
  };

  // App reopened on a new day: jump to the new today
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    const now = dkey(); if (now === lastToday) return;
    if (curDay === lastToday) curDay = now;
    if ($("#wDate").value === lastToday) $("#wDate").value = now;
    lastToday = now; renderAll();
  });
}

(async function init() {
  try { await DB.open(); await loadAll(); } catch (e) { toast("Storage error: " + e.message, { ms: 6000 }); }
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
  wire(); renderAll();
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
})();
