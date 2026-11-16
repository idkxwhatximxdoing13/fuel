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
function toast(msg, ms = 2600) { const t = $("#toast"); t.textContent = msg; t.classList.remove("hidden"); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.add("hidden"), ms); }

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
const KEYS = ["profile", "weights", "log", "products", "myfoods", "ai"];
const S = { profile: {}, weights: [], log: {}, products: {}, myfoods: {}, ai: { model: "claude-opus-5-5" } };
async function loadAll() { for (const k of KEYS) { const v = await DB.get(k); if (v !== undefined) S[k] = v; } }
function save(...keys) { return Promise.all(keys.map((k) => DB.set(k, S[k]))).catch((e) => toast("Save failed: " + e.message)); }

// ---------- nutrition maths ----------
const GOALS = { lose: "Lose fat", recomp: "Recomp", gain: "Build muscle" };
function latestWeight() { const w = [...S.weights].sort((a, b) => a.date.localeCompare(b.date)); return w.length ? w[w.length - 1].kg : null; }
function trendWeight() {
  // average of weigh-ins in the last 7 days before the latest one (smooths water swings)
  const w = [...S.weights].sort((a, b) => a.date.localeCompare(b.date));
  if (!w.length) return null;
  const last = w[w.length - 1].date;
  const recent = w.filter((x) => daysBetween(x.date, last) <= 7);
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
  let kcal = p.kcalOverride || Math.round((tdee * factor) / 10) * 10;
  // protein 1.8 g/kg; if overweight use the weight at BMI 25 instead (fat mass doesn't need protein)
  const refKg = Math.min(kg, 25 * Math.pow(h / 100, 2));
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
// Real-world burn from logged food vs weight change (needs ≥14 days span, ≥10 logged days)
function adaptiveEstimate() {
  const today = dkey(), from = addDays(today, -35);
  const w = S.weights.filter((x) => x.date >= from).sort((a, b) => a.date.localeCompare(b.date));
  if (w.length < 2 || daysBetween(w[0].date, w[w.length - 1].date) < 14) return { ok: false, why: "Needs at least 2 weigh-ins about 2+ weeks apart (within the last 5 weeks)." };
  const x0 = parseDkey(w[0].date);
  const xs = w.map((p) => (parseDkey(p.date) - x0) / 86400000), ys = w.map((p) => p.kg);
  const mx = xs.reduce((a, b) => a + b) / xs.length, my = ys.reduce((a, b) => a + b) / ys.length;
  let num_ = 0, den = 0; xs.forEach((x, i) => { num_ += (x - mx) * (ys[i] - my); den += (x - mx) ** 2; });
  const slope = num_ / den; // kg per day
  const days = []; for (let k = w[0].date; k <= w[w.length - 1].date; k = addDays(k, 1)) { const t = dayTotals(k); if (t.kcal > 300) days.push(t.kcal); }
  if (days.length < 10) return { ok: false, why: `Needs at least 10 fully logged days in that period (have ${days.length}).` };
  const avgIn = days.reduce((a, b) => a + b) / days.length;
  const est = avgIn - slope * 7700;
  return { ok: true, est: r0(est), avgIn: r0(avgIn), perWeek: r1(slope * 7), loggedDays: days.length };
}

// ---------- foods / products ----------
// product shape: {id, name, brand, barcode, basis:'g'|'ml', per100:{kcal,p,c,f}, packG, servingG, pieceG, piecesPerPack, pieceLabel, source}
function pieceG(prod) { if (prod.pieceG) return prod.pieceG; if (prod.packG && prod.piecesPerPack) return prod.packG / prod.piecesPerPack; return null; }
function builtinFoods() { return (window.BUILTIN_FOODS || []).map((f) => ({ id: "usda:" + f.fdc, name: f.name, basis: "g", per100: f.per100, pieceG: f.unit?.g || null, pieceLabel: f.unit?.label || null, source: "usda" })); }
function allFoods() { return [...Object.values(S.myfoods), ...Object.values(S.products), ...builtinFoods()]; }
function findFood(id) { if (S.myfoods[id]) return S.myfoods[id]; for (const p of Object.values(S.products)) if (p.id === id) return p; return builtinFoods().find((f) => f.id === id) || null; }
function saveProduct(prod) {
  if (prod.barcode) { S.products[prod.barcode] = prod; return save("products"); }
  S.myfoods[prod.id] = prod; return save("myfoods");
}

async function lookupOFF(code) {
  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=product_name,product_name_ro,product_name_en,brands,quantity,product_quantity,product_quantity_unit,serving_size,serving_quantity,nutriments`;
  const r = await fetch(url);
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
const MEAL_PROMPT = (txt) => `Estimate the nutrition of this meal someone ate. Split it into separate ingredients/items. For each item give the eaten amount in grams and total kcal, protein, carbs, fat (grams) FOR THAT AMOUNT. Count cooking fat (oil, butter) as its own item when it's mentioned or clearly implied (e.g. "fried"). Use typical European portion sizes when no amount is given, and say what you assumed in note (one short sentence, English). Meal: """${txt}"""`;

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

// ---------- rendering: Today ----------
let curDay = dkey();
const MEALS = [["breakfast", "Breakfast"], ["lunch", "Lunch"], ["dinner", "Dinner"], ["snacks", "Snacks"]];
function defaultMeal() { const h = new Date().getHours(); return h < 11 ? "breakfast" : h < 16 ? "lunch" : h < 21 ? "dinner" : "snacks"; }
function setBar(el, val, max) { const pct = max ? Math.min(100, (val / max) * 100) : 0; el.style.width = pct + "%"; el.classList.toggle("over", max && val > max * 1.03); }

function renderToday() {
  const today = dkey();
  $("#dayTitle").textContent = curDay === today ? "Today" : curDay === addDays(today, -1) ? "Yesterday" : parseDkey(curDay).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  $("#dayNext").disabled = curDay >= today;
  const T = targets(), t = dayTotals(curDay);
  $("#setupHint").classList.toggle("hidden", !!T);
  if (T) {
    const left = T.kcal - t.kcal;
    $("#kcalLeft").textContent = r0(Math.abs(left));
    $("#kcalLeftLabel").textContent = left >= 0 ? "kcal left" : "kcal over";
    $("#kcalEaten").textContent = `${r0(t.kcal)} eaten / ${T.kcal} target`;
  } else { $("#kcalLeft").textContent = r0(t.kcal); $("#kcalLeftLabel").textContent = "kcal eaten"; $("#kcalEaten").textContent = ""; }
  setBar($("#kcalBar"), t.kcal, T?.kcal);
  $("#mP").textContent = `${r0(t.p)}${T ? " / " + T.prot : ""} g`; setBar($("#bP"), t.p, T?.prot);
  $("#mC").textContent = `${r0(t.c)}${T ? " / " + T.carbs : ""} g`; setBar($("#bC"), t.c, T?.carbs);
  $("#mF").textContent = `${r0(t.f)}${T ? " / " + T.fat : ""} g`; setBar($("#bF"), t.f, T?.fat);
  const entries = S.log[curDay] || [];
  $("#meals").innerHTML = MEALS.map(([k, label]) => {
    const es = entries.filter((e) => e.meal === k);
    const sum = es.reduce((s, e) => s + e.kcal, 0);
    return `<div class="card meal"><h3><span>${label}</span><span class="muted small">${r0(sum)} kcal</span></h3>
      ${es.length ? `<ul class="list">${es.map((e) => `<li class="tap" data-entry="${e.id}"><div class="name">${esc(e.name)}<small>${esc(e.amountText || r0(e.grams) + " g")} · P ${r0(e.p)} · C ${r0(e.c)} · F ${r0(e.f)}</small></div><div class="kcal">${r0(e.kcal)}</div></li>`).join("")}</ul>` : `<div class="empty">Nothing yet</div>`}
    </div>`;
  }).join("");
}

// ---------- rendering: Weight ----------
function renderWeight() {
  if (!$("#wDate").value) $("#wDate").value = dkey();
  const w = [...S.weights].sort((a, b) => b.date.localeCompare(a.date));
  $("#wList").innerHTML = w.length ? w.map((x) => `<li><div class="name">${parseDkey(x.date).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</div><div class="kcal">${x.kg} kg</div><button class="danger" data-delw="${x.date}">✕</button></li>`).join("") : `<li class="empty">No weigh-ins yet</li>`;
  // chart
  const pts = [...w].reverse();
  if (pts.length >= 2) {
    const W = 520, H = 180, pad = 40;
    const t0 = parseDkey(pts[0].date), t1 = parseDkey(pts[pts.length - 1].date);
    const span = Math.max(1, (t1 - t0) / 86400000);
    const ys = pts.map((p) => p.kg), lo = Math.min(...ys) - 0.5, hi = Math.max(...ys) + 0.5;
    const X = (d) => pad + ((parseDkey(d) - t0) / 86400000 / span) * (W - pad * 2);
    const Y = (kg) => H - pad - ((kg - lo) / (hi - lo)) * (H - pad * 2);
    const line = pts.map((p, i) => `${i ? "L" : "M"}${X(p.date).toFixed(1)},${Y(p.kg).toFixed(1)}`).join(" ");
    $("#wChart").innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Weight chart">
      <text x="2" y="${Y(hi - 0.5) + 4}">${r1(hi - 0.5)}</text><text x="2" y="${Y(lo + 0.5) + 4}">${r1(lo + 0.5)}</text>
      <path d="${line}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round"/>
      ${pts.map((p) => `<circle cx="${X(p.date)}" cy="${Y(p.kg)}" r="3.5" fill="var(--accent)"/>`).join("")}
      <text x="${pad}" y="${H - 6}">${t0.toLocaleDateString(undefined, { day: "numeric", month: "short" })}</text>
      <text x="${W - pad}" y="${H - 6}" text-anchor="end">${t1.toLocaleDateString(undefined, { day: "numeric", month: "short" })}</text></svg>`;
    const first = pts[0], last = pts[pts.length - 1];
    const ch = last.kg - first.kg, weeks = span / 7;
    $("#wStats").innerHTML = `Change: <b>${ch > 0 ? "+" : ""}${r1(ch)} kg</b> over ${r0(span)} days${weeks >= 1 ? ` (≈ ${ch > 0 ? "+" : ""}${r1(ch / weeks)} kg/week)` : ""}`;
  } else { $("#wChart").innerHTML = `<p class="muted small">The chart appears after 2 weigh-ins.</p>`; $("#wStats").innerHTML = ""; }
  // adaptive
  const T = targets(), A = adaptiveEstimate();
  let html = `<h3>Is the target right?</h3>`;
  if (!A.ok) html += `<p class="muted small">After a few weeks of logging food and weighing in, the app compares what you ate with how your weight moved and works out your real daily burn. ${esc(A.why)}</p>`;
  else {
    html += `<p class="small">Last ~${A.loggedDays} logged days: you ate about <b>${A.avgIn} kcal/day</b> and your weight moved <b>${A.perWeek > 0 ? "+" : ""}${A.perWeek} kg/week</b>.<br>That means your real daily burn is about <b>${A.est} kcal</b>${T ? ` (the formula guessed ${T.formulaTdee})` : ""}.</p>`;
    if (T) html += `<button class="primary" id="useAdaptive">Use ${A.est} as my burn</button> `;
    if (S.profile.tdeeOverride) html += `<button id="clearAdaptive">Back to formula</button>`;
  }
  $("#adaptCard").innerHTML = html;
}

// ---------- rendering: Me ----------
function renderMe() {
  const f = $("#profileForm"), p = S.profile;
  for (const k of ["sex", "birthYear", "height", "activity", "goal", "kcalOverride"]) if (p[k] !== undefined && p[k] !== null) f.elements[k].value = p[k];
  const a = $("#aiForm"); a.elements.apiKey.value = S.ai.apiKey || ""; a.elements.model.value = S.ai.model || "claude-opus-5-5";
  const T = targets();
  $("#targetsCard").innerHTML = T ? `<h3>Your daily targets</h3>
    <div class="preview"><div><b>${T.kcal}</b><span>kcal</span></div><div><b>${T.prot}</b><span>protein g</span></div><div><b>${T.carbs}</b><span>carbs g</span></div><div><b>${T.fat}</b><span>fat g</span></div></div>
    <p class="small">Goal: <b>${GOALS[T.goal]}</b>${T.auto ? ` <span class="muted">(suggested: your BMI is ${T.bmi}; ${T.suggested === "lose" ? "25+ → lose fat first" : T.suggested === "gain" ? "under 20 → build muscle" : "20–25 → recomp"})</span>` : ""}</p>
    <p class="muted small">How it's worked out: weight ${r1(T.kg)} kg (7-day average), age ${T.age}. Resting burn (Mifflin-St Jeor) ${T.bmr} kcal × activity = ${T.formulaTdee} kcal/day${S.profile.tdeeOverride ? `, but you chose the measured burn of ${S.profile.tdeeOverride}` : ""}. Lose fat = 20% below that, recomp = 10% below, build muscle = 10% above. Protein 1.8 g per kg${T.kg > 25 * (S.profile.height / 100) ** 2 ? " of your weight at BMI 25" : ""}, fat 25% of calories, carbs the rest. Not medical advice.</p>`
    : `<h3>Your daily targets</h3><p class="muted small">Fill in the profile and add your weight (Weight tab) to see them.</p>`;
  if (navigator.storage?.persisted) navigator.storage.persisted().then((p) => { $("#storageInfo").textContent = p ? "Storage is protected from automatic clean-up." : "Tip: add this app to your Home Screen so iOS keeps its data."; });
}

function renderAll() { renderToday(); renderWeight(); renderMe(); }

// ---------- sheet helpers ----------
const sheet = $("#sheet");
let sheetCleanup = null;
function openSheet(html, onClose) {
  if (sheetCleanup) { try { sheetCleanup(); } catch {} }
  sheetCleanup = onClose || null;
  $("#sheetBody").innerHTML = html;
  if (!sheet.open) sheet.showModal();
  return $("#sheetBody");
}
function closeSheet() { if (sheetCleanup) { try { sheetCleanup(); } catch {} sheetCleanup = null; } if (sheet.open) sheet.close(); }
sheet.addEventListener("click", (e) => { if (e.target === sheet) closeSheet(); });
sheet.addEventListener("cancel", (e) => { e.preventDefault(); closeSheet(); });
const head = (title) => `<div class="sheethead"><h2>${esc(title)}</h2><button class="icon" data-close aria-label="Close">×</button></div>`;
$("#sheetBody").addEventListener("click", (e) => { if (e.target.closest("[data-close]")) closeSheet(); });

// ---------- Scan ----------
async function openScanner() {
  let controls = null, done = false;
  const body = openSheet(`${head("Scan barcode")}
    <div class="video-wrap"><video id="scanVideo" playsinline muted autoplay></video><div class="aim"></div></div>
    <p class="muted small" id="scanMsg">Point the camera at the barcode.</p>
    <div class="row">
      <label class="filebtn">📷 Photo of barcode<input type="file" accept="image/*" capture="environment" id="bcPhoto" hidden></label>
    </div>
    <div class="row" style="margin-top:8px"><input id="bcManual" inputmode="numeric" placeholder="or type the barcode number"><button id="bcGo">Go</button></div>`,
    () => { try { controls?.stop(); } catch {} });
  const hints = new Map();
  const F = Vendor.BarcodeFormat;
  hints.set(Vendor.DecodeHintType.POSSIBLE_FORMATS, [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E]);
  const reader = new Vendor.BrowserMultiFormatReader(hints);
  const got = (code) => { if (done) return; done = true; try { controls?.stop(); } catch {} if (navigator.vibrate) navigator.vibrate(60); handleBarcode(code); };
  $("#bcGo", body).onclick = () => { const v = $("#bcManual", body).value.replace(/\D/g, ""); if (v.length >= 6) got(v); else toast("That doesn't look like a barcode"); };
  $("#bcPhoto", body).onchange = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    $("#scanMsg", body).textContent = "Reading photo…";
    const url = URL.createObjectURL(file);
    try { const res = await reader.decodeFromImageUrl(url); got(res.getText()); }
    catch { $("#scanMsg", body).textContent = "Couldn't find a barcode in that photo. Try closer and sharper, or type the number."; }
    finally { URL.revokeObjectURL(url); }
  };
  try {
    controls = await reader.decodeFromConstraints({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } } }, $("#scanVideo", body), (res) => { if (res) got(res.getText()); });
  } catch (err) {
    $("#scanMsg", body).textContent = "Camera not available here (" + (err.name || err.message) + "). Use a photo or type the number.";
  }
}

