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
const DISCLAIMER_VERSION = 1;

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
  };
  const CLUB_URL = "https://www.instagram.com/7amclub__/";
  const LOGO = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="var(--p-red)"/>' +
    '<circle cx="12" cy="12" r="7.6" fill="none" stroke="rgba(255,255,255,.4)" stroke-width="1.3"/>' +
    '<circle cx="12" cy="12" r="2.8" fill="var(--bg)"/></svg>';
  const TABS = [
    { key: "train", label: "Train" },
    { key: "workout", label: "Workout" },
    { key: "history", label: "History" },
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
    consent: !!(BOOT.consent && BOOT.consent.version === CFG.disclaimerVersion),
    showDisclaimer: false,
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
  function startRest() {
    S.rest = { end: Date.now() + CFG.rest * 1000, total: CFG.rest, beeped: false };
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
    S.history.sessions = S.history.sessions.filter((x) => x.id !== done.id).concat(done);
    clearTimeout(draftT);
    send("save", { session: done });
    S.session = null;
    S.rest.end = 0;
    S.tab = "history";
    S.openSession = done.id;
    render();
    toast("Workout saved");
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
      <footer class="lib">
        <p class="muted small">${S.lib.length} exercises for ${esc(eqNames())} stored on this phone${S.meta ? `, updated ${esc(day(S.meta.syncedAt))}` : ""}. Photos and instructions from free-exercise-db (public domain).</p>
        ${missingPhotos() && !S.sync ? `<p class="small"><b>${plural(missingPhotos(), "exercise")} ${missingPhotos() === 1 ? "has" : "have"} no photos yet.</b> Tap Update library to download them.</p>` : ""}
        <div class="row">${S.sync ? "" : `<button class="link" data-a="sync">Update library</button>`}<button class="link danger" data-a="disclaimer">Disclaimer</button></div>
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
        ${last ? `<p class="muted small">Last time, ${esc(day(last.date))}: ${esc(fmtSets(last.sets))}</p>` : `<p class="muted small">First time logging this one.</p>`}
        <div class="set-row head"><span>Set</span><span>${UNIT}</span><span>Reps</span><span></span><span></span></div>
        ${rows}
        <button class="link" data-a="add-set" data-v="${ei}">Add set</button></section>`;
    }).join("");
    return `<header class="bar"><h1 class="title">Workout</h1><span class="muted" id="elapsed">${elapsed(s.start)}</span></header>
      <p class="muted small" id="totals">${plural(t.n, "set")} done${t.v ? `, ${fmtNum(t.v)} ${UNIT} lifted` : ""}. Tap ✓ after each set to start the ${CFG.rest} s rest timer.</p>
      ${entries}
      <button class="secondary" data-a="tab" data-v="train">Add exercise</button>
      <button class="primary${S.armed === "finish" ? " armed" : ""}" data-a="finish">${S.armed === "finish" ? "Tap again to save" : "Finish workout"}</button>
      <button class="link danger${S.armed === "discard" ? " armed" : ""}" data-a="discard">${S.armed === "discard" ? "Tap again to discard" : "Discard workout"}</button>`;
  }

  function renderHistory() {
    const ss = sessionsDesc();
    const head = `<header class="bar"><h1 class="title">History</h1>${ss.length ? `<button class="link" data-a="export">Export CSV</button>` : ""}</header>`;
    if (!ss.length) return head + `<div class="empty"><p>Finished workouts show up here, with every set you logged.</p></div>`;
    const monday = new Date();
    monday.setHours(0, 0, 0, 0);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    const week = ss.filter((s) => new Date(s.start) >= monday);
    const wv = volume(week.flatMap((s) => s.entries));
    const summary = week.length
      ? `This week: ${plural(week.length, "workout")}, ${plural(wv.n, "set")}${wv.v ? `, ${fmtNum(wv.v)} ${UNIT} lifted` : ""}.`
      : "No workouts yet this week.";
    const items = ss.map((s) => {
      const v = volume(s.entries);
      const open = S.openSession === s.id;
      const dots = (s.groups || []).map((k) => {
        const g = GROUPS.find((x) => x.key === k);
        return g ? `<i class="dot pl-${g.plate}" title="${g.label}"></i>` : "";
      }).join("");
      return `<section class="sess${open ? " open" : ""}">
        <button class="sess-head" data-a="sess" data-v="${esc(s.id)}" aria-expanded="${open}">
          <span><b>${esc(day(s.start))}</b><span class="muted small">${s.end ? `${minutesBetween(s.start, s.end)} min, ` : ""}${plural(s.entries.length, "exercise")}, ${plural(v.n, "set")}${v.v ? `, ${fmtNum(v.v)} ${UNIT}` : ""}</span></span>
          <span class="dots">${dots}</span></button>
        ${open ? `<div class="sess-body">${s.entries.map((en) => `<div class="sess-ex">
            <button class="entry-name" data-a="open" data-v="${esc(en.id)}">${esc(en.name)}</button>
            <span class="muted small">${esc(fmtSets(en.sets))}</span></div>`).join("")}
          <div class="row"><button class="link" data-a="repeat" data-v="${esc(s.id)}">Repeat this workout</button>
          <button class="link danger${S.armed === "del" + s.id ? " armed" : ""}" data-a="del-sess" data-v="${esc(s.id)}">${S.armed === "del" + s.id ? "Tap to delete" : "Delete"}</button></div></div>` : ""}
      </section>`;
    }).join("");
    return head + `<p class="lead">${esc(summary)}</p>` + items;
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
      : S.tab === "train" ? (S.trainView === "list" && S.lib.length ? renderList() : renderHome())
      : S.tab === "workout" ? renderWorkout() : renderHistory();
    if (S.consent) renderTabs();
    else $tabs.innerHTML = "";
    window.scrollTo(0, same ? y : key.startsWith("detail:") ? 0 : S.scroll[key] || 0);
    currentKey = key;
    if (S.detailId) want(S.detailId);
    else if (S.tab === "train" && S.trainView === "list") observeThumbs();
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
      const set = S.session.entries[ei].sets[si];
      if (!set.done && !(set.r > 0)) return toast("Enter reps first.", true);
      set.done = !set.done;
      if (set.done) startRest();
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
    onHistory(h) {
      if (h && Array.isArray(h.sessions)) S.history = h;
      if (S.tab === "history" && !S.detailId) render();
    },
    onError(msg) { S.sync = null; render(); toast(msg, true); },
    toast(msg) { toast(msg); },
  };

  setLib(BOOT.lib);
  if (S.session && S.session.entries && S.session.entries.length) {
    S.tab = "workout";
    setTimeout(() => toast("Unfinished workout restored"), 300);
  } else S.session = null;
  render();
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
body{padding:env(safe-area-inset-top,0px) 0 calc(150px + env(safe-area-inset-bottom,0px))}
body::before{content:"";position:fixed;inset:0 0 auto;height:env(safe-area-inset-top,0px);background:var(--bg);z-index:10}
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
.bar{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:48px;position:sticky;top:env(safe-area-inset-top,0px);background:var(--bg);z-index:5}
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
#toast{position:fixed;left:50%;top:calc(env(safe-area-inset-top,0px) + 10px);transform:translate(-50%,-150%);max-width:88vw;padding:10px 16px;border-radius:10px;
  background:var(--ink);color:var(--bg);font-size:15px;font-weight:600;z-index:30;transition:transform .25s ease;pointer-events:none;text-align:center}
#toast.show{transform:translate(-50%,0)}#toast.err{background:var(--accent);color:#fff}
#tabs{position:fixed;left:0;right:0;bottom:0;display:grid;grid-template-columns:repeat(3,1fr);background:var(--surface);border-top:1px solid var(--line);
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
