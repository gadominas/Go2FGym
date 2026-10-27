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

// ---------------------------------------------------------------- settings
const CONFIG = {
  unit: "kg",
  restSeconds: 90,
  // Equipment you own. Add any of: "kettlebells", "e-z curl bar",
  // "medicine ball", "exercise ball", "foam roll", "other". Then tap
  // "Update library" in the app to download the extra photos.
  equipment: ["body only", "dumbbell", "barbell", "bands"],
  // Categories that need a platform, coach or special gear.
  skipCategories: ["strongman", "olympic weightlifting"],
  dataUrl: "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json",
  imageBase: "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/",
  parallelDownloads: 6,
  icloudBackup: true, // mirror history.json to iCloud Drive/Scriptable/Go2FGym-backup
  ai: {
    // ✨ Optional AI coach via the OpenAI API (your own key, stored in the iOS Keychain).
    model: "gpt-5.4-mini",
    reasoning: "low", // "low" is quick; "medium" plans a little more carefully but slower
    autoAnalyze: true, // analyze each workout right after you finish it (needs a key)
    autoStrava: true, // also write a Strava title and description after each workout
    stravaMode: "funny", // default tone for Strava posts: "serious", "funny" or "neutral"
  },
};

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

// Bump when the disclaimer text changes materially, so users accept it again.
const DISCLAIMER_VERSION = 2;
const KC_AI_KEY = "go2fgym-openai-key";

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
  if (!CONFIG.icloudBackup) return;
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
  const rows = [["date", "workout_id", "muscle_groups", "exercise", "set", `weight_${CONFIG.unit}`, "reps"]];
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
  return CONFIG.equipment.includes(eq) && !CONFIG.skipCategories.includes(e.category);
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
  const req = new Request(CONFIG.dataUrl);
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
  for (let i = 0; i < jobs.length; i += CONFIG.parallelDownloads) {
    const batch = jobs.slice(i, i + CONFIG.parallelDownloads);
    await Promise.all(
      batch.map(async (j) => {
        try {
          const r = new Request(CONFIG.imageBase + encodeURI(j.rel));
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

// ---------------------------------------------------------------- AI (OpenAI Responses API)
// Generic proxy: the web UI builds the prompt and schema; the key never leaves Scriptable.
async function openai(p) {
  if (!Keychain.contains(KC_AI_KEY)) return { needKey: true };
  const req = new Request("https://api.openai.com/v1/responses");
  req.method = "POST";
  req.timeoutInterval = 90;
  req.headers = { Authorization: `Bearer ${Keychain.get(KC_AI_KEY)}`, "Content-Type": "application/json" };
  req.body = JSON.stringify({
    model: CONFIG.ai.model,
    instructions: p.instructions,
    input: p.input,
    reasoning: { effort: CONFIG.ai.reasoning },
    text: { format: { type: "json_schema", name: p.name, strict: true, schema: p.schema } },
  });
  let res = null;
  try {
    res = await req.loadJSON();
  } catch (e) {
    const code0 = req.response && req.response.statusCode;
    if (!code0) throw new Error("No connection to OpenAI. Check your internet and try again.");
  }
  const code = req.response && req.response.statusCode;
  if (code === 401) {
    Keychain.remove(KC_AI_KEY);
    return { needKey: true };
  }
  if (code >= 400 || !res) throw new Error((res && res.error && res.error.message) || `OpenAI answered HTTP ${code}`);
  let text = res.output_text || "";
  if (!text && Array.isArray(res.output))
    text = res.output.flatMap((o) => o.content || []).filter((c) => c.type === "output_text").map((c) => c.text).join("");
  try {
    return { data: JSON.parse(text) };
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

  const boot = {
    lib: forWeb(lib),
    history,
    draft: readJSON(P.draft, null),
    ai: { hasKey: Keychain.contains(KC_AI_KEY), autoAnalyze: CONFIG.ai.autoAnalyze, autoStrava: CONFIG.ai.autoStrava, stravaMode: CONFIG.ai.stravaMode },
    meta: readJSON(P.meta, null),
    consent: readJSON(P.consent, null),
    cfg: { unit: CONFIG.unit, rest: CONFIG.restSeconds, equipment: CONFIG.equipment, disclaimerVersion: DISCLAIMER_VERSION },
  };

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
    switch (m.type) {
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
          out = await openai(p);
        } catch (e) {
          out = { error: String((e && e.message) || e) };
        }
        await js(`HG.onAI(${J(p.rid)},${J(out)})`);
        break;
      }
      case "setkey": {
        const key = String(p.key || "").trim();
        if (!/^sk-/.test(key)) await js(`HG.onKey(${J({ ok: false, msg: "That doesn't look like an OpenAI key. It starts with sk-." })})`);
        else {
          Keychain.set(KC_AI_KEY, key);
          await js(`HG.onKey(${J({ ok: true })})`);
        }
        break;
      }
      case "copy":
        Pasteboard.copyString(String(p.text || ""));
        await js(`HG.toast(${J(p.label ? `${p.label} copied` : "Copied")})`);
        break;
      case "delkey":
        if (Keychain.contains(KC_AI_KEY)) Keychain.remove(KC_AI_KEY);
        await js(`HG.onKey(${J({ ok: true, removed: true })})`);
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

  async function pump() {
    let msgs = [];
    try {
      msgs = JSON.parse((await wv.evaluateJavaScript("window.HG ? HG.drain() : '[]'", false)) || "[]");
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

  await wv.loadHTML(buildHTML(boot));
  let open = true;
  wv.present(true).then(
    () => (open = false),
    () => (open = false)
  );
  while (open) {
    await pump();
    await sleep(200);
  }
  await pump(); // catch anything queued right before closing
}

function buildHTML(boot) {
  const data = J(boot).replace(/<\//g, "<\\/");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,viewport-fit=cover">
<meta name="color-scheme" content="light dark"><title>Go2FGym</title><style>${CSS}</style></head>
<body><main id="app"></main>
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
    histView: "calendar", cal: null, stravaMode: {},
    consent: !!(BOOT.consent && BOOT.consent.version === CFG.disclaimerVersion),
    showDisclaimer: false,
    ai: {
      hasKey: !!(BOOT.ai && BOOT.ai.hasKey), auto: !BOOT.ai || BOOT.ai.autoAnalyze !== false,
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
    if (S.ai.hasKey && (S.ai.auto || S.ai.autoStrava)) {
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
    if (!cands.length) return toast("No exercises match that equipment and those muscles.", true);
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
    if (!res) return render();
    const clamp = (n, lo, hi, d) => (Number.isFinite(+n) ? Math.min(hi, Math.max(lo, Math.round(+n))) : d);
    const seen = new Set();
    const exercises = (res.exercises || []).filter((x) => S.byId[x.id] && !seen.has(x.id) && seen.add(x.id)).map((x) => ({
      id: x.id, name: S.byId[x.id].n,
      sets: clamp(x.sets, 1, 6, 3), reps: clamp(x.reps, 1, 50, 10), rest: clamp(x.rest_seconds, 30, 240, CFG.rest),
      w: x.weight_kg > 0 ? Math.round(x.weight_kg * 2) / 2 : null, note: String(x.note || "").slice(0, 140),
    }));
    if (!exercises.length) {
      toast("The AI coach didn't return usable exercises. Try again.", true);
      return render();
    }
    S.plan = {
      title: String(res.title || "Your workout").slice(0, 60), summary: String(res.summary || ""),
      minutes: clamp(res.estimated_minutes, 5, 180, b.minutes), warmup: String(res.warmup || ""), cooldown: String(res.cooldown || ""),
      exercises,
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
    if (!S.ai.hasKey) return toast("Add your OpenAI API key under Build with AI first.", true);
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
        recovery: str(res.recovery),
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
    return `<div class="keybox"><p class="small"><b>Connect the AI coach.</b> Paste your OpenAI API key once. It stays in this iPhone's Keychain and is only sent to OpenAI. Create one at platform.openai.com.</p>
      <div class="keyrow"><input type="password" id="aikey" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="sk-..."><button class="chip" data-a="savekey">Save</button></div></div>`;
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
      <p class="muted small">${busy ? "<b>Building your workout…</b> " : ""}${S.ai.hasKey ? "Tap <b>Build workout</b> at the top when you're ready. " : "Save your key above to enable <b>Build workout</b>. "}AI suggestions can be wrong. Check every weight before you lift it.</p>`;
  }

  function renderPlan() {
    const p = S.plan;
    if (!p) return renderBuilder();
    const busy = S.aiBusy === "plan";
    const total = p.exercises.reduce((n, x) => n + x.sets, 0);
    const replacing = S.session && S.session.entries.length;
    const rows = p.exercises.map((x) => `<div class="ex plan-ex" data-a="open" data-v="${esc(x.id)}">
        <div class="thumb" data-id="${esc(x.id)}">${imgTag(x.id, 0)}<span>${esc(initials(x.name))}</span></div>
        <div><div class="ex-name">${esc(x.name)}</div>
        <div class="ex-meta"><b>${x.sets} × ${x.reps}${x.w ? ` at ${fmtNum(x.w)} ${UNIT}` : ""}</b>, rest ${x.rest} s</div>
        ${x.note ? `<div class="ex-meta">${esc(x.note)}</div>` : ""}</div></div>`).join("");
    return `<header class="bar"><button class="back" data-a="b-edit">‹ Settings</button></header>
      <p class="kicker">✨ Built by your AI coach</p>
      <h1 class="title">${esc(p.title)}</h1>
      <p class="lead">${esc(p.summary)}</p>
      <p class="muted small">About ${p.minutes} min, ${plural(p.exercises.length, "exercise")}, ${plural(total, "set")}.</p>
      ${p.warmup ? `<h2>Warm-up</h2><p>${esc(p.warmup)}</p>` : ""}
      <h2>Exercises</h2><div class="list">${rows}</div>
      ${p.cooldown ? `<h2>Cool-down</h2><p>${esc(p.cooldown)}</p>` : ""}
      <button class="primary${S.armed === "plan-start" ? " armed" : ""}" data-a="plan-start">${S.armed === "plan-start" ? "Tap again to replace your current workout" : "Start this workout"}</button>
      <button class="secondary${busy ? " busy" : ""}" data-a="build" ${busy ? "disabled" : ""}>${busy ? "Building another…" : "Build another"}</button>
      <p class="muted small">${replacing ? "Starting replaces the workout in progress. " : ""}Weights without history are left for you to choose. AI suggestions can be wrong.</p>`;
  }

  function renderAnalysis(s) {
    const busy = S.aiBusy === `an:${s.id}`;
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
      <p class="kicker">✨ AI coach</p>
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
      <button class="club" data-a="club" aria-label="Inspired by the 7AM Club community. Opens their Instagram.">Inspired by <b>7AM Club</b> <span aria-hidden="true">↗</span></button></header>`;
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
      <button class="secondary ai" data-a="builder">✨ Build a workout with AI</button>
      <footer class="lib">
        <p class="muted small">${S.lib.length} exercises for ${esc(eqNames())} stored on this phone${S.meta ? `, updated ${esc(day(S.meta.syncedAt))}` : ""}. Photos and instructions from free-exercise-db (public domain).</p>
        ${missingPhotos() && !S.sync ? `<p class="small"><b>${plural(missingPhotos(), "exercise")} ${missingPhotos() === 1 ? "has" : "have"} no photos yet.</b> Tap Update library to download them.</p>` : ""}
        <div class="row">${S.sync ? "" : `<button class="link" data-a="sync">Update library</button>`}${S.ai.hasKey ? `<button class="link danger${S.armed === "delkey" ? " armed" : ""}" data-a="delkey">${S.armed === "delkey" ? "Tap to remove" : "AI key"}</button>` : ""}<button class="link danger" data-a="disclaimer">Disclaimer</button></div>
        ${S.sync ? syncProgress() : ""}
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
  function renderList() {
    const groups = GROUPS.filter((g) => S.groups.has(g.key));
    const muscles = selectedMuscles().filter((m) => S.lib.some((e) => e.pm.includes(m)));
    const eqs = [...new Set(S.lib.map((e) => e.eq))];
    return `<header class="bar"><button class="back" data-a="home">‹ Muscles</button></header>
      <h1 class="title">${esc(groups.map((g) => g.label).join(" + "))}</h1>
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
    return `<header class="bar"><button class="back" data-a="close-detail">‹ ${back}</button></header>
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

  function renderWorkout() {
    const s = S.session;
    if (!s || !s.entries.length)
      return `<header class="bar"><h1 class="title">Workout</h1></header>
        <div class="empty"><p>No exercises yet. Pick the muscles you want to train, then add exercises with +.</p>
        <button class="primary" data-a="tab" data-v="train">Choose muscles</button></div>`;
    const t = volume(s.entries.map((en) => ({ sets: en.sets.filter((x) => x.done) })));
    const entries = s.entries.map((en, ei) => {
      const last = lastSets(en.id);
      const rows = en.sets.map((x, si) => `<div class="set-row${x.done ? " done" : ""}">
          <span class="n">${si + 1}</span>
          <input data-in="w" data-ei="${ei}" data-si="${si}" inputmode="decimal" placeholder="Body" value="${x.w == null ? "" : esc(x.w)}" aria-label="Set ${si + 1} weight in ${UNIT}">
          <input data-in="r" data-ei="${ei}" data-si="${si}" inputmode="numeric" placeholder="0" value="${x.r == null ? "" : esc(x.r)}" aria-label="Set ${si + 1} reps">
          <button class="tick" data-a="done" data-v="${ei}:${si}" aria-label="${x.done ? "Mark set as not done" : "Mark set as done"}">✓</button>
          <button class="x" data-a="rm-set" data-v="${ei}:${si}" aria-label="Remove set ${si + 1}">×</button></div>`).join("");
      return `<section class="entry">
        <div class="entry-head"><button class="entry-name" data-a="open" data-v="${esc(en.id)}">${esc(en.name)}</button>
        <button class="link small${S.armed === "rm" + ei ? " armed" : ""}" data-a="rm-entry" data-v="${ei}">${S.armed === "rm" + ei ? "Tap to remove" : "Remove"}</button></div>
        ${en.note ? `<p class="small coach-note">✨ ${esc(en.note)}${en.rest ? ` Rest ${en.rest} s.` : ""}</p>` : ""}
        ${last ? `<p class="muted small">Last time, ${esc(day(last.date))}: ${esc(fmtSets(last.sets))}</p>` : `<p class="muted small">First time logging this one.</p>`}
        <div class="set-row head"><span>Set</span><span>${UNIT}</span><span>Reps</span><span></span><span></span></div>
        ${rows}
        <button class="link" data-a="add-set" data-v="${ei}">Add set</button></section>`;
    }).join("");
    return `<header class="bar"><h1 class="title">${esc(s.title || "Workout")}</h1><span class="muted" id="elapsed">${elapsed(s.start)}</span></header>
      <p class="muted small" id="totals">${plural(t.n, "set")} done${t.v ? `, ${fmtNum(t.v)} ${UNIT} lifted` : ""}. Tap ✓ after each set to start the rest timer.</p>
      ${entries}
      <button class="secondary" data-a="tab" data-v="train">Add exercise</button>
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
      return { groups: latest.ai.next.groups, intensity: f ? (f.intensity === "light" ? "easy" : f.intensity) : null, why: "your AI coach's suggestion" };
    }
    const due = groupStats(28).sort((a, b) => (b.days_since_trained ?? 99) - (a.days_since_trained ?? 99)).slice(0, 2).map((x) => x.group);
    return { groups: due, intensity: null, why: "your most-due muscle groups" };
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
    el.innerHTML = `<span class="last-k">Last</span>${esc(relDay(s.start))}<span class="dots">${dotsFor(gs)}</span>${gs.length ? `${plural(gs.length, "group")}: ${esc(gs.map((g) => g.label).join(", "))}` : plural(s.entries.length, "exercise")}${mins ? `, ${mins} min` : ""}`;
    el.setAttribute("aria-label", `Last workout ${relDay(s.start)}: ${gs.map((g) => g.label).join(", ")}${mins ? `, ${mins} minutes` : ""}. Opens it in History.`);
    el.dataset.v = s.start;
    el.hidden = false;
  }
  function layoutBand() {
    const probe = $("#sat");
    const inset = probe ? probe.offsetHeight : 0;
    document.documentElement.style.setProperty("--band", `${Math.max(inset, 40)}px`);
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
    if (!S.ai.hasKey) return toast("Add your OpenAI API key under Build with AI first.", true);
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
      s.strava = Object.assign({}, s.strava, { [mode]: { title: String(res.title).slice(0, 120), description: String(res.description || "").slice(0, 700) } });
      S.stravaMode[id] = mode;
      send("save", { session: s });
    }
    render();
  }
  function renderStrava(s) {
    const mode = S.stravaMode[s.id] || S.ai.stravaMode;
    const busy = S.aiBusy === `st:${s.id}`;
    let post = s.strava && s.strava[mode];
    if (!post && !S.ai.hasKey && mode === "neutral") post = stravaTemplate(s);
    const seg = `<div class="seg">${STRAVA_MODES.map((x) => `<button data-a="st-mode" data-v="${esc(s.id)}|${x.key}" aria-pressed="${mode === x.key}" ${S.aiBusy ? "disabled" : ""}>${x.label}</button>`).join("")}</div>`;
    let body;
    if (busy) body = `<p class="busy small">Writing a ${mode} title and description…</p>`;
    else if (post)
      body = `<div class="st-post"><p class="st-title">${esc(post.title)}</p><p class="st-desc">${esc(post.description)}</p></div>
        <div class="st-actions"><button class="chip" data-a="st-copy" data-v="${esc(s.id)}|title">Copy title</button><button class="chip" data-a="st-copy" data-v="${esc(s.id)}|description">Copy description</button><button class="chip" data-a="st-copy" data-v="${esc(s.id)}|both">Copy both</button></div>
        ${post.basic ? `<p class="muted small">Basic version. Add an OpenAI key under Build with AI for AI-written posts in any tone.</p>` : `<button class="link small" data-a="st-gen" data-v="${esc(s.id)}" ${S.aiBusy ? "disabled" : ""}>Write another ${mode} version</button>`}`;
    else if (!S.ai.hasKey) body = `<p class="muted small">${cap(mode)} posts are written by the AI coach. Add your OpenAI key under <b>Build with AI</b>, or pick Neutral for a basic version.</p>`;
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
    savekey: () => {
      const el = $("#aikey");
      const key = el ? el.value.trim() : "";
      if (!key) return toast("Paste your OpenAI API key first.", true);
      send("setkey", { key });
    },
    delkey: () => arm("delkey", () => { send("delkey", {}); }),
    accept: () => {
      S.consent = true;
      S.acceptedAt = new Date().toISOString();
      send("accept", { version: CFG.disclaimerVersion });
      render();
    },
    disclaimer: () => { S.showDisclaimer = true; render(); },
    "close-disclaimer": () => { S.showDisclaimer = false; render(); },
    tab: (v) => { S.showDisclaimer = false; S.detailId = null; S.tab = v; S.armed = null; render(); },
    plate: (v) => { S.groups.has(v) ? S.groups.delete(v) : S.groups.add(v); S.muscle = "all"; render(); },
    browse: () => { if (S.groups.size) { S.trainView = "list"; S.q = ""; render(); } },
    home: () => { S.trainView = "home"; render(); },
    filter: (v) => { const i = v.indexOf("|"); S[v.slice(0, i)] = v.slice(i + 1); render(); },
    open: (v) => { S.detailId = v; render(); },
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
      if (set.done) startRest(en.rest);
      saveDraft();
      render();
    },
    "rm-entry": (v) => arm("rm" + v, () => { S.session.entries.splice(+v, 1); saveDraft(); render(); }),
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
    "build-next-h": () => {
      const n = nextSuggestion();
      if (n.intensity) S.builder.intensity = n.intensity;
      openBuilder(n.groups);
    },
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
        toast("Add your OpenAI API key to use the AI coach.", true);
      } else if (out.error) toast(`AI coach: ${out.error}`, true);
      if (done) done(out.data || null);
    },
    onKey(r) {
      if (r.ok && r.removed) { S.ai.hasKey = false; toast("AI key removed"); }
      else if (r.ok) { S.ai.hasKey = true; toast("Key saved. Your AI coach is ready."); }
      else toast(r.msg || "Could not save the key.", true);
      render();
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
:root{
  --bg:#E8EBEE;--surface:#FFFFFF;--ink:#14181C;--muted:#5A636C;--line:#D2D7DC;
  --accent:#C8102E;--accent-ink:#FFFFFF;--done:#2E8B3E;
  --p-red:#C8102E;--p-blue:#1F4E9E;--p-yellow:#F2B705;--p-green:#2E8B3E;--p-white:#F4F4F1;--p-steel:#7B8794;--p-iron:#2A2E33;
  --display:"Avenir Next Condensed","AvenirNextCondensed-Bold","Arial Narrow",system-ui,sans-serif;
  --body:-apple-system,system-ui,"Helvetica Neue",sans-serif;
  color-scheme:light dark;
}
@media (prefers-color-scheme:dark){:root{
  --bg:#16191C;--surface:#22272B;--ink:#EEF1F4;--muted:#9AA4AD;--line:#353B41;--accent:#E8344B;--done:#45AD59;--p-iron:#0F1113;
}}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html,body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.45 var(--body);-webkit-text-size-adjust:100%}
body{padding:var(--band,env(safe-area-inset-top,0px)) 0 calc(150px + env(safe-area-inset-bottom,0px))}
body::before{content:"";position:fixed;inset:0 0 auto;height:var(--band,env(safe-area-inset-top,0px));background:var(--bg);z-index:10}
#sat{position:fixed;top:0;left:0;width:1px;height:env(safe-area-inset-top,0px);visibility:hidden;pointer-events:none}
#last{position:fixed;z-index:12;left:50%;top:calc(var(--band,40px) / 2 - 13px);transform:translateX(-50%);display:flex;align-items:center;gap:6px;
  height:26px;max-width:calc(100vw - 24px);padding:0 12px;border-radius:999px;background:var(--surface);border:1px solid var(--line);
  font:500 12.5px/1 var(--body);color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#last[hidden]{display:none}
#last .last-k{font-weight:800;color:var(--accent);text-transform:uppercase;font-size:10.5px;letter-spacing:.05em}
#last .dots{gap:3px}#last .dot{width:8px;height:8px}
.hbtn{flex:none;background:var(--accent);color:var(--accent-ink);font:700 15px/1 var(--body);padding:9px 14px;border-radius:999px;white-space:nowrap;text-align:center}
.hbtn:disabled{opacity:.4}
#app{max-width:640px;margin:0 auto;padding:0 16px 32px}
button{font:inherit;color:inherit;background:none;border:0;padding:0;cursor:pointer;text-align:inherit}
button:focus-visible,input:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
h2{font:700 20px/1.2 var(--display);margin:22px 0 8px}
p{margin:0 0 10px}
.muted{color:var(--muted)}.small{font-size:14px}
.hero{font:800 46px/.95 var(--display);margin:14px 0 8px;letter-spacing:-.01em}
.brand{display:flex;align-items:center;gap:8px;min-height:44px;padding-top:4px;border-bottom:1px solid var(--line)}
.brand-mark svg{display:block;width:24px;height:24px}
.brand-name{font:800 19px/1 var(--display);margin-right:auto;letter-spacing:-.01em}
.club{font-size:13px;color:var(--muted);padding:10px 0 10px 8px;white-space:nowrap}
.club b{color:var(--ink);font-weight:700}
.club span{color:var(--accent);font-weight:700}
.title{font:800 32px/1.02 var(--display);margin:6px 0 12px;letter-spacing:-.01em}
.lead{color:var(--muted);margin-bottom:16px}
.bar{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:48px;position:sticky;top:var(--band,env(safe-area-inset-top,0px));background:var(--bg);z-index:5}
.bar .title{margin:10px 0}
.back{font-weight:600;color:var(--accent);padding:10px 0}
.link{color:var(--accent);font-weight:600;padding:10px 0}
.link.danger{color:var(--muted)}
.armed{color:var(--accent)!important;text-decoration:underline}
.primary{display:block;width:100%;margin:14px 0 6px;padding:15px 16px;border-radius:12px;background:var(--accent);color:var(--accent-ink);font:700 20px/1 var(--display);text-align:center}
.primary:disabled{opacity:.35}
.primary.armed{background:var(--ink);color:var(--bg)!important;text-decoration:none}
.secondary{display:block;width:100%;margin:6px 0;padding:13px 16px;border-radius:12px;border:1.5px solid var(--line);font-weight:600;text-align:center}
.rack{display:grid;grid-template-columns:repeat(3,1fr);gap:14px 12px;margin:20px 0 10px}
.plate{position:relative;aspect-ratio:1;border-radius:50%;background:var(--pc);color:var(--pi);
  box-shadow:inset 0 0 0 5px rgba(0,0,0,.16),inset 0 0 0 9px rgba(255,255,255,.10),inset 0 0 0 1px rgba(0,0,0,.25);transition:transform .15s ease,box-shadow .15s ease}
.plate::after{content:"";position:absolute;left:50%;top:50%;width:17%;aspect-ratio:1;border-radius:50%;transform:translate(-50%,-50%);
  background:var(--bg);box-shadow:inset 0 0 0 3px rgba(0,0,0,.28),0 0 0 4px rgba(0,0,0,.12)}
.pl-name{position:absolute;left:8%;right:8%;top:20%;text-align:center;font:800 17px/1 var(--display);letter-spacing:-.01em}
.pl-count{position:absolute;left:0;right:0;bottom:19%;text-align:center;font:600 13px/1 var(--body);opacity:.8;font-variant-numeric:tabular-nums}
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
.chip{flex:none;padding:7px 13px;border-radius:999px;border:1px solid var(--line);background:var(--surface);font-size:14px;white-space:nowrap}
.chip[aria-pressed="true"]{background:var(--ink);color:var(--bg);border-color:var(--ink)}
.search{width:100%;font:16px var(--body);padding:11px 14px;margin:6px 0 4px;border-radius:10px;border:1px solid var(--line);background:var(--surface);color:var(--ink);-webkit-appearance:none}
.count{margin:10px 2px 6px}
.list{background:var(--surface);border-radius:14px;overflow:hidden}
.ex{display:grid;grid-template-columns:64px 1fr 42px;gap:12px;align-items:center;padding:10px 12px;border-top:1px solid var(--line)}
.ex:first-child{border-top:0}
.ex-name{font-weight:600;line-height:1.25}.ex-meta{font-size:13px;color:var(--muted);margin-top:2px}
.thumb{position:relative;width:64px;height:64px;border-radius:8px;background:var(--bg);overflow:hidden;display:grid;place-items:center}
.thumb span{font:800 18px var(--display);color:var(--muted)}
.thumb img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;background:#fff}
.add{width:40px;height:40px;border-radius:50%;border:2px solid var(--ink);font-size:22px;line-height:1;text-align:center}
.add.on{background:var(--done);border-color:var(--done);color:#fff;font-size:18px}
.stage{position:relative;aspect-ratio:4/3;background:#fff;border-radius:14px;overflow:hidden;margin:4px 0 8px}
.stage img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain}
.stage .f1{animation:frame 2.4s ease-in-out infinite}
@keyframes frame{0%,35%{opacity:0}50%,85%{opacity:1}100%{opacity:0}}
.stage[data-frame="0"] .f1{animation:none;opacity:0}.stage[data-frame="1"] .f1{animation:none;opacity:1}
@media (prefers-reduced-motion:reduce){.stage[data-frame="play"] .f1{animation:none;opacity:0}}
.noimg{position:absolute;inset:0;display:grid;place-items:center;padding:20px;text-align:center;color:#5A636C;margin:0}
.seg{display:grid;grid-template-columns:repeat(3,1fr);background:var(--surface);border-radius:10px;padding:3px;margin-bottom:12px}
.seg button{padding:7px 0;border-radius:8px;font-size:14px;font-weight:600;text-align:center;color:var(--muted)}
.seg button[aria-pressed="true"]{background:var(--ink);color:var(--bg)}
.tags{display:flex;flex-wrap:wrap;gap:6px}
.tag{display:inline-flex;align-items:center;gap:6px;font-size:14px;padding:4px 10px;border-radius:6px;background:var(--surface)}
.tags.quiet .tag{background:transparent;border:1px solid var(--line)}
.dot{display:inline-block;width:10px;height:10px;border-radius:50%;background:var(--pc);box-shadow:inset 0 0 0 1px rgba(0,0,0,.25)}
.steps{padding-left:22px;margin:0}.steps li{margin:0 0 10px;padding-left:4px}
.spark{width:100%;height:70px;display:block}
.spark polyline{fill:none;stroke:var(--accent);stroke-width:2.5;vector-effect:non-scaling-stroke}
.spark circle{fill:var(--accent)}
.cta{margin-top:18px}
.chips.wrap{flex-wrap:wrap;overflow:visible;margin:0 0 6px;padding:2px 0}
.seg4{grid-template-columns:repeat(4,1fr)}
.seg2{grid-template-columns:repeat(2,1fr)}
.cal{background:var(--surface);border-radius:14px;padding:10px 8px 8px}
.cal-head{display:flex;align-items:center;justify-content:space-between;padding:0 4px 8px}
.cal-head b{font:800 20px/1 var(--display)}
.cal-nav{width:40px;height:36px;font-size:24px;line-height:1;text-align:center;color:var(--accent);border-radius:8px}
.cal-nav:disabled{opacity:.25}
.cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:3px}
.cal-wd{text-align:center;font-size:12px;font-weight:700;color:var(--muted);padding-bottom:4px}
.cd{position:relative;aspect-ratio:1/1.08;border-radius:9px;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;padding-top:5px;gap:3px;text-align:center}
.cd .cd-n{font-size:14px;font-weight:600;color:var(--muted);line-height:1}
.cd.has{background:var(--bg)}
.cd.has .cd-n{color:var(--ink);font-weight:800}
.cd.today .cd-n{color:var(--accent)}
.cd.today{box-shadow:inset 0 0 0 1.5px var(--accent)}
.cd.sel{background:var(--ink)}.cd.sel .cd-n{color:var(--bg)}
.cd-dots{display:flex;flex-wrap:wrap;justify-content:center;gap:2px;max-width:30px}
.cd-dots .dot{width:8px;height:8px}
.cd.sel .dot{box-shadow:0 0 0 1px var(--bg)}
.cd-more{font-size:10px;font-weight:700;color:var(--muted);line-height:8px}
.cd:disabled{cursor:default}
.month-sum{margin:12px 2px 6px}
.legend{display:flex;flex-wrap:wrap;gap:6px 12px;margin:4px 2px 6px}
.lg{display:inline-flex;align-items:center;gap:5px;font-size:13px}
.lg b{font-variant-numeric:tabular-nums}
.lg.zero{opacity:.45}
.weeks{width:100%;height:auto;display:block;background:var(--surface);border-radius:14px;padding:8px 6px 2px}
.weeks .gl{stroke:var(--line);stroke-width:1}
.weeks .ax{font:10px var(--body);fill:var(--muted)}
.weeks rect{stroke:rgba(0,0,0,.18);stroke-width:.5}
.f-red{fill:var(--p-red)}.f-blue{fill:var(--p-blue)}.f-yellow{fill:var(--p-yellow)}.f-green{fill:var(--p-green)}.f-white{fill:var(--p-white)}.f-steel{fill:var(--p-steel)}.f-iron{fill:var(--p-iron)}
@media (prefers-color-scheme:dark){.weeks rect{stroke:rgba(255,255,255,.22)}}
.balance{background:var(--surface);border-radius:14px;padding:6px 12px}
.bal{display:grid;grid-template-columns:92px 1fr 26px 74px;gap:8px;align-items:center;padding:7px 0;border-top:1px solid var(--line)}
.bal:first-child{border-top:0}
.bal-name{display:flex;align-items:center;gap:6px;font-size:14px;font-weight:600}
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
.st-desc{white-space:pre-line;margin:0;font-size:15px}
.st-actions{display:flex;flex-wrap:wrap;gap:6px}
textarea.search{resize:none;line-height:1.4}
.secondary.ai{border-color:var(--accent);color:var(--accent);font-weight:700}
.busy{animation:pulse 1.2s ease-in-out infinite}
@keyframes pulse{50%{opacity:.55}}
@media (prefers-reduced-motion:reduce){.busy{animation:none}}
.kicker{font-size:13px;font-weight:700;color:var(--accent);margin:8px 0 0}
.keybox{background:var(--surface);border-radius:14px;padding:14px;margin:18px 0 4px;border:1.5px dashed var(--accent)}
.keyrow{display:flex;gap:8px;align-items:center}
.keyrow input{flex:1;min-width:0;font:16px var(--body);padding:10px 12px;border-radius:10px;border:1px solid var(--line);background:var(--bg);color:var(--ink);-webkit-appearance:none}
.plan-ex{grid-template-columns:64px 1fr}
.plan-ex .ex-meta b{color:var(--ink);font-weight:700}
.coach-note{margin:2px 0 4px;color:var(--ink)}
.ai-btn{display:block;width:100%;margin:12px 0 4px;padding:12px;border-radius:12px;border:1.5px solid var(--accent);color:var(--accent);font-weight:700;text-align:center}
.coach{margin:12px 0 4px;padding:12px 14px;border-radius:12px;background:var(--bg)}
.coach .kicker{margin:0 0 2px}
.coach-h{font:800 20px/1.2 var(--display);margin:0 0 6px}
.coach h3{font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);margin:14px 0 4px}
.coach ul{margin:0;padding-left:18px}.coach li{margin:0 0 4px}
.focus-row{padding:6px 0;border-top:1px solid var(--line)}
.focus-top{display:flex;align-items:center;gap:8px}
.focus-row p{margin:2px 0 0 18px}
.int{margin-left:auto;font-size:13px;font-weight:700;padding:2px 8px;border-radius:6px}
.int-light{background:rgba(46,139,62,.16);color:var(--done)}
.int-moderate{background:rgba(242,183,5,.22);color:var(--ink)}
.int-hard{background:rgba(200,16,46,.15);color:var(--accent)}
.spark-mark{font-style:normal;font-size:14px}
.row{flex-wrap:wrap;gap:0 18px}
.note{font-size:14px;color:var(--muted);border-left:3px solid var(--accent);padding:2px 0 2px 10px;margin:4px 0 0}
.disclaimer{background:var(--surface);border-radius:14px;padding:16px 16px 6px;margin:8px 0 6px}
.disclaimer p{margin:0 0 12px}
.empty{padding:30px 0}.empty-line{padding:20px 4px;color:var(--muted)}
.entry{background:var(--surface);border-radius:14px;padding:12px 14px 4px;margin:0 0 12px}
.entry-head{display:flex;justify-content:space-between;align-items:baseline;gap:10px}
.entry-name{font:800 21px/1.1 var(--display);padding:4px 0;color:var(--ink)}
.set-row{display:grid;grid-template-columns:26px 1fr 1fr 44px 28px;gap:8px;align-items:center;margin-top:8px}
.set-row.head{font-size:12px;color:var(--muted);margin-top:4px}
.set-row .n{font-weight:700;color:var(--muted);text-align:center}
.set-row input{width:100%;font:600 17px var(--body);padding:9px 6px;border-radius:8px;border:1px solid var(--line);background:var(--bg);color:var(--ink);text-align:center;-webkit-appearance:none}
.tick{height:40px;border-radius:8px;border:2px solid var(--line);font-weight:800;text-align:center;color:var(--muted)}
.set-row.done .tick{background:var(--done);border-color:var(--done);color:#fff}
.set-row.done input{border-color:transparent;background:transparent}
.x{height:40px;color:var(--muted);font-size:20px;text-align:center}
#rest{position:fixed;left:12px;right:12px;bottom:calc(68px + env(safe-area-inset-bottom,0px));display:flex;align-items:center;gap:14px;
  padding:10px 16px;border-radius:14px;background:var(--ink);color:var(--bg);z-index:19;overflow:hidden;max-width:616px;margin:0 auto}
#rest[hidden]{display:none}
.rest-fill{position:absolute;inset:0 auto 0 0;width:calc(var(--p,0) * 100%);background:currentColor;opacity:.13;transition:width .25s linear}
.rest-label{font-size:14px;opacity:.75}
.rest-time{font:800 28px/1 var(--display);font-variant-numeric:tabular-nums;margin-right:auto;min-width:3ch}
#rest button{font-weight:700;font-size:15px;padding:6px 0;position:relative}
#rest.go{background:var(--done);color:#fff}
#toast{position:fixed;left:50%;top:calc(var(--band,40px) / 2 - 17px);transform:translate(-50%,-8px);max-width:88vw;padding:8px 16px;border-radius:12px;
  background:var(--ink);color:var(--bg);font-size:15px;font-weight:600;z-index:30;pointer-events:none;text-align:center;
  opacity:0;visibility:hidden;transition:opacity .2s ease,transform .2s ease,visibility .2s}
#toast.show{opacity:1;visibility:visible;transform:translate(-50%,0)}#toast.err{background:var(--accent);color:#fff}
#tabs{position:fixed;left:0;right:0;bottom:0;display:grid;grid-template-columns:repeat(4,1fr);background:var(--surface);border-top:1px solid var(--line);
  padding-bottom:env(safe-area-inset-bottom,0px);z-index:20}
#tabs button{display:flex;flex-direction:column;align-items:center;gap:3px;padding:9px 0 10px;font:600 12px var(--body);color:var(--muted)}
#tabs button[aria-current="page"]{color:var(--ink)}
#tabs svg{width:24px;height:24px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.sess{background:var(--surface);border-radius:14px;margin:0 0 10px;overflow:hidden}
.sess-head{display:flex;justify-content:space-between;align-items:center;gap:12px;width:100%;padding:13px 14px}
.sess-head b{display:block;font:800 19px/1.15 var(--display)}
.dots{display:flex;gap:4px;flex:none}
.sess-body{padding:0 14px 6px;border-top:1px solid var(--line)}
.sess-ex{padding:10px 0 8px;border-bottom:1px solid var(--line)}
.sess-ex .entry-name{font-size:18px;display:block}
.row{display:flex;justify-content:space-between}
@media (min-width:520px){.rack{grid-template-columns:repeat(4,1fr)}}
`;

// ---------------------------------------------------------------- main
async function main() {
  if (config.runsInWidget) await runWidget();
  else await runApp();
  Script.complete();
}
await main();