async function handleBarcode(code) {
  if (S.products[code] && complete(S.products[code])) return openPortion(S.products[code]);
  openSheet(`${head("Looking up…")}<p><span class="spinner"></span>Barcode ${esc(code)}</p>`);
  let prod = null;
  try { prod = await lookupOFF(code); } catch (e) { toast(e.message); }
  if (prod && complete(prod)) { await saveProduct(prod); return openPortion(prod, { fresh: true }); }
  openProductForm(prod || { id: "bc:" + code, barcode: code, basis: "g", per100: {} }, { reason: prod ? "Found the product, but its nutrition info is incomplete." : "This barcode isn't in the food database yet." });
}

// ---------- Product form (new / edit / AI label) ----------
function openProductForm(prod, opts = {}) {
  const p = prod.per100 || {};
  const v = (x) => (x === null || x === undefined ? "" : x);
  const body = openSheet(`${head(prod.barcode ? "Product " + prod.barcode : "My food")}
    ${opts.reason ? `<div class="note">${esc(opts.reason)} ${S.ai.apiKey ? "Take a photo of the nutrition table and the AI fills it in, or type it." : "Type the values from the label (add an API key in Me to read photos automatically)."}</div>` : ""}
    ${S.ai.apiKey ? `<label class="filebtn" style="width:100%;margin-bottom:10px">📷 Read label with AI (nutrition table, + front for pack size)<input type="file" accept="image/*" multiple id="labelPhotos" hidden></label>
    <p class="muted small" id="aiMsg"></p>` : ""}
    <form id="prodForm" class="form">
      <label>Name <input name="name" value="${esc(v(prod.name))}" required></label>
      <label>Brand <input name="brand" value="${esc(v(prod.brand))}"></label>
      <label>Values are per 100 <select name="basis"><option value="g">g</option><option value="ml">ml</option></select></label>
      <div class="grid4">
        <label>kcal <input name="kcal" inputmode="decimal" value="${v(p.kcal)}" required></label>
        <label>Protein <input name="p" inputmode="decimal" value="${v(p.p)}" required></label>
        <label>Carbs <input name="c" inputmode="decimal" value="${v(p.c)}" required></label>
        <label>Fat <input name="f" inputmode="decimal" value="${v(p.f)}" required></label>
      </div>
      <div class="grid2">
        <label>Whole pack (g/ml) <input name="packG" inputmode="decimal" value="${v(prod.packG)}"></label>
        <label>Pieces in pack <input name="piecesPerPack" inputmode="decimal" value="${v(prod.piecesPerPack)}" placeholder="e.g. 8"></label>
        <label>One piece (g) – if no pack info <input name="pieceG" inputmode="decimal" value="${v(prod.pieceG)}"></label>
        <label>Piece is called <input name="pieceLabel" value="${esc(v(prod.pieceLabel))}" placeholder="tortilla, slice…"></label>
        <label>Serving (g/ml) <input name="servingG" inputmode="decimal" value="${v(prod.servingG)}"></label>
      </div>
      <button class="primary" type="submit">Save & continue</button>
      ${S.products[prod.barcode] || S.myfoods[prod.id] ? `<button type="button" class="danger" id="delProd">Delete</button>` : ""}
    </form>`);
  const form = $("#prodForm", body);
  form.elements.basis.value = prod.basis || "g";
  const photos = $("#labelPhotos", body);
  if (photos) photos.onchange = async (e) => {
    const files = [...e.target.files].slice(0, 3); if (!files.length) return;
    const msg = $("#aiMsg", body); msg.innerHTML = `<span class="spinner"></span>Reading label…`;
    try {
      const imgs = await Promise.all(files.map(fileToImageBlock));
      const r = await askClaude([...imgs, { type: "text", text: LABEL_PROMPT }], LABEL_SCHEMA);
      const set = (k, val) => { if (val !== null && val !== undefined && val !== "") form.elements[k].value = val; };
      set("name", r.name); set("brand", r.brand); form.elements.basis.value = r.basis || "g";
      set("kcal", r.kcal_100 !== null ? r1(r.kcal_100) : null); set("p", r.protein_100); set("c", r.carbs_100); set("f", r.fat_100);
      set("packG", r.pack_g); set("piecesPerPack", r.pieces_per_pack); set("pieceLabel", r.piece_name); set("servingG", r.serving_g);
      const missing = ["kcal", "p", "c", "f"].filter((k) => !form.elements[k].value);
      msg.textContent = (missing.length ? "Couldn't read: " + missing.join(", ") + ". " : "Done – check the numbers against the label, then save. ") + (r.notes || "");
    } catch (err) { msg.textContent = err.message; }
    e.target.value = "";
  };
  form.onsubmit = async (e) => {
    e.preventDefault();
    const g = (k) => num(form.elements[k].value);
    const per100 = { kcal: g("kcal"), p: g("p"), c: g("c"), f: g("f") };
    if (Object.values(per100).some((x) => x === null)) return toast("Fill in kcal, protein, carbs and fat");
    const out = { ...prod, id: prod.id || "my:" + uid(), name: form.elements.name.value.trim(), brand: form.elements.brand.value.trim(), basis: form.elements.basis.value,
      per100, packG: g("packG"), piecesPerPack: g("piecesPerPack"), pieceG: g("pieceG"), pieceLabel: form.elements.pieceLabel.value.trim() || null, servingG: g("servingG"),
      source: prod.source === "openfoodfacts" ? "openfoodfacts+edited" : prod.source || "manual" };
    await saveProduct(out);
    toast(out.barcode ? "Saved – next scan will know it" : "Saved to your foods");
    if (opts.afterSave) opts.afterSave(out); else openPortion(out);
  };
  const del = $("#delProd", body);
  if (del) del.onclick = async () => {
    if (!confirm("Delete this product? Logged entries stay.")) return;
    if (prod.barcode) { delete S.products[prod.barcode]; await save("products"); } else { delete S.myfoods[prod.id]; await save("myfoods"); }
    closeSheet(); toast("Deleted");
  };
}

