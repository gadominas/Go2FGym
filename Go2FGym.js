// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: red; icon-glyph: dumbbell;

/*
 * Go2FGym — "Go to the f***g gym". Offline home-gym exercise library and
 * workout log for Scriptable (iOS). https://github.com/gadominas/Go2FGym
 *
 * - Pick muscle groups, browse matching exercises, see a 2-frame animated
 *   demo, step-by-step instructions and your last performance.
 * - Log sets (weight + reps), rest timer, finish and save to history.
 * - Everything works offline after the one-time library download.
 * - Run it as a widget to see your last workout and this week's count.
 *
 * Exercise data and photos: free-exercise-db by yuhonas (public domain,
 * Unlicense) — https://github.com/yuhonas/free-exercise-db
 */

// ---------------------------------------------------------------- fixed choices
// Everything a user may want different lives in Settings (the sliders icon on the Train tab), saved in settings.json;
// see the settings defaults and the CONFIG registry further down (github.com/gadominas/app-blueprints · settings).
const LIBRARY = {
  dataUrl: "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json",
  imageBase: "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/",
};
// The two "after each workout" jobs; AI settings › What AI does turns both on or off.
const COACH = { autoAnalyze: true, autoStrava: true };

// ---------------------------------------------------------------- version
// This build's version. When releasing, bump it and add a matching entry to releases.json.
const VERSION = '1.9.0';
const APP_ID = 'go2fgym';   // unique per app, never changes
const REPO_RAW = 'https://raw.githubusercontent.com/gadominas/Go2FGym/main/';
const SCRIPT_FILE = 'Go2FGym.js';   // the script's file name in the repository
const UPDATE_SNOOZE_MS = 2 * 24 * 3600 * 1000;   // "Later" = 2 days
const KC_UPDATE_SNOOZE = 'go2fgym-update-snooze';   // Keychain key, unique per app

// ───────── Blueprints ─────────
// Shared blueprints this app was built with (github.com/gadominas/app-blueprints). One line per blueprint, in this exact shape:
// inventory tools read it without running the script, and Settings › Built with shows it.
const BLUEPRINTS_REPO = 'https://github.com/gadominas/app-blueprints';
const BLUEPRINTS = [
  { id: 'in-app-updates', name: 'In-app updates', version: '1.0.0', since: '1.7.0' },
  { id: 'settings', name: 'Settings', version: '1.0.0', since: '1.7.0' },
  { id: 'ai-configuration', name: 'AI configuration', version: '1.0.0', since: '1.6.0' },
];

// ---------------------------------------------------------------- storage
const fm = FileManager.local();
const ROOT = fm.joinPath(fm.documentsDirectory(), "Go2FGym");
// Move data from the pre-release "HomeGym" folder, if present.
const LEGACY = fm.joinPath(fm.documentsDirectory(), "HomeGym");
if (!fm.fileExists(ROOT) && fm.fileExists(LEGACY)) fm.move(LEGACY, ROOT);
const IMG = fm.joinPath(ROOT, "images");
const P = {
  raw: fm.joinPath(ROOT, "exercises.json"),
  meta: fm.joinPath(ROOT, "library-meta.json"),
  history: fm.joinPath(ROOT, "history.json"),
  draft: fm.joinPath(ROOT, "draft.json"),
  consent: fm.joinPath(ROOT, "disclaimer-accepted.json"),
};
for (const d of [ROOT, IMG]) if (!fm.fileExists(d)) fm.createDirectory(d, true);

// ---------------------------------------------------------------- settings (app-blueprints · settings)
// Choices live in settings.json in iCloud Drive › Scriptable › Go2FGym; workouts and the library stay where they are.
const sfm = (() => { try { return FileManager.iCloud(); } catch (e) { return FileManager.local(); } })();
const SET_DIR = sfm.joinPath(sfm.documentsDirectory(), "Go2FGym");
const SP = (n) => sfm.joinPath(SET_DIR, n + ".json");
async function load(n, def) {
  const p = SP(n);
  if (!sfm.fileExists(p)) return def;
  try {
    if (sfm.isFileStoredIniCloud(p) && !sfm.isFileDownloaded(p)) await sfm.downloadFileFromiCloud(p);
    return JSON.parse(sfm.readString(p));
  } catch (e) { return def; }   // a broken file falls back to defaults, never crashes
}
const write = (n, v) => {
  try { if (!sfm.fileExists(SET_DIR)) sfm.createDirectory(SET_DIR, true); sfm.writeString(SP(n), JSON.stringify(v)); return true; }
  catch (e) { console.warn(`Couldn't save ${n}: ${e}`); return false; }
};

// Equipment the library can include; the first four are on by default.
const EQUIPMENT = ["body only", "dumbbell", "barbell", "bands", "kettlebells", "e-z curl bar", "medicine ball", "exercise ball", "foam roll", "other"];
// Defaults first, saved choices on top (loadSettings runs before the app and the widget).
const settings = {
  theme: "auto", density: "comfortable", font: "sans", textSize: 1,
  unit: "kg",
  equipment: ["body only", "dumbbell", "barbell", "bands"],
  strongman: false, olympic: false,   // exercise types that need a platform, coach or special gear
  icloudBackup: true,   // mirror history.json to iCloud Drive/Scriptable/Go2FGym-backup
  checkUpdates: true,   // offer new versions from GitHub (asks again 2 days after "Later")
  stravaMode: "funny",  // default tone for Strava posts
  cfg: {},
};
const saveSettings = () => write("settings", settings);
const skipCategories = () => [settings.strongman ? null : "strongman", settings.olympic ? null : "olympic weightlifting"].filter(Boolean);

// Every key the page may change, with its check and what closing Settings must then do.
const SET_KEYS = {
  theme: [(v) => v === "auto" || !!PALETTES[v], ""], density: [(v) => ["comfortable", "compact", "tiny"].includes(v), ""],
  font: [(v) => ["sans", "serif"].includes(v), ""], textSize: [(v) => [0.92, 1, 1.12, 1.25].includes(+v), ""],
  unit: [(v) => ["kg", "lb"].includes(v), "reload"],
  strongman: ["bool", "library"], olympic: ["bool", "library"],
  icloudBackup: ["bool", ""], checkUpdates: ["bool", ""],
  stravaMode: [(v) => ["serious", "funny", "neutral"].includes(v), ""],
};
// Returns the effect ('', 'library' or 'reload'), or null when the key or value isn't allowed.
function setSetting(k, v) {
  const s = SET_KEYS[k];
  if (!s) return null;
  if (s[0] === "bool") v = v === true || v === "true";
  else if (!s[0](v)) return null;
  if (k === "textSize") v = +v;
  settings[k] = v;
  return s[1];
}
// Equipment is a list: one switch per item, at least one kept on.
function toggleEquipment(name) {
  if (!EQUIPMENT.includes(name)) return null;
  const on = settings.equipment.includes(name);
  if (on && settings.equipment.length === 1) return null;
  settings.equipment = on ? settings.equipment.filter((x) => x !== name) : EQUIPMENT.filter((x) => x === name || settings.equipment.includes(x));
  return "library";
}

async function loadSettings() {
  const saved = await load("settings", null);
  if (saved) Object.assign(settings, saved);
  const d = { theme: "auto", density: "comfortable", font: "sans", textSize: 1, unit: "kg", stravaMode: "funny" };
  for (const k of Object.keys(d)) if (setSetting(k, settings[k]) === null) settings[k] = d[k];
  settings.equipment = Array.isArray(settings.equipment) ? EQUIPMENT.filter((x) => settings.equipment.includes(x)) : [];
  if (!settings.equipment.length) settings.equipment = ["body only", "dumbbell", "barbell", "bands"];
  settings.cfg = settings.cfg && typeof settings.cfg === "object" ? settings.cfg : {};
  if (!saved) saveSettings();
}

// Everything tunable lives here; the Settings screen edits these (stored in settings.cfg, defaults below).
const CONFIG = [
  ["Timing", [
    { k: "restSeconds", label: "Rest timer", help: "Started after each set you tick off", unit: "s", def: 90, min: 30, max: 300, step: 15 },
  ]],
  ["Downloads", [
    { k: "parallelDownloads", label: "Photos downloaded at once", help: "Higher is faster but heavier on the network", unit: "", def: 6, min: 1, max: 12, step: 1 },
  ]],
];
const CFG_FLAT = CONFIG.flatMap(([, items]) => items);
const cfgDef = (k) => CFG_FLAT.find((x) => x.k === k);
const cfg = (k) => { const v = settings.cfg && settings.cfg[k]; return v === undefined ? cfgDef(k).def : v; };
function setCfg(k, v) {
  const d = cfgDef(k);
  if (!d) return "Unknown setting";
  settings.cfg = settings.cfg || {};
  if (v === null) { delete settings.cfg[k]; return ""; }   // Reset
  v = Number(String(v).replace(",", "."));   // accept a decimal comma
  if (!isFinite(v)) v = d.def;
  v = Math.min(d.max, Math.max(d.min, v));
  v = d.step < 1 ? Math.round(v / d.step) * d.step : Math.round(v);
  v = Number(v.toFixed(2));
  if (v === d.def) delete settings.cfg[k]; else settings.cfg[k] = v;   // store only what differs
  return "";
}

// Six palettes on the shared colour tokens. Go2FGym red is the accent in all of them; done (the green tick)
// and iron (the darkest plate) are this app's own extra colours. The other plate colours are fixed artwork.
const PALETTES = {
  ink:      { paper: "#E8EBEE", sheet: "#FFFFFF", ink: "#14181C", ink2: "#363D44", muted: "#5A636C", rule: "#D2D7DC", signal: "#C8102E", signalWash: "#F8DDE1", amber: "#9A6200", amberWash: "#FDF0D2", danger: "#B3261E", done: "#2E8B3E", iron: "#2A2E33", scheme: "light" },
  sepia:    { paper: "#F3EAD6", sheet: "#FBF5E6", ink: "#2A1F14", ink2: "#4B3B2A", muted: "#73604A", rule: "#E1D3B5", signal: "#B5122C", signalWash: "#F3D8D2", amber: "#A16207", amberWash: "#F6E5BF", danger: "#9F1239", done: "#3F7A3A", iron: "#3A2F25", scheme: "light" },
  mint:     { paper: "#F1F6F3", sheet: "#FFFFFF", ink: "#0D2318", ink2: "#2C4A3B", muted: "#556D60", rule: "#D3E2D9", signal: "#C8102E", signalWash: "#F8DDE1", amber: "#B45309", amberWash: "#FBEED8", danger: "#B91C1C", done: "#15803D", iron: "#22302A", scheme: "light" },
  contrast: { paper: "#FFFFFF", sheet: "#FFFFFF", ink: "#000000", ink2: "#111111", muted: "#333333", rule: "#9A9A9A", signal: "#A30020", signalWash: "#FFE0E5", amber: "#7A4B00", amberWash: "#FFEEC2", danger: "#A30000", done: "#006B2E", iron: "#000000", scheme: "light" },
  slate:    { paper: "#1C2128", sheet: "#22272E", ink: "#E6EDF3", ink2: "#C5CED8", muted: "#9AA5B1", rule: "#373E47", signal: "#F0485F", signalWash: "#3D1E25", amber: "#E3B341", amberWash: "#3A2F12", danger: "#FF8A7A", done: "#45AD59", iron: "#12161B", scheme: "dark" },
  night:    { paper: "#16191C", sheet: "#22272B", ink: "#EEF1F4", ink2: "#CDD3D9", muted: "#9AA4AD", rule: "#353B41", signal: "#E8344B", signalWash: "#3A1A20", amber: "#F5C04A", amberWash: "#2D240C", danger: "#FF8F7A", done: "#45AD59", iron: "#0F1113", scheme: "dark" },
};
const PALETTE_CSS = Object.entries(PALETTES).map(([k, p]) => `[data-theme=${k}]{--paper:${p.paper};--sheet:${p.sheet};--ink:${p.ink};--ink-2:${p.ink2};--muted:${p.muted};--rule:${p.rule};--signal:${p.signal};--signal-wash:${p.signalWash};--amber:${p.amber};--amber-wash:${p.amberWash};--danger:${p.danger};--done:${p.done};--p-iron:${p.iron};color-scheme:${p.scheme}}`).join("\n");

// The look for the first paint, so the page never flashes the default palette (the page keeps Auto live afterwards).
function lookState() {
  return { theme: settings.theme, density: settings.density, font: settings.font, textSize: settings.textSize,
           shown: settings.theme === "auto" ? (Device.isUsingDarkAppearance() ? "night" : "ink") : settings.theme };
}

// What the Settings sheet shows. Keys never go to the page: AI settings has its own sheet.
function settingsState() {
  return {
    settings: Object.assign(Object.fromEntries(Object.keys(SET_KEYS).map((k) => [k, settings[k]])), { equipment: settings.equipment }),
    equipmentAll: EQUIPMENT,
    cfg: Object.fromEntries(CFG_FLAT.map((d) => [d.k, cfg(d.k)])),
    cfgSchema: CONFIG.map(([title, items]) => ({ title, items })),
    palettes: PALETTES, version: VERSION, appName: "Go2FGym",
    blueprints: BLUEPRINTS, blueprintsRepo: BLUEPRINTS_REPO,
    hasKey: !!aiKey(), aiStatus: aiStatusLine(),
  };
}

// Bump when the disclaimer text changes materially, so users accept it again.
const DISCLAIMER_VERSION = 2;

const J = (v) => JSON.stringify(v).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
const sleep = (ms) => new Promise((r) => Timer.schedule(ms, false, r));