// ---------- Portion (how much did you eat) ----------
function openPortion(prod, opts = {}) {
  const pg = pieceG(prod);
  const units = [["g", prod.basis === "ml" ? "ml" : "grams", 1]];
  if (pg) units.push(["piece", prod.pieceLabel || "piece", pg]);
  if (prod.servingG) units.push(["serving", "serving", prod.servingG]);
  if (prod.packG) units.push(["pack", "whole pack", prod.packG]);
  let unit = pg ? "piece" : "g", amount = pg ? 1 : 100, meal = opts.meal || defaultMeal();
  const body = openSheet(`${head(prod.name)}
    <div class="muted small">${esc(prod.brand || "")}${prod.brand ? " · " : ""}per 100 ${prod.basis === "ml" ? "ml" : "g"}: ${r0(prod.per100.kcal)} kcal · P ${r1(prod.per100.p)} · C ${r1(prod.per100.c)} · F ${r1(prod.per100.f)}${prod.source === "usda" ? " · USDA" : ""}</div>
    ${opts.fresh ? `<div class="note">Found in Open Food Facts and saved. If the numbers look off, tap “Edit product”.</div>` : ""}
    <div class="chips" id="unitChips"></div>
    ${prod.packG && !pg ? `<div class="note">Eat it in pieces (like tortillas)? <a href="#" id="setPieces">Set how many pieces are in the pack</a> once and the app remembers.</div>` : ""}
    <div class="row"><input id="amt" type="number" inputmode="decimal" step="any" value="${amount}"><span id="unitLbl" class="muted"></span></div>
    <div class="preview" id="pv"></div>
    <div class="chips" id="mealChips">${MEALS.map(([k, l]) => `<button data-meal="${k}">${l}</button>`).join("")}</div>
    <button class="primary" id="addBtn" style="width:100%">Add to ${curDay === dkey() ? "today" : parseDkey(curDay).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</button>
    ${prod.source !== "usda" ? `<p><button id="editProd">Edit product</button></p>` : `<p><button id="copyProd">Make my own copy to edit</button></p>`}`);
  const calc = () => {
    const u = units.find((x) => x[0] === unit), grams = (num($("#amt", body).value) || 0) * u[2], k = grams / 100;
    return { grams, kcal: prod.per100.kcal * k, p: prod.per100.p * k, c: prod.per100.c * k, f: prod.per100.f * k, u };
  };
  const draw = () => {
    $("#unitChips", body).innerHTML = units.map(([k, l, g]) => `<button data-unit="${k}" class="${k === unit ? "on" : ""}">${esc(l)}${k !== "g" ? ` (${r0(g)} ${prod.basis === "ml" ? "ml" : "g"})` : ""}</button>`).join("");
    $$("#mealChips button", body).forEach((b) => b.classList.toggle("on", b.dataset.meal === meal));
    const c = calc();
    $("#unitLbl", body).textContent = c.u[1] + (unit !== "g" && num($("#amt", body).value) !== 1 ? "s" : "");
    $("#pv", body).innerHTML = `<div><b>${r0(c.kcal)}</b><span>kcal</span></div><div><b>${r1(c.p)}</b><span>protein</span></div><div><b>${r1(c.c)}</b><span>carbs</span></div><div><b>${r1(c.f)}</b><span>fat</span></div>`;
  };
  body.addEventListener("click", (e) => {
    const u = e.target.closest("[data-unit]"); if (u) { unit = u.dataset.unit; $("#amt", body).value = unit === "g" ? 100 : 1; draw(); }
    const m = e.target.closest("[data-meal]"); if (m) { meal = m.dataset.meal; draw(); }
  });
  $("#amt", body).oninput = draw;
  const sp = $("#setPieces", body);
  if (sp) sp.onclick = async (e) => {
    e.preventDefault();
    const n = num(prompt(`How many pieces are in the ${r0(prod.packG)} g pack?`)); if (!n) return;
    const lbl = prompt("What is one piece called? (e.g. tortilla, slice)", "piece") || "piece";
    const upd = { ...prod, piecesPerPack: n, pieceLabel: lbl.trim() };
    await saveProduct(upd); openPortion(upd, { meal });
  };
  $("#addBtn", body).onclick = async () => {
    const c = calc(); if (c.grams <= 0) return toast("Enter an amount");
    const amt = num($("#amt", body).value);
    const amountText = unit === "g" ? `${r0(c.grams)} ${prod.basis === "ml" ? "ml" : "g"}` : `${amt} ${c.u[1]}${amt !== 1 ? "s" : ""} · ${r0(c.grams)} g`;
    (S.log[curDay] ||= []).push({ id: uid(), ref: prod.barcode || prod.id, name: prod.name, grams: c.grams, amountText, kcal: c.kcal, p: c.p, c: c.c, f: c.f, meal, ts: Date.now() });
    await save("log"); closeSheet(); renderToday(); toast(`Added ${r0(c.kcal)} kcal`);
  };
  const ed = $("#editProd", body); if (ed) ed.onclick = () => openProductForm(prod);
  const cp = $("#copyProd", body); if (cp) cp.onclick = () => openProductForm({ ...prod, id: "my:" + uid(), source: "manual", name: prod.name + " (mine)" });
  draw();
}

// ---------- Food list search ----------
function openSearch() {
  const body = openSheet(`${head("Food list")}
    <input id="q" type="search" placeholder="Search: egg, rice, tortilla…" autocomplete="off">
    <ul class="list" id="results" style="margin-top:8px"></ul>
    <p><button id="newFood">＋ Create my own food</button></p>
    <p class="muted small">Basic foods: USDA FoodData Central. Scanned products and your own foods show up here too.</p>`);
  const draw = () => {
    const q = $("#q", body).value.trim().toLowerCase();
    const recentIds = []; // most-used first when no query
    if (!q) { const seen = new Set(); for (const k of Object.keys(S.log).sort().reverse()) for (const e of [...S.log[k]].reverse()) if (e.ref && !seen.has(e.ref)) { seen.add(e.ref); recentIds.push(e.ref); } }
    let list;
    if (q) { const words = q.split(/\s+/); list = allFoods().filter((f) => words.every((w) => (f.name + " " + (f.brand || "")).toLowerCase().includes(w))).slice(0, 60); }
    else { list = recentIds.map((id) => S.products[id] || findFood(id)).filter(Boolean).slice(0, 15); if (!list.length) list = builtinFoods(); }
    $("#results", body).innerHTML = list.length ? (q ? "" : `<li class="muted small">${recentIds.length ? "Recent" : "Basic foods"}</li>`) + list.map((f) => `<li class="tap" data-food="${esc(f.barcode || f.id)}"><div class="name">${esc(f.name)}<small>${esc(f.brand || (f.source === "usda" ? "basic food" : f.barcode ? "scanned" : "my food"))}${pieceG(f) ? ` · 1 ${esc(f.pieceLabel || "piece")} = ${r0(pieceG(f))} g` : ""}</small></div><div class="kcal">${r0(f.per100.kcal)}<small class="muted"> /100</small></div></li>`).join("") : `<li class="empty">Nothing found. Create it, scan it, or use Describe.</li>`;
  };
  $("#q", body).oninput = draw;
  $("#results", body).onclick = (e) => { const li = e.target.closest("[data-food]"); if (!li) return; const id = li.dataset.food; openPortion(S.products[id] || findFood(id)); };
  $("#newFood", body).onclick = () => openProductForm({ id: "my:" + uid(), basis: "g", per100: {}, source: "manual", name: $("#q", body).value.trim() });
  draw();
}