function readJSON(path, fallback) {
  try {
    if (fm.fileExists(path)) return JSON.parse(fm.readString(path));
  } catch (e) {
    console.error(`Could not read ${path}: ${e}`);
  }
  return fallback;
}
function writeJSON(path, value) {
  fm.writeString(path, JSON.stringify(value));
}
function imgPath(rel) {
  return fm.joinPath(IMG, rel.replace(/\//g, "__"));
}

function icloudDir() {
  try {
    const ic = FileManager.iCloud();
    const dir = ic.joinPath(ic.documentsDirectory(), "Go2FGym-backup");
    if (!ic.fileExists(dir)) ic.createDirectory(dir, true);
    return { ic, dir };
  } catch (e) {
    return null;
  }
}

function loadHistory() {
  const h = readJSON(P.history, null);
  return h && Array.isArray(h.sessions) ? h : { version: 1, sessions: [] };
}
function saveHistory(h) {
  h.sessions.sort((a, b) => a.start.localeCompare(b.start));
  writeJSON(P.history, h);
  if (!settings.icloudBackup) return;
  const c = icloudDir();
  if (c) {
    try {
      c.ic.writeString(c.ic.joinPath(c.dir, "history.json"), JSON.stringify(h, null, 1));
    } catch (e) {
      console.log(`iCloud backup skipped: ${e}`);
    }
  }
}
async function restoreFromBackupIfNeeded() {
  if (fm.fileExists(P.history)) return;
  const c = icloudDir();
  if (!c) return;
  let p = c.ic.joinPath(c.dir, "history.json");
  const legacy = c.ic.joinPath(c.ic.joinPath(c.ic.documentsDirectory(), "HomeGym-backup"), "history.json");
  if (!c.ic.fileExists(p) && c.ic.fileExists(legacy)) p = legacy;
  try {
    if (c.ic.fileExists(p)) {
      await c.ic.downloadFileFromiCloud(p);
      fm.writeString(P.history, c.ic.readString(p));
      console.log("History restored from iCloud backup");
    }
  } catch (e) {
    console.log(`No backup restored: ${e}`);
  }
}

function toCSV(h) {
  const rows = [["date", "workout_id", "muscle_groups", "exercise", "set", `weight_${settings.unit}`, "reps"]];
  for (const s of h.sessions)
    for (const en of s.entries)
      en.sets.forEach((x, i) =>
        rows.push([s.start.slice(0, 10), s.id, (s.groups || []).join(" "), en.name, i + 1, x.w == null ? "" : x.w, x.r])
      );
  return rows
    .map((r) =>
      r
        .map((c) => {
          c = String(c);
          return /[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c;
        })
        .join(",")
    )
    .join("\n");
}

// ---------------------------------------------------------------- library
function isHomeExercise(e) {
  const eq = e.equipment || "body only";
  return settings.equipment.includes(eq) && !skipCategories().includes(e.category);
}

function buildLibrary() {
  const raw = readJSON(P.raw, null);
  if (!Array.isArray(raw)) return [];
  return raw.filter(isHomeExercise).map((e) => {
    const img = e.images || [];
    return {
      id: e.id,
      n: e.name,
      lv: e.level,
      eq: e.equipment || "body only",
      mech: e.mechanic,
      force: e.force,
      cat: e.category,
      pm: e.primaryMuscles || [],
      sm: e.secondaryMuscles || [],
      ins: e.instructions || [],
      img,
      has: img.length > 0 && fm.fileExists(imgPath(img[0])),
    };
  });
}
const forWeb = (lib) => lib.map(({ img, ...rest }) => rest);

async function syncLibrary(report) {
  await report({ phase: "Downloading exercise list", done: 0, total: 0 });
  const req = new Request(LIBRARY.dataUrl);
  req.timeoutInterval = 60;
  const all = await req.loadJSON();
  if (!Array.isArray(all) || !all.length) throw new Error("The exercise list came back empty. Check your connection and try again.");
  writeJSON(P.raw, all);

  const jobs = [];
  for (const e of all.filter(isHomeExercise))
    for (const rel of e.images || []) {
      const local = imgPath(rel);
      if (!fm.fileExists(local)) jobs.push({ rel, local });
    }

  let done = 0;
  let failed = 0;
  const total = jobs.length;
  await report({ phase: "Downloading photos", done, total });
  for (let i = 0; i < jobs.length; i += cfg("parallelDownloads")) {
    const batch = jobs.slice(i, i + cfg("parallelDownloads"));
    await Promise.all(
      batch.map(async (j) => {
        try {
          const r = new Request(LIBRARY.imageBase + encodeURI(j.rel));
          r.timeoutInterval = 30;
          const data = await r.load();
          if (data && r.response && r.response.statusCode === 200) fm.write(j.local, data);
          else failed++;
        } catch (e) {
          failed++;
        }
        done++;
      })
    );
    await report({ phase: "Downloading photos", done, total });
  }
  const meta = { syncedAt: new Date().toISOString(), failed };
  writeJSON(P.meta, meta);
  return meta;
}

// ---------------------------------------------------------------- in-app updates
// Compares "1.10.0" and "1.9.2" as numbers: returns 1, 0 or -1.
function cmpVer(a, b) {
  const pa = String(a).split(".").map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

function updateSnoozed() {
  try {
    return Keychain.contains(KC_UPDATE_SNOOZE) && Date.now() < +Keychain.get(KC_UPDATE_SNOOZE);
  } catch (e) {
    return false;
  }
}
function snoozeUpdate() {
  Keychain.set(KC_UPDATE_SNOOZE, String(Date.now() + UPDATE_SNOOZE_MS));
}
function clearUpdateSnooze() {
  if (Keychain.contains(KC_UPDATE_SNOOZE)) Keychain.remove(KC_UPDATE_SNOOZE);
}

// Never throws and never blocks: any failure just means no update is offered this time.
async function checkForUpdate() {
  if (!settings.checkUpdates || updateSnoozed()) return null;
  try {
    const req = new Request(`${REPO_RAW}releases.json?t=${Date.now()}`);
    req.timeoutInterval = 10;
    const data = await req.loadJSON();
    if (!data || !Array.isArray(data.releases)) return null;
    const newer = data.releases
      .filter((r) => r && r.version && cmpVer(r.version, VERSION) > 0)
      .sort((x, y) => cmpVer(y.version, x.version));
    if (!newer.length) return null;
    // The newest release's highlights first, topped up from older versions the user skipped.
    const highlights = [];
    newer.forEach((r) => (r.highlights || []).forEach((h) => {
      if (highlights.length < 3 && h && h.title) highlights.push(h);
    }));
    return {
      current: VERSION, latest: newer[0].version, title: newer[0].title || "",
      skipped: newer.length, highlights, script: data.script || SCRIPT_FILE,
    };
  } catch (e) {
    console.log(`Update check skipped: ${e}`);
    return null;
  }
}

async function applyUpdate(info) {
  const req = new Request(`${REPO_RAW}${encodeURI((info && info.script) || SCRIPT_FILE)}?t=${Date.now()}`);
  req.timeoutInterval = 30;
  const code = await req.loadString();
  const okStatus = req.response && req.response.statusCode === 200;
  const m = code && code.match(/const VERSION = '([^']+)'/);
  // 1. A real script for THIS app, not an error page or another project's file
  if (!okStatus || !m || !code.includes(`const APP_ID = '${APP_ID}'`)) {
    throw new Error("The download didn't look right. Try again later.");
  }
  // 2. Actually newer: GitHub's cache can serve the old file for a few minutes after a release
  if (cmpVer(m[1], VERSION) <= 0) {
    throw new Error("GitHub is still serving the old version. Try again in a few minutes.");
  }
  // 3. Write it where the running script lives (iCloud or on the phone)
  const path = module.filename;
  let target = FileManager.local();
  try {
    const ic = FileManager.iCloud();
    if (path.startsWith(ic.documentsDirectory())) target = ic;
  } catch (e) {
    /* iCloud off */
  }
  target.writeString(path, code);
  return m[1]; // the version now installed
}

// ─────────────── AI configuration ───────────────
// Follows github.com/gadominas/app-blueprints · blueprints/ai-configuration.md (reference: BlogPulse.js).
// Every AI request goes through aiCall. Keys live in the iOS Keychain only; the page sees them masked.

// AI providers. Keychain names are unique per app; models are defaults until the user picks one.
const AI = {
  anthropic: { key: "GO2FGYM_ANTHROPIC_KEY", model: "claude-haiku-5-5" },
  openai:    { key: "GO2FGYM_OPENAI_KEY",    model: "gpt-5.4-mini" },
};
const PROVIDERS = { anthropic: "Claude", openai: "OpenAI" };

// AI settings and token usage live in their own small JSON files on this iPhone (never the keys).
const aiFm = FileManager.local();
const aiPath = name => aiFm.joinPath(aiFm.documentsDirectory(), "go2fgym-" + name + ".json");
function aiLoad(name, fallback) {
  try { const p = aiPath(name); if (aiFm.fileExists(p)) return JSON.parse(aiFm.readString(p)); }
  catch (e) { console.log("AI: couldn't read " + name + ": " + e); }
  return fallback;
}
function aiWrite(name, data) {
  try { aiFm.writeString(aiPath(name), JSON.stringify(data)); } catch (e) { console.log("AI: couldn't save " + name + ": " + e); }
}
const aiSettings = Object.assign({
  aiProvider: "anthropic",   // the provider marked "In use"
  ai: true,                  // background AI jobs on/off ("What AI does")
  // model:  { anthropic: "…", openai: "…" }   set when the user picks a model
  // models: { anthropic: { at, list: [{ id, name }] }, openai: … }   cached model lists
}, aiLoad("ai-settings", {}));
const saveAiSettings = () => aiWrite("ai-settings", aiSettings);

const keyFor   = p => Keychain.contains(AI[p].key) ? Keychain.get(AI[p].key) : null;
const aiKey    = () => keyFor(aiSettings.aiProvider);   // the key of the provider in use
const modelFor = p => (aiSettings.model && aiSettings.model[p]) || AI[p].model;
const maskKey  = k => k ? (k.length > 14 ? k.slice(0, 7) + "…" + k.slice(-4) : "…" + k.slice(-4)) : null;

// Run once at start: move a key an earlier version stored elsewhere, then use whichever provider has a key.
function aiMigrate(oldKeyNames, oldModel) {
  for (const old of oldKeyNames || []) {
    if (!Keychain.contains(old)) continue;
    if (!Keychain.contains(AI.openai.key)) Keychain.set(AI.openai.key, Keychain.get(old));
    Keychain.remove(old);
    if (!keyFor("anthropic")) aiSettings.aiProvider = "openai";   // use the key that now exists
  }
  if (oldModel && !(aiSettings.model && aiSettings.model.openai)) aiSettings.model = Object.assign({}, aiSettings.model, { openai: oldModel });
  if (!PROVIDERS[aiSettings.aiProvider]) aiSettings.aiProvider = "anthropic";
  if (!aiKey()) { const other = Object.keys(PROVIDERS).find(p => keyFor(p)); if (other) aiSettings.aiProvider = other; }
  saveAiSettings();
}

async function askKey(p) {
  const cur = keyFor(p);
  const al = new Alert();
  al.title = `${PROVIDERS[p]} API key`;
  al.message = cur ? `The saved key ends in …${cur.slice(-4)}. Paste a new key to replace it.`
                   : "Paste your API key. It's stored in the iOS Keychain on this device only.";
  al.addSecureTextField(p === "openai" ? "sk-…" : "sk-ant-…", "");
  al.addAction("Save key");
  al.addCancelAction("Cancel");
  if (await al.present() !== 0) return false;
  const v = al.textFieldValue(0).trim();
  if (!v) return false;
  Keychain.set(AI[p].key, v);
  if (!aiKey()) aiSettings.aiProvider = p;   // first key saved: use that provider
  return true;
}

function removeKey(p) {
  if (Keychain.contains(AI[p].key)) Keychain.remove(AI[p].key);
}

// The only way the app calls AI. feature: a short tag for the usage table.
// provider: defaults to the one in use; "Test connection" passes the card's provider.
async function aiCall(system, user, maxTokens = 2500, feature = "other", provider = aiSettings.aiProvider) {
  const key = keyFor(provider);
  if (!key) throw new Error(`No ${PROVIDERS[provider]} key saved`);
  const openai = provider === "openai", model = modelFor(provider);
  const r = new Request(openai ? "https://api.openai.com/v1/chat/completions" : "https://api.anthropic.com/v1/messages");
  r.method = "POST";
  r.timeoutInterval = 90;
  if (openai) {
    r.headers = { "Authorization": "Bearer " + key, "Content-Type": "application/json" };
    r.body = JSON.stringify({ model, messages: [{ role: "system", content: system }, { role: "user", content: user }] });
  } else {
    r.headers = { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" };
    r.body = JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] });
  }
  const j = await r.loadJSON();
  if (j.error) throw new Error(j.error.message || "AI request failed");
  const u = j.usage || {};
  recordUsage(provider, model, feature,
    openai ? (u.prompt_tokens || 0) : (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0),
    openai ? (u.completion_tokens || 0) : (u.output_tokens || 0));
  return openai ? ((j.choices && j.choices[0] && j.choices[0].message.content) || "")
                : (j.content || []).map(c => c.text || "").join("");
}

// For prompts that ask for JSON: tolerate code fences and stray text around it.
function parseJSON(txt) {
  const s = String(txt).replace(/```json|```/g, "").trim();
  const a = s.search(/[\[{]/), b = Math.max(s.lastIndexOf("}"), s.lastIndexOf("]"));
  return JSON.parse(s.slice(a, b + 1));
}

// Token usage, counted from what the provider reports, per provider, model, feature and local day.
let usage = aiLoad("usage", { since: Date.now(), p: {} });
const aiDayKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function recordUsage(provider, model, feature, tin, tout) {
  const P = usage.p[provider] = usage.p[provider] || { calls: 0, in: 0, out: 0, models: {}, features: {}, days: {} };
  const b = (o, k) => o[k] = o[k] || { calls: 0, in: 0, out: 0 };
  for (const x of [P, b(P.models, model), b(P.features, feature), b(P.days, aiDayKey())]) {
    x.calls++; x.in += tin; x.out += tout;
  }
  const days = Object.keys(P.days).sort();
  while (days.length > 400) delete P.days[days.shift()];   // keep about 13 months of days
  aiWrite("usage", usage);   // save after every call: the app can be closed at any moment
}

function resetUsage() { usage = { since: Date.now(), p: {} }; aiWrite("usage", usage); }

// The models the user's own key can call, newest first; cached so the menu works offline.
async function fetchModels(p) {
  const key = keyFor(p);
  if (!key) throw new Error(`Add a ${PROVIDERS[p]} key first`);
  const r = new Request(p === "openai" ? "https://api.openai.com/v1/models" : "https://api.anthropic.com/v1/models?limit=100");
  r.headers = p === "openai" ? { "Authorization": "Bearer " + key } : { "x-api-key": key, "anthropic-version": "2023-06-01" };
  r.timeoutInterval = 20;
  const j = await r.loadJSON();
  if (j.error) throw new Error(j.error.message || "Couldn't load models");
  let list = (j.data || []).map(m => ({
    id: m.id, name: m.display_name || m.id,
    t: m.created_at ? Date.parse(m.created_at) : (m.created || 0) * 1000,
  }));
  // OpenAI lists every model the key can reach; keep only the ones that write text.
  if (p === "openai") list = list.filter(m => /^(gpt-|o\d|chatgpt-)/.test(m.id)
    && !/(audio|realtime|tts|transcribe|image|search|embedding|instruct|moderation)/.test(m.id));
  list.sort((a, b) => b.t - a.t);
  aiSettings.models = aiSettings.models || {};
  aiSettings.models[p] = { at: Date.now(), list: list.map(m => ({ id: m.id, name: m.name })) };
  saveAiSettings();
  return list.length;
}

// Bridge actions from the AI settings sheet. Returns the toast to show ("" for none).
const AI_ACTIONS = ["aistate", "aikey", "airm", "aiprov", "aimodels", "aimodel", "aitest", "usagereset", "aitoggle"];
async function aiAction(head, m) {
  const P = PROVIDERS[m.v] ? m.v : aiSettings.aiProvider;
  let msg = "";
  switch (head) {
    case "aikey":
      if (await askKey(P)) {
        aiSettings.ai = true; saveAiSettings();
        try { const n = await fetchModels(P); msg = `${PROVIDERS[P]} key saved — ${n} models available`; }
        catch (e) { msg = `Key saved, but checking it failed: ${String(e.message || e).slice(0, 70)}`; }
      }
      break;
    case "airm": removeKey(P); msg = `${PROVIDERS[P]} key removed`;
      if (!aiKey()) { const other = Object.keys(PROVIDERS).find(p => keyFor(p)); if (other) aiSettings.aiProvider = other; }
      break;
    case "aiprov": if (PROVIDERS[m.v] && keyFor(m.v)) aiSettings.aiProvider = m.v; break;
    case "aimodels":
      try { const n = await fetchModels(P); msg = `${n} ${PROVIDERS[P]} models found`; }
      catch (e) { msg = String(e.message || e).slice(0, 90); }
      break;
    case "aimodel":
      if (PROVIDERS[m.p] && m.v) { aiSettings.model = aiSettings.model || {}; aiSettings.model[m.p] = m.v; msg = `${PROVIDERS[m.p]} now uses ${m.v}`; }
      break;
    case "aitest": {
      const t0 = Date.now();
      try {
        await aiCall("Reply with the single word OK.", "Connection test.", 10, "test", P);
        msg = `${PROVIDERS[P]} works — ${modelFor(P)} answered in ${((Date.now() - t0) / 1000).toFixed(1)} s`;
      } catch (e) { msg = `${PROVIDERS[P]} test failed: ${String(e.message || e).slice(0, 80)}`; }
      break;
    }
    case "usagereset": resetUsage(); msg = "Usage counters reset"; break;
    case "aitoggle": aiSettings.ai = !aiSettings.ai; break;
  }
  saveAiSettings();
  return msg;
}

// What the page gets. Keys appear only masked.
function aiClientState() {
  return {
    provider: aiSettings.aiProvider,
    keys:  Object.fromEntries(Object.keys(PROVIDERS).map(p => [p, maskKey(keyFor(p))])),
    model: Object.fromEntries(Object.keys(PROVIDERS).map(p => [p, modelFor(p)])),
    models: aiSettings.models || {}, usage, today: aiDayKey(),
    ai: aiSettings.ai, hasKey: !!aiKey(),
  };
}
// One-line status for the app's Settings row: "Claude — claude-haiku-5-5 — 12.4k tokens used".
function aiStatusLine() {
  if (!aiKey()) return "";
  const P = usage.p[aiSettings.aiProvider];
  return `${PROVIDERS[aiSettings.aiProvider]} — ${modelFor(aiSettings.aiProvider)}` +
    (P && P.calls ? ` — ${aiFmtN(P.in + P.out)} tokens used` : "");
}
const aiFmtN = n => n >= 1e6 ? (n / 1e6).toFixed(2) + "M" : n >= 1e4 ? Math.round(n / 1e3) + "k" : n >= 1e3 ? (n / 1e3).toFixed(1) + "k" : String(n);
// ─────────────── end of AI configuration ───────────────

// ---------------------------------------------------------------- AI coach
// The web UI builds the prompt and JSON schema; the request goes through aiCall, so keys never leave Scriptable.
async function aiCoach(p) {
  if (!aiKey()) return { needKey: true };
  const provider = aiSettings.aiProvider;
  const system = `${p.instructions}\n\nReply with JSON only, no other text, matching this JSON schema:\n${JSON.stringify(p.schema)}`;
  const text = await aiCall(system, p.input, 4000, p.name || "other");
  try {
    return { data: parseJSON(text), by: PROVIDERS[provider] };
  } catch (e) {
    throw new Error("The AI answer could not be read. Try again.");
  }
}

// ---------------------------------------------------------------- widget
async function runWidget() {
  const h = loadHistory();
  const w = new ListWidget();
  w.backgroundColor = Color.dynamic(new Color("#E8EBEE"), new Color("#16191C"));
  w.url = URLScheme.forRunningScript();
  const ink = Color.dynamic(new Color("#14181C"), new Color("#EEF1F4"));
  const muted = Color.dynamic(new Color("#5A636C"), new Color("#9AA4AD"));

  const t = w.addText("Go2FGym");
  t.font = Font.heavySystemFont(15);
  t.textColor = new Color("#C8102E");
  w.addSpacer(8);

  const sorted = [...h.sessions].sort((a, b) => b.start.localeCompare(a.start));
  const now = new Date();
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const week = sorted.filter((s) => new Date(s.start) >= monday).length;

  if (sorted[0]) {
    const s = sorted[0];
    const days = Math.floor((now - new Date(s.start)) / 86400000);
    const when = days === 0 ? "Today" : days === 1 ? "Yesterday" : `${days} days ago`;
    const sets = s.entries.reduce((n, en) => n + en.sets.length, 0);
    const a = w.addText(when);
    a.font = Font.boldSystemFont(17);
    a.textColor = ink;
    const b = w.addText((s.groups || []).map((g) => g[0].toUpperCase() + g.slice(1)).join(", ") || "Workout");
    b.font = Font.systemFont(13);
    b.textColor = ink;
    b.lineLimit = 2;
    const c = w.addText(`${sets} sets`);
    c.font = Font.systemFont(13);
    c.textColor = muted;
  } else {
    const a = w.addText("No workouts yet");
    a.font = Font.boldSystemFont(15);
    a.textColor = ink;
  }
  w.addSpacer();
  const f = w.addText(`${week} this week`);
  f.font = Font.mediumSystemFont(12);
  f.textColor = muted;
  Script.setWidget(w);
}

// ---------------------------------------------------------------- app
async function runApp() {
  await restoreFromBackupIfNeeded();
  let lib = buildLibrary();
  let libById = Object.fromEntries(lib.map((e) => [e.id, e]));
  let history = loadHistory();

  const makeBoot = () => ({
    lib: forWeb(lib),
    history,
    draft: readJSON(P.draft, null),
    ai: { hasKey: !!aiKey(), bg: aiSettings.ai, autoAnalyze: COACH.autoAnalyze, autoStrava: COACH.autoStrava, stravaMode: settings.stravaMode },
    meta: readJSON(P.meta, null),
    consent: readJSON(P.consent, null),
    version: VERSION,
    look: lookState(),
    cfg: { unit: settings.unit, rest: cfg("restSeconds"), equipment: settings.equipment, disclaimerVersion: DISCLAIMER_VERSION },
  });
  const boot = makeBoot();
  let settingsEffect = "";   // what closing Settings must do: "", "library" or "reload"

  const wv = new WebView();
  const js = async (code) => {
    try {
      await wv.evaluateJavaScript(`${code};0`, false);
    } catch (e) {
      console.log(`Bridge: ${e}`);
    }
  };

  async function handle(m) {
    const p = m.payload || {};
    if (AI_ACTIONS.includes(m.type)) {   // AI settings sheet (app-blueprints · ai-configuration)
      const msg = await aiAction(m.type, p);
      await js(`window.__aiState(${J(aiClientState())})`);
      if (msg) await js(`window.__aiToast(${J(msg)})`);
      return;
    }
    switch (m.type) {
      // Settings (app-blueprints · settings): each change is applied and saved at once; the page gets the fresh state.
      case "settings-get":
      case "set":
      case "equip":
      case "cfg": {
        let effect = "";
        if (m.type === "set") effect = setSetting(p.k, p.v);
        else if (m.type === "equip") effect = toggleEquipment(p.v);
        else if (m.type === "cfg") { if (p.k === "*") settings.cfg = {}; else setCfg(p.k, p.reset ? null : p.v); }
        if (effect === null) await js(`HG.toast(${J(m.type === "equip" ? "Keep at least one kind of equipment." : "That setting can’t be changed here.")})`);
        else if (effect) settingsEffect = settingsEffect === "reload" || effect === "reload" ? "reload" : effect;
        if (m.type !== "settings-get") saveSettings();
        await js(`HG.onSettings(${J(settingsState())})`);
        break;
      }
      case "settings-done": {   // the sheet closed: rebuild the library or reload the page once, if needed
        const effect = settingsEffect;
        settingsEffect = "";
        if (effect === "library" || effect === "reload") {
          lib = buildLibrary();
          libById = Object.fromEntries(lib.map((e) => [e.id, e]));
        }
        if (effect === "reload") await wv.loadHTML(buildHTML(makeBoot()));
        else if (effect === "library") await js(`HG.onLibrary(${J(forWeb(lib))},${J(readJSON(P.meta, null))})`);
        break;
      }
      case "update-check": {   // Settings › Check for updates now: clears "Later" and checks at once
        clearUpdateSnooze();
        const was = settings.checkUpdates; settings.checkUpdates = true;
        const u = await checkForUpdate(); settings.checkUpdates = was;
        await js(`HG.onUpdateCheck(${J(u ? `Version ${u.latest} is available` : `You're on the latest version (${VERSION})`)},${!!u})`);
        if (u) { pendingUpdate = u; await js(`window.__showUpdate(${J(u)})`); }
        break;
      }
      case "openurl":   // Built with: only the blueprints repository opens from here
        if (p.v === BLUEPRINTS_REPO || String(p.v).startsWith(BLUEPRINTS_REPO + "/")) await Safari.openInApp(p.v, false);
        break;
      case "images":
        for (const id of p.ids || []) {
          const ex = libById[id];
          const urls = [];
          if (ex)
            for (const rel of ex.img) {
              const path = imgPath(rel);
              if (fm.fileExists(path)) urls.push(`data:image/jpeg;base64,${Data.fromFile(path).toBase64String()}`);
            }
          await js(`HG.onImages(${J(id)},${J(urls)})`);
        }
        break;
      case "ai": {
        let out;
        try {
          out = await aiCoach(p);
        } catch (e) {
          out = { error: String((e && e.message) || e) };
        }
        await js(`HG.onAI(${J(p.rid)},${J(out)})`);
        break;
      }
      case "update-later":
        snoozeUpdate();
        pendingUpdate = null;
        break;
      case "update-now": {
        let ok = false;
        let msg = "";
        try {
          msg = await applyUpdate(pendingUpdate);
          ok = true;
          pendingUpdate = null;
          clearUpdateSnooze();
        } catch (e) {
          msg = String((e && e.message) || e);
        }
        await js(`HG.onUpdateDone(${ok},${J(msg)})`);
        break;
      }
      case "copy":
        Pasteboard.copyString(String(p.text || ""));
        await js(`HG.toast(${J(p.label ? `${p.label} copied` : "Copied")})`);
        break;
      case "accept":
        writeJSON(P.consent, { version: p.version, acceptedAt: new Date().toISOString() });
        break;
      case "open":
        if (typeof p.url === "string" && p.url.startsWith("https://")) Safari.open(p.url);
        break;
      case "draft":
        if (p.session) writeJSON(P.draft, p.session);
        else if (fm.fileExists(P.draft)) fm.remove(P.draft);
        break;
      case "save": {
        const s = p.session;
        if (!s || !s.id || !Array.isArray(s.entries)) throw new Error("Workout could not be saved: missing data.");
        history.sessions = history.sessions.filter((x) => x.id !== s.id).concat(s);
        saveHistory(history);
        if (fm.fileExists(P.draft)) fm.remove(P.draft);
        await js(`HG.onHistory(${J(history)})`);
        break;
      }
      case "delete":
        history.sessions = history.sessions.filter((x) => x.id !== p.id);
        saveHistory(history);
        await js(`HG.onHistory(${J(history)})`);
        break;
      case "export": {
        const csv = toCSV(history);
        let where = "Scriptable's local Go2FGym folder";
        const c = icloudDir();
        try {
          if (c) {
            c.ic.writeString(c.ic.joinPath(c.dir, "history.csv"), csv);
            where = "iCloud Drive › Scriptable › Go2FGym-backup";
          } else fm.writeString(fm.joinPath(ROOT, "history.csv"), csv);
        } catch (e) {
          fm.writeString(fm.joinPath(ROOT, "history.csv"), csv);
        }
        await js(`HG.toast(${J(`history.csv saved to ${where}`)})`);
        try {
          await ShareSheet.present([csv]);
        } catch (e) {
          /* share sheet dismissed */
        }
        break;
      }
      case "sync": {
        const meta = await syncLibrary((s) => js(`HG.onSync(${J(s)})`));
        lib = buildLibrary();
        libById = Object.fromEntries(lib.map((e) => [e.id, e]));
        await js(`HG.onLibrary(${J(forWeb(lib))},${J(meta)})`);
        break;
      }
    }
  }

  // Page watchdog. On a cold start iOS sometimes fails to start (or kills) the web page, leaving a black
  // screen until the app is reopened. A running page always answers with a JSON string, so no answer for
  // about 1.6 s means it isn't running: load it again (at most 3 times per run) and note it in the log.
  let silent = 0;
  let reloads = 0;
  let answered = false;
  async function pump() {
    let msgs = [];
    let raw = null;
    try {
      raw = await wv.evaluateJavaScript("window.HG ? HG.drain() : null", false);
    } catch (e) {
      raw = null;
    }
    if (typeof raw !== "string") {
      if (open && ++silent >= 8 && reloads < 3) {
        silent = 0;
        reloads++;
        startupLog(`page not responding${answered ? " (was running)" : " after opening"}, reload ${reloads}`);
        try {
          await wv.loadHTML(buildHTML(makeBoot()));
          if (pendingUpdate) await js(`window.__showUpdate(${J(pendingUpdate)})`);
        } catch (e) {
          startupLog(`reload failed: ${e}`);
        }
      }
      return;
    }
    if (!answered) {
      answered = true;
      if (reloads) startupLog(`page running after ${reloads} reload${reloads > 1 ? "s" : ""}`);
    }
    silent = 0;
    try {
      msgs = JSON.parse(raw || "[]");
    } catch (e) {
      return;
    }
    for (const m of msgs) {
      try {
        await handle(m);
      } catch (e) {
        await js(`HG.onError(${J(String((e && e.message) || e))})`);
      }
    }
  }

  let pendingUpdate = null;
  await wv.loadHTML(buildHTML(boot));
  let open = true;
  wv.present(true).then(
    () => (open = false),
    () => (open = false)
  );
  // Once per run, after the first screen has rendered, so it never slows the start.
  checkForUpdate().then((u) => {
    pendingUpdate = u;
    if (u && open) js(`window.__showUpdate(${J(u)})`);
  });
  while (open) {
    await pump();
    await sleep(200);
  }
  await pump(); // catch anything queued right before closing
}

// A short log of startup problems (newest last), kept next to the app's data. It never holds personal data.
function startupLog(msg) {
  try {
    const path = fm.joinPath(ROOT, "startup-log.txt");
    const old = fm.fileExists(path) ? fm.readString(path).split("\n").filter(Boolean) : [];
    old.push(`${new Date().toISOString()} v${VERSION} ${msg}`);
    fm.writeString(path, old.slice(-30).join("\n") + "\n");
    console.log(`Startup: ${msg}`);
  } catch (e) {
    /* logging must never break the app */
  }
}

function buildHTML(boot) {
  const data = J(boot).replace(/<\//g, "<\\/");
  const look = lookState();
  return `<!doctype html><html lang="en" data-theme="${look.shown}" data-font="${look.font}" style="--ts:${look.textSize}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,viewport-fit=cover">
<meta name="color-scheme" content="light dark"><title>Go2FGym</title><style>${CSS}</style></head>
<body class="d-${look.density}"><main id="app"></main>
<div id="rest" hidden><div class="rest-fill"></div><span class="rest-label">Rest</span><span class="rest-time">0:00</span>
<button data-a="rest-add">+30 s</button><button data-a="rest-skip">Skip</button></div>
<div id="sat"></div><button id="last" data-a="last" hidden></button>
<div id="toast" role="status" aria-live="polite"></div><nav id="tabs"></nav>
<script>window.__BOOT=${data};(${webApp.toString()})();</script></body></html>`;
}

// ---------------------------------------------------------------- web UI (runs inside the WebView)
function webApp() {
  "use strict";
  const BOOT = window.__BOOT || {};
  const CFG = BOOT.cfg || { unit: "kg", rest: 90, equipment: [] };
  const UNIT = CFG.unit;

  const GROUPS = [
    { key: "chest", label: "Chest", muscles: ["chest"], plate: "red" },
    { key: "back", label: "Back", muscles: ["lats", "middle back", "lower back", "traps"], plate: "blue" },
    { key: "legs", label: "Legs", muscles: ["quadriceps", "hamstrings", "calves", "adductors", "abductors"], plate: "yellow" },
    { key: "shoulders", label: "Shoulders", muscles: ["shoulders", "neck"], plate: "green" },
    { key: "arms", label: "Arms", muscles: ["biceps", "triceps", "forearms"], plate: "white" },
    { key: "glutes", label: "Glutes", muscles: ["glutes"], plate: "steel" },
    { key: "core", label: "Core", muscles: ["abdominals"], plate: "iron" },
  ];
  const GROUP_OF = {};
  GROUPS.forEach((g) => g.muscles.forEach((m) => (GROUP_OF[m] = g)));
  const TYPES = [
    { key: "strength", label: "Strength", cats: ["strength", "powerlifting"] },
    { key: "stretch", label: "Stretching", cats: ["stretching"] },
    { key: "power", label: "Plyo and cardio", cats: ["plyometrics", "cardio"] },
    { key: "all", label: "All types", cats: null },
  ];
  const EQ_LABEL = {
    "body only": "Bodyweight", dumbbell: "Dumbbell", barbell: "Barbell", kettlebells: "Kettlebell",
    bands: "Bands", "e-z curl bar": "EZ bar", other: "Other", "medicine ball": "Medicine ball",
    "exercise ball": "Exercise ball", "foam roll": "Foam roller",
  };
  const LEVEL = { beginner: 0, intermediate: 1, expert: 2 };
  const ICON = {
    train: '<svg viewBox="0 0 24 24"><path d="M3 10v4M6.5 7v10M17.5 7v10M21 10v4M6.5 12h11"/></svg>',
    workout: '<svg viewBox="0 0 24 24"><circle cx="12" cy="13.5" r="7.5"/><path d="M12 9.5v4l2.5 1.8M9.5 3h5"/></svg>',
    history: '<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/></svg>',
    progress: '<svg viewBox="0 0 24 24"><path d="M3 20h18M6 16v-4M11 16V8M16 16v-6M20 16V5"/></svg>',
  };
  const CLUB_URL = "https://www.instagram.com/7amclub__/";
  const LOGO = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="var(--p-red)"/>' +
    '<circle cx="12" cy="12" r="7.6" fill="none" stroke="rgba(255,255,255,.4)" stroke-width="1.3"/>' +
    '<circle cx="12" cy="12" r="2.8" fill="var(--bg)"/></svg>';
  const TABS = [
    { key: "train", label: "Train" },
    { key: "workout", label: "Workout" },
    { key: "history", label: "History" },
    { key: "progress", label: "Progress" },
  ];

  const S = {
    lib: [], byId: {},
    history: BOOT.history || { sessions: [] },
    meta: BOOT.meta || null,
    tab: "train", trainView: "home", detailId: null,
    groups: new Set(), muscle: "all", eq: "all", type: "strength", q: "",
    session: BOOT.draft || null,
    imgs: {}, pending: new Set(), queue: new Set(),
    rest: { end: 0, total: 0, beeped: true },
    openSession: null, armed: null, sync: null,
    histView: "calendar", cal: null, stravaMode: {}, focusId: null,
    consent: !!(BOOT.consent && BOOT.consent.version === CFG.disclaimerVersion),
    showDisclaimer: false,
    ai: {
      hasKey: !!(BOOT.ai && BOOT.ai.hasKey), bg: !BOOT.ai || BOOT.ai.bg !== false, auto: !BOOT.ai || BOOT.ai.autoAnalyze !== false,
      autoStrava: !BOOT.ai || BOOT.ai.autoStrava !== false,
      stravaMode: (BOOT.ai && ["serious", "funny", "neutral"].includes(BOOT.ai.stravaMode)) ? BOOT.ai.stravaMode : "funny",
    },
    aiBusy: null, plan: null,
    builder: { groups: [], equipment: [], minutes: 45, intensity: "moderate", note: "" },
    acceptedAt: BOOT.consent ? BOOT.consent.acceptedAt : null,
    scroll: {}, outbox: [],
  };

  const $ = (s) => document.querySelector(s);
  const $app = $("#app");
  const $tabs = $("#tabs");
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : "");
  const num = (v) => {
    if (v === "" || v == null) return null;
    const n = parseFloat(String(v).replace(",", "."));
    return isFinite(n) ? n : null;
  };
  const fmtNum = (n) => (Math.round(n * 100) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 });
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const day = (iso) => new Date(iso).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  const minutesBetween = (a, b) => Math.max(1, Math.round((new Date(b) - new Date(a)) / 60000));
  const elapsed = (start) => `${minutesBetween(start, new Date())} min`;
  const initials = (n) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  const send = (type, payload) => S.outbox.push({ type, payload });
  const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

  function setLib(lib) {
    S.lib = lib || [];
    S.byId = {};
    S.lib.forEach((e) => (S.byId[e.id] = e));
  }

  // ------------------------------------------------ toast
  let toastT = null;
  function toast(msg, isError) {
    const t = $("#toast");
    t.textContent = msg;
    t.className = `show${isError ? " err" : ""}`;
    clearTimeout(toastT);
    toastT = setTimeout(() => (t.className = ""), isError ? 5000 : 2200);
  }

  // ------------------------------------------------ audio (rest timer)
  let actx = null;
  function unlockAudio() {
    try {
      if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === "suspended") actx.resume();
    } catch (e) { /* no audio */ }
  }
  function beep() {
    if (!actx) return;
    [0, 0.25, 0.5].forEach((t, i) => {
      const o = actx.createOscillator();
      const g = actx.createGain();
      o.frequency.value = i === 2 ? 1320 : 880;
      o.connect(g);
      g.connect(actx.destination);
      const st = actx.currentTime + t;
      g.gain.setValueAtTime(0.0001, st);
      g.gain.exponentialRampToValueAtTime(0.3, st + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, st + 0.2);
      o.start(st);
      o.stop(st + 0.22);
    });
  }

  // ------------------------------------------------ history helpers
  const sessionsDesc = () => [...S.history.sessions].sort((a, b) => b.start.localeCompare(a.start));
  function lastSets(id) {
    for (const s of sessionsDesc()) {
      const en = s.entries.find((x) => x.id === id);
      if (en && en.sets.length) return { date: s.start, sets: en.sets };
    }
    return null;
  }
  function fmtSet(x) {
    return x.w ? `${x.r} reps at ${fmtNum(x.w)} ${UNIT}` : `${x.r} reps`;
  }
  function fmtSets(sets) {
    const same = sets.every((x) => x.w === sets[0].w && x.r === sets[0].r);
    if (same) return sets.length > 1 ? `${sets.length} × ${fmtSet(sets[0])}` : fmtSet(sets[0]);
    return sets.map((x) => (x.w ? `${fmtNum(x.w)} ${UNIT} × ${x.r}` : `${x.r}`)).join(", ");
  }
  const e1rm = (x) => (x.w ? x.w * (1 + x.r / 30) : x.r);
  function volume(entries) {
    let v = 0, n = 0;
    entries.forEach((en) => en.sets.forEach((x) => { n++; if (x.w && x.r) v += x.w * x.r; }));
    return { v, n };
  }
  function trendFor(id) {
    const pts = [];
    [...S.history.sessions].sort((a, b) => a.start.localeCompare(b.start)).forEach((s) => {
      const en = s.entries.find((x) => x.id === id);
      if (en && en.sets.length) pts.push({ d: s.start, v: Math.max(...en.sets.map(e1rm)), w: en.sets.some((x) => x.w) });
    });
    if (pts.length < 2) return "";
    const W = 300, H = 70, pad = 6;
    const vs = pts.map((p) => p.v);
    const lo = Math.min(...vs), hi = Math.max(...vs), span = hi - lo || 1;
    const xy = pts.map((p, i) => [pad + (i * (W - 2 * pad)) / (pts.length - 1), H - pad - ((p.v - lo) * (H - 2 * pad)) / span]);
    const last = pts[pts.length - 1];
    const label = last.w ? `Estimated one-rep max, now ${fmtNum(Math.round(last.v * 10) / 10)} ${UNIT}` : `Best set, now ${Math.round(last.v)} reps`;
    return `<h2>Progress</h2><p class="muted small">${esc(label)} across ${pts.length} workouts.</p>
      <svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
      <polyline points="${xy.map((p) => p.join(",")).join(" ")}"/>
      ${xy.map((p) => `<circle cx="${p[0]}" cy="${p[1]}" r="3"/>`).join("")}</svg>`;
  }

  // ------------------------------------------------ session
  function ensureSession() {
    if (!S.session) S.session = { id: uid(), start: new Date().toISOString(), groups: [...S.groups], entries: [] };
    return S.session;
  }
  const inSession = (id) => !!(S.session && S.session.entries.some((x) => x.id === id));
  function addToSession(id) {
    const ex = S.byId[id];
    if (!ex) return;
    const s = ensureSession();
    if (s.entries.some((x) => x.id === id)) return;
    const last = lastSets(id);
    const sets = last
      ? last.sets.map((x) => ({ w: x.w, r: x.r, done: false }))
      : [{ w: null, r: null, done: false }];
    s.entries.push({ id, name: ex.n, sets });
    ex.pm.forEach((m) => {
      const g = GROUP_OF[m];
      if (g && !s.groups.includes(g.key)) s.groups.push(g.key);
    });
    saveDraft();
  }
  let draftT = null;
  function saveDraft() {
    clearTimeout(draftT);
    draftT = setTimeout(() => send("draft", { session: S.session }), 400);
  }
  function startRest(seconds) {
    const secs = seconds || CFG.rest;
    S.rest = { end: Date.now() + secs * 1000, total: secs, beeped: false };
    tick();
  }
  function finish() {
    const s = S.session;
    if (!s) return;
    const entries = s.entries
      .map((en) => ({ id: en.id, name: en.name, sets: en.sets.filter((x) => x.r > 0).map((x) => ({ w: x.w, r: x.r })) }))
      .filter((en) => en.sets.length);
    if (!entries.length) return toast("Enter reps for at least one set first.", true);
    const done = { id: s.id, start: s.start, end: new Date().toISOString(), groups: s.groups, entries };
    if (s.title) done.title = s.title;
    S.history.sessions = S.history.sessions.filter((x) => x.id !== done.id).concat(done);
    clearTimeout(draftT);
    send("save", { session: done });
    S.session = null;
    S.rest.end = 0;
    S.tab = "history";
    S.openSession = done.id;
    focusDay(done.start);
    render();
    if (S.ai.hasKey && S.ai.bg && (S.ai.auto || S.ai.autoStrava)) {
      toast(S.ai.auto ? "Workout saved. Your AI coach is reviewing it…" : "Workout saved");
      (async () => {
        if (S.ai.auto) await analyze(done.id);
        if (S.ai.autoStrava && S.ai.hasKey) await stravaPost(done.id, S.ai.stravaMode);
      })();
    } else toast("Workout saved");
  }

  // ------------------------------------------------ images
  let flushT = null;
  function want(id) {
    const e = S.byId[id];
    if (!e || !e.has || S.imgs[id] || S.pending.has(id)) return;
    S.queue.add(id);
    clearTimeout(flushT);
    flushT = setTimeout(flushImages, 120);
  }
  function flushImages() {
    const ids = [...S.queue].slice(0, 12);
    ids.forEach((id) => { S.queue.delete(id); S.pending.add(id); });
    if (ids.length) send("images", { ids });
    if (S.queue.size) flushT = setTimeout(flushImages, 400);
  }
  function paintImages(id) {
    const arr = S.imgs[id];
    if (!arr) return;
    document.querySelectorAll("img[data-img]").forEach((img) => {
      if (img.dataset.img !== id) return;
      const src = arr[+img.dataset.f] || arr[0];
      if (src && img.getAttribute("src") !== src) img.src = src;
      img.hidden = false;
    });
  }
  function imgTag(id, f, cls) {
    const arr = S.imgs[id];
    const src = arr && (arr[f] || arr[0]);
    return `<img${cls ? ` class="${cls}"` : ""} data-img="${esc(id)}" data-f="${f}" alt="" ${src ? `src="${src}"` : "hidden"}>`;
  }
  let io = null;
  function observeThumbs() {
    if (io) io.disconnect();
    const els = document.querySelectorAll(".thumb[data-id]");
    if (!("IntersectionObserver" in window)) return els.forEach((el) => want(el.dataset.id));
    io = new IntersectionObserver(
      (es) => es.forEach((en) => { if (en.isIntersecting) { want(en.target.dataset.id); io.unobserve(en.target); } }),
      { rootMargin: "400px" }
    );
    els.forEach((el) => { if (!S.imgs[el.dataset.id]) io.observe(el); });
  }

// ── AI settings sheet (app-blueprints · ai-configuration) ──
  // Opened with window.__aiOpen(); the Scriptable side pushes state with window.__aiState(state).
  var AIS=null, aiIsOpen=false, aiArmed=null, aiLoading={};
  var AI_PN={ anthropic:'Claude', openai:'OpenAI' };
  var AI_FEAT={"workout_plan": "Workout plans", "workout_review": "Workout reviews", "strava_post": "Strava posts", "test": "Connection tests", "other": "Other"};
  var AI_JOBS=[{"title": "Coach after each workout", "text": "When you finish a workout, the AI coach reviews it and writes a Strava post. About two requests per workout."}];
  function aiSend(act,data){ send(act,data); }
  function aiEsc(t){ var d=document.createElement('div'); d.textContent=String(t==null?'':t); return d.innerHTML; }
  function aiFmtN(n){ return n>=1e6?(n/1e6).toFixed(2)+'M':n>=1e4?Math.round(n/1e3)+'k':n>=1e3?(n/1e3).toFixed(1)+'k':String(n); }
  function aiRel(t){ var s=Math.max(0,Math.round((Date.now()-t)/1000)); if(s<60) return 'just now'; if(s<3600) return Math.round(s/60)+' min ago'; if(s<86400) return Math.round(s/3600)+' h ago'; return Math.round(s/86400)+' d ago'; }
  function aiDayStr(d){ return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2); }
  function aiArm(k){ aiArmed=k; renderAI(); setTimeout(function(){ if(aiArmed===k){ aiArmed=null; renderAI(); } },3500); }
  function aiSheet(){
    var el=document.getElementById('aisheet');
    if(!el){
      el=document.createElement('div'); el.id='aisheet'; el.setAttribute('role','dialog'); el.setAttribute('aria-label','AI settings');
      document.body.appendChild(el);
      el.addEventListener('click',aiClick);
      el.addEventListener('change',function(e){ e.stopPropagation(); if(e.target.classList.contains('modelsel')) aiSend('aimodel',{p:e.target.getAttribute('data-p'),v:e.target.value}); });
    }
    return el;
  }
  window.__aiOpen=function(){ aiIsOpen=true; renderAI(); aiSend('aistate',{}); };
  window.__aiState=function(s){ AIS=s; aiLoading={}; renderAI(); if(typeof window.__aiChanged==='function') window.__aiChanged(s); };
  window.__aiToast=function(t){
    if(!t) return; if(typeof toast==='function') return toast(t);
    var el=document.getElementById('aitoast'); if(!el){ el=document.createElement('div'); el.id='aitoast'; el.setAttribute('aria-live','polite'); document.body.appendChild(el); }
    el.textContent=t; el.classList.add('on'); clearTimeout(el.tm); el.tm=setTimeout(function(){ el.classList.remove('on'); },2600);
  };
  function aiUsageBlock(p,P){
    var days=[], now=new Date(), i;
    for(i=13;i>=0;i--){ var d=new Date(now); d.setDate(d.getDate()-i); days.push(aiDayStr(d)); }
    var tot=function(k){ var x=P.days[k]; return x?x.in+x.out:0; };
    var max=Math.max.apply(null,[1].concat(days.map(tot))), month=AIS.today.slice(0,7);
    var monthTot=Object.keys(P.days).filter(function(k){ return k.indexOf(month)===0; }).reduce(function(n,k){ return n+P.days[k].in+P.days[k].out; },0);
    var rows=function(obj,label){ return Object.keys(obj).sort(function(a,b){ return (obj[b].in+obj[b].out)-(obj[a].in+obj[a].out); }).map(function(k){ var x=obj[k];
      return '<tr><td>'+aiEsc(label(k))+'</td><td>'+x.calls+'</td><td>'+aiFmtN(x.in)+'</td><td>'+aiFmtN(x.out)+'</td></tr>'; }).join(''); };
    return '<div class="ucard"><div class="aic-h"><b>'+AI_PN[p]+'</b><span class="muted small">'+P.calls+' request'+(P.calls===1?'':'s')+'</span></div>'+
      '<div class="ustat"><div><b>'+aiFmtN(P.in+P.out)+'</b><small>total tokens</small></div><div><b>'+aiFmtN(P.in)+'</b><small>input</small></div><div><b>'+aiFmtN(P.out)+'</b><small>output</small></div></div>'+
      '<p class="note">Today '+aiFmtN(tot(AIS.today))+' tokens — this month '+aiFmtN(monthTot)+' tokens</p>'+
      '<div class="ubars" aria-label="Tokens per day, last 14 days">'+days.map(function(k){ var v=tot(k); return '<span style="height:'+Math.max(v?6:2,v/max*100)+'%" class="'+(v?'':'zero')+'" title="'+k+': '+v+' tokens"></span>'; }).join('')+'</div>'+
      '<div class="ubars-l"><span>2 weeks ago</span><span>Today</span></div>'+
      '<table class="utab"><tr><th>Feature</th><th>Requests</th><th>In</th><th>Out</th></tr>'+rows(P.features,function(k){ return AI_FEAT[k]||k; })+'</table>'+
      '<table class="utab"><tr><th>Model</th><th>Requests</th><th>In</th><th>Out</th></tr>'+rows(P.models,function(k){ return k; })+'</table></div>';
  }
  function renderAI(){
    var el=aiSheet(), keep=el.scrollTop;
    el.classList.toggle('open',aiIsOpen);
    if(!aiIsOpen) return;
    if(!AIS){ el.innerHTML='<div class="sh-head"><h2>AI</h2><button class="link" data-aiact="aiclose">Done</button></div><div class="sh-body"><p class="muted pad">Loading…</p></div>'; return; }
    var A=AIS;
    var card=function(p){
      var key=A.keys[p], ml=(A.models[p]||{}).list||[], cur=A.model[p];
      var opts=ml.some(function(m){ return m.id===cur; })?ml:[{id:cur,name:cur}].concat(ml);   // keep the chosen model visible
      return '<div class="aicard '+(A.provider===p?'active':'')+'">'+
        '<div class="aic-h"><b>'+AI_PN[p]+'</b>'+(A.provider===p?'<span class="badge-ai">In use</span>':key?'<button class="sm" data-aiact="aiprov" data-v="'+p+'">Use '+AI_PN[p]+'</button>':'')+'</div>'+
        '<div class="aic-row"><span class="lbl">API key</span>'+(key?'<code>'+aiEsc(key)+'</code>':'<span class="muted">Not set</span>')+'</div>'+
        '<div class="aic-btns"><button class="sm '+(key?'':'primary')+'" data-aiact="aikey" data-v="'+p+'">'+(key?'Change key':'Add key')+'</button>'+
          (key?'<button class="sm" data-aiact="aitest" data-v="'+p+'">Test connection</button><button class="sm danger '+(aiArmed==='rm'+p?'armed':'')+'" data-aiact="airm" data-v="'+p+'">'+(aiArmed==='rm'+p?'Confirm':'Remove')+'</button>':'')+'</div>'+
        '<label class="aic-row lbl" for="ms-'+p+'">Model</label>'+
        '<select id="ms-'+p+'" class="modelsel" data-p="'+p+'">'+opts.map(function(m){ return '<option value="'+aiEsc(m.id)+'" '+(m.id===cur?'selected':'')+'>'+aiEsc(m.name)+(m.name!==m.id?' — '+aiEsc(m.id):'')+'</option>'; }).join('')+'</select>'+
        '<div class="aic-btns"><button class="sm" data-aiact="aimodels" data-v="'+p+'" '+(key&&!aiLoading[p]?'':'disabled')+'>'+(aiLoading[p]?'Loading…':ml.length?'Refresh model list':'Load my models')+'</button>'+
          '<span class="note">'+(ml.length?ml.length+' models, updated '+aiRel(A.models[p].at):key?'Loads the models your key can use':'Add a key to load models')+'</span></div>'+
      '</div>';
    };
    var order=A.provider==='openai'?['openai','anthropic']:['anthropic','openai'];
    var used=Object.keys(A.usage.p).filter(function(p){ return A.usage.p[p].calls; });
    var jobs=AI_JOBS.length?AI_JOBS.map(function(j){
        return '<div class="srow"><div class="grow"><b>'+aiEsc(j.title)+'</b><small class="muted">'+aiEsc(j.text)+'</small></div>'+
          '<button class="switch '+(A.ai?'on':'')+'" data-aiact="aitoggle" aria-label="'+aiEsc(j.title)+'"></button></div>'; }).join('')
      :'<p class="muted pad"></p>';
    el.innerHTML='<div class="sh-head"><h2>AI</h2><button class="link" data-aiact="aiclose">Done</button></div><div class="sh-body">'+
      '<p class="hint">Keys stay in this iPhone’s Keychain. Only the provider marked “In use” is called.</p>'+
      order.map(card).join('')+
      '<h3 class="sec">What AI does</h3>'+jobs+
      '<h3 class="sec">Token usage</h3>'+
      (used.length?used.map(function(p){ return aiUsageBlock(p,A.usage.p[p]); }).join(''):'<p class="muted pad">No AI requests yet.</p>')+
      (used.length?'<div class="aic-btns"><span class="note">Counting since '+new Date(A.usage.since).toLocaleDateString(undefined,{month:'long',day:'numeric',year:'numeric'})+'</span>'+
        '<button class="sm danger '+(aiArmed==='reset'?'armed':'')+'" data-aiact="usagereset">'+(aiArmed==='reset'?'Confirm reset':'Reset counters')+'</button></div>':'')+
    '</div>';
    el.scrollTop=keep;   // re-renders must not jump the user back to the top
  }
  function aiClick(e){
    e.stopPropagation();   // the sheet's taps never reach the app's own click handler
    if(e.target.closest('select, option, input, textarea')) return;
    var t=e.target.closest('[data-aiact]'); if(!t||t.disabled) return;
    var act=t.getAttribute('data-aiact'), v=t.getAttribute('data-v');
    if(act==='aiclose'){ aiIsOpen=false; aiArmed=null; renderAI(); return; }
    if(act==='aikey'||act==='aitest'||act==='aiprov'||act==='aitoggle'){ if(act==='aitest') window.__aiToast('Testing '+AI_PN[v]+'…'); aiSend(act,{v:v}); return; }
    if(act==='aimodels'){ aiLoading[v]=1; renderAI(); aiSend('aimodels',{v:v}); return; }
    if(act==='airm'){ if(aiArmed==='rm'+v){ aiArmed=null; aiSend('airm',{v:v}); } else aiArm('rm'+v); return; }
    if(act==='usagereset'){ if(aiArmed==='reset'){ aiArmed=null; aiSend('usagereset',{}); } else aiArm('reset'); return; }
  }
  // Keys and the background switch changed in AI settings apply straight away.
  window.__aiChanged = (s) => {
    const changed = S.ai.hasKey !== s.hasKey || S.ai.bg !== s.ai;
    S.ai.hasKey = s.hasKey;
    S.ai.bg = s.ai;
    if (!s.hasKey && (S.trainView === "ai" || S.trainView === "plan") && !S.plan) S.trainView = "home";
    if (changed) render();
    const st = document.getElementById("s-aistatus"), P = s.usage.p[s.provider];   // the AI settings row in Settings
    if (st) st.textContent = s.hasKey ? `${AI_PN[s.provider]} — ${s.model[s.provider]}${P && P.calls ? ` — ${aiFmtN(P.in + P.out)} tokens used` : ""}` : "Add a Claude or OpenAI key for the AI coach";
  };

  // The in-app updates blueprint's name for the update hook (HG.showUpdate stays for older callers).
  window.__showUpdate = (u) => HG.showUpdate(u);

  // ------------------------------------------------ Settings (app-blueprints · settings): every change applies at once and is saved; Done closes
  const EQ_NAMES = { "body only": "Body weight", dumbbell: "Dumbbells", barbell: "Barbell", bands: "Bands", kettlebells: "Kettlebells", "e-z curl bar": "E-Z curl bar", "medicine ball": "Medicine ball", "exercise ball": "Exercise ball", "foam roll": "Foam roller", other: "Other" };
  const LOOK = Object.assign({ theme: "auto", density: "comfortable", font: "sans", textSize: 1 }, BOOT.look || {});
  let SET = null, cfgOpen = false, cfgArmed = false;
  const darkMQ = window.matchMedia ? matchMedia("(prefers-color-scheme: dark)") : { matches: false };
  function applyLook() {
    const root = document.documentElement;
    root.dataset.theme = LOOK.theme === "auto" ? (darkMQ.matches ? "night" : "ink") : LOOK.theme;
    root.dataset.font = LOOK.font;
    root.style.setProperty("--ts", LOOK.textSize);
    document.body.classList.remove("d-comfortable", "d-compact", "d-tiny");
    document.body.classList.add("d-" + LOOK.density);
  }
  const onDark = () => { if (LOOK.theme === "auto") applyLook(); };
  if (darkMQ.addEventListener) darkMQ.addEventListener("change", onDark); else if (darkMQ.addListener) darkMQ.addListener(onDark);
  const cfgSheet = () => {
    let el = document.getElementById("cfgsheet");
    if (!el) {
      el = document.createElement("div"); el.id = "cfgsheet"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Settings");
      document.body.appendChild(el);
      el.addEventListener("click", cfgClick);
      el.addEventListener("change", cfgChange);
    }
    return el;
  };
  const cfgItem = (k) => { for (const sec of SET.cfgSchema) for (const d of sec.items) if (d.k === k) return d; return null; };
  const cfgChanged = (k) => { const d = cfgItem(k); return !!d && JSON.stringify(SET.cfg[k]) !== JSON.stringify(d.def); };
  const fmtCfg = (d, v) => (d.step && d.step < 1 ? Number(v).toFixed(String(d.step).split(".")[1].length) : String(v));
  const segRow = (k, opts, cur, act) => `<div class="seg wide">${opts.map(([v, l]) => `<button class="${String(cur) === String(v) ? "on" : ""}" data-act="${act || "look"}" data-k="${k}" data-v="${v}">${esc(l)}</button>`).join("")}</div>`;
  function lookHTML() {
    const P = SET.palettes, themes = [["auto", "Auto"]].concat(Object.keys(P).map((k) => [k, k[0].toUpperCase() + k.slice(1)]));
    return `<div class="lk-row"><span class="lk-l">Colours</span><div class="sws">${themes.map(([k, l]) => {
        const st = k === "auto" ? `background:linear-gradient(135deg,${P.ink.paper} 50%,${P.night.sheet} 50%);color:${P.night.signal}` : `background:${P[k].paper};color:${P[k].ink}`;
        return `<button class="sw ${LOOK.theme === k ? "on" : ""}" data-act="look" data-k="theme" data-v="${k}" aria-label="${l} colours"><span class="prev" style="${st}">Aa<i style="background:${(P[k] || P.night).signal}"></i></span><small>${l}</small></button>`;
      }).join("")}</div></div>
      <div class="lk-row"><span class="lk-l">Layout</span>${segRow("density", [["comfortable", "Comfortable"], ["compact", "Compact"], ["tiny", "Tiny"]], LOOK.density)}</div>
      <div class="lk-row"><span class="lk-l">Text size</span>${segRow("textSize", [[0.92, "Small"], [1, "Default"], [1.12, "Large"], [1.25, "Larger"]], LOOK.textSize)}</div>
      <div class="lk-row"><span class="lk-l">Headline font</span>${segRow("font", [["sans", "Sans serif"], ["serif", "Serif"]], LOOK.font)}</div>`;
  }
  const swRow = (k, label, help, on, act) => `<div class="srow"><div class="grow"><b>${esc(label)}</b>${help ? `<small>${esc(help)}</small>` : ""}</div><button class="switch ${on ? "on" : ""}" data-act="${act || "toggle"}" data-v="${esc(k)}" aria-label="${esc(label)}"></button></div>`;
  function fieldHTML(d) {
    const v = SET.cfg[d.k], ch = cfgChanged(d.k);
    const reset = ch ? `<button class="link small" data-act="cfgreset" data-k="${d.k}">Reset</button>` : "";
    const head = `<div class="cfg-h"><b>${esc(d.label)}</b>${reset}</div>${d.help ? `<small class="muted">${esc(d.help)}</small>` : ""}`;
    return `<div class="cfg ${ch ? "ch" : ""}">${head}
      <div class="stepper"><button data-act="cfgstep" data-k="${d.k}" data-v="-1" aria-label="Decrease" ${v <= d.min ? "disabled" : ""}>−</button>
      <input class="cfgin" data-k="${d.k}" value="${fmtCfg(d, v)}" inputmode="decimal" aria-label="${esc(d.label)}">
      <button data-act="cfgstep" data-k="${d.k}" data-v="1" aria-label="Increase" ${v >= d.max ? "disabled" : ""}>+</button>
      <span class="unit">${esc(d.unit || "")}</span><span class="range">${fmtCfg(d, d.min)}–${fmtCfg(d, d.max)}${ch ? ` — original ${fmtCfg(d, d.def)}` : ""}</span></div></div>`;
  }
  const bpLink = (b) => `${SET.blueprintsRepo}/blob/${b.id}-v${b.version}/blueprints/${b.id}.md`;
  function builtWithHTML() {
    return `<h3 class="sec">Built with</h3><p class="hint">${esc(SET.appName)} is built from shared blueprints that the other apps use too. Tap one to read how that part works.</p>
      ${SET.blueprints.map((b) => `<button class="srow bp" data-act="openurl" data-v="${esc(bpLink(b))}"><div class="grow"><b>${esc(b.name)}</b><small class="muted">Blueprint ${esc(b.version)} · since ${esc(SET.appName)} ${esc(b.since)}</small></div><span class="chev" aria-hidden="true">›</span></button>`).join("")}
      <button class="srow bp" data-act="openurl" data-v="${esc(SET.blueprintsRepo)}"><div class="grow"><b>All blueprints</b><small class="muted">${esc(SET.blueprintsRepo.replace("https://", ""))}</small></div><span class="chev" aria-hidden="true">›</span></button>`;
  }
  let libDirty = false;
  function renderCfg() {
    const el = cfgSheet(), keep = el.scrollTop;
    el.classList.toggle("open", cfgOpen);
    document.body.style.overflow = cfgOpen ? "hidden" : "";
    if (!cfgOpen || !SET) return;
    const s = SET.settings, changed = Object.keys(SET.cfg).filter(cfgChanged).length;
    el.innerHTML = `<div class="sh-head"><h2>Settings</h2><button class="link" data-act="cfgclose">Done</button></div><div class="sh-body">
      <p class="hint">Changes apply right away and are kept on this iPhone.</p>
      <h3 class="sec">Appearance</h3>${lookHTML()}
      <h3 class="sec">Workout</h3>
      <div class="lk-row"><span class="lk-l">Weight unit</span>${segRow("unit", [["kg", "kg"], ["lb", "lb"]], s.unit, "set")}<small class="muted">The app redraws in this unit when you close Settings</small></div>
      <h3 class="sec">Library</h3>
      <p class="hint">Equipment you own. Exercises for it appear in the library.</p>
      ${SET.equipmentAll.map((q) => swRow(q, EQ_NAMES[q] || q, "", s.equipment.includes(q), "equip")).join("")}
      ${swRow("strongman", "Strongman exercises", "Need special gear", s.strongman)}
      ${swRow("olympic", "Olympic weightlifting", "Need a platform and a coach", s.olympic)}
      ${libDirty ? `<div class="srow"><div class="grow"><b>Download photos for new equipment</b><small>The library updates when you close Settings; photos need a download</small></div><button class="sm" data-act="sync">Update library</button></div>` : ""}
      <h3 class="sec">History</h3>
      ${swRow("icloudBackup", "Back up history to iCloud Drive", "iCloud Drive › Scriptable › Go2FGym-backup", s.icloudBackup)}
      <h3 class="sec">AI coach</h3>
      <div class="srow"><div class="grow"><b>Keys, models and token usage</b><small id="s-aistatus">${esc(SET.hasKey ? SET.aiStatus : "Add a Claude or OpenAI key for the AI coach")}</small></div><button class="sm" data-act="ai-open">AI settings</button></div>
      <div class="lk-row"><span class="lk-l">Default Strava post tone</span>${segRow("stravaMode", [["serious", "Serious"], ["funny", "Funny"], ["neutral", "Neutral"]], s.stravaMode, "set")}</div>
      <h3 class="sec">Updates</h3>
      ${swRow("checkUpdates", "Offer new versions", `You have Go2FGym ${SET.version}. “Later” waits two days.`, s.checkUpdates)}
      <div class="srow"><div class="grow"><b>Check for updates now</b><small id="updmsg" class="muted" aria-live="polite"></small></div><button class="sm" data-act="updcheck">Check</button></div>
      ${SET.cfgSchema.map((sec) => `<h3 class="sec">${esc(sec.title)}</h3>${sec.items.map(fieldHTML).join("")}`).join("")}
      <div class="cfg-foot"><span class="note">${changed ? `${changed} setting${changed === 1 ? "" : "s"} changed` : "All settings are at their original values"}</span>
        ${changed ? `<button class="sm danger ${cfgArmed ? "armed" : ""}" data-act="cfgall">${cfgArmed ? "Confirm reset" : "Reset all"}</button>` : ""}</div>
      ${builtWithHTML()}</div>`;
    el.scrollTop = keep;   // re-renders must not jump back to the top
  }
  function openSettings() { if (cfgOpen) return; cfgOpen = true; libDirty = false; send("settings-get", {}); renderCfg(); }
  function closeSettings() { cfgOpen = false; cfgArmed = false; renderCfg(); send("settings-done", {}); }
  function cfgClick(e) {
    e.stopPropagation();   // the sheet's taps never reach the app's own click handler
    if (e.target.closest("select, option, input, textarea")) return;
    const t = e.target.closest("[data-act]"); if (!t || t.disabled) return;
    const act = t.dataset.act, v = t.dataset.v, k = t.dataset.k;
    if (act === "cfgclose") return closeSettings();
    if (act === "look") { const val = k === "textSize" ? +v : v; LOOK[k] = val; applyLook(); renderCfg(); return send("set", { k, v: val }); }
    if (act === "set") { SET.settings[k] = v; renderCfg(); return send("set", { k, v }); }
    if (act === "toggle") { SET.settings[v] = !SET.settings[v]; if (v === "strongman" || v === "olympic") libDirty = true; renderCfg(); return send("set", { k: v, v: SET.settings[v] }); }
    if (act === "equip") { libDirty = true; return send("equip", { v }); }
    if (act === "cfgreset") return send("cfg", { k, reset: 1 });
    if (act === "cfgstep") { const d = cfgItem(k), step = d.step || 1; SET.cfg[k] = Number(Math.min(d.max, Math.max(d.min, Number(SET.cfg[k]) + step * +v)).toFixed(2)); renderCfg(); return send("cfg", { k, v: SET.cfg[k] }); }
    if (act === "cfgall") {
      if (cfgArmed) { cfgArmed = false; return send("cfg", { k: "*" }); }
      cfgArmed = true; renderCfg(); setTimeout(() => { if (cfgArmed) { cfgArmed = false; renderCfg(); } }, 3500); return;
    }
    if (act === "ai-open") return window.__aiOpen();
    if (act === "openurl") return send("openurl", { v });
    if (act === "updcheck") { const um = document.getElementById("updmsg"); t.disabled = true; if (um) um.textContent = "Checking…"; return send("update-check", {}); }
    if (act === "sync") { closeSettings(); return send("sync", {}); }
  }
  function cfgChange(e) {
    e.stopPropagation();
    if (e.target.classList.contains("cfgin")) send("cfg", { k: e.target.dataset.k, v: e.target.value });
  }
  applyLook();

  // ------------------------------------------------ AI coach
  const INTENSITY = [
    { key: "easy", label: "Easy" },
    { key: "moderate", label: "Moderate" },
    { key: "hard", label: "Hard" },
  ];
  const GROUP_KEYS = GROUPS.map((g) => g.key);
  const libEquipment = () => [...new Set(S.lib.map((e) => e.eq))];
  const isoDay = (d) => new Date(d).toISOString().slice(0, 10);
  const groupOf = (id) => { const ex = S.byId[id]; return ex ? GROUP_OF[ex.pm[0]] : null; };
  const setsText = (sets) => sets.map((x) => (x.w ? `${x.w}${UNIT}x${x.r}` : `${x.r} reps`)).join(", ");

  let aiSeq = 0;
  const aiWaiting = {};
  function aiCall(name, instructions, input, schema) {
    return new Promise((resolve) => {
      const rid = `r${++aiSeq}`;
      aiWaiting[rid] = resolve;
      send("ai", { rid, name, instructions, input: JSON.stringify(input), schema });
    });
  }

  function groupStats(days, excludeId) {
    const since = Date.now() - days * 864e5;
    const out = {};
    GROUPS.forEach((g) => (out[g.key] = { group: g.key, sets: 0, sessions: 0, last: null }));
    S.history.sessions.filter((s) => s.id !== excludeId).forEach((s) => {
      const touched = new Set();
      s.entries.forEach((en) => {
        const g = groupOf(en.id);
        if (!g) return;
        touched.add(g.key);
        if (new Date(s.start) >= since) out[g.key].sets += en.sets.length;
      });
      touched.forEach((k) => {
        if (new Date(s.start) >= since) out[k].sessions++;
        if (!out[k].last || s.start > out[k].last) out[k].last = s.start;
      });
    });
    return Object.values(out).map((o) => ({
      group: o.group, [`sets_last_${days}_days`]: o.sets, [`sessions_last_${days}_days`]: o.sessions,
      days_since_trained: o.last ? Math.floor((Date.now() - new Date(o.last)) / 864e5) : null,
    }));
  }
  function previousFor(id, before) {
    const s = sessionsDesc().find((x) => x.start < before && x.entries.some((en) => en.id === id && en.sets.length));
    return s ? { date: isoDay(s.start), sets: setsText(s.entries.find((en) => en.id === id).sets) } : null;
  }

  const PLAN_INSTRUCTIONS = [
    "You are a careful, practical strength coach planning one home workout.",
    "Use ONLY exercises from the candidates list and reference each by its exact id. Never invent ids.",
    "Fit the time budget: about 5 minutes of warm-up, then roughly 2 to 3 minutes per working set including rest.",
    "Put big compound movements first, isolation and core last. Usually 4 to 7 exercises.",
    "If target is 'auto', choose the muscle groups that are most due based on recent_training (longest rest, fewest sets), and balance push, pull, legs and core.",
    "Avoid loading a group hard if it was trained in the last 48 hours unless the user asked for it.",
    "Respect the user's note. If it mentions pain or an injury, avoid loading that area and keep everything light.",
    "Intensity: easy = 2 sets of 12 to 15 reps, about 3 reps in reserve; moderate = 3 sets of 8 to 12, 2 reps in reserve; hard = 3 to 4 sets of 6 to 10, 1 rep in reserve.",
    "Weights: when a candidate shows the user's last performance, keep that weight or progress by at most about 5 percent if all reps were done. With no history set weight_kg to null and tell them to pick a weight that leaves 2 to 3 reps in reserve. Bodyweight exercises have weight_kg null.",
    "rest_seconds between 45 and 180. Each note is one short practical form cue, at most 15 words.",
    "Write title (max 5 words), summary (one sentence on the focus and why), warmup and cooldown (one or two sentences each) in plain English. Units are kilograms.",
  ].join(" ");
  const PLAN_SCHEMA = {
    type: "object", additionalProperties: false,
    required: ["title", "summary", "estimated_minutes", "warmup", "cooldown", "exercises"],
    properties: {
      title: { type: "string" }, summary: { type: "string" }, estimated_minutes: { type: "integer" },
      warmup: { type: "string" }, cooldown: { type: "string" },
      exercises: { type: "array", items: {
        type: "object", additionalProperties: false,
        required: ["id", "sets", "reps", "rest_seconds", "weight_kg", "note"],
        properties: {
          id: { type: "string" }, sets: { type: "integer" }, reps: { type: "integer" },
          rest_seconds: { type: "integer" }, weight_kg: { type: ["number", "null"] }, note: { type: "string" },
        },
      } },
    },
  };

  const REVIEW_INSTRUCTIONS = [
    "You are a supportive but honest strength coach reviewing a home workout that was just logged.",
    "Base everything on the data given. Never invent numbers or exercises.",
    "headline: one encouraging sentence that names something specific from the workout.",
    "went_well: 1 to 3 points, e.g. progress versus the previous time (compare weights and reps in previous).",
    "watch_out: 0 to 3 points, e.g. a drop in reps, a very high or low volume, an imbalance such as lots of push and no pull. Empty if nothing stands out.",
    "focus_next: 2 to 4 muscle groups to prioritise in the next sessions, chosen from undertrained groups in last_4_weeks and balance (push/pull, upper/lower, core), with intensity light, moderate or hard and a sensible number of working sets for one session.",
    "Do not put a group that was trained hard today in focus_next with hard intensity.",
    "recovery: one sentence on when today's muscles are ready again (typically 48 to 72 hours).",
    "next_workout: the groups for the next session, when (e.g. 'Tomorrow' or 'In 2 days'), and a one-sentence idea.",
    "Keep every string under 25 words. Plain English. This is not medical advice; if anything suggests pain, recommend rest and a professional.",
  ].join(" ");
  const REVIEW_SCHEMA = {
    type: "object", additionalProperties: false,
    required: ["headline", "went_well", "watch_out", "focus_next", "recovery", "next_workout"],
    properties: {
      headline: { type: "string" },
      went_well: { type: "array", items: { type: "string" } },
      watch_out: { type: "array", items: { type: "string" } },
      focus_next: { type: "array", items: {
        type: "object", additionalProperties: false, required: ["group", "intensity", "sets", "why"],
        properties: {
          group: { type: "string", enum: GROUP_KEYS },
          intensity: { type: "string", enum: ["light", "moderate", "hard"] },
          sets: { type: "integer" }, why: { type: "string" },
        },
      } },
      recovery: { type: "string" },
      next_workout: {
        type: "object", additionalProperties: false, required: ["groups", "when", "idea"],
        properties: { groups: { type: "array", items: { type: "string", enum: GROUP_KEYS } }, when: { type: "string" }, idea: { type: "string" } },
      },
    },
  };

  function openBuilder(groups) {
    const eqs = libEquipment();
    S.builder.groups = (groups || [...S.groups]).filter((k) => GROUP_KEYS.includes(k));
    S.builder.equipment = S.builder.equipment.filter((q) => eqs.includes(q));
    if (!S.builder.equipment.length) S.builder.equipment = eqs;
    S.tab = "train";
    S.detailId = null;
    S.trainView = "ai";
    render();
  }

  async function buildPlan() {
    if (S.aiBusy) return;
    const b = S.builder;
    const muscles = (b.groups.length ? GROUPS.filter((g) => b.groups.includes(g.key)) : GROUPS).flatMap((g) => g.muscles);
    const cands = S.lib.filter((e) => b.equipment.includes(e.eq) && e.cat !== "stretching" && e.pm.some((m) => muscles.includes(m)));
    if (!cands.length) {
      S.trainView = "ai";
      render();
      return toast("No exercises match that equipment and those muscles.", true);
    }
    const now = new Date().toISOString();
    const input = {
      today: isoDay(now),
      request: {
        target: b.groups.length ? b.groups : "auto",
        equipment: b.equipment.map((q) => EQ_LABEL[q] || q),
        minutes: b.minutes, intensity: b.intensity, note: b.note.trim() || null,
      },
      recent_training: groupStats(14),
      last_sessions: sessionsDesc().slice(0, 5).map((s) => ({
        date: isoDay(s.start), groups: s.groups, exercises: s.entries.map((en) => `${en.name}: ${setsText(en.sets)}`),
      })),
      candidates: cands.map((e) => {
        const prev = previousFor(e.id, now);
        return [e.id, e.n, EQ_LABEL[e.eq] || e.eq, e.lv, e.mech || "", e.pm.join("/"), prev ? `last ${prev.date}: ${prev.sets}` : ""].join(" | ");
      }),
    };
    S.aiBusy = "plan";
    render();
    const res = await aiCall("workout_plan", PLAN_INSTRUCTIONS, input, PLAN_SCHEMA);
    S.aiBusy = null;
    if (!res) {
      if (!S.plan) S.trainView = "ai";
      return render();
    }
    const clamp = (n, lo, hi, d) => (Number.isFinite(+n) ? Math.min(hi, Math.max(lo, Math.round(+n))) : d);
    const seen = new Set();
    const exercises = (res.exercises || []).filter((x) => S.byId[x.id] && !seen.has(x.id) && seen.add(x.id)).map((x) => ({
      id: x.id, name: S.byId[x.id].n,
      sets: clamp(x.sets, 1, 6, 3), reps: clamp(x.reps, 1, 50, 10), rest: clamp(x.rest_seconds, 30, 240, CFG.rest),
      w: x.weight_kg > 0 ? Math.round(x.weight_kg * 2) / 2 : null, note: String(x.note || "").slice(0, 140),
    }));
    if (!exercises.length) {
      toast("The AI coach didn't return usable exercises. Try again.", true);
      if (!S.plan) S.trainView = "ai";
      return render();
    }
    S.plan = {
      title: String(res.title || "Your workout").slice(0, 60), summary: String(res.summary || ""),
      minutes: clamp(res.estimated_minutes, 5, 180, b.minutes), warmup: String(res.warmup || ""), cooldown: String(res.cooldown || ""),
      exercises, by: res._by || "",
    };
    S.trainView = "plan";
    render();
  }

  function startPlan() {
    const p = S.plan;
    const groups = [];
    p.exercises.forEach((x) => { const g = groupOf(x.id); if (g && !groups.includes(g.key)) groups.push(g.key); });
    S.session = {
      id: uid(), start: new Date().toISOString(), groups, title: p.title,
      entries: p.exercises.map((x) => ({
        id: x.id, name: x.name, rest: x.rest, note: x.note,
        sets: Array.from({ length: x.sets }, () => ({ w: x.w, r: x.reps, done: false })),
      })),
    };
    saveDraft();
    S.trainView = "home";
    S.tab = "workout";
    render();
    toast("Workout ready. Go!");
  }

  async function analyze(id) {
    const s = S.history.sessions.find((x) => x.id === id);
    if (!s || S.aiBusy) return;
    if (!S.ai.hasKey) return toast("Add a Claude or OpenAI key in AI settings first.", true);
    const input = {
      today: isoDay(new Date()),
      workout: {
        date: isoDay(s.start), title: s.title || null,
        duration_minutes: s.end ? minutesBetween(s.start, s.end) : null,
        exercises: s.entries.map((en) => {
          const ex = S.byId[en.id];
          const g = groupOf(en.id);
          return {
            name: en.name, group: g ? g.key : null, muscles: ex ? ex.pm : [], level: ex ? ex.lv : null,
            sets: setsText(en.sets), previous: previousFor(en.id, s.start),
          };
        }),
      },
      last_4_weeks: groupStats(28, s.id),
      equipment: libEquipment().map((q) => EQ_LABEL[q] || q),
    };
    S.aiBusy = `an:${id}`;
    render();
    const res = await aiCall("workout_review", REVIEW_INSTRUCTIONS, input, REVIEW_SCHEMA);
    S.aiBusy = null;
    const s2 = S.history.sessions.find((x) => x.id === id);
    if (res && s2) {
      const s = s2;
      const str = (v) => String(v || "").slice(0, 240);
      const arr = (v) => (Array.isArray(v) ? v.map(str).filter(Boolean).slice(0, 4) : []);
      s.ai = {
        at: new Date().toISOString(), headline: str(res.headline), went_well: arr(res.went_well), watch_out: arr(res.watch_out),
        focus_next: (res.focus_next || []).filter((f) => GROUP_KEYS.includes(f.group)).slice(0, 4).map((f) => ({
          group: f.group, intensity: ["light", "moderate", "hard"].includes(f.intensity) ? f.intensity : "moderate",
          sets: Math.max(1, Math.min(20, Math.round(+f.sets || 3))), why: str(f.why),
        })),
        recovery: str(res.recovery), by: res._by || "",
        next: {
          groups: ((res.next_workout || {}).groups || []).filter((k) => GROUP_KEYS.includes(k)),
          when: str((res.next_workout || {}).when), idea: str((res.next_workout || {}).idea),
        },
      };
      send("save", { session: s });
      S.openSession = id;
    }
    render();
  }

  function keyBox() {
    return `<div class="keybox"><p class="small"><b>Connect the AI coach.</b> Add a Claude or OpenAI key in AI settings. It stays in this iPhone's Keychain and is only sent to that provider.</p>
      <div class="keyrow"><button class="chip" data-a="aisettings">AI settings</button></div></div>`;
  }

  function renderBuilder() {
    const b = S.builder;
    const busy = S.aiBusy === "plan";
    const bchip = (v, on, label) => `<button class="chip" data-a="b-chip" data-v="${esc(v)}" aria-pressed="${on}">${esc(label)}</button>`;
    return `<header class="bar"><button class="back" data-a="home">‹ Muscles</button>
        <button class="hbtn${busy ? " busy" : ""}" data-a="build" ${busy || !S.ai.hasKey || !b.equipment.length ? "disabled" : ""}>${busy ? "Building…" : "Build workout"}</button></header>
      <h1 class="title">Build my workout</h1>
      <p class="lead">Tell the AI coach what you want. It picks exercises from your library, sets weights from your history and fits it all into your time.</p>
      <h2>What to train</h2>
      <div class="chips wrap">${bchip("auto", !b.groups.length, "Let AI decide")}${GROUPS.map((g) => bchip(`g:${g.key}`, b.groups.includes(g.key), g.label)).join("")}</div>
      <h2>Equipment you have</h2>
      <div class="chips wrap">${libEquipment().map((q) => bchip(`e:${q}`, b.equipment.includes(q), EQ_LABEL[q] || cap(q))).join("")}</div>
      <h2>Time</h2>
      <div class="seg seg4">${[20, 30, 45, 60].map((m) => `<button data-a="b-min" data-v="${m}" aria-pressed="${b.minutes === m}">${m} min</button>`).join("")}</div>
      <h2>Intensity</h2>
      <div class="seg">${INTENSITY.map((i) => `<button data-a="b-int" data-v="${i.key}" aria-pressed="${b.intensity === i.key}">${i.label}</button>`).join("")}</div>
      <h2>Anything else?</h2>
      <textarea class="search" data-in="b-note" rows="2" placeholder="Optional, e.g. lower back is a bit sore, or I want to get better at bench press">${esc(b.note)}</textarea>
      ${S.ai.hasKey ? "" : keyBox()}
      <p class="muted small">${busy ? "<b>Building your workout…</b> " : ""}${S.ai.hasKey ? "Tap <b>Build workout</b> at the top when you're ready. " : "Add a key in AI settings to enable <b>Build workout</b>. "}AI suggestions can be wrong. Check every weight before you lift it.</p>`;
  }

  function renderBuilding() {
    const b = S.builder;
    const labels = b.groups.length ? b.groups.map((k) => GROUPS.find((g) => g.key === k).label).join(" + ") : "Muscles picked by the AI";
    const level = (INTENSITY.find((i) => i.key === b.intensity) || INTENSITY[1]).label.toLowerCase();
    return `<header class="bar"><button class="back" data-a="b-edit">‹ Options</button></header>
      <p class="kicker">✨ Your AI coach</p>
      <h1 class="title busy">Building your next workout…</h1>
      <p class="lead"><b>${esc(labels)}</b>, about ${b.minutes} min, ${level}${b.why ? `, based on ${esc(b.why)}` : ""}. Weights come from your last sessions.</p>
      <div class="list skel">${[0, 1, 2, 3].map(() => `<div class="ex plan-ex"><div class="thumb"></div><div><div class="sk sk1"></div><div class="sk sk2"></div></div></div>`).join("")}</div>
      <p class="muted small">This usually takes a few seconds. Tap Settings to change the choices.</p>`;
  }

  function renderPlan() {
    const p = S.plan;
    if (!p) return S.aiBusy === "plan" ? renderBuilding() : renderBuilder();
    const busy = S.aiBusy === "plan";
    const total = p.exercises.reduce((n, x) => n + x.sets, 0);
    const replacing = S.session && S.session.entries.length;
    const rows = p.exercises.map((x) => `<div class="ex plan-ex pv-row" data-a="open" data-v="${esc(x.id)}">
        <div class="thumb" data-id="${esc(x.id)}">${imgTag(x.id, 0)}<span>${esc(initials(x.name))}</span></div>
        <div><div class="ex-name">${esc(x.name)}</div>
        <div class="ex-meta"><b>${x.sets} × ${x.reps}${x.w ? ` at ${fmtNum(x.w)} ${UNIT}` : ""}</b>, rest ${x.rest} s</div>
        ${x.note ? `<div class="ex-meta">${esc(x.note)}</div>` : ""}</div>
        <button class="pv-btn" data-a="preview" data-v="${esc(x.id)}" aria-label="Preview ${esc(x.name)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg></button></div>`).join("");
    return `<header class="bar"><button class="back" data-a="b-edit">‹ Options</button>
        <button class="hbtn${S.armed === "plan-start" ? " armed" : ""}" data-a="plan-start">${S.armed === "plan-start" ? "Tap to replace" : "Start ›"}</button></header>
      <p class="kicker"><span class="badge-ai">${esc(p.by ? `✦ AI workout by ${p.by}` : "✦ AI workout")}</span></p>
      <h1 class="title">${esc(p.title)}</h1>
      <p class="lead">${esc(p.summary)}</p>
      <p class="muted small">About ${p.minutes} min, ${plural(p.exercises.length, "exercise")}, ${plural(total, "set")}.</p>
      ${p.warmup ? `<h2>Warm-up</h2><p>${esc(p.warmup)}</p>` : ""}
      <h2>Exercises</h2><div class="list">${rows}</div>
      ${p.cooldown ? `<h2>Cool-down</h2><p>${esc(p.cooldown)}</p>` : ""}
      <button class="primary${S.armed === "plan-start" ? " armed" : ""}" data-a="plan-start">${S.armed === "plan-start" ? "Tap again to replace your current workout" : "Start this workout"}</button>
      <button class="secondary" data-a="plan-start-add">Start and add exercises</button>
      <button class="secondary${busy ? " busy" : ""}" data-a="build" ${busy ? "disabled" : ""}>${busy ? "Building another…" : "Build another"}</button>
      <p class="muted small">${replacing ? "Starting replaces the workout in progress. " : ""}Weights without history are left for you to choose. AI suggestions can be wrong.</p>`;
  }

  function renderAnalysis(s) {
    const busy = S.aiBusy === `an:${s.id}`;
    if (!s.ai && !S.ai.hasKey) return "";   // the AI coach is hidden without a key
    if (!s.ai)
      return `<button class="ai-btn${busy ? " busy" : ""}" data-a="analyze" data-v="${esc(s.id)}" ${busy || S.aiBusy ? "disabled" : ""}>${busy ? "Your AI coach is reviewing this workout…" : "✨ Analyze with AI coach"}</button>`;
    const a = s.ai;
    const list = (title, items) => (items.length ? `<h3>${title}</h3><ul>${items.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : "");
    const focus = a.focus_next.map((f) => {
      const g = GROUPS.find((x) => x.key === f.group);
      return `<div class="focus-row"><div class="focus-top"><i class="dot pl-${g.plate}"></i><b>${g.label}</b>
        <span class="int int-${f.intensity}">${cap(f.intensity)}, ${plural(f.sets, "set")}</span></div>
        <p class="muted small">${esc(f.why)}</p></div>`;
    }).join("");
    const nextLabels = a.next.groups.map((k) => GROUPS.find((g) => g.key === k).label).join(" + ");
    return `<div class="coach">
      <p class="kicker"><span class="badge-ai">${esc(a.by ? `✦ AI review by ${a.by}` : "✦ AI review")}</span></p>
      <p class="coach-h">${esc(a.headline)}</p>
      ${list("Went well", a.went_well)}${list("Watch", a.watch_out)}
      ${focus ? `<h3>Focus next</h3>${focus}` : ""}
      ${a.recovery ? `<h3>Recovery</h3><p>${esc(a.recovery)}</p>` : ""}
      ${a.next.idea ? `<h3>Next workout${a.next.when ? `: ${esc(a.next.when)}` : ""}</h3><p>${nextLabels ? `<b>${esc(nextLabels)}.</b> ` : ""}${esc(a.next.idea)}</p>` : ""}
      <button class="link small" data-a="reanalyze" data-v="${esc(s.id)}" ${S.aiBusy ? "disabled" : ""}>${busy ? "Analyzing…" : "Analyze again"}</button>
    </div>`;
  }

  // ------------------------------------------------ views
  const selectedMuscles = () => GROUPS.filter((g) => S.groups.has(g.key)).flatMap((g) => g.muscles);
  const countFor = (muscles) => S.lib.filter((e) => e.pm.some((m) => muscles.includes(m))).length;
  function listItems() {
    const muscles = S.muscle !== "all" ? [S.muscle] : selectedMuscles();
    const t = TYPES.find((x) => x.key === S.type);
    const q = S.q.trim().toLowerCase();
    return S.lib
      .filter((e) => e.pm.some((m) => muscles.includes(m)))
      .filter((e) => S.eq === "all" || e.eq === S.eq)
      .filter((e) => !t || !t.cats || t.cats.includes(e.cat))
      .filter((e) => !q || e.n.toLowerCase().includes(q))
      .sort((a, b) =>
        (a.mech === "compound" ? 0 : 1) - (b.mech === "compound" ? 0 : 1) ||
        (LEVEL[a.lv] || 0) - (LEVEL[b.lv] || 0) ||
        a.n.localeCompare(b.n)
      );
  }
  const metaLine = (e) => [EQ_LABEL[e.eq] || cap(e.eq), e.lv, e.mech].filter(Boolean).map((x, i) => (i ? x : cap(x))).join(", ");
  const eqNames = () => CFG.equipment.map((q) => (EQ_LABEL[q] || q).toLowerCase()).join(", ").replace(/, ([^,]*)$/, " and $1");

  function syncProgress() {
    const s = S.sync || {};
    const pct = s.total ? Math.round((s.done / s.total) * 100) : 4;
    return `<div class="sync" id="sync"><p>${esc(s.phase || "Starting")}${s.total ? `: ${s.done} of ${s.total}` : ""}</p>
      <div class="progress"><i style="width:${pct}%"></i></div>
      <p class="muted small">Keep this screen open until it finishes. Photos already downloaded are skipped next time.</p></div>`;
  }

  function appHeader() {
    return `<header class="brand"><span class="brand-mark">${LOGO}</span><span class="brand-name">Go2FGym</span>
      <button class="club" data-a="club" aria-label="Inspired by the 7AM Club community. Opens their Instagram.">Inspired by <b>7AM Club</b> <span aria-hidden="true">↗</span></button>
      <button class="icon" data-a="settings" aria-label="Settings"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/></svg></button></header>`;
  }

  function renderDisclaimer() {
    const first = !S.consent;
    return `${first ? appHeader() : `<header class="bar"><button class="back" data-a="close-disclaimer">‹ Back</button></header>`}
      <h1 class="${first ? "hero" : "title"}">Train at your own risk</h1>
      <div class="disclaimer">
        <p>Go2FGym shows exercise photos and instructions for general information only. It is not medical, physiotherapy or coaching advice.</p>
        <p>Check with a doctor before you start, especially if you have an injury or a health condition, are pregnant, or haven't trained for a while.</p>
        <p>Learn each movement with light weights, warm up, use safety stops or a spotter for heavy barbell work, and stop straight away if you feel pain, dizziness or shortness of breath.</p>
        <p>The exercise data comes from a third-party public-domain source and may contain mistakes.</p>
        <p>The optional AI coach is an automated language model. Its workouts, weights and analysis are generated automatically, can be wrong, and are no substitute for a qualified coach or doctor.</p>
        <p><b>You use this app and do these exercises entirely at your own risk.</b> To the fullest extent permitted by law, the author is not responsible or liable for any injury, health problem, loss or damage arising from using the app or doing the exercises.</p>
      </div>
      ${first
        ? `<button class="primary" data-a="accept">I understand and accept</button>
           <p class="muted small">You'll only be asked once. The full text is always available from the Train screen.</p>`
        : `<p class="muted small">Accepted ${S.acceptedAt ? esc(day(S.acceptedAt)) : "earlier"}.</p>`}`;
  }

  function renderLibraryEmpty() {
    return `${appHeader()}<h1 class="hero">Set up your gym</h1>
      <p class="lead">Download the exercise library once: about 470 exercises for ${esc(eqNames())}, each with two photos and step-by-step instructions (roughly 36 MB). After that, everything works offline.</p>
      ${S.sync ? syncProgress() : `<button class="primary" data-a="sync">Download library</button>`}
      <p class="muted small">Source: free-exercise-db on GitHub, released into the public domain.</p>`;
  }

  const missingPhotos = () => S.lib.filter((e) => !e.has).length;

  function plateHTML(g) {
    const on = S.groups.has(g.key);
    return `<button class="plate pl-${g.plate}" data-a="plate" data-v="${g.key}" aria-pressed="${on}">
      <span class="pl-name">${g.label}</span><span class="pl-count">${countFor(g.muscles)}</span></button>`;
  }

  function renderHome() {
    if (!S.lib.length) return renderLibraryEmpty();
    const sel = S.groups.size;
    const s = S.session;
    const resume = s && s.entries.length
      ? `<button class="resume" data-a="tab" data-v="workout"><span>Workout in progress</span><b>${plural(s.entries.length, "exercise")}, ${elapsed(s.start)}</b></button>`
      : "";
    return `${appHeader()}<h1 class="hero">Train what today?</h1>
      <p class="lead">Load one or more plates.</p>
      ${resume}
      <div class="rack">${GROUPS.map(plateHTML).join("")}</div>
      <button class="primary" data-a="browse" ${sel ? "" : "disabled"}>${sel ? `Show ${countFor(selectedMuscles())} exercises` : "Pick a muscle group"}</button>
      ${S.ai.hasKey ? `<button class="secondary ai" data-a="builder">✨ Build a workout with AI</button>` : ""}
      <footer class="lib">
        <p class="muted small">${S.lib.length} exercises for ${esc(eqNames())} stored on this phone${S.meta ? `, updated ${esc(day(S.meta.syncedAt))}` : ""}. Photos and instructions from free-exercise-db (public domain).</p>
        ${missingPhotos() && !S.sync ? `<p class="small"><b>${plural(missingPhotos(), "exercise")} ${missingPhotos() === 1 ? "has" : "have"} no photos yet.</b> Tap Update library to download them.</p>` : ""}
        <div class="row">${S.sync ? "" : `<button class="link" data-a="sync">Update library</button>`}<button class="link danger" data-a="disclaimer">Disclaimer</button></div>
        ${S.sync ? syncProgress() : ""}
        <p class="ver">Go2FGym v${esc(BOOT.version || "")}</p>
      </footer>`;
  }

  function chip(kind, v, label) {
    return `<button class="chip" data-a="filter" data-v="${esc(kind + "|" + v)}" aria-pressed="${S[kind] === v}">${esc(label)}</button>`;
  }
  function exRow(e) {
    const on = inSession(e.id);
    return `<div class="ex" data-a="open" data-v="${esc(e.id)}">
      <div class="thumb" data-id="${esc(e.id)}">${imgTag(e.id, 0)}<span>${esc(initials(e.n))}</span></div>
      <div><div class="ex-name">${esc(e.n)}</div><div class="ex-meta">${esc(metaLine(e))}</div></div>
      <button class="add${on ? " on" : ""}" data-a="add" data-v="${esc(e.id)}" aria-label="${on ? "Remove from workout" : "Add to workout"}">${on ? "✓" : "+"}</button></div>`;
  }
  function resultsHTML() {
    const items = listItems();
    if (!items.length) return `<p class="empty-line">No exercises match these filters. Try another equipment or type.</p>`;
    return `<p class="muted small count">${items.length} exercise${items.length > 1 ? "s" : ""}</p><div class="list">${items.map(exRow).join("")}</div>`;
  }
  function toWorkoutBtn() {
    const n = S.session ? S.session.entries.length : 0;
    return n ? `<button class="hbtn" data-a="tab" data-v="workout">✓ Workout (${n})</button>` : "";
  }
  // Open the exercise list for adding to the running workout, filtered to its muscle groups.
  function addExercises() {
    const keys = S.session ? sessionGroups(S.session).map((g) => g.key) : [];
    S.tab = "train";
    S.detailId = null;
    S.q = "";
    S.muscle = "all";
    if (keys.length) { S.groups = new Set(keys); S.trainView = "list"; }
    else S.trainView = "home";
    render();
  }

  // Quick preview pop-up: the photo demo and the essentials, with a way into the full page. Closes itself after 10 s.
  const PV_SECONDS = 10;
  let pvTimer = null;
  function closePreview() {
    clearInterval(pvTimer);
    pvTimer = null;
    const el = $("#pv");
    if (el) el.remove();
  }
  function openPreview(id) {
    closePreview();
    const e = S.byId[id];
    if (!e) return;
    want(id);
    const last = lastSets(id);
    const el = document.createElement("div");
    el.id = "pv";
    el.innerHTML = `<div class="pv-card" role="dialog" aria-modal="true" aria-label="Preview: ${esc(e.n)}">
      <div class="pv-head"><b>${esc(e.n)}</b><button class="pv-x" data-a="pv-close" aria-label="Close preview">×</button></div>
      <div class="stage pv-stage" data-frame="play">${e.has ? imgTag(e.id, 0, "f0") + imgTag(e.id, 1, "f1") : `<p class="noimg">No photos downloaded for this exercise yet.</p>`}</div>
      <p class="small pv-meta">${esc(metaLine(e))}. Works <b>${esc(e.pm.map(cap).join(", "))}</b>.</p>
      ${last ? `<p class="small muted pv-meta">Last time, ${esc(day(last.date))}: ${esc(fmtSets(last.sets))}</p>` : ""}
      <div class="pv-actions"><button class="secondary" data-a="pv-close">Close</button><button class="primary" data-a="pv-open" data-v="${esc(id)}">Open exercise ›</button></div>
      <div class="pv-bar" aria-hidden="true"><i></i></div>
      <p class="pv-auto">Closes in <span>${PV_SECONDS}</span> s</p>
    </div>`;
    document.body.appendChild(el);
    el.addEventListener("click", (ev) => { if (ev.target === el) closePreview(); });   // tap outside closes
    const t0 = Date.now();
    pvTimer = setInterval(() => {
      const left = Math.max(0, PV_SECONDS - Math.floor((Date.now() - t0) / 1000));
      const n = el.querySelector(".pv-auto span");
      if (n) n.textContent = left;
      if (Date.now() - t0 >= PV_SECONDS * 1000) closePreview();
    }, 250);
  }

  function renderList() {
    const groups = GROUPS.filter((g) => S.groups.has(g.key));
    const muscles = selectedMuscles().filter((m) => S.lib.some((e) => e.pm.includes(m)));
    const eqs = [...new Set(S.lib.map((e) => e.eq))];
    return `<header class="bar"><button class="back" data-a="home">‹ Muscles</button>${toWorkoutBtn()}</header>
      <h1 class="title">${esc(groups.map((g) => g.label).join(" + "))}</h1>
      ${S.session && S.session.entries.length ? `<p class="add-hint">Adding to <b>${esc(S.session.title || "your workout")}</b>: tap <b>+</b> on an exercise, then <b>Workout</b> at the top to go back.</p>` : ""}
      ${muscles.length > 1 ? `<div class="chips">${chip("muscle", "all", "All muscles")}${muscles.map((m) => chip("muscle", m, cap(m))).join("")}</div>` : ""}
      <div class="chips">${chip("eq", "all", "Any equipment")}${eqs.map((q) => chip("eq", q, EQ_LABEL[q] || cap(q))).join("")}</div>
      <div class="chips">${TYPES.map((t) => chip("type", t.key, t.label)).join("")}</div>
      <input class="search" type="search" placeholder="Search exercises" value="${esc(S.q)}" data-in="q" autocomplete="off" autocorrect="off">
      <div id="results">${resultsHTML()}</div>`;
  }

  function muscleTags(list) {
    return list.map((m) => {
      const g = GROUP_OF[m];
      return `<span class="tag"><i class="dot pl-${g ? g.plate : "steel"}"></i>${esc(cap(m))}</span>`;
    }).join("");
  }
  function renderDetail() {
    const e = S.byId[S.detailId];
    if (!e) return `<p class="empty-line">Exercise not found.</p>`;
    const on = inSession(e.id);
    const last = lastSets(e.id);
    const back = S.tab === "workout" ? "Workout" : S.tab === "history" ? "History" : "Exercises";
    return `<header class="bar"><button class="back" data-a="close-detail">‹ ${back}</button>${S.tab === "workout" ? "" : toWorkoutBtn()}</header>
      <h1 class="title">${esc(e.n)}</h1>
      <div class="stage" data-frame="play">${e.has ? imgTag(e.id, 0, "f0") + imgTag(e.id, 1, "f1") : `<p class="noimg">Photos not downloaded. Tap Update library on the Train tab.</p>`}</div>
      ${e.has ? `<div class="seg" role="group" aria-label="Demo frame">
        <button data-a="frame" data-v="0" aria-pressed="false">Start</button>
        <button data-a="frame" data-v="play" aria-pressed="true">Play</button>
        <button data-a="frame" data-v="1" aria-pressed="false">End</button></div>` : ""}
      <p class="muted">${esc(metaLine(e))}${e.force ? `, ${esc(e.force)} movement` : ""}</p>
      <h2>Works</h2><div class="tags">${muscleTags(e.pm)}</div>
      ${e.sm.length ? `<h2>Also helps</h2><div class="tags quiet">${muscleTags(e.sm)}</div>` : ""}
      <h2>How to do it</h2><ol class="steps">${e.ins.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>
      <p class="note">Use a weight you can control with good form, and stop if anything hurts. You train at your own risk.</p>
      ${last ? `<h2>Last time</h2><p>${esc(day(last.date))}: ${esc(fmtSets(last.sets))}</p>` : ""}
      ${trendFor(e.id)}
      <div class="cta">${on
        ? `<button class="primary" data-a="tab" data-v="workout">Go to workout</button>`
        : `<button class="primary" data-a="add" data-v="${esc(e.id)}">Add to workout</button>`}</div>`;
  }

  // ------------------------------------------------ workout order, completing exercises, drag and drop
  const firstOpen = (list) => { const i = list.findIndex((x) => !x.completed); return i < 0 ? list.length : i; };
  // Where "Up next" puts an exercise: right after the exercises already started, or first among the open ones.
  function upNextIndex(ei) {
    const list = S.session.entries.filter((_, i) => i !== ei);
    let at = -1;
    list.forEach((x, i) => { if (!x.completed && x.sets.some((y) => y.done)) at = i; });
    return at >= 0 ? at + 1 : firstOpen(list);
  }
  function moveEntry(from, to) {
    const list = S.session.entries;
    const [m] = list.splice(from, 1);
    list.splice(Math.max(0, Math.min(list.length, to)), 0, m);
  }
  function entrySummary(en) {
    const done = en.sets.filter((x) => x.done && x.r > 0);
    const reps = done.reduce((n, x) => n + x.r, 0);
    const kg = done.reduce((n, x) => n + (x.w ? x.w * x.r : 0), 0);
    const mins = en.startedAt && en.doneAt ? Math.max(1, Math.round((en.doneAt - en.startedAt) / 60000)) : null;
    return [kg ? `${fmtNum(kg)} ${UNIT}` : "", `${reps} reps`, mins ? `${mins} min` : ""].filter(Boolean).join(" · ");
  }
  function scrollToFocus() {
    const list = S.session ? S.session.entries : [];
    const i = list.findIndex((x) => x.id === S.focusId);
    const el = i >= 0 ? document.querySelector(`#app .entry[data-ei="${i}"]`) : null;
    if (!el) return;
    const bar = document.querySelector("#app .bar");
    const top = el.getBoundingClientRect().top + window.scrollY - (bar ? bar.getBoundingClientRect().bottom : 60) - 10;
    window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }
  function completeEntry(ei) {
    const list = S.session.entries;
    const en = list[ei];
    const now = Date.now();
    en.sets.forEach((x) => { if (x.r > 0 && !x.done) { x.done = true; x.t = x.t || now; } });
    if (!en.sets.some((x) => x.done)) return toast("Log at least one set first.", true);
    en.completed = true;
    en.doneAt = now;
    en.startedAt = en.startedAt || Math.min(...en.sets.filter((x) => x.t).map((x) => x.t), now);
    moveEntry(ei, firstOpen(list.filter((_, i) => i !== ei)));   // completed ones collect at the top
    const next = list.find((x) => !x.completed && x.sets.some((y) => y.done)) || list.find((x) => !x.completed);
    S.focusId = next ? next.id : null;
    saveDraft();
    render();
    if (next) setTimeout(scrollToFocus, 30);
    toast(next ? `${en.name} done. Next: ${next.name}` : `${en.name} done. That's every exercise!`);
  }

  // Drag and drop by the ⠿ handle (pointer events, so it works with touch and mouse).
  let drag = null;
  function dragTarget(center) {
    let n = 0;
    drag.rects.forEach((r, i) => { if (i !== drag.from && r.top + r.h / 2 < center) n++; });
    return n;
  }
  document.addEventListener("pointerdown", (ev) => {
    const h = ev.target.closest && ev.target.closest(".drag");
    if (!h || !S.session || S.tab !== "workout") return;
    const el = h.closest(".entry");
    const els = [...document.querySelectorAll("#app .entry")];
    ev.preventDefault();
    drag = {
      el, els, from: els.indexOf(el), startY: ev.clientY, scroll0: window.scrollY, pid: ev.pointerId, to: els.indexOf(el),
      rects: els.map((e) => { const r = e.getBoundingClientRect(); return { top: r.top + window.scrollY, h: r.height }; }),
    };
    drag.gap = drag.rects.length > 1 ? Math.max(0, drag.rects[1].top - drag.rects[0].top - drag.rects[0].h) : 12;
    el.classList.add("dragging");
    document.body.classList.add("is-dragging");
    try { h.setPointerCapture(ev.pointerId); } catch (e) { /* not supported */ }
  });
  document.addEventListener("pointermove", (ev) => {
    if (!drag || ev.pointerId !== drag.pid) return;
    ev.preventDefault();
    if (ev.clientY < 110) window.scrollBy(0, -14);
    else if (ev.clientY > window.innerHeight - 130) window.scrollBy(0, 14);
    const dy = ev.clientY - drag.startY + (window.scrollY - drag.scroll0);
    drag.el.style.transform = `translateY(${dy}px)`;
    const me = drag.rects[drag.from];
    drag.to = dragTarget(me.top + me.h / 2 + dy);
    const shift = me.h + drag.gap;
    drag.els.forEach((e, i) => {
      if (i === drag.from) return;
      const j = i < drag.from ? i : i - 1;   // index among the others
      let y = 0;
      if (i < drag.from && j >= drag.to) y = shift;
      if (i > drag.from && j < drag.to) y = -shift;
      e.style.transform = y ? `translateY(${y}px)` : "";
    });
  });
  function endDrag(ev) {
    if (!drag || (ev && ev.pointerId !== drag.pid)) return;
    const { from, to, els } = drag;
    els.forEach((e) => { e.style.transform = ""; e.classList.remove("dragging"); });
    document.body.classList.remove("is-dragging");
    drag = null;
    if (to !== from) { moveEntry(from, to); saveDraft(); }
    render();
  }
  document.addEventListener("pointerup", endDrag);
  document.addEventListener("pointercancel", endDrag);

  function renderWorkout() {
    const s = S.session;
    if (!s || !s.entries.length)
      return `<header class="bar"><h1 class="title">Workout</h1></header>
        <div class="empty"><p>No exercises yet. Pick the muscles you want to train and add exercises with <b>+</b>${S.ai.hasKey ? ", or let the AI coach build the whole workout" : ""}.</p>
        <button class="primary" data-a="go-muscles">Choose muscles</button>
        ${S.ai.hasKey && S.history.sessions.length ? `<button class="secondary ai" data-a="build-next-h">✨ Build next workout</button>` : ""}</div>`;
    const t = volume(s.entries.map((en) => ({ sets: en.sets.filter((x) => x.done) })));
    const entries = s.entries.map((en, ei) => {
      const grip = `<button class="drag" data-ei="${ei}" aria-label="Drag ${esc(en.name)} to reorder"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg></button>`;
      if (en.completed) {
        const sum = entrySummary(en);
        const g = groupOf(en.id);
        return `<section class="entry done-row" data-ei="${ei}">${grip}
          <button class="done-main" data-a="reopen" data-v="${ei}" aria-label="${esc(en.name)}, completed. Tap to reopen.">
          <span class="ck">✓</span><b>${esc(en.name)}</b>
          <span class="dl-meta">${g ? `<i class="dot pl-${g.plate}" title="${g.label}"></i>` : ""}${esc(sum)}${g ? ` · ${g.label}` : ""}</span></button></section>`;
      }
      const last = lastSets(en.id);
      const started = en.sets.some((x) => x.done);
      const focus = S.focusId === en.id;
      const nextIdx = upNextIndex(ei);
      const rows = en.sets.map((x, si) => `<div class="set-row${x.done ? " done" : ""}">
          <span class="n">${si + 1}</span>
          <input data-in="w" data-ei="${ei}" data-si="${si}" inputmode="decimal" placeholder="Body" value="${x.w == null ? "" : esc(x.w)}" aria-label="Set ${si + 1} weight in ${UNIT}">
          <input data-in="r" data-ei="${ei}" data-si="${si}" inputmode="numeric" placeholder="0" value="${x.r == null ? "" : esc(x.r)}" aria-label="Set ${si + 1} reps">
          <button class="tick" data-a="done" data-v="${ei}:${si}" aria-label="${x.done ? "Mark set as not done" : "Mark set as done"}">✓</button>
          <button class="x" data-a="rm-set" data-v="${ei}:${si}" aria-label="Remove set ${si + 1}">×</button></div>`).join("");
      return `<section class="entry${focus ? " focus" : ""}" data-ei="${ei}">
        ${focus || started ? `<p class="entry-status">${started ? "● In progress" : "▶ Up now"}</p>` : ""}
        <div class="entry-head">${grip}<button class="entry-name" data-a="open" data-v="${esc(en.id)}">${esc(en.name)}</button>
        <button class="pv-btn" data-a="preview" data-v="${esc(en.id)}" aria-label="Preview ${esc(en.name)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg></button>
        <button class="link small${S.armed === "rm" + ei ? " armed" : ""}" data-a="rm-entry" data-v="${ei}">${S.armed === "rm" + ei ? "Tap to remove" : "Remove"}</button></div>
        ${en.note ? `<p class="small coach-note">✨ ${esc(en.note)}${en.rest ? ` Rest ${en.rest} s.` : ""}</p>` : ""}
        ${last ? `<p class="muted small">Last time, ${esc(day(last.date))}: ${esc(fmtSets(last.sets))}</p>` : `<p class="muted small">First time logging this one.</p>`}
        <div class="set-row head"><span>Set</span><span>${UNIT}</span><span>Reps</span><span></span><span></span></div>
        ${rows}
        <div class="entry-actions"><button class="link" data-a="add-set" data-v="${ei}">Add set</button>
          ${nextIdx !== ei && !started ? `<button class="chip" data-a="up-next" data-v="${ei}">↑ Up next</button>` : ""}
          <button class="chip complete-btn" data-a="complete" data-v="${ei}">✓ Complete</button></div></section>`;
    }).join("");
    return `<header class="bar"><h1 class="title">${esc(s.title || "Workout")}</h1><button class="hbtn" data-a="add-ex">＋ Add exercises</button></header>
      <p class="muted small" id="totals"><span id="elapsed">${elapsed(s.start)}</span>, ${plural(t.n, "set")} done${t.v ? `, ${fmtNum(t.v)} ${UNIT} lifted` : ""}${s.entries.some((x) => x.completed) ? `, ${s.entries.filter((x) => x.completed).length} of ${s.entries.length} exercises complete` : ""}. Tap ✓ after each set; drag ⠿ to reorder, or ↑ Up next.</p>
      ${entries}
      <button class="secondary" data-a="add-ex">＋ Add exercises</button>
      <button class="primary${S.armed === "finish" ? " armed" : ""}" data-a="finish">${S.armed === "finish" ? "Tap again to save" : "Finish workout"}</button>
      <button class="link danger${S.armed === "discard" ? " armed" : ""}" data-a="discard">${S.armed === "discard" ? "Tap again to discard" : "Discard workout"}</button>`;
  }

  // ------------------------------------------------ calendar, history, progress
  const ymd = (d) => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`; };
  function sessionGroups(s) {
    const keys = new Set();
    s.entries.forEach((en) => { const g = groupOf(en.id); if (g) keys.add(g.key); });
    if (!keys.size) (s.groups || []).forEach((k) => keys.add(k));
    return GROUPS.filter((g) => keys.has(g.key));
  }
  const dotsFor = (groups) => groups.map((g) => `<i class="dot pl-${g.plate}" title="${g.label}"></i>`).join("");
  function focusDay(iso) {
    const d = new Date(iso);
    S.cal = { y: d.getFullYear(), m: d.getMonth(), sel: ymd(d) };
    S.histView = "calendar";
  }
  function ensureCal() {
    if (S.cal) return;
    const latest = sessionsDesc()[0];
    const now = new Date();
    const inMonth = latest && new Date(latest.start).getMonth() === now.getMonth() && new Date(latest.start).getFullYear() === now.getFullYear();
    S.cal = { y: now.getFullYear(), m: now.getMonth(), sel: inMonth ? ymd(latest.start) : null };
  }

  function sessCard(s, forceOpen) {
    const v = volume(s.entries);
    const open = forceOpen || S.openSession === s.id;
    return `<section class="sess${open ? " open" : ""}">
      <button class="sess-head" data-a="sess" data-v="${esc(s.id)}" aria-expanded="${open}">
        <span><b>${esc(day(s.start))}${s.ai ? ' <i class="spark-mark" title="Analyzed by AI coach">✨</i>' : ""}</b><span class="muted small">${s.title ? `${esc(s.title)}, ` : ""}${s.end ? `${minutesBetween(s.start, s.end)} min, ` : ""}${plural(s.entries.length, "exercise")}, ${plural(v.n, "set")}${v.v ? `, ${fmtNum(v.v)} ${UNIT}` : ""}</span></span>
        <span class="dots">${dotsFor(sessionGroups(s))}</span></button>
      ${open ? `<div class="sess-body">${s.entries.map((en) => `<div class="sess-ex">
          <button class="entry-name" data-a="open" data-v="${esc(en.id)}">${esc(en.name)}</button>
          <span class="muted small">${esc(fmtSets(en.sets))}</span></div>`).join("")}
        ${renderAnalysis(s)}
        ${renderStrava(s)}
        <div class="row"><button class="link" data-a="repeat" data-v="${esc(s.id)}">Repeat this workout</button>
        <button class="link danger${S.armed === "del" + s.id ? " armed" : ""}" data-a="del-sess" data-v="${esc(s.id)}">${S.armed === "del" + s.id ? "Tap to delete" : "Delete"}</button></div></div>` : ""}
    </section>`;
  }

  function renderCalendar(ss) {
    ensureCal();
    const { y, m, sel } = S.cal;
    const first = new Date(y, m, 1);
    const pad = (first.getDay() + 6) % 7;
    const days = new Date(y, m + 1, 0).getDate();
    const byDay = {};
    ss.forEach((s) => { const k = ymd(s.start); (byDay[k] = byDay[k] || []).push(s); });
    const todayK = ymd(new Date());
    const weekdays = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(undefined, { weekday: "narrow" }));
    let cells = "";
    for (let i = 0; i < pad; i++) cells += `<div class="cd empty"></div>`;
    for (let d = 1; d <= days; d++) {
      const k = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const list = byDay[k];
      const groups = list ? GROUPS.filter((g) => list.some((s) => sessionGroups(s).includes(g))) : [];
      cells += `<button class="cd${list ? " has" : ""}${k === todayK ? " today" : ""}${k === sel ? " sel" : ""}" data-a="cal-day" data-v="${k}" ${list ? "" : "disabled"}
        aria-label="${esc(new Date(y, m, d).toLocaleDateString(undefined, { day: "numeric", month: "long" }))}${list ? `: ${groups.map((g) => g.label).join(", ")}` : ""}">
        <span class="cd-n">${d}</span><span class="cd-dots">${dotsFor(groups.slice(0, 4))}${groups.length > 4 ? `<span class="cd-more">+${groups.length - 4}</span>` : ""}</span></button>`;
    }
    const monthSessions = ss.filter((s) => { const d = new Date(s.start); return d.getFullYear() === y && d.getMonth() === m; });
    const mv = volume(monthSessions.flatMap((s) => s.entries));
    const trainedDays = new Set(monthSessions.map((s) => ymd(s.start))).size;
    const groupDays = GROUPS.map((g) => ({ g, n: new Set(monthSessions.filter((s) => sessionGroups(s).includes(g)).map((s) => ymd(s.start))).size }));
    const monthName = first.toLocaleDateString(undefined, { month: "long", year: "numeric" });
    const selList = sel && byDay[sel] ? byDay[sel] : null;
    const isCurrent = y === new Date().getFullYear() && m === new Date().getMonth();
    return `<div class="cal">
        <div class="cal-head"><button class="cal-nav" data-a="cal-prev" aria-label="Previous month">‹</button><b>${esc(monthName)}</b>
        <button class="cal-nav" data-a="cal-next" aria-label="Next month" ${isCurrent ? "disabled" : ""}>›</button></div>
        <div class="cal-grid">${weekdays.map((w) => `<span class="cal-wd">${esc(w)}</span>`).join("")}${cells}</div>
      </div>
      <p class="small month-sum">${monthSessions.length ? `${esc(monthName.split(" ")[0])}: ${plural(monthSessions.length, "workout")} on ${plural(trainedDays, "day")}, ${plural(mv.n, "set")}${mv.v ? `, ${fmtNum(mv.v)} ${UNIT} lifted` : ""}.` : "No workouts this month yet."}</p>
      ${monthSessions.length ? `<div class="legend">${groupDays.map(({ g, n }) => `<span class="lg${n ? "" : " zero"}"><i class="dot pl-${g.plate}"></i>${g.label} <b>${n}</b></span>`).join("")}</div>
      <p class="muted small">Dots show the muscle groups trained that day; numbers count training days this month.</p>` : ""}
      ${selList ? selList.map((s2) => sessCard(s2, true)).join("") : monthSessions.length ? `<p class="empty-line">Tap a day with dots to see the workout.</p>` : ""}`;
  }

  function renderHistory() {
    const ss = sessionsDesc();
    const head = `<header class="bar"><h1 class="title">History</h1>${ss.length ? nextButton() : ""}</header>`;
    if (!ss.length) return head + `<div class="empty"><p>Finished workouts show up here, with every set you logged.</p></div>`;
    const monday = new Date();
    monday.setHours(0, 0, 0, 0);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    const week = ss.filter((s) => new Date(s.start) >= monday);
    const wv = volume(week.flatMap((s) => s.entries));
    const summary = week.length
      ? `This week: ${plural(week.length, "workout")}, ${plural(wv.n, "set")}${wv.v ? `, ${fmtNum(wv.v)} ${UNIT} lifted` : ""}.`
      : "No workouts yet this week.";
    const seg = `<div class="seg seg2"><button data-a="hist-view" data-v="calendar" aria-pressed="${S.histView === "calendar"}">Calendar</button>
      <button data-a="hist-view" data-v="list" aria-pressed="${S.histView === "list"}">List</button></div>`;
    return head + `<p class="lead">${esc(summary)}</p>` + seg + (S.histView === "calendar" ? renderCalendar(ss) : ss.map((s) => sessCard(s)).join("")) +
      `<button class="link" data-a="export">Export CSV</button>`;
  }

  function weekStart(d) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
    return x;
  }
  function renderProgress() {
    const asc = [...S.history.sessions].sort((a, b) => a.start.localeCompare(b.start));
    const head = `<header class="bar"><h1 class="title">Progress</h1>${asc.length ? nextButton() : ""}</header>`;
    if (!asc.length) return head + `<div class="empty"><p>Log a few workouts and your trends show up here: weekly volume by muscle group, balance, and your best lifts.</p></div>`;
    // weekly sets stacked by muscle group, last 12 weeks
    const thisWeek = weekStart(new Date());
    const weeks = Array.from({ length: 12 }, (_, i) => {
      const start = new Date(thisWeek);
      start.setDate(start.getDate() - 7 * (11 - i));
      return { start, sets: Object.fromEntries(GROUPS.map((g) => [g.key, 0])), total: 0, n: 0 };
    });
    asc.forEach((s) => {
      const w = weeks.find((x) => { const end = new Date(x.start); end.setDate(end.getDate() + 7); return new Date(s.start) >= x.start && new Date(s.start) < end; });
      if (!w) return;
      w.n++;
      s.entries.forEach((en) => { const g = groupOf(en.id); if (g) { w.sets[g.key] += en.sets.length; w.total += en.sets.length; } });
    });
    const W = 336, H = 150, padL = 22, padB = 18, bw = (W - padL) / 12;
    const max = Math.max(10, ...weeks.map((w) => w.total));
    const yS = (v) => ((H - padB - 6) * v) / max;
    const ticks = [0, Math.round(max / 2), max];
    const bars = weeks.map((w, i) => {
      let y = H - padB;
      const x = padL + i * bw + bw * 0.16;
      const segs = GROUPS.map((g) => {
        const h = yS(w.sets[g.key]);
        if (!h) return "";
        y -= h;
        return `<rect class="f-${g.plate}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(bw * 0.68).toFixed(1)}" height="${h.toFixed(1)}"><title>${g.label}: ${w.sets[g.key]} sets</title></rect>`;
      }).join("");
      const label = i % 3 === 0 || i === 11 ? `<text class="ax" x="${(x + bw * 0.34).toFixed(1)}" y="${H - 4}" text-anchor="middle">${i === 11 ? "Now" : w.start.toLocaleDateString(undefined, { day: "numeric", month: "numeric" })}</text>` : "";
      return segs + label;
    }).join("");
    const grid = ticks.map((t) => `<line class="gl" x1="${padL}" x2="${W}" y1="${(H - padB - yS(t)).toFixed(1)}" y2="${(H - padB - yS(t)).toFixed(1)}"/><text class="ax" x="${padL - 4}" y="${(H - padB - yS(t) + 3).toFixed(1)}" text-anchor="end">${t}</text>`).join("");
    // streak of weeks with at least one workout
    let streak = 0;
    for (let i = 11; i >= 0; i--) { if (weeks[i].n) streak++; else if (i === 11) continue; else break; }
    // balance, last 4 weeks
    const stats = groupStats(28);
    const maxSets = Math.max(1, ...stats.map((x) => x.sets_last_28_days));
    const balance = stats.map((x) => {
      const g = GROUPS.find((y) => y.key === x.group);
      const d = x.days_since_trained;
      return `<div class="bal"><span class="bal-name"><i class="dot pl-${g.plate}"></i>${g.label}</span>
        <span class="bal-bar"><i class="pl-${g.plate}" style="width:${Math.round((x.sets_last_28_days / maxSets) * 100)}%"></i></span>
        <span class="bal-n">${x.sets_last_28_days}</span>
        <span class="bal-d muted small">${d == null ? "not yet" : d === 0 ? "today" : d === 1 ? "1 day" : `${d} days`}</span></div>`;
    }).join("");
    // best lifts
    const lifts = {};
    asc.forEach((s) => s.entries.forEach((en) => {
      if (!en.sets.length) return;
      const best = Math.max(...en.sets.map(e1rm));
      (lifts[en.id] = lifts[en.id] || { id: en.id, name: en.name, pts: [], weighted: false }).pts.push({ d: s.start, v: best });
      if (en.sets.some((x) => x.w)) lifts[en.id].weighted = true;
    }));
    const top = Object.values(lifts).filter((l) => l.pts.length >= 2).sort((a, b) => b.pts.length - a.pts.length || a.name.localeCompare(b.name)).slice(0, 6);
    const spark = (pts) => {
      const vs = pts.map((p) => p.v), lo = Math.min(...vs), hi = Math.max(...vs), sp = hi - lo || 1;
      const xy = pts.map((p, i) => `${(2 + (i * 86) / (pts.length - 1)).toFixed(1)},${(26 - ((p.v - lo) * 22) / sp).toFixed(1)}`).join(" ");
      return `<svg class="mini" viewBox="0 0 90 30" aria-hidden="true"><polyline points="${xy}"/></svg>`;
    };
    const liftRows = top.map((l) => {
      const a = l.pts[0].v, b = l.pts[l.pts.length - 1].v, diff = b - a;
      const now = l.weighted ? `${fmtNum(Math.round(b * 10) / 10)} ${UNIT} est. max` : `${Math.round(b)} reps best set`;
      const delta = Math.abs(diff) < 0.05 ? "no change yet" : `${diff > 0 ? "+" : "−"}${l.weighted ? `${fmtNum(Math.round(Math.abs(diff) * 10) / 10)} ${UNIT}` : `${Math.round(Math.abs(diff))} reps`} since ${new Date(l.pts[0].d).toLocaleDateString(undefined, { day: "numeric", month: "short" })}`;
      return `<button class="lift" data-a="open" data-v="${esc(l.id)}"><span><b>${esc(l.name)}</b><span class="muted small">${now}, <span class="${diff > 0.05 ? "up" : diff < -0.05 ? "down" : ""}">${delta}</span></span></span>${spark(l.pts)}</button>`;
    }).join("");
    const month = asc.filter((s) => { const d = new Date(s.start), n = new Date(); return d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear(); });
    const mv = volume(month.flatMap((s) => s.entries));
    const due = [...stats].sort((a, b) => (b.days_since_trained ?? 99) - (a.days_since_trained ?? 99))[0];
    const dueG = GROUPS.find((g) => g.key === due.group);
    return head + `<p class="lead">This month: ${plural(month.length, "workout")}, ${plural(mv.n, "set")}${mv.v ? `, ${fmtNum(mv.v)} ${UNIT} lifted` : ""}.
        ${streak ? `${streak >= 2 ? `<b>${streak} weeks in a row</b> with at least one workout.` : "Trained this week."}` : ""}</p>
      <h2>Sets per week</h2>
      <svg class="weeks" viewBox="0 0 ${W} ${H}" role="img" aria-label="Sets per week for the last 12 weeks, stacked by muscle group">${grid}${bars}</svg>
      <div class="legend">${GROUPS.map((g) => `<span class="lg"><i class="dot pl-${g.plate}"></i>${g.label}</span>`).join("")}</div>
      <h2>Muscle balance, last 4 weeks</h2>
      <p class="muted small">Working sets per muscle group, and days since you last trained it. Most due: <b>${dueG.label}</b>.</p>
      <div class="balance">${balance}</div>
      ${top.length ? `<h2>Your lifts</h2><p class="muted small">Best set per workout as an estimated one-rep max (reps for bodyweight moves). Tap one for details.</p><div class="lifts">${liftRows}</div>` : ""}`;
  }

  // ------------------------------------------------ next workout + last-workout pill
  function nextSuggestion() {
    const latest = sessionsDesc()[0];
    if (latest && latest.ai && latest.ai.next && latest.ai.next.groups.length) {
      const f = latest.ai.focus_next.find((x) => latest.ai.next.groups.includes(x.group));
      return { groups: latest.ai.next.groups, intensity: f ? (f.intensity === "light" ? "easy" : f.intensity) : null, why: "your AI coach's suggestion", idea: latest.ai.next.idea };
    }
    const due = groupStats(28).sort((a, b) => (b.days_since_trained ?? 99) - (a.days_since_trained ?? 99)).slice(0, 2).map((x) => x.group);
    return { groups: due, intensity: null, why: "your most-due muscle groups", idea: "" };
  }
  function usualMinutes() {
    const ds = sessionsDesc().slice(0, 6).filter((s) => s.end).map((s) => minutesBetween(s.start, s.end)).sort((a, b) => a - b);
    if (!ds.length) return S.builder.minutes;
    const med = ds[Math.floor(ds.length / 2)];
    return [20, 30, 45, 60].reduce((best, m) => (Math.abs(m - med) < Math.abs(best - med) ? m : best), 45);
  }
  function buildNextNow() {
    const n = nextSuggestion();
    const eqs = libEquipment();
    S.builder = {
      groups: n.groups.filter((k) => GROUP_KEYS.includes(k)),
      equipment: S.builder.equipment.filter((q) => eqs.includes(q)).length ? S.builder.equipment.filter((q) => eqs.includes(q)) : eqs,
      minutes: usualMinutes(), intensity: n.intensity || "moderate",
      note: n.idea ? `My coach suggested: ${n.idea}`.slice(0, 300) : "",
      why: n.why,
    };
    S.tab = "train";
    S.detailId = null;
    if (!S.ai.hasKey) {
      S.trainView = "ai";
      render();
      return toast("Add a Claude or OpenAI key in AI settings to build workouts instantly.", true);
    }
    S.plan = null;
    S.trainView = "plan";
    buildPlan();
  }
  function nextButton() {
    const n = nextSuggestion();
    const labels = n.groups.map((k) => GROUPS.find((g) => g.key === k).label).join(" + ");
    return `<button class="hbtn" data-a="build-next-h" aria-label="Build next workout: ${esc(labels)}, based on ${esc(n.why)}">✨ Build next</button>`;
  }
  function relDay(iso) {
    const a = new Date(iso); a.setHours(0, 0, 0, 0);
    const b = new Date(); b.setHours(0, 0, 0, 0);
    const d = Math.round((b - a) / 864e5);
    if (d === 0) return "Today";
    if (d === 1) return "Yesterday";
    if (d < 7) return a.toLocaleDateString(undefined, { weekday: "short" });
    return a.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  }
  function updateLast() {
    const el = $("#last");
    const s = S.consent ? sessionsDesc()[0] : null;
    if (!s) { el.hidden = true; return; }
    const gs = sessionGroups(s);
    const mins = s.end ? minutesBetween(s.start, s.end) : null;
    el.innerHTML = `<span class="last-1"><span class="last-k">Last</span>${esc(relDay(s.start))}${mins ? `, ${mins} min` : ""}</span>
      <span class="last-2"><span class="dots">${dotsFor(gs)}</span>${gs.length ? `${plural(gs.length, "group")}: ${esc(gs.map((g) => g.label).join(", "))}` : plural(s.entries.length, "exercise")}</span>`;
    el.setAttribute("aria-label", `Last workout ${relDay(s.start)}: ${gs.map((g) => g.label).join(", ")}${mins ? `, ${mins} minutes` : ""}. Opens it in History.`);
    el.dataset.v = s.start;
    el.hidden = false;
  }
  function layoutBand() {
    // Scriptable draws its Close/share bar over the top of the page, under the status bar.
    // When that bar is there (tall inset), the pill sits in the middle of its row, between
    // Close and share. Otherwise a slim row is added below the status bar for it.
    const probe = $("#sat");
    const inset = probe ? probe.offsetHeight : 0;
    const root = document.documentElement.style;
    if (inset >= 80) {
      root.setProperty("--band", `${inset}px`);
      root.setProperty("--pill-top", `${inset - 22 - 17}px`);
      root.setProperty("--pill-max", "min(62vw, calc(100vw - 150px))");
    } else {
      root.setProperty("--band", `${inset + 44}px`);
      root.setProperty("--pill-top", `${inset + 5}px`);
      root.setProperty("--pill-max", "calc(100vw - 24px)");
    }
  }

  // ------------------------------------------------ update sheet
  function showUpdateSheet() {
    const u = S.update;
    if (!u || !S.consent || $("#upd")) return;
    const ov = document.createElement("div");
    ov.id = "upd";
    const cards = (u.highlights || []).slice(0, 3).map((h) => `<div class="updi"><span class="updic">${esc(h.icon || "✨")}</span>
      <div><b>${esc(h.title)}</b><span>${esc(h.text || "")}</span></div></div>`).join("");
    const more = u.skipped > 1 ? ` (and ${u.skipped - 1} more update${u.skipped > 2 ? "s" : ""})` : "";
    ov.innerHTML = `<div class="updp" role="dialog" aria-modal="true" aria-label="Update available">
      <div class="updtag">New version ${esc(u.latest)}</div>
      <h2 class="updt">${esc(u.title || "An update is ready")}</h2>
      <div class="upds">You have ${esc(u.current)}${esc(more)}. Here’s what you get:</div>
      <div class="updl">${cards}</div>
      <div class="updmsg" aria-live="polite"></div>
      <button class="updgo" data-a="upd-now">Update now</button>
      <button class="updlater" data-a="upd-later">Later, remind me in 2 days</button></div>`;
    document.body.appendChild(ov);
    ov.addEventListener("click", (e) => { if (e.target === ov) updLater(); }); // outside = Later
  }
  function updLater() {
    const ov = $("#upd");
    if (!ov) return;
    ov.remove();
    S.update = null;
    send("update-later", {});
  }
  function updNow(btn) {
    const ov = $("#upd");
    const msg = ov.querySelector(".updmsg");
    const later = ov.querySelector(".updlater");
    btn.disabled = true;
    btn.textContent = "Updating…";
    later.hidden = true;
    msg.textContent = "";
    send("update-now", {});
  }

  // ------------------------------------------------ Strava post
  const STRAVA_MODES = [
    { key: "serious", label: "Serious" },
    { key: "funny", label: "Funny" },
    { key: "neutral", label: "Neutral" },
  ];
  const STRAVA_TONE = {
    serious: "Tone: serious and focused, like an athlete's training log. Lead with the main lifts and any progress. Calm and confident, no jokes.",
    funny: "Tone: funny and self-ironic, like a teammate teasing with affection: home-gym life, the bench as a loyal friend, early alarms if early_start is true, and the app name Go2FGym, short for 'go to the f***ing gym' (always write it as Go2FGym). Build one clever joke on a real detail and still mention the key work.",
    neutral: "Tone: neutral and informative. A plain summary of the focus, duration, main lifts and any progress.",
  };
  const STRAVA_SCHEMA = {
    type: "object", additionalProperties: false, required: ["title", "description"],
    properties: { title: { type: "string" }, description: { type: "string" } },
  };
  function liftLine(en) {
    const same = en.sets.every((x) => x.w === en.sets[0].w && x.r === en.sets[0].r);
    if (same) return `${en.name}: ${en.sets.length}×${en.sets[0].r}${en.sets[0].w ? ` @ ${fmtNum(en.sets[0].w)} ${UNIT}` : ""}`;
    return `${en.name}: ${en.sets.map((x) => (x.w ? `${fmtNum(x.w)}×${x.r}` : `${x.r}`)).join(", ")}${en.sets.some((x) => x.w) ? ` ${UNIT}` : ""}`;
  }
  function personalBests(s) {
    return s.entries.filter((en) => en.sets.length).map((en) => {
      const prior = S.history.sessions.filter((x) => x.start < s.start).flatMap((x) => x.entries.filter((e) => e.id === en.id)).flatMap((e) => e.sets);
      if (!prior.length) return null;
      const now = Math.max(...en.sets.map(e1rm)), before = Math.max(...prior.map(e1rm));
      return now > before + 0.05 ? en.name : null;
    }).filter(Boolean);
  }
  function stravaTemplate(s) {
    const groups = sessionGroups(s).map((g) => g.label);
    const v = volume(s.entries);
    const pbs = personalBests(s);
    const title = `${groups.length ? groups.join(" + ") : "Strength"} at home`;
    const lines = [
      `${s.end ? `${minutesBetween(s.start, s.end)} min home strength session, ` : "Home strength session, "}${plural(v.n, "set")}${v.v ? `, ${fmtNum(v.v)} ${UNIT} lifted` : ""}.`,
      ...[...s.entries].sort((a, b) => b.sets.length - a.sets.length).slice(0, 4).map(liftLine),
    ];
    if (pbs.length) lines.push(`New best: ${pbs.join(", ")}.`);
    return { title, description: lines.join("\n"), basic: true };
  }
  async function stravaPost(id, mode) {
    const s = S.history.sessions.find((x) => x.id === id);
    if (!s || S.aiBusy) return;
    if (!S.ai.hasKey) return toast("Add a Claude or OpenAI key in AI settings first.", true);
    const start = new Date(s.start);
    const v = volume(s.entries);
    const input = {
      mode,
      workout: {
        date: isoDay(s.start), weekday: start.toLocaleDateString("en", { weekday: "long" }),
        start_time: `${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}`,
        early_start: start.getHours() < 8, duration_minutes: s.end ? minutesBetween(s.start, s.end) : null,
        title: s.title || null, muscle_groups: sessionGroups(s).map((g) => g.label),
        total_sets: v.n, total_kg_lifted: Math.round(v.v),
        exercises: s.entries.map((en) => ({ lifts: liftLine(en), previous: previousFor(en.id, s.start) })),
        personal_bests_today: personalBests(s),
      },
    };
    const instructions = [
      "You write the title and description for a Strava activity: a home strength workout. Write in English.",
      "Use only the facts given. Never invent numbers, exercises, places or people.",
      "Title: at most 8 words, at most one emoji.",
      "Description: 2 to 5 short lines separated by newlines. You may list 2 to 4 key lifts like 'Dumbbell Bench Press: 3×10 @ 22 kg'. Mention personal bests if there are any. At most 500 characters. No hashtags.",
      "Never mock body, weight, age or looks.",
      STRAVA_TONE[mode],
    ].join(" ");
    S.aiBusy = `st:${id}`;
    render();
    const res = await aiCall("strava_post", instructions, input, STRAVA_SCHEMA);
    S.aiBusy = null;
    const s2 = S.history.sessions.find((x) => x.id === id);
    if (res && res.title && s2) {
      const s = s2;
      s.strava = Object.assign({}, s.strava, { [mode]: { title: String(res.title).slice(0, 120), description: String(res.description || "").slice(0, 700), by: res._by || "" } });
      S.stravaMode[id] = mode;
      send("save", { session: s });
    }
    render();
  }
  function renderStrava(s) {
    // Without a key only the Neutral template is offered: AI tones are hidden, not disabled.
    const mode = S.ai.hasKey ? S.stravaMode[s.id] || S.ai.stravaMode : "neutral";
    const busy = S.aiBusy === `st:${s.id}`;
    let post = s.strava && s.strava[mode];
    if (!post && !S.ai.hasKey && mode === "neutral") post = stravaTemplate(s);
    const modes = S.ai.hasKey ? STRAVA_MODES : STRAVA_MODES.filter((x) => x.key === "neutral");
    const seg = `<div class="seg">${modes.map((x) => `<button data-a="st-mode" data-v="${esc(s.id)}|${x.key}" aria-pressed="${mode === x.key}" ${S.aiBusy ? "disabled" : ""}>${x.label}</button>`).join("")}</div>`;
    let body;
    if (busy) body = `<p class="busy small">Writing a ${mode} title and description…</p>`;
    else if (post)
      body = `${post.basic ? `<span class="badge-ex">Template — no AI</span>` : `<span class="badge-ai">${esc(post.by ? `✦ AI-written by ${post.by}` : "✦ AI-written")}</span>`}<div class="st-post"><p class="st-title">${esc(post.title)}</p><p class="st-desc">${esc(post.description)}</p></div>
        <div class="st-actions"><button class="chip" data-a="st-copy" data-v="${esc(s.id)}|title">Copy title</button><button class="chip" data-a="st-copy" data-v="${esc(s.id)}|description">Copy description</button><button class="chip" data-a="st-copy" data-v="${esc(s.id)}|both">Copy both</button></div>
        ${post.basic ? `<p class="muted small">Add a Claude or OpenAI key in AI settings (Train tab, bottom) for AI-written posts in any tone.</p>` : `<button class="link small" data-a="st-gen" data-v="${esc(s.id)}" ${S.aiBusy ? "disabled" : ""}>Write another ${mode} version</button>`}`;
    else body = `<button class="ai-btn" data-a="st-gen" data-v="${esc(s.id)}" ${S.aiBusy ? "disabled" : ""}>✨ Write a ${mode} Strava post</button>`;
    return `<div class="strava"><p class="kicker st-k">Strava post</p>${seg}${body}</div>`;
  }

  function renderTabs() {
    const n = S.session ? S.session.entries.length : 0;
    $tabs.innerHTML = TABS.map((t) => `<button data-a="tab" data-v="${t.key}"${S.tab === t.key ? ' aria-current="page"' : ""}>
      ${ICON[t.key]}<span>${t.label}${t.key === "workout" && n ? ` (${n})` : ""}</span></button>`).join("");
  }

  // ------------------------------------------------ render
  const viewKey = () => (!S.consent ? "consent" : S.showDisclaimer ? "disclaimer" : S.detailId ? `detail:${S.detailId}` : S.tab === "train" ? `train:${S.trainView}` : S.tab);
  let currentKey = null;
  function render() {
    const key = viewKey();
    const same = currentKey === key;
    const y = window.scrollY;
    if (currentKey && !same) S.scroll[currentKey] = y;
    $app.innerHTML = !S.consent || S.showDisclaimer ? renderDisclaimer()
      : S.detailId ? renderDetail()
      : S.tab === "train" ? (!S.lib.length ? renderHome() : S.trainView === "list" ? renderList() : S.trainView === "ai" ? renderBuilder() : S.trainView === "plan" ? renderPlan() : renderHome())
      : S.tab === "workout" ? renderWorkout() : S.tab === "progress" ? renderProgress() : renderHistory();
    if (S.consent) renderTabs();
    else $tabs.innerHTML = "";
    updateLast();
    window.scrollTo(0, same ? y : key.startsWith("detail:") ? 0 : S.scroll[key] || 0);
    currentKey = key;
    if (S.detailId) want(S.detailId);
    else if (S.tab === "train" && (S.trainView === "list" || S.trainView === "plan")) observeThumbs();
  }

  function tick() {
    const el = $("#rest");
    const now = Date.now();
    if (S.rest.end) {
      const left = Math.ceil((S.rest.end - now) / 1000);
      el.hidden = false;
      if (left > 0) {
        el.classList.remove("go");
        el.querySelector(".rest-time").textContent = mmss(left);
        el.style.setProperty("--p", String(1 - left / (S.rest.total || 1)));
      } else {
        if (!S.rest.beeped) {
          S.rest.beeped = true;
          beep();
          el.classList.add("go");
          el.querySelector(".rest-time").textContent = "Go";
          el.style.setProperty("--p", "1");
        }
        if (now - S.rest.end > 4000) S.rest.end = 0;
      }
    } else el.hidden = true;
    const e2 = $("#elapsed");
    if (e2 && S.session) e2.textContent = elapsed(S.session.start);
  }

  // ------------------------------------------------ interactions
  let armT = null;
  function arm(key, fn) {
    clearTimeout(armT);
    if (S.armed === key) { S.armed = null; fn(); return; }
    S.armed = key;
    render();
    armT = setTimeout(() => { if (S.armed === key) { S.armed = null; render(); } }, 3000);
  }
  const ij = (v) => v.split(":").map(Number);

  const A = {
    builder: () => openBuilder(),
    "b-chip": (v) => {
      const b = S.builder;
      if (v === "auto") b.groups = [];
      else if (v.startsWith("g:")) { const k = v.slice(2); b.groups = b.groups.includes(k) ? b.groups.filter((x) => x !== k) : b.groups.concat(k); }
      else if (v.startsWith("e:")) { const q = v.slice(2); b.equipment = b.equipment.includes(q) ? b.equipment.filter((x) => x !== q) : b.equipment.concat(q); }
      render();
    },
    "b-min": (v) => { S.builder.minutes = +v; render(); },
    "b-int": (v) => { S.builder.intensity = v; render(); },
    "b-edit": () => { S.trainView = "ai"; render(); },
    build: () => buildPlan(),
    "plan-start": () => (S.session && S.session.entries.length ? arm("plan-start", startPlan) : startPlan()),
    analyze: (v) => analyze(v),
    reanalyze: (v) => { const s = S.history.sessions.find((x) => x.id === v); if (s && !S.aiBusy) { delete s.ai; analyze(v); } },
    "build-next": (v) => {
      const s = S.history.sessions.find((x) => x.id === v);
      const f = s && s.ai && s.ai.focus_next.find((x) => s.ai.next.groups.includes(x.group));
      if (f) S.builder.intensity = f.intensity === "light" ? "easy" : f.intensity;
      openBuilder(s && s.ai ? s.ai.next.groups : []);
    },
    aisettings: () => window.__aiOpen(),
    settings: () => openSettings(),
    "upd-now": (v, t) => updNow(t),
    "upd-later": () => updLater(),
    "upd-close": () => { const uo = $("#upd"); if (uo) uo.remove(); },
    accept: () => {
      S.consent = true;
      S.acceptedAt = new Date().toISOString();
      send("accept", { version: CFG.disclaimerVersion });
      render();
      showUpdateSheet();
    },
    disclaimer: () => { S.showDisclaimer = true; render(); },
    "close-disclaimer": () => { S.showDisclaimer = false; render(); },
    tab: (v) => { S.showDisclaimer = false; S.detailId = null; S.tab = v; S.armed = null; render(); },
    plate: (v) => { S.groups.has(v) ? S.groups.delete(v) : S.groups.add(v); S.muscle = "all"; render(); },
    browse: () => { if (S.groups.size) { S.trainView = "list"; S.q = ""; render(); } },
    home: () => { S.trainView = "home"; render(); },
    filter: (v) => { const i = v.indexOf("|"); S[v.slice(0, i)] = v.slice(i + 1); render(); },
    open: (v) => { S.detailId = v; render(); },
    preview: (v) => openPreview(v),
    "pv-close": () => closePreview(),
    "pv-open": (v) => { closePreview(); S.detailId = v; render(); },
    "add-ex": () => addExercises(),
    "go-muscles": () => { S.tab = "train"; S.detailId = null; S.trainView = "home"; render(); },
    "plan-start-add": () => {
      const go = () => { startPlan(); addExercises(); };
      return S.session && S.session.entries.length ? arm("plan-start-add", go) : go();
    },
    "close-detail": () => { S.detailId = null; render(); },
    add: (v) => {
      if (inSession(v)) {
        const s = S.session;
        const i = s.entries.findIndex((x) => x.id === v);
        if (s.entries[i].sets.some((x) => x.done)) return toast("Already has logged sets. Remove it from the Workout tab.");
        s.entries.splice(i, 1);
        saveDraft();
        toast("Removed from workout");
      } else {
        addToSession(v);
        toast("Added to workout");
      }
      render();
    },
    "add-set": (v) => {
      const en = S.session.entries[+v];
      const prev = en.sets[en.sets.length - 1];
      en.sets.push({ w: prev ? prev.w : null, r: prev ? prev.r : null, done: false });
      saveDraft();
      render();
    },
    "rm-set": (v) => {
      const [ei, si] = ij(v);
      const en = S.session.entries[ei];
      en.sets.splice(si, 1);
      if (!en.sets.length) en.sets.push({ w: null, r: null, done: false });
      saveDraft();
      render();
    },
    done: (v) => {
      const [ei, si] = ij(v);
      const en = S.session.entries[ei];
      const set = en.sets[si];
      if (!set.done && !(set.r > 0)) return toast("Enter reps first.", true);
      set.done = !set.done;
      if (set.done) {
        set.t = Date.now();
        en.startedAt = en.startedAt || set.t;
        S.focusId = en.id;
        startRest(en.rest);
      }
      saveDraft();
      render();
    },
    "rm-entry": (v) => arm("rm" + v, () => { S.session.entries.splice(+v, 1); saveDraft(); render(); }),
    "up-next": (v) => {
      const ei = +v;
      const en = S.session.entries[ei];
      moveEntry(ei, upNextIndex(ei));
      S.focusId = en.id;
      saveDraft();
      render();
      setTimeout(scrollToFocus, 30);
      toast(`${en.name} is up next`);
    },
    complete: (v) => completeEntry(+v),
    reopen: (v) => {
      const en = S.session.entries[+v];
      en.completed = false;
      delete en.doneAt;
      S.focusId = en.id;
      saveDraft();
      render();
    },
    finish: () => arm("finish", finish),
    discard: () => arm("discard", () => {
      S.session = null;
      clearTimeout(draftT);
      send("draft", { session: null });
      S.rest.end = 0;
      render();
      toast("Workout discarded");
    }),
    "rest-add": () => {
      const base = Math.max(S.rest.end, Date.now());
      S.rest = { end: base + 30000, total: Math.max(S.rest.total, Math.ceil((base + 30000 - Date.now()) / 1000)), beeped: false };
      tick();
    },
    "rest-skip": () => { S.rest.end = 0; tick(); },
    sync: () => {
      if (S.sync) return;
      S.sync = { phase: "Starting download", done: 0, total: 0 };
      send("sync", {});
      render();
    },
    sess: (v) => { S.openSession = S.openSession === v ? null : v; render(); },
    "hist-view": (v) => { S.histView = v; render(); },
    "cal-day": (v) => { S.cal.sel = S.cal.sel === v ? null : v; render(); },
    "cal-prev": () => { const d = new Date(S.cal.y, S.cal.m - 1, 1); S.cal = { y: d.getFullYear(), m: d.getMonth(), sel: null }; render(); },
    "cal-next": () => { const d = new Date(S.cal.y, S.cal.m + 1, 1); S.cal = { y: d.getFullYear(), m: d.getMonth(), sel: null }; render(); },
    "build-next-h": () => buildNextNow(),
    last: (v) => { focusDay(v); S.detailId = null; S.showDisclaimer = false; S.tab = "history"; render(); },
    "st-mode": (v) => {
      const [id, mode] = v.split("|");
      S.stravaMode[id] = mode;
      const s = S.history.sessions.find((x) => x.id === id);
      if (s && !(s.strava && s.strava[mode]) && S.ai.hasKey) stravaPost(id, mode);
      else render();
    },
    "st-gen": (v) => stravaPost(v, S.stravaMode[v] || S.ai.stravaMode),
    "st-copy": (v) => {
      const [id, what] = v.split("|");
      const s = S.history.sessions.find((x) => x.id === id);
      if (!s) return;
      const mode = S.stravaMode[id] || S.ai.stravaMode;
      const post = (s.strava && s.strava[mode]) || stravaTemplate(s);
      const text = what === "title" ? post.title : what === "description" ? post.description : `${post.title}\n\n${post.description}`;
      send("copy", { text, label: what === "title" ? "Title" : what === "description" ? "Description" : "Title and description" });
    },
    "del-sess": (v) => arm("del" + v, () => {
      S.history.sessions = S.history.sessions.filter((x) => x.id !== v);
      send("delete", { id: v });
      render();
      toast("Workout deleted");
    }),
    repeat: (v) => {
      if (S.session && S.session.entries.length) return toast("Finish or discard the current workout first.", true);
      const src = S.history.sessions.find((x) => x.id === v);
      if (!src) return;
      S.session = {
        id: uid(), start: new Date().toISOString(), groups: [...(src.groups || [])],
        entries: src.entries.map((en) => ({ id: en.id, name: en.name, sets: en.sets.map((x) => ({ w: x.w, r: x.r, done: false })) })),
      };
      saveDraft();
      S.tab = "workout";
      render();
    },
    export: () => send("export", {}),
    club: () => send("open", { url: CLUB_URL }),
    frame: (v) => {
      const st = $(".stage");
      if (st) st.dataset.frame = v;
      document.querySelectorAll(".seg button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === v)));
    },
  };

  document.addEventListener("click", (ev) => {
    unlockAudio();
    const t = ev.target.closest("[data-a]");
    if (!t || t.disabled) return;
    const fn = A[t.dataset.a];
    if (fn) { ev.preventDefault(); fn(t.dataset.v, t); }
  });

  document.addEventListener("input", (ev) => {
    const t = ev.target;
    const k = t.dataset && t.dataset.in;
    if (!k) return;
    if (k === "b-note") { S.builder.note = t.value.slice(0, 300); return; }
    if (k === "q") {
      S.q = t.value;
      const r = $("#results");
      if (r) { r.innerHTML = resultsHTML(); observeThumbs(); }
      return;
    }
    const en = S.session && S.session.entries[+t.dataset.ei];
    const set = en && en.sets[+t.dataset.si];
    if (!set) return;
    const n = num(t.value);
    set[k] = k === "r" ? (n == null ? null : Math.round(n)) : n;
    saveDraft();
  });

  // ------------------------------------------------ bridge for Scriptable
  window.HG = {
    drain() { const o = S.outbox; S.outbox = []; return JSON.stringify(o); },
    onImages(id, arr) { S.pending.delete(id); if (arr && arr.length) { S.imgs[id] = arr; paintImages(id); } },
    onSync(p) {
      S.sync = p;
      const el = $("#sync");
      if (el) el.outerHTML = syncProgress();
      else if (S.tab === "train" && !S.detailId) render();
    },
    onLibrary(lib, meta) {
      setLib(lib);
      S.meta = meta;
      S.sync = null;
      S.imgs = {};
      S.pending.clear();
      render();
      toast(`Library ready: ${lib.length} exercises${meta && meta.failed ? `. ${meta.failed} photos failed, tap Update library to retry.` : ""}`, !!(meta && meta.failed));
    },
    onHistory() {
      // Saves are echoed back; the in-app copy is already the newest, so just refresh the view.
      if (S.tab === "history" && !S.detailId) render();
    },
    onError(msg) { S.sync = null; render(); toast(msg, true); },
    onAI(rid, out) {
      const done = aiWaiting[rid];
      delete aiWaiting[rid];
      out = out || {};
      if (out.needKey) {
        S.ai.hasKey = false;
        toast("Add a Claude or OpenAI key in AI settings to use the AI coach.", true);
      } else if (out.error) toast(`AI coach: ${out.error}`, true);
      if (done) done(out.data ? Object.assign(out.data, { _by: out.by }) : null);
    },
    onSettings(st) {   // fresh Settings state from the Scriptable side
      SET = st;
      CFG.rest = st.cfg.restSeconds;
      S.ai.stravaMode = st.settings.stravaMode;
      renderCfg();
    },
    onUpdateCheck(msg, available) {
      const um = document.getElementById("updmsg"), b = document.querySelector('#cfgsheet [data-act="updcheck"]');
      if (um) um.textContent = msg; if (b) b.disabled = false;
      if (available) closeSettings();
    },
    showUpdate(u) {
      if (!u || !u.latest) return;
      S.update = u;
      showUpdateSheet(); // waits for the disclaimer to be accepted on a first launch
    },
    onUpdateDone(ok, res) {
      const ov = $("#upd");
      if (!ov) return;
      const btn = ov.querySelector(".updgo");
      const msg = ov.querySelector(".updmsg");
      const later = ov.querySelector(".updlater");
      if (ok) {
        S.update = null;
        ov.querySelector(".updtag").textContent = `Updated to ${res}`;
        msg.innerHTML = "<b>✓ Done.</b> Close the app and open it again to start using the new version.";
        btn.disabled = false;
        btn.textContent = "Got it";
        btn.dataset.a = "upd-close";
      } else {
        msg.textContent = res || "Update failed";
        btn.disabled = false;
        btn.textContent = "Try again";
        later.hidden = false;
      }
    },
    toast(msg) { toast(msg); },
  };

  setLib(BOOT.lib);
  if (S.session && S.session.entries && S.session.entries.length) {
    S.tab = "workout";
    setTimeout(() => toast("Unfinished workout restored"), 300);
  } else S.session = null;
  render();
  layoutBand();
  window.addEventListener("resize", layoutBand);
  setInterval(tick, 250);
}

// ---------------------------------------------------------------- styles
const CSS = `
#aisheet{--ai-paper:var(--bg);--ai-sheet:var(--surface);--ai-rule:var(--line);--ai-ink:var(--ink);--ai-muted:var(--muted);--ai-signal:var(--accent);--ai-wash:color-mix(in srgb,var(--ai-signal) 14%,transparent);--ai-danger:#d93636;
  position:fixed;inset:0;z-index:60;background:var(--ai-paper);color:var(--ai-ink);transform:translateY(102%);visibility:hidden;transition:transform .28s ease,visibility 0s linear .28s;overflow-y:auto;-webkit-overflow-scrolling:touch;font:15px/1.4 -apple-system,system-ui,sans-serif;text-align:left}
#aisheet.open{transform:none;visibility:visible;transition:transform .28s ease}
#aisheet *{box-sizing:border-box}
#aisheet button{font:inherit;color:inherit;background:none;border:0;margin:0;padding:0;cursor:pointer;-webkit-appearance:none;appearance:none;touch-action:manipulation}
#aisheet .sh-head{position:sticky;top:0;z-index:1;display:flex;align-items:center;justify-content:space-between;padding:calc(10px + env(safe-area-inset-top,0px)) 16px 10px;background:var(--ai-paper);border-bottom:1px solid var(--ai-rule)}
#aisheet .sh-head h2{margin:0;font-size:22px;font-weight:700}
#aisheet .sh-body{padding:4px 16px calc(28px + env(safe-area-inset-bottom,0px));max-width:680px;margin:0 auto}
#aisheet .link{color:var(--ai-signal);font-weight:600;font-size:17px;padding:8px 0 8px 12px}
#aisheet .hint{font-size:14px;color:var(--ai-muted);margin:12px 0 0}
#aisheet .muted{color:var(--ai-muted)} #aisheet .small{font-size:13px} #aisheet .pad{padding:4px 0 8px;margin:0}
#aisheet .note{font-size:12.5px;color:var(--ai-muted);margin:6px 0 0}
#aisheet .sec{font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--ai-muted);margin:24px 0 8px}
#aisheet .sm{font-size:14px;font-weight:600;padding:8px 12px;border-radius:9px;border:1px solid var(--ai-rule);background:var(--ai-sheet);color:var(--ai-ink)}
#aisheet .sm.primary{background:var(--ai-signal);border-color:var(--ai-signal);color:#fff}
#aisheet .srow{display:flex;align-items:center;gap:12px;background:var(--ai-sheet);border:1px solid var(--ai-rule);border-radius:14px;padding:12px 14px;margin:8px 0}
#aisheet .grow{flex:1;min-width:0} #aisheet .grow b{display:block;font-weight:600} #aisheet .grow small{display:block;font-size:13px;margin-top:2px}
#aisheet .switch{flex:none;width:51px;height:31px;border-radius:16px;background:var(--ai-rule);position:relative;transition:background .2s}
#aisheet .switch::after{content:"";position:absolute;top:2px;left:2px;width:27px;height:27px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.3);transition:transform .2s}
#aisheet .switch.on{background:var(--ai-signal)} #aisheet .switch.on::after{transform:translateX(20px)}
#aisheet .aicard,#aisheet .ucard{background:var(--ai-sheet);border:1px solid var(--ai-rule);border-radius:14px;padding:14px;margin:14px 0}
#aisheet .aicard.active{border-color:var(--ai-signal);box-shadow:0 0 0 1px var(--ai-signal)}
#aisheet .aic-h{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:17px}
#aisheet .aic-row{display:flex;align-items:center;gap:10px;margin-top:10px;font-size:14px}
#aisheet .aic-row.lbl,#aisheet .aic-row .lbl{font-weight:600}
#aisheet code{font:13px ui-monospace,Menlo,monospace;background:var(--ai-paper);border:1px solid var(--ai-rule);border-radius:6px;padding:2px 6px}
#aisheet .aic-btns{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:10px}
#aisheet .sm[disabled]{opacity:.5}
#aisheet .modelsel{display:block;width:100%;margin-top:6px;font:16px -apple-system,system-ui,sans-serif;color:var(--ai-ink);background:var(--ai-paper);border:1px solid var(--ai-rule);border-radius:9px;padding:9px 10px}
#aisheet .danger{color:var(--ai-danger)} #aisheet .danger.armed{background:var(--ai-danger);color:#fff;border-color:var(--ai-danger)}
#aisheet .ustat{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:10px 0 4px}
#aisheet .ustat div{background:var(--ai-paper);border-radius:10px;padding:8px 10px}
#aisheet .ustat b{display:block;font-size:20px;font-weight:700}
#aisheet .ustat small{color:var(--ai-muted);font-size:12px}
#aisheet .ubars{display:flex;align-items:flex-end;gap:3px;height:56px;margin-top:10px}
#aisheet .ubars span{flex:1;background:var(--ai-signal);border-radius:3px 3px 0 0;min-height:2px}
#aisheet .ubars span.zero{background:var(--ai-rule)}
#aisheet .ubars-l{display:flex;justify-content:space-between;font-size:11.5px;color:var(--ai-muted);margin-top:4px}
#aisheet .utab{width:100%;border-collapse:collapse;margin-top:12px;font-size:13px}
#aisheet .utab th{text-align:left;font-weight:600;color:var(--ai-muted);padding:4px 4px 4px 0;border-bottom:1px solid var(--ai-rule)}
#aisheet .utab td{padding:6px 4px 6px 0;border-bottom:1px solid var(--ai-rule);word-break:break-word}
#aisheet .utab th:not(:first-child),#aisheet .utab td:not(:first-child){text-align:right;white-space:nowrap}
#aitoast{position:fixed;left:50%;bottom:calc(24px + env(safe-area-inset-bottom,0px));z-index:61;transform:translate(-50%,20px);opacity:0;visibility:hidden;max-width:90vw;padding:10px 16px;border-radius:18px;background:var(--ink);color:var(--bg);font:14px/1.35 -apple-system,system-ui,sans-serif;text-align:center;pointer-events:none;transition:transform .25s,opacity .25s,visibility 0s linear .25s}
#aitoast.on{transform:translate(-50%,0);opacity:1;visibility:visible;transition:transform .25s,opacity .25s}
.badge-ai{display:inline-block;font-size:12px;font-weight:700;color:var(--accent);background:color-mix(in srgb,var(--accent) 14%,transparent);border-radius:6px;padding:2px 8px}
.badge-ex{display:inline-block;font-size:12px;font-weight:600;color:var(--muted);border:1px dashed var(--muted);border-radius:6px;padding:1px 8px}
.st-post{margin-top:8px}
:root{
  --ts:1; --serif: ui-serif, "New York", Georgia, serif; --sans: -apple-system, system-ui, "Helvetica Neue", sans-serif;
  --condensed:"Avenir Next Condensed","AvenirNextCondensed-Bold","Arial Narrow",system-ui,sans-serif;
  --display:var(--condensed); --body:var(--sans);
  --accent-ink:#FFFFFF;
  --p-red:#C8102E;--p-blue:#1F4E9E;--p-yellow:#F2B705;--p-green:#2E8B3E;--p-white:#F4F4F1;--p-steel:#7B8794;
  --thumb:64px; --expad:10px 12px; --entrypad:12px 14px 4px;
}
html[data-font=serif]{--display:var(--serif)}
${PALETTE_CSS}
:root{--bg:var(--paper);--surface:var(--sheet);--line:var(--rule);--accent:var(--signal)}
body.d-compact{--thumb:48px;--expad:7px 12px}
body.d-tiny{--thumb:0px;--expad:8px 12px}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html,body{margin:0;background:var(--bg);color:var(--ink);font:calc(16px * var(--ts))/1.45 var(--body);-webkit-text-size-adjust:100%}
body{padding:var(--band,env(safe-area-inset-top,0px)) 0 calc(150px + env(safe-area-inset-bottom,0px))}
body::before{content:"";position:fixed;inset:0 0 auto;height:var(--band,env(safe-area-inset-top,0px));background:var(--bg);z-index:10}
#sat{position:fixed;top:0;left:0;width:1px;height:env(safe-area-inset-top,0px);visibility:hidden;pointer-events:none}
#last{position:fixed;z-index:12;left:50%;top:var(--pill-top,5px);transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;
  height:34px;max-width:var(--pill-max,calc(100vw - 24px));padding:0 12px;border-radius:12px;background:var(--surface);border:1px solid var(--line);
  font:500 calc(11.5px * var(--ts))/1.1 var(--body);color:var(--muted);white-space:nowrap;overflow:hidden}
#last[hidden]{display:none}
#last .last-1,#last .last-2{display:flex;align-items:center;gap:5px;max-width:100%;overflow:hidden;text-overflow:ellipsis}
#last .last-1{color:var(--ink);font-weight:600}
#last .last-k{font-weight:800;color:var(--accent);text-transform:uppercase;font-size:calc(9.5px * var(--ts));letter-spacing:.06em}
#last .dots{gap:3px;flex:none}#last .dot{width:7px;height:7px}
.hbtn{flex:none;background:var(--accent);color:var(--accent-ink);font:700 calc(15px * var(--ts))/1 var(--body);padding:9px 14px;border-radius:999px;white-space:nowrap;text-align:center}
.hbtn:disabled{opacity:.4}
.hbtn.armed{background:var(--ink);color:var(--bg)!important;text-decoration:none}
#app{max-width:640px;margin:0 auto;padding:0 16px 32px}
button{font:inherit;color:inherit;background:none;border:0;padding:0;cursor:pointer;text-align:inherit}
button:focus-visible,input:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
h2{font:700 calc(20px * var(--ts))/1.2 var(--display);margin:22px 0 8px}
p{margin:0 0 10px}
.muted{color:var(--muted)}.small{font-size:calc(14px * var(--ts))}
.hero{font:800 calc(46px * var(--ts))/.95 var(--display);margin:14px 0 8px;letter-spacing:-.01em}
.brand{display:flex;align-items:center;gap:8px;min-height:56px;padding:6px 0 8px;border-bottom:1px solid var(--line)}
.brand-mark svg{display:block;width:24px;height:24px}
.brand-name{font:800 calc(19px * var(--ts))/1 var(--display);margin-right:auto;letter-spacing:-.01em}
.club{font-size:calc(13px * var(--ts));color:var(--muted);padding:8px 0 8px 8px;min-width:0;text-align:right;line-height:1.2}
.club b{white-space:nowrap}
.club b{color:var(--ink);font-weight:700}
.club span{color:var(--accent);font-weight:700}
.title{font:800 calc(32px * var(--ts))/1.02 var(--display);margin:6px 0 12px;letter-spacing:-.01em}
.lead{color:var(--muted);margin-bottom:16px}
.bar{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:48px;position:sticky;top:var(--band,env(safe-area-inset-top,0px));background:var(--bg);z-index:5}
.bar .title{margin:10px 0}
.back{display:inline-flex;align-items:center;gap:2px;font:600 calc(15px * var(--ts))/1 var(--body);color:var(--ink);background:var(--surface);border:1px solid var(--line);
  padding:8px 13px 8px 10px;border-radius:999px;white-space:nowrap}
.bar .back:first-child{margin-right:auto}
.add-hint{font-size:calc(14px * var(--ts));background:var(--surface);border-left:3px solid var(--accent);border-radius:8px;padding:8px 10px;margin:0 0 10px}
.pv-btn{flex:none;width:34px;height:34px;border-radius:17px;display:grid;place-items:center;border:1px solid var(--line);background:var(--bg);color:var(--ink)}
.pv-btn svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.entry-head{align-items:center}.entry-head .entry-name{flex:1;text-align:left}
.drag{flex:none;width:28px;height:36px;margin-left:-8px;display:grid;place-items:center;color:var(--muted);touch-action:none;-webkit-user-select:none;user-select:none;cursor:grab}
.drag svg{width:18px;height:18px;fill:currentColor}
.entry{transition:transform .18s ease,box-shadow .18s ease}
.entry.dragging{transition:none;position:relative;z-index:30;box-shadow:0 12px 30px rgba(0,0,0,.3)}
body.is-dragging{-webkit-user-select:none;user-select:none}
.entry.focus{box-shadow:0 0 0 2px var(--accent)}
.entry-status{margin:0 0 2px;font-size:calc(12px * var(--ts));font-weight:800;color:var(--accent);text-transform:uppercase;letter-spacing:.05em}
.entry-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:4px 0 8px}
.entry-actions .link{margin-right:auto}
.entry-actions .chip.complete-btn{background:var(--done);border-color:var(--done);color:#fff;font-weight:700}
.done-row{display:flex;align-items:center;gap:4px;padding:6px 10px 6px 14px;opacity:.92}
.done-main{flex:1;min-width:0;display:flex;align-items:center;gap:8px;padding:6px 0;text-align:left;white-space:nowrap;overflow:hidden}
.done-main .ck{flex:none;width:22px;height:22px;border-radius:11px;background:var(--done);color:#fff;display:grid;place-items:center;font-size:13px;font-weight:800}
.done-main b{flex:0 1 auto;max-width:32%;overflow:hidden;text-overflow:ellipsis;font-size:calc(15px * var(--ts))}
.dl-meta{flex:1;min-width:0;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--muted);font-size:calc(13px * var(--ts))}
.dl-meta .dot{display:inline-block;vertical-align:-1px;margin-right:4px}
.plan-ex.pv-row{grid-template-columns:64px 1fr 34px}
#pv{position:fixed;inset:0;z-index:55;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:18px}
.pv-card{width:100%;max-width:440px;background:var(--surface);color:var(--ink);border-radius:18px;padding:14px 14px 10px;box-shadow:0 12px 40px rgba(0,0,0,.35);overflow:hidden}
.pv-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:8px}
.pv-head b{font:800 calc(21px * var(--ts))/1.15 var(--display)}
.pv-x{flex:none;width:32px;height:32px;border-radius:16px;background:var(--bg);font-size:22px;line-height:1;text-align:center}
.pv-stage{margin:0 0 8px}
.pv-meta{margin:0 0 4px}
.pv-actions{display:grid;grid-template-columns:1fr 1.4fr;gap:8px;margin-top:10px}
.pv-actions .primary,.pv-actions .secondary{margin:0;white-space:nowrap;font-size:calc(17px * var(--ts));padding:13px 10px}
.pv-bar{height:4px;border-radius:2px;background:var(--line);margin:12px 0 4px;overflow:hidden}
.pv-bar i{display:block;height:100%;background:var(--accent);transform-origin:left;animation:pvbar 10s linear forwards}
@keyframes pvbar{from{transform:scaleX(1)}to{transform:scaleX(0)}}
.pv-auto{font-size:12px;color:var(--muted);text-align:center;margin:0}
.link{color:var(--accent);font-weight:600;padding:10px 0}
.link.danger{color:var(--muted)}
.armed{color:var(--accent)!important;text-decoration:underline}
.primary{display:block;width:100%;margin:14px 0 6px;padding:15px 16px;border-radius:12px;background:var(--accent);color:var(--accent-ink);font:700 calc(20px * var(--ts))/1 var(--display);text-align:center}
.primary:disabled{opacity:.35}
.primary.armed{background:var(--ink);color:var(--bg)!important;text-decoration:none}
.secondary{display:block;width:100%;margin:6px 0;padding:13px 16px;border-radius:12px;border:1.5px solid var(--line);font-weight:600;text-align:center}
.rack{display:grid;grid-template-columns:repeat(3,1fr);gap:14px 12px;margin:20px 0 10px}
.plate{position:relative;aspect-ratio:1;border-radius:50%;background:var(--pc);color:var(--pi);
  box-shadow:inset 0 0 0 5px rgba(0,0,0,.16),inset 0 0 0 9px rgba(255,255,255,.10),inset 0 0 0 1px rgba(0,0,0,.25);transition:transform .15s ease,box-shadow .15s ease}
.plate::after{content:"";position:absolute;left:50%;top:50%;width:17%;aspect-ratio:1;border-radius:50%;transform:translate(-50%,-50%);
  background:var(--bg);box-shadow:inset 0 0 0 3px rgba(0,0,0,.28),0 0 0 4px rgba(0,0,0,.12)}
.pl-name{position:absolute;left:8%;right:8%;top:20%;text-align:center;font:800 calc(17px * var(--ts))/1 var(--display);letter-spacing:-.01em}
.pl-count{position:absolute;left:0;right:0;bottom:19%;text-align:center;font:600 calc(13px * var(--ts))/1 var(--body);opacity:.8;font-variant-numeric:tabular-nums}
.plate[aria-pressed="true"]{transform:scale(1.05);box-shadow:0 0 0 3px var(--bg),0 0 0 6px var(--ink),inset 0 0 0 5px rgba(0,0,0,.16),inset 0 0 0 9px rgba(255,255,255,.10)}
.plate[aria-pressed="false"]{opacity:.82}
@media (prefers-color-scheme:dark){.pl-iron{box-shadow:inset 0 0 0 5px rgba(255,255,255,.14),inset 0 0 0 1.5px rgba(255,255,255,.35)}}
.pl-red{--pc:var(--p-red);--pi:#fff}.pl-blue{--pc:var(--p-blue);--pi:#fff}.pl-yellow{--pc:var(--p-yellow);--pi:#1A1A12}
.pl-green{--pc:var(--p-green);--pi:#fff}.pl-white{--pc:var(--p-white);--pi:#1A1D20}.pl-steel{--pc:var(--p-steel);--pi:#fff}.pl-iron{--pc:var(--p-iron);--pi:#E9ECEF}
.resume{display:flex;justify-content:space-between;align-items:center;width:100%;padding:12px 14px;border-radius:12px;background:var(--ink);color:var(--bg);margin:4px 0 6px}
.lib{margin-top:26px;padding-top:14px;border-top:1px solid var(--line)}
.sync{margin:14px 0}.progress{height:8px;border-radius:4px;background:var(--line);overflow:hidden;margin:8px 0}
.progress i{display:block;height:100%;background:var(--accent);transition:width .3s}
.chips{display:flex;gap:8px;overflow-x:auto;margin:0 -16px 8px;padding:2px 16px;scrollbar-width:none}
.chips::-webkit-scrollbar{display:none}
.chip{flex:none;padding:7px 13px;border-radius:999px;border:1px solid var(--line);background:var(--surface);font-size:calc(14px * var(--ts));white-space:nowrap}
.chip[aria-pressed="true"]{background:var(--ink);color:var(--bg);border-color:var(--ink)}
.search{width:100%;font:16px var(--body);padding:11px 14px;margin:6px 0 4px;border-radius:10px;border:1px solid var(--line);background:var(--surface);color:var(--ink);-webkit-appearance:none}
.count{margin:10px 2px 6px}
.list{background:var(--surface);border-radius:14px;overflow:hidden}
.ex{display:grid;grid-template-columns:var(--thumb) 1fr 42px;gap:12px;align-items:center;padding:var(--expad);border-top:1px solid var(--line)}
.ex:first-child{border-top:0}
.ex-name{font-weight:600;line-height:1.25}.ex-meta{font-size:calc(13px * var(--ts));color:var(--muted);margin-top:2px}
.thumb{position:relative;width:var(--thumb);height:var(--thumb);border-radius:8px;background:var(--bg);overflow:hidden;display:grid;place-items:center}
.thumb span{font:800 calc(18px * var(--ts)) var(--display);color:var(--muted)}
.thumb img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;background:#fff}
.add{width:40px;height:40px;border-radius:50%;border:2px solid var(--ink);font-size:calc(22px * var(--ts));line-height:1;text-align:center}
.add.on{background:var(--done);border-color:var(--done);color:#fff;font-size:calc(18px * var(--ts))}
.stage{position:relative;aspect-ratio:4/3;background:#fff;border-radius:14px;overflow:hidden;margin:4px 0 8px}
.stage img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain}
.stage .f1{animation:frame 2.4s ease-in-out infinite}
@keyframes frame{0%,35%{opacity:0}50%,85%{opacity:1}100%{opacity:0}}
.stage[data-frame="0"] .f1{animation:none;opacity:0}.stage[data-frame="1"] .f1{animation:none;opacity:1}
@media (prefers-reduced-motion:reduce){.stage[data-frame="play"] .f1{animation:none;opacity:0}}
.noimg{position:absolute;inset:0;display:grid;place-items:center;padding:20px;text-align:center;color:#5A636C;margin:0}
.seg{display:grid;grid-template-columns:repeat(3,1fr);background:var(--surface);border-radius:10px;padding:3px;margin-bottom:12px}
.seg button{padding:7px 0;border-radius:8px;font-size:calc(14px * var(--ts));font-weight:600;text-align:center;color:var(--muted)}
.seg button[aria-pressed="true"]{background:var(--ink);color:var(--bg)}
.tags{display:flex;flex-wrap:wrap;gap:6px}
.tag{display:inline-flex;align-items:center;gap:6px;font-size:calc(14px * var(--ts));padding:4px 10px;border-radius:6px;background:var(--surface)}
.tags.quiet .tag{background:transparent;border:1px solid var(--line)}
.dot{display:inline-block;width:10px;height:10px;border-radius:50%;background:var(--pc);box-shadow:inset 0 0 0 1px rgba(0,0,0,.25)}
.steps{padding-left:22px;margin:0}.steps li{margin:0 0 10px;padding-left:4px}
.spark{width:100%;height:70px;display:block}
.spark polyline{fill:none;stroke:var(--accent);stroke-width:2.5;vector-effect:non-scaling-stroke}
.spark circle{fill:var(--accent)}
.cta{margin-top:18px}
.ver{font-size:calc(12px * var(--ts));color:var(--muted);margin:14px 0 0;opacity:.8}
#upd{position:fixed;inset:0;z-index:48;background:rgba(0,0,0,.55);display:flex;align-items:flex-end;justify-content:center}
.updp{width:100%;max-width:640px;background:var(--surface);color:var(--ink);border-radius:22px 22px 0 0;padding:20px 18px calc(16px + env(safe-area-inset-bottom,0px));display:flex;flex-direction:column;gap:8px;
  box-shadow:0 -8px 30px rgba(0,0,0,.25)}
.updtag{align-self:flex-start;background:var(--accent);color:#fff;font-size:calc(12px * var(--ts));font-weight:800;padding:4px 10px;border-radius:999px}
.updt{margin:6px 0 0;font:800 calc(26px * var(--ts))/1.1 var(--display)}
.upds{color:var(--muted);font-size:calc(14px * var(--ts))}
.updl{display:flex;flex-direction:column;gap:10px;margin:8px 0 6px}
.updi{display:flex;gap:12px;align-items:flex-start;background:var(--bg);border-radius:14px;padding:12px}
.updic{font-size:calc(24px * var(--ts));line-height:1.1;flex:none}
.updi b{display:block;font-size:calc(15px * var(--ts))}
.updi span{display:block;color:var(--muted);font-size:calc(13px * var(--ts));line-height:1.35;margin-top:2px}
.updmsg{font-size:calc(14px * var(--ts))}.updmsg:empty{display:none}
.updgo{padding:14px;border-radius:12px;background:var(--accent);color:#fff;font:700 calc(19px * var(--ts))/1 var(--display);text-align:center}
.updgo:disabled{opacity:.6}
.updlater{padding:12px;border-radius:12px;background:var(--bg);color:var(--ink);font-weight:600;text-align:center}
.updlater[hidden]{display:none}
.chips.wrap{flex-wrap:wrap;overflow:visible;margin:0 0 6px;padding:2px 0}
.seg4{grid-template-columns:repeat(4,1fr)}
.seg2{grid-template-columns:repeat(2,1fr)}
.cal{background:var(--surface);border-radius:14px;padding:10px 8px 8px}
.cal-head{display:flex;align-items:center;justify-content:space-between;padding:0 4px 8px}
.cal-head b{font:800 calc(20px * var(--ts))/1 var(--display)}
.cal-nav{width:40px;height:36px;font-size:calc(24px * var(--ts));line-height:1;text-align:center;color:var(--accent);border-radius:8px}
.cal-nav:disabled{opacity:.25}
.cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:3px}
.cal-wd{text-align:center;font-size:calc(12px * var(--ts));font-weight:700;color:var(--muted);padding-bottom:4px}
.cd{position:relative;aspect-ratio:1/1.08;border-radius:9px;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;padding-top:5px;gap:3px;text-align:center}
.cd .cd-n{font-size:calc(14px * var(--ts));font-weight:600;color:var(--muted);line-height:1}
.cd.has{background:var(--bg)}
.cd.has .cd-n{color:var(--ink);font-weight:800}
.cd.today .cd-n{color:var(--accent)}
.cd.today{box-shadow:inset 0 0 0 1.5px var(--accent)}
.cd.sel{background:var(--ink)}.cd.sel .cd-n{color:var(--bg)}
.cd-dots{display:flex;flex-wrap:wrap;justify-content:center;gap:2px;max-width:30px}
.cd-dots .dot{width:8px;height:8px}
.cd.sel .dot{box-shadow:0 0 0 1px var(--bg)}
.cd-more{font-size:calc(10px * var(--ts));font-weight:700;color:var(--muted);line-height:8px}
.cd:disabled{cursor:default}
.month-sum{margin:12px 2px 6px}
.legend{display:flex;flex-wrap:wrap;gap:6px 12px;margin:4px 2px 6px}
.lg{display:inline-flex;align-items:center;gap:5px;font-size:calc(13px * var(--ts))}
.lg b{font-variant-numeric:tabular-nums}
.lg.zero{opacity:.45}
.weeks{width:100%;height:auto;display:block;background:var(--surface);border-radius:14px;padding:8px 6px 2px}
.weeks .gl{stroke:var(--line);stroke-width:1}
.weeks .ax{font:calc(10px * var(--ts)) var(--body);fill:var(--muted)}
.weeks rect{stroke:rgba(0,0,0,.18);stroke-width:.5}
.f-red{fill:var(--p-red)}.f-blue{fill:var(--p-blue)}.f-yellow{fill:var(--p-yellow)}.f-green{fill:var(--p-green)}.f-white{fill:var(--p-white)}.f-steel{fill:var(--p-steel)}.f-iron{fill:var(--p-iron)}
@media (prefers-color-scheme:dark){.weeks rect{stroke:rgba(255,255,255,.22)}}
.balance{background:var(--surface);border-radius:14px;padding:6px 12px}
.bal{display:grid;grid-template-columns:92px 1fr 26px 74px;gap:8px;align-items:center;padding:7px 0;border-top:1px solid var(--line)}
.bal:first-child{border-top:0}
.bal-name{display:flex;align-items:center;gap:6px;font-size:calc(14px * var(--ts));font-weight:600}
.bal-bar{height:10px;border-radius:5px;background:var(--bg);overflow:hidden}
.bal-bar i{display:block;height:100%;border-radius:5px;background:var(--pc);box-shadow:inset 0 0 0 1px rgba(0,0,0,.18)}
.bal-n{text-align:right;font-weight:700;font-variant-numeric:tabular-nums}
.bal-d{text-align:right}
.lifts{background:var(--surface);border-radius:14px;overflow:hidden}
.lift{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;padding:11px 14px;border-top:1px solid var(--line)}
.lift:first-child{border-top:0}
.lift b{display:block;font-weight:600;line-height:1.25}
.lift .up{color:var(--done);font-weight:700}.lift .down{color:var(--accent);font-weight:700}
.mini{width:90px;height:30px;flex:none}
.mini polyline{fill:none;stroke:var(--accent);stroke-width:2;vector-effect:non-scaling-stroke}
.strava{margin:12px 0 4px;padding:12px 14px;border-radius:12px;background:var(--bg)}
.st-k{color:#FC4C02;margin:0 0 8px}
.st-post{background:var(--surface);border-radius:10px;padding:10px 12px;margin-bottom:8px}
.st-title{font-weight:800;margin:0 0 4px}
.st-desc{white-space:pre-line;margin:0;font-size:calc(15px * var(--ts))}
.st-actions{display:flex;flex-wrap:wrap;gap:6px}
textarea.search{resize:none;line-height:1.4}
.secondary.ai{border-color:var(--accent);color:var(--accent);font-weight:700}
.busy{animation:pulse 1.2s ease-in-out infinite}
@keyframes pulse{50%{opacity:.55}}
@media (prefers-reduced-motion:reduce){.busy{animation:none}}
.kicker{font-size:calc(13px * var(--ts));font-weight:700;color:var(--accent);margin:8px 0 0}
.keybox{background:var(--surface);border-radius:14px;padding:14px;margin:18px 0 4px;border:1.5px dashed var(--accent)}
.keyrow{display:flex;gap:8px;align-items:center}
.keyrow input{flex:1;min-width:0;font:16px var(--body);padding:10px 12px;border-radius:10px;border:1px solid var(--line);background:var(--bg);color:var(--ink);-webkit-appearance:none}
.plan-ex{grid-template-columns:64px 1fr}
.skel .sk{height:12px;border-radius:6px;background:var(--line);margin:6px 0}
.skel .sk1{width:70%}.skel .sk2{width:45%}
.skel{animation:pulse 1.2s ease-in-out infinite}
@media (prefers-reduced-motion:reduce){.skel{animation:none}}
.plan-ex .ex-meta b{color:var(--ink);font-weight:700}
.coach-note{margin:2px 0 4px;color:var(--ink)}
.ai-btn{display:block;width:100%;margin:12px 0 4px;padding:12px;border-radius:12px;border:1.5px solid var(--accent);color:var(--accent);font-weight:700;text-align:center}
.coach{margin:12px 0 4px;padding:12px 14px;border-radius:12px;background:var(--bg)}
.coach .kicker{margin:0 0 2px}
.coach-h{font:800 calc(20px * var(--ts))/1.2 var(--display);margin:0 0 6px}
.coach h3{font-size:calc(13px * var(--ts));text-transform:uppercase;letter-spacing:.04em;color:var(--muted);margin:14px 0 4px}
.coach ul{margin:0;padding-left:18px}.coach li{margin:0 0 4px}
.focus-row{padding:6px 0;border-top:1px solid var(--line)}
.focus-top{display:flex;align-items:center;gap:8px}
.focus-row p{margin:2px 0 0 18px}
.int{margin-left:auto;font-size:calc(13px * var(--ts));font-weight:700;padding:2px 8px;border-radius:6px}
.int-light{background:rgba(46,139,62,.16);color:var(--done)}
.int-moderate{background:rgba(242,183,5,.22);color:var(--ink)}
.int-hard{background:rgba(200,16,46,.15);color:var(--accent)}
.spark-mark{font-style:normal;font-size:calc(14px * var(--ts))}
.row{flex-wrap:wrap;gap:0 18px}
.note{font-size:calc(14px * var(--ts));color:var(--muted);border-left:3px solid var(--accent);padding:2px 0 2px 10px;margin:4px 0 0}
.disclaimer{background:var(--surface);border-radius:14px;padding:16px 16px 6px;margin:8px 0 6px}
.disclaimer p{margin:0 0 12px}
.empty{padding:30px 0}.empty-line{padding:20px 4px;color:var(--muted)}
.entry{background:var(--surface);border-radius:14px;padding:12px 14px 4px;margin:0 0 12px}
.entry-head{display:flex;justify-content:space-between;align-items:baseline;gap:10px}
.entry-name{font:800 calc(21px * var(--ts))/1.1 var(--display);padding:4px 0;color:var(--ink)}
.set-row{display:grid;grid-template-columns:26px 1fr 1fr 44px 28px;gap:8px;align-items:center;margin-top:8px}
.set-row.head{font-size:calc(12px * var(--ts));color:var(--muted);margin-top:4px}
.set-row .n{font-weight:700;color:var(--muted);text-align:center}
.set-row input{width:100%;font:600 17px var(--body);padding:9px 6px;border-radius:8px;border:1px solid var(--line);background:var(--bg);color:var(--ink);text-align:center;-webkit-appearance:none}
.tick{height:40px;border-radius:8px;border:2px solid var(--line);font-weight:800;text-align:center;color:var(--muted)}
.set-row.done .tick{background:var(--done);border-color:var(--done);color:#fff}
.set-row.done input{border-color:transparent;background:transparent}
.x{height:40px;color:var(--muted);font-size:calc(20px * var(--ts));text-align:center}
#rest{position:fixed;left:12px;right:12px;bottom:calc(68px + env(safe-area-inset-bottom,0px));display:flex;align-items:center;gap:14px;
  padding:10px 16px;border-radius:14px;background:var(--ink);color:var(--bg);z-index:19;overflow:hidden;max-width:616px;margin:0 auto}
#rest[hidden]{display:none}
.rest-fill{position:absolute;inset:0 auto 0 0;width:calc(var(--p,0) * 100%);background:currentColor;opacity:.13;transition:width .25s linear}
.rest-label{font-size:calc(14px * var(--ts));opacity:.75}
.rest-time{font:800 calc(28px * var(--ts))/1 var(--display);font-variant-numeric:tabular-nums;margin-right:auto;min-width:3ch}
#rest button{font-weight:700;font-size:calc(15px * var(--ts));padding:6px 0;position:relative}
#rest.go{background:var(--done);color:#fff}
#toast{position:fixed;left:50%;top:calc(var(--band,44px) + 8px);transform:translate(-50%,-8px);max-width:88vw;padding:8px 16px;border-radius:12px;
  background:var(--ink);color:var(--bg);font-size:calc(15px * var(--ts));font-weight:600;z-index:30;pointer-events:none;text-align:center;
  opacity:0;visibility:hidden;transition:opacity .2s ease,transform .2s ease,visibility .2s}
#toast.show{opacity:1;visibility:visible;transform:translate(-50%,0)}#toast.err{background:var(--accent);color:#fff}
#tabs{position:fixed;left:0;right:0;bottom:0;display:grid;grid-template-columns:repeat(4,1fr);background:var(--surface);border-top:1px solid var(--line);
  padding-bottom:env(safe-area-inset-bottom,0px);z-index:20}
#tabs button{display:flex;flex-direction:column;align-items:center;gap:3px;padding:9px 0 10px;font:600 calc(12px * var(--ts)) var(--body);color:var(--muted)}
#tabs button[aria-current="page"]{color:var(--ink)}
#tabs svg{width:24px;height:24px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.sess{background:var(--surface);border-radius:14px;margin:0 0 10px;overflow:hidden}
.sess-head{display:flex;justify-content:space-between;align-items:center;gap:12px;width:100%;padding:13px 14px}
.sess-head b{display:block;font:800 calc(19px * var(--ts))/1.15 var(--display)}
.dots{display:flex;gap:4px;flex:none}
.sess-body{padding:0 14px 6px;border-top:1px solid var(--line)}
.sess-ex{padding:10px 0 8px;border-bottom:1px solid var(--line)}
.sess-ex .entry-name{font-size:calc(18px * var(--ts));display:block}
.row{display:flex;justify-content:space-between}
@media (min-width:520px){.rack{grid-template-columns:repeat(4,1fr)}}

/* Tiny: one line per exercise without the photo, one line per workout in History; logging sets stays full size */
body.d-tiny .thumb{display:none}
body.d-tiny .ex{column-gap:0}
body.d-tiny .ex-name{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
body.d-tiny .ex-meta{display:none}
body.d-tiny .sess-head{padding:8px 14px}
body.d-tiny .sess-head b{display:inline;font-size:calc(16px * var(--ts));margin-right:6px}
body.d-tiny .sess-head>span:first-child{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
body.d-tiny .sess-head>span:first-child>span{display:inline}
body.d-compact .sess-head{padding:10px 14px}
.brand .icon{width:36px;height:36px;border-radius:18px;display:grid;place-items:center;background:var(--sheet);border:1px solid var(--rule);color:var(--ink);flex:none;margin-left:6px}
.brand .icon svg{width:20px;height:20px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
/* Settings sheet (scoped: the app already uses .seg, .chip and .row) */
#cfgsheet{position:fixed;inset:0;z-index:50;background:var(--paper);color:var(--ink);transform:translateY(102%);visibility:hidden;transition:transform .28s ease,visibility 0s linear .28s;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;text-align:left}
#cfgsheet.open{transform:none;visibility:visible;transition:transform .28s ease}
#cfgsheet button{font:inherit;color:inherit;background:none;border:0;border-radius:0;padding:0;font-weight:inherit;cursor:pointer;text-align:inherit}
#cfgsheet .sh-head{position:sticky;top:0;z-index:2;background:var(--paper);display:flex;justify-content:space-between;align-items:center;padding:calc(env(safe-area-inset-top) + 14px) 18px 12px;border-bottom:1px solid var(--rule)}
#cfgsheet .sh-head h2{font:700 calc(24px * var(--ts))/1 var(--display);margin:0}
#cfgsheet .sh-body{padding:16px 18px calc(env(safe-area-inset-bottom) + 40px);max-width:680px;margin:0 auto}
#cfgsheet .link{color:var(--signal);font-weight:600;font-size:16px}
#cfgsheet .link.small{font-size:calc(14px * var(--ts))}
#cfgsheet .hint{font-size:calc(13px * var(--ts));color:var(--muted);margin:8px 2px 0}
#cfgsheet .muted{color:var(--muted)}
#cfgsheet .sec{display:block;font:700 calc(17px * var(--ts))/1.2 var(--display);color:var(--ink);margin:26px 0 6px}
#cfgsheet .srow{display:flex;align-items:center;gap:8px;padding:11px 0;border-bottom:1px solid var(--rule)}
#cfgsheet .grow{flex:1;min-width:0}
#cfgsheet .grow b{display:block;font-weight:600}
#cfgsheet .grow small{display:block;font-size:calc(13px * var(--ts));color:var(--ink-2)}
#cfgsheet .switch{width:46px;height:28px;border-radius:14px;background:var(--rule);position:relative;flex:none;transition:background .2s}
#cfgsheet .switch::after{content:"";position:absolute;top:3px;left:3px;width:22px;height:22px;border-radius:11px;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.25);transition:transform .2s}
#cfgsheet .switch.on{background:var(--signal)}
#cfgsheet .switch.on::after{transform:translateX(18px)}
#cfgsheet .sm{font-size:calc(13px * var(--ts));padding:6px 11px;border-radius:8px;border:1px solid var(--rule);background:var(--sheet);white-space:nowrap;flex:none}
#cfgsheet .danger{color:var(--danger)}
#cfgsheet .danger.armed{background:var(--danger);color:#fff;border-color:var(--danger)}
#cfgsheet .seg{display:flex;flex:none;gap:0;padding:0;border:1px solid var(--rule);border-radius:9px;overflow:hidden;background:var(--sheet)}
#cfgsheet .seg button{font-size:calc(12.5px * var(--ts));padding:6px 10px;color:var(--ink-2);white-space:nowrap}
#cfgsheet .seg button.on{background:var(--ink);color:var(--paper);font-weight:600}
#cfgsheet .seg.wide button{flex:1;text-align:center;padding:9px 4px;font-size:calc(13.5px * var(--ts))}
#cfgsheet .lk-row{margin:10px 0 14px}
#cfgsheet .lk-l{display:block;font-size:calc(13px * var(--ts));font-weight:600;color:var(--ink-2);margin-bottom:6px}
#cfgsheet .sws{display:flex;gap:12px;overflow-x:auto;scrollbar-width:none;padding:3px 3px 2px}
#cfgsheet .sws::-webkit-scrollbar{display:none}
#cfgsheet .sw{display:flex;flex-direction:column;align-items:center;gap:5px;flex:none}
#cfgsheet .sw .prev{position:relative;width:50px;height:50px;border-radius:13px;display:grid;place-items:center;border:1px solid rgba(127,127,127,.35);font:700 18px/1 var(--display)}
#cfgsheet .sw .prev i{position:absolute;right:6px;bottom:6px;width:9px;height:9px;border-radius:5px}
#cfgsheet .sw.on .prev{outline:2.5px solid var(--signal);outline-offset:2px}
#cfgsheet .sw small{font-size:12px;color:var(--ink-2)}
#cfgsheet .sw.on small{color:var(--ink);font-weight:600}
#cfgsheet .cfg{padding:12px 0;border-bottom:1px solid var(--rule)}
#cfgsheet .cfg.ch .cfg-h b::after{content:"";display:inline-block;width:7px;height:7px;border-radius:4px;background:var(--signal);margin-left:7px;vertical-align:2px}
#cfgsheet .cfg-h{display:flex;justify-content:space-between;align-items:baseline;gap:10px}
#cfgsheet .cfg-h b{font-weight:600}
#cfgsheet .cfg small{display:block;font-size:calc(13px * var(--ts));margin-top:2px}
#cfgsheet .stepper{display:flex;align-items:center;gap:6px;margin-top:8px;flex-wrap:wrap}
#cfgsheet .stepper button{width:38px;height:36px;border-radius:9px;border:1px solid var(--rule);background:var(--sheet);font-size:20px;font-weight:600;text-align:center}
#cfgsheet .stepper button[disabled]{opacity:.35}
#cfgsheet .stepper input{width:86px;text-align:center;font:600 16px var(--sans);padding:7px 6px;border-radius:9px;border:1px solid var(--rule);background:var(--paper);color:var(--ink)}
#cfgsheet .stepper .unit{font-size:calc(14px * var(--ts));color:var(--ink-2);min-width:2.5em}
#cfgsheet .stepper .range{flex-basis:100%;font-size:calc(12px * var(--ts));color:var(--muted)}
#cfgsheet .cfgin.wide,#cfgsheet .cfgsel{display:block;width:100%;margin-top:8px;font:16px/1.45 var(--sans);padding:9px 11px;border-radius:9px;border:1px solid var(--rule);background:var(--paper);color:var(--ink);-webkit-appearance:none;appearance:none}
#cfgsheet textarea.cfgsel{resize:none}
#cfgsheet .cfgin:focus,#cfgsheet .cfgsel:focus{outline:2px solid var(--signal);outline-offset:-1px}
#cfgsheet .cfg-foot{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;margin-top:18px}
#cfgsheet .note{font-size:12.5px;color:var(--muted)}
#cfgsheet .srow.bp{width:100%;text-align:left}
#cfgsheet .chev{flex:none;color:var(--muted);font-size:calc(20px * var(--ts));line-height:1}
#cfgsheet input{-webkit-user-select:text;user-select:text}
`;

// ---------------------------------------------------------------- main
async function main() {
  await loadSettings();   // before every branch: the app and the widget use the saved choices
  aiMigrate(["go2fgym-openai-key"]);   // 1.5.x kept one OpenAI key under another name
  if (config.runsInWidget) await runWidget();
  else await runApp();
  Script.complete();
}
await main();