// ---------- Describe with AI ----------
function openDescribe() {
  const body = openSheet(`${head("Describe what you ate")}
    ${S.ai.apiKey ? "" : `<div class="note">This needs an Anthropic API key (Me → AI). Until then use the Food list or Quick add.</div>`}
    <textarea id="mealTxt" placeholder="e.g. 3 eggs fried in a bit of butter, 2 slices of toast, a coffee with milk"></textarea>
    <div class="chips" id="mealChips">${MEALS.map(([k, l]) => `<button data-meal="${k}">${l}</button>`).join("")}</div>
    <button class="primary" id="estBtn" style="width:100%" ${S.ai.apiKey ? "" : "disabled"}>Estimate</button>
    <div id="estOut"></div>`);
  let meal = defaultMeal(), items = [];
  const mark = () => $$("#mealChips button", body).forEach((b) => b.classList.toggle("on", b.dataset.meal === meal));
  $("#mealChips", body).onclick = (e) => { const m = e.target.closest("[data-meal]"); if (m) { meal = m.dataset.meal; mark(); } };
  mark();
  $("#estBtn", body).onclick = async () => {
    const txt = $("#mealTxt", body).value.trim(); if (!txt) return;
    const out = $("#estOut", body); out.innerHTML = `<p><span class="spinner"></span>Estimating…</p>`;
    try {
      const r = await askClaude([{ type: "text", text: MEAL_PROMPT(txt) }], MEAL_SCHEMA);
      items = r.items.map((i) => ({ ...i, on: true }));
      const drawItems = () => {
        const on = items.filter((i) => i.on), t = on.reduce((s, i) => ({ k: s.k + i.kcal, p: s.p + i.protein, c: s.c + i.carbs, f: s.f + i.fat }), { k: 0, p: 0, c: 0, f: 0 });
        out.innerHTML = `<ul class="list">${items.map((i, n) => `<li class="tap" data-i="${n}"><div class="name">${i.on ? "☑" : "☐"} ${esc(i.name)}<small>${r0(i.grams)} g · P ${r0(i.protein)} · C ${r0(i.carbs)} · F ${r0(i.fat)}</small></div><div class="kcal">${r0(i.kcal)}</div></li>`).join("")}</ul>
          ${r.note ? `<div class="note">${esc(r.note)}</div>` : ""}
          <div class="preview"><div><b>${r0(t.k)}</b><span>kcal</span></div><div><b>${r0(t.p)}</b><span>protein</span></div><div><b>${r0(t.c)}</b><span>carbs</span></div><div><b>${r0(t.f)}</b><span>fat</span></div></div>
          <p class="muted small">AI estimate – tap an item to leave it out.</p>
          <button class="primary" id="addAll" style="width:100%">Add ${on.length} item${on.length === 1 ? "" : "s"}</button>`;
        $("#addAll", out).onclick = async () => {
          const day = (S.log[curDay] ||= []);
          for (const i of items.filter((x) => x.on)) day.push({ id: uid(), name: i.name, grams: i.grams, amountText: `${r0(i.grams)} g · AI estimate`, kcal: i.kcal, p: i.protein, c: i.carbs, f: i.fat, meal, ts: Date.now() });
          await save("log"); closeSheet(); renderToday(); toast("Added");
        };
      };
      out.onclick = (e) => { const li = e.target.closest("[data-i]"); if (li) { items[li.dataset.i].on = !items[li.dataset.i].on; drawItems(); } };
      drawItems();
    } catch (err) { out.innerHTML = `<div class="note">${esc(err.message)}</div>`; }
  };
}

// ---------- Quick add ----------
function openQuick() {
  const body = openSheet(`${head("Quick add")}
    <form id="qf" class="form">
      <label>What <input name="name" placeholder="e.g. Coffee with milk"></label>
      <div class="grid4">
        <label>kcal <input name="kcal" inputmode="decimal" required></label>
        <label>Protein <input name="p" inputmode="decimal"></label>
        <label>Carbs <input name="c" inputmode="decimal"></label>
        <label>Fat <input name="f" inputmode="decimal"></label>
      </div>
      <div class="chips" id="mealChips">${MEALS.map(([k, l]) => `<button type="button" data-meal="${k}">${l}</button>`).join("")}</div>
      <button class="primary" type="submit" style="width:100%">Add</button>
    </form>`);
  let meal = defaultMeal();
  const mark = () => $$("#mealChips button", body).forEach((b) => b.classList.toggle("on", b.dataset.meal === meal));
  $("#mealChips", body).onclick = (e) => { const m = e.target.closest("[data-meal]"); if (m) { meal = m.dataset.meal; mark(); } };
  mark();
  $("#qf", body).onsubmit = async (e) => {
    e.preventDefault(); const f = e.target.elements, kcal = num(f.kcal.value); if (kcal === null) return;
    (S.log[curDay] ||= []).push({ id: uid(), name: f.name.value.trim() || "Quick add", grams: 0, amountText: "quick add", kcal, p: num(f.p.value) || 0, c: num(f.c.value) || 0, f: num(f.f.value) || 0, meal, ts: Date.now() });
    await save("log"); closeSheet(); renderToday(); toast(`Added ${r0(kcal)} kcal`);
  };
}

// ---------- Entry actions ----------
function openEntry(id) {
  const day = S.log[curDay] || [], e = day.find((x) => x.id === id); if (!e) return;
  const body = openSheet(`${head(e.name)}
    <div class="preview"><div><b>${r0(e.kcal)}</b><span>kcal</span></div><div><b>${r1(e.p)}</b><span>protein</span></div><div><b>${r1(e.c)}</b><span>carbs</span></div><div><b>${r1(e.f)}</b><span>fat</span></div></div>
    <p class="muted small">${esc(e.amountText || "")}</p>
    <div class="chips" id="mealChips">${MEALS.map(([k, l]) => `<button data-meal="${k}" class="${k === e.meal ? "on" : ""}">${l}</button>`).join("")}</div>
    <div class="row"><button id="again">Add again</button><button class="danger" id="del">Delete</button></div>`);
  $("#mealChips", body).onclick = async (ev) => { const m = ev.target.closest("[data-meal]"); if (!m) return; e.meal = m.dataset.meal; await save("log"); closeSheet(); renderToday(); };
  $("#del", body).onclick = async () => { S.log[curDay] = day.filter((x) => x.id !== id); await save("log"); closeSheet(); renderToday(); toast("Deleted"); };
  $("#again", body).onclick = async () => { day.push({ ...e, id: uid(), ts: Date.now() }); await save("log"); closeSheet(); renderToday(); toast("Added again"); };
}

// ---------- wiring ----------
function wire() {
  $$(".tabbar button").forEach((b) => b.onclick = () => {
    $$(".tabbar button").forEach((x) => x.classList.toggle("active", x === b));
    $$(".tab").forEach((t) => t.classList.toggle("active", t.id === "tab-" + b.dataset.tab));
    renderAll(); window.scrollTo(0, 0);
  });
  $("#dayPrev").onclick = () => { curDay = addDays(curDay, -1); renderToday(); };
  $("#dayNext").onclick = () => { if (curDay < dkey()) { curDay = addDays(curDay, 1); renderToday(); } };
  $(".addrow").onclick = (e) => { const a = e.target.closest("[data-act]")?.dataset.act; ({ scan: openScanner, search: openSearch, describe: openDescribe, quick: openQuick })[a]?.(); };
  $("#meals").onclick = (e) => { const li = e.target.closest("[data-entry]"); if (li) openEntry(li.dataset.entry); };

  $("#wSave").onclick = async () => {
    const kg = num($("#wInput").value), date = $("#wDate").value || dkey();
    if (!kg || kg < 30 || kg > 300) return toast("Enter your weight in kg");
    S.weights = S.weights.filter((w) => w.date !== date); S.weights.push({ date, kg: r1(kg) });
    await save("weights"); $("#wInput").value = ""; renderAll(); toast("Weight saved");
  };
  $("#wList").onclick = async (e) => { const b = e.target.closest("[data-delw]"); if (!b) return; S.weights = S.weights.filter((w) => w.date !== b.dataset.delw); await save("weights"); renderAll(); };
  $("#adaptCard").onclick = async (e) => {
    if (e.target.id === "useAdaptive") { S.profile.tdeeOverride = adaptiveEstimate().est; await save("profile"); renderAll(); toast("Target updated from your real data"); }
    if (e.target.id === "clearAdaptive") { delete S.profile.tdeeOverride; await save("profile"); renderAll(); }
  };

  $("#profileForm").onsubmit = async (e) => {
    e.preventDefault(); const f = e.target.elements;
    Object.assign(S.profile, { sex: f.sex.value, birthYear: num(f.birthYear.value), height: num(f.height.value), activity: f.activity.value, goal: f.goal.value, kcalOverride: num(f.kcalOverride.value) });
    await save("profile"); renderAll(); toast(latestWeight() ? "Saved" : "Saved – now add your weight in the Weight tab");
  };
  $("#aiForm").onsubmit = async (e) => {
    e.preventDefault(); const f = e.target.elements;
    S.ai.apiKey = f.apiKey.value.trim(); S.ai.model = f.model.value; await save("ai"); toast("AI settings saved");
  };
  $("#aiTest").onclick = async () => {
    const f = $("#aiForm").elements; S.ai.apiKey = f.apiKey.value.trim(); S.ai.model = f.model.value; await save("ai");
    toast("Testing…", 8000);
    try { const r = await askClaude([{ type: "text", text: "Reply with ok=true." }], { type: "object", additionalProperties: false, required: ["ok"], properties: { ok: { type: "boolean" } } }); toast(r.ok ? "Key works ✓" : "Unexpected answer"); }
    catch (err) { toast(err.message, 5000); }
  };
  $("#exportBtn").onclick = async () => {
    const data = { app: "fuel", version: 1, exported: new Date().toISOString(), ...Object.fromEntries(KEYS.filter((k) => k !== "ai").map((k) => [k, S[k]])) };
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
}

(async function init() {
  try { await DB.open(); await loadAll(); } catch (e) { toast("Storage error: " + e.message, 6000); }
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
  wire(); renderAll();
})();
