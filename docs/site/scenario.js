// Screenshot scenario for Go2FGym (repo-site, see github.com/gadominas/app-blueprints/tree/main/repo-site).
//
//   node app-blueprints/repo-site/tools/capture.js .            # every card
//   node app-blueprints/repo-site/tools/capture.js . --only=01-pick-muscles
//
// Everything here is invented sample data. The exercise library is a small copy of free-exercise-db
// (public domain): fixtures/exercises.json holds the 466 home exercises (instructions kept only for the
// exercises the cards show) and fixtures/images/ the photos of those exercises. Every other exercise
// gets a tiny grey placeholder photo, so the app counts its library as downloaded; no placeholder is
// ever on screen.
'use strict';
// The Scriptable side runs in Node: give it the phone's time zone, so "today" and weekdays match the pages.
process.env.TZ = 'Europe/Vilnius';
const fs = require('fs');
const path = require('path');

const FX = path.join(__dirname, 'fixtures');
const REPO = path.join(__dirname, '..', '..');
const LIB = JSON.parse(fs.readFileSync(path.join(FX, 'exercises.json'), 'utf8'));
const NAME = Object.fromEntries(LIB.map((e) => [e.id, e.name]));
const PHOTOS = new Set(fs.readdirSync(path.join(FX, 'images')).filter((f) => f.includes('__')));
const PLACEHOLDER = fs.readFileSync(path.join(FX, 'images', 'placeholder.jpg'));

const LOCAL = '/var/mobile/Containers/Data/Application/SCRIPTABLE/Documents';   // FileManager.local()
const ROOT = LOCAL + '/Go2FGym';
const NOW = Date.UTC(2026, 9, 29, 6, 12);   // Thursday 29 October 2026, 08:12 in Vilnius

// Local Vilnius time to ISO (summer time ends on 25 October 2026).
const at = (day, hm) => new Date(`${day}T${hm}:00${day >= '2026-10-25' ? '+02:00' : '+03:00'}`).toISOString();
const addDays = (day, n) => { const d = new Date(day + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// ───────── workout history: twelve weeks of push, pull and legs at about 06:45 ─────────
// [id, sets, reps from → to, weight from → to (null = bodyweight), weight step]
const PLANS = {
  pull: { groups: ['back', 'arms', 'shoulders'], min: 52, ex: [
    ['Pullups', 4, [5, 9], null],
    ['Bent_Over_Barbell_Row', 4, [8, 8], [40, 52.5], 2.5],
    ['One-Arm_Dumbbell_Row', 3, [10, 10], [22, 28], 2],
    ['Hammer_Curls', 3, [10, 10], [12, 15], 1],
    ['Reverse_Flyes', 3, [12, 12], [6, 8], 1],
  ] },
  push: { groups: ['chest', 'shoulders', 'arms'], min: 48, ex: [
    ['Dumbbell_Bench_Press', 3, [10, 10], [20, 26], 2],
    ['Pushups', 3, [15, 22], null],
    ['Dumbbell_Shoulder_Press', 3, [10, 10], [14, 18], 2],
    ['Side_Lateral_Raise', 3, [12, 12], [6, 8], 1],
    ['Standing_Dumbbell_Triceps_Extension', 3, [12, 12], [12, 16], 2],
  ] },
  legs: { groups: ['legs', 'glutes', 'core'], min: 58, ex: [
    ['Barbell_Squat', 4, [8, 8], [55, 72.5], 2.5],
    ['Romanian_Deadlift', 3, [10, 10], [50, 62.5], 2.5],
    ['Dumbbell_Lunges', 3, [10, 10], [14, 18], 2],
    ['Barbell_Glute_Bridge', 3, [10, 10], [60, 80], 5],
    ['Standing_Dumbbell_Calf_Raise', 3, [15, 15], [16, 20], 2],
    ['Reverse_Crunch', 3, [12, 15], null],
  ] },
  hotel: { groups: ['legs', 'chest', 'shoulders', 'core'], min: 24, title: 'Hotel room full body', ex: [
    ['Bodyweight_Squat', 3, [20, 20], null],
    ['Pushups', 3, [18, 18], null],
    ['Band_Pull_Apart', 3, [15, 15], null],
    ['Reverse_Crunch', 3, [15, 15], null],
  ] },
};
// Monday of each week (10 August to 26 October) and the days trained.
const WEEKS = Array.from({ length: 12 }, (_, i) => addDays('2026-08-10', 7 * i));
const SCHEDULE = [];
WEEKS.forEach((mon, i) => {
  SCHEDULE.push([mon, 'pull']);
  if (i === 5) { SCHEDULE.push([addDays(mon, 2), 'hotel']); return; }   // a work trip: one hotel-room session
  SCHEDULE.push([addDays(mon, 2), 'push']);
  if (i !== 3 && i < 11) SCHEDULE.push([addDays(mon, 5), 'legs']);       // one missed Saturday; this week's is still ahead
});

function buildHistory() {
  const count = {}, seen = {};
  SCHEDULE.forEach(([, k]) => (count[k] = (count[k] || 0) + 1));
  const sessions = SCHEDULE.map(([day, k], n) => {
    const p = PLANS[k];
    const i = (seen[k] = (seen[k] || 0) + 1) - 1;
    const t = count[k] > 1 ? i / (count[k] - 1) : 1;
    const startHM = ['06:41', '06:47', '06:38', '06:52', '06:44'][n % 5];
    const start = at(day, startHM);
    const end = new Date(Date.parse(start) + (p.min + ((n * 7) % 9) - 4) * 60000).toISOString();
    const entries = p.ex.map(([id, sets, reps, w, step], j) => {
      const r = Math.round(reps[0] + (reps[1] - reps[0]) * t);
      const kg = w ? Math.floor((w[0] + (w[1] - w[0]) * t) / step + 1e-9) * step : null;
      return { id, name: NAME[id], sets: Array.from({ length: sets }, (_, s) => ({ w: kg, r: s === sets - 1 && (n + j) % 3 === 0 && r > 6 ? r - 1 : r })) };
    });
    const s = { id: 's' + day.replace(/-/g, ''), start, end, groups: p.groups.slice(), entries };
    if (p.title) s.title = p.title;
    return s;
  });
  const by = (d) => sessions.find((s) => s.start.startsWith(d) || s.id === 's' + d.replace(/-/g, ''));
  // The last push day: every set of bench press at 26 kg (a new best), lateral raises one rep short.
  const wed = by('2026-10-28');
  wed.entries.find((e) => e.id === 'Side_Lateral_Raise').sets[2].r = 10;
  wed.ai = {
    at: at('2026-10-28', '07:41'), by: 'Claude',
    headline: 'Dumbbell bench press went up to 26 kg for all three sets of 10, your best yet.',
    went_well: ['Bench press: 26 kg × 10 on every set, up from 24 kg two weeks ago.', 'Shoulder press held 18 kg × 10 with no missed reps.'],
    watch_out: ['Lateral raises dropped to 10 reps on the last set; stay at 8 kg until all 12 land.'],
    focus_next: [
      { group: 'legs', intensity: 'hard', sets: 10, why: 'Last trained on Saturday, so quads and hamstrings are fully recovered.' },
      { group: 'glutes', intensity: 'moderate', sets: 4, why: 'Fewest working sets of any group in the last four weeks.' },
      { group: 'core', intensity: 'light', sets: 3, why: 'A short finisher keeps core work going twice a week.' },
    ],
    recovery: 'Chest, shoulders and triceps should be ready again by Saturday morning.',
    next: { groups: ['legs', 'glutes', 'core'], when: 'Tomorrow', idea: 'Squats and Romanian deadlifts first, then lunges and glute bridges, and finish with reverse crunches.' },
  };
  wed.strava = {
    funny: { by: 'Claude', title: 'Bench PR before sunrise ☕',
      description: '06:47, 26 kg dumbbells, zero witnesses.\nDumbbell Bench Press: 3×10 @ 26 kg (new best)\nDumbbell Shoulder Press: 3×10 @ 18 kg\nPushups: 3×22\nThe bench and I are officially in a relationship. Go2FGym.' },
  };
  const mon = by('2026-10-26');
  mon.ai = { at: at('2026-10-26', '07:45'), by: 'Claude', headline: 'Nine pull-ups on every set: a clean four-set best.', went_well: ['Pull-ups: 4 × 9, up from 4 × 8.'], watch_out: [],
    focus_next: [{ group: 'chest', intensity: 'moderate', sets: 9, why: 'Two days since the last push session.' }], recovery: 'Back and biceps are ready again on Wednesday.',
    next: { groups: ['chest', 'shoulders'], when: 'In 2 days', idea: 'Bench press, shoulder press and lateral raises.' } };
  return { version: 1, sessions };
}

// Today's workout in progress: the plan Build next made, squats done, Romanian deadlifts under way.
function draftSession() {
  const t0 = Date.parse(at('2026-10-29', '07:31'));
  const s = (w, r, n, done) => Array.from({ length: n }, (_, i) => ({ w, r, done: !!done && i < done, t: done && i < done ? t0 + (5 + 3 * i) * 60000 : undefined }));
  return {
    id: 'draft1029', start: new Date(t0).toISOString(), groups: ['legs', 'glutes', 'core'], title: 'Squat day, coach’s pick',
    entries: [
      { id: 'Barbell_Squat', name: NAME.Barbell_Squat, rest: 150, note: 'Brace before each rep; hips and knees bend together.', sets: s(72.5, 8, 4, 4), completed: true, startedAt: t0 + 4 * 60000, doneAt: t0 + 19 * 60000 },
      { id: 'Romanian_Deadlift', name: NAME.Romanian_Deadlift, rest: 120, note: 'Push the hips back and keep the bar close to your legs.', sets: s(62.5, 10, 3, 1), active: true, startedAt: t0 + 21 * 60000 },
      { id: 'Dumbbell_Lunges', name: NAME.Dumbbell_Lunges, rest: 90, note: 'Long step; the back knee lightly touches down.', sets: s(18, 10, 3) },
      { id: 'Barbell_Glute_Bridge', name: NAME.Barbell_Glute_Bridge, rest: 90, note: 'Pause for one second at the top.', sets: s(80, 10, 3) },
      { id: 'Standing_Dumbbell_Calf_Raise', name: NAME.Standing_Dumbbell_Calf_Raise, rest: 60, sets: s(20, 15, 3) },
      { id: 'Reverse_Crunch', name: NAME.Reverse_Crunch, rest: 45, sets: s(null, 15, 3) },
    ],
  };
}

// ───────── AI: fixed replies, shaped like the real Claude API ─────────
const PLAN_LEGS = {
  title: 'Squat day, coach’s pick', estimated_minutes: 55,
  summary: 'Legs first while they are fresh, then glutes and a short core finisher, as your coach suggested after Wednesday.',
  warmup: 'Five minutes of bodyweight squats, leg swings and hip circles, then two light squat sets with the empty bar.',
  cooldown: 'Walk for two minutes, then hold a hip flexor and a hamstring stretch for 30 seconds per side.',
  exercises: [
    { id: 'Barbell_Squat', sets: 4, reps: 8, rest_seconds: 150, weight_kg: 72.5, note: 'Brace before each rep; hips and knees bend together.' },
    { id: 'Romanian_Deadlift', sets: 3, reps: 10, rest_seconds: 120, weight_kg: 62.5, note: 'Push the hips back and keep the bar close to your legs.' },
    { id: 'Dumbbell_Lunges', sets: 3, reps: 10, rest_seconds: 90, weight_kg: 18, note: 'Long step; the back knee lightly touches down.' },
    { id: 'Barbell_Glute_Bridge', sets: 3, reps: 10, rest_seconds: 90, weight_kg: 80, note: 'Pause for one second at the top.' },
    { id: 'Standing_Dumbbell_Calf_Raise', sets: 3, reps: 15, rest_seconds: 60, weight_kg: 20, note: 'Full stretch at the bottom, slow on the way down.' },
    { id: 'Reverse_Crunch', sets: 3, reps: 15, rest_seconds: 45, weight_kg: null, note: 'Curl the hips up; no swinging.' },
  ],
};
const PLAN_HOTEL = {
  title: 'Hotel room full body', estimated_minutes: 20,
  summary: 'A quiet full-body circuit for a small room, with only your bodyweight and one band.',
  warmup: 'Two minutes of marching on the spot, arm circles and slow bodyweight squats.',
  cooldown: 'One minute of slow breathing, then stretch your chest in the doorway for 30 seconds.',
  exercises: [
    { id: 'Bodyweight_Squat', sets: 3, reps: 20, rest_seconds: 45, weight_kg: null, note: 'Sit back between your heels; chest up.' },
    { id: 'Pushups', sets: 3, reps: 18, rest_seconds: 60, weight_kg: null, note: 'Body in one straight line; chest to a fist above the floor.' },
    { id: 'Band_Pull_Apart', sets: 3, reps: 15, rest_seconds: 45, weight_kg: null, note: 'Squeeze the shoulder blades; arms stay straight.' },
    { id: 'Shoulder_Press_-_With_Bands', sets: 3, reps: 12, rest_seconds: 60, weight_kg: null, note: 'Stand on the band; press without arching your back.' },
    { id: 'Hip_Lift_with_Band', sets: 3, reps: 15, rest_seconds: 45, weight_kg: null, note: 'Drive through the heels and pause at the top.' },
  ],
};
const REVIEW = { headline: 'A strong session: every planned set done.', went_well: ['All sets completed.'], watch_out: [], focus_next: [{ group: 'back', intensity: 'moderate', sets: 9, why: 'Most due.' }], recovery: 'Ready again in 48 hours.', next_workout: { groups: ['back', 'arms'], when: 'In 2 days', idea: 'Rows and pull-ups.' } };
const STRAVA = { title: 'Morning iron', description: 'A steady home session before work.' };

function claude(req) {
  const b = req.json() || {};
  const sys = String(b.system || '');
  const user = String(((b.messages || [])[0] || {}).content || '');
  let out = 'OK', tin = 14, tout = 2;
  if (/planning one home workout/.test(sys)) {
    let eq = [];
    try { eq = JSON.parse(user).request.equipment; } catch (e) { /* default plan */ }
    out = JSON.stringify(eq.length && eq.every((q) => q === 'Bodyweight' || q === 'Bands') ? PLAN_HOTEL : PLAN_LEGS); tin = 6120; tout = 690;
  } else if (/reviewing a home workout/.test(sys)) { out = JSON.stringify(REVIEW); tin = 2980; tout = 460; }
  else if (/Strava activity/.test(sys)) { out = JSON.stringify(STRAVA); tin = 1480; tout = 140; }
  return { json: { id: 'msg_demo', type: 'message', role: 'assistant', model: b.model, content: [{ type: 'text', text: out }], usage: { input_tokens: tin, output_tokens: tout } } };
}

// Token usage for AI settings › Token usage: two to three requests a day over the last weeks.
function usageFixture() {
  const p = { calls: 0, in: 0, out: 0, models: {}, features: {}, days: {} };
  const add = (o, k, tin, tout) => { const x = (o[k] = o[k] || { calls: 0, in: 0, out: 0 }); x.calls++; x.in += tin; x.out += tout; };
  const call = (day, feature, tin, tout) => {
    p.calls++; p.in += tin; p.out += tout;
    add(p.models, 'claude-haiku-5-5', tin, tout); add(p.features, feature, tin, tout); add(p.days, day, tin, tout);
  };
  call('2026-09-21', 'test', 14, 2);
  SCHEDULE.filter(([d]) => d >= '2026-09-21').forEach(([d], i) => {
    call(d, 'workout_review', 2900 + (i % 4) * 60, 430 + (i % 3) * 25);
    call(d, 'strava_post', 1450 + (i % 5) * 20, 130 + (i % 4) * 8);
    if (i % 3 === 0) call(addDays(d, -1), 'workout_plan', 6050 + (i % 4) * 90, 660 + (i % 3) * 30);
  });
  return { since: Date.parse(at('2026-09-21', '21:10')), p: { anthropic: p } };
}

// ───────── saved state ─────────
function files(shot) {
  const f = {};
  f[ROOT + '/exercises.json'] = fs.readFileSync(path.join(FX, 'exercises.json'));
  f[ROOT + '/library-meta.json'] = { syncedAt: at('2026-08-09', '20:14'), failed: 0 };
  f[ROOT + '/disclaimer-accepted.json'] = { version: 2, acceptedAt: at('2026-08-09', '20:05') };
  f[ROOT + '/history.json'] = buildHistory();
  for (const e of LIB) for (const rel of e.images || []) {
    const name = rel.replace(/\//g, '__');
    f[ROOT + '/images/' + name] = PHOTOS.has(name) ? fs.readFileSync(path.join(FX, 'images', name)) : PLACEHOLDER;
  }
  f[LOCAL + '/go2fgym-ai-settings.json'] = { aiProvider: 'anthropic', ai: true, models: { anthropic: { at: NOW - 3 * 864e5, list: [
    { id: 'claude-opus-5-5', name: 'Claude Opus 5.5' }, { id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5' }, { id: 'claude-haiku-5-5', name: 'Claude Haiku 5.5' },
  ] } } };
  f[LOCAL + '/go2fgym-usage.json'] = usageFixture();
  if (shot.draft) f[ROOT + '/draft.json'] = draftSession();
  return f;
}

// The update card offers the real 1.12.0 release to someone still on 1.11.0, from a copy of the
// script with only its VERSION line changed (written to the git-ignored raw folder).
const SCRIPT = 'Go2FGym.js';
function scriptFor(shot) {
  if (!shot.olderVersion) return SCRIPT;
  const rel = 'docs/site/raw/Go2FGym-' + shot.olderVersion + '.js';
  fs.mkdirSync(path.join(REPO, 'docs/site/raw'), { recursive: true });
  const code = fs.readFileSync(path.join(REPO, SCRIPT), 'utf8').replace(/const VERSION = '[^']+';/, `const VERSION = '${shot.olderVersion}';`);
  fs.writeFileSync(path.join(REPO, rel), code);
  return rel;
}

// The emulator's DateFormatter knows only yyyy, MM, dd, HH, mm and ss; the widget also uses EEE and d MMM.
class DateFormatter {
  constructor() { this.dateFormat = 'yyyy-MM-dd'; this.locale = 'en_US'; }
  useShortDateStyle() {} useMediumDateStyle() {} useNoDateStyle() {} useShortTimeStyle() {} useNoTimeStyle() {}
  string(d) {
    const p = (n) => String(n).padStart(2, '0');
    const part = (o) => new Intl.DateTimeFormat('en-US', Object.assign({ timeZone: 'Europe/Vilnius' }, o)).format(d);
    const map = { yyyy: () => d.getFullYear(), EEEE: () => part({ weekday: 'long' }), EEE: () => part({ weekday: 'short' }), MMMM: () => part({ month: 'long' }), MMM: () => part({ month: 'short' }),
      MM: () => p(d.getMonth() + 1), dd: () => p(d.getDate()), d: () => d.getDate(), HH: () => p(d.getHours()), mm: () => p(d.getMinutes()), ss: () => p(d.getSeconds()) };
    return this.dateFormat.replace(/yyyy|EEEE|EEE|MMMM|MMM|MM|dd|d|HH|mm|ss/g, (t) => map[t]());
  }
  date(s) { const d = new Date(s); return isNaN(d) ? null : d; }
}

const tapPlate =(h, g) => h.tap(`[data-a="plate"][data-v="${g}"]`, { after: 250 });

module.exports = {
  app: { name: 'Go2FGym', script: SCRIPT, accent: '#A3E635' },
  now: NOW,
  locale: 'en_US', timezone: 'Europe/Vilnius',
  settle: 2900,
  fixtures: (shot) => {
    module.exports.app.script = scriptFor(shot);
    return {
      files: files(shot),
      keychain: { GO2FGYM_ANTHROPIC_KEY: 'sk-ant-demo-0000000000001234' },
      globals: () => ({ DateFormatter }),
      routes: [
        { match: /releases\.json/, respond: { file: path.join(REPO, 'releases.json') } },
        { match: /icon-1024\.png/, respond: { file: path.join(REPO, 'docs/icon-1024.png') } },
        { match: 'api.anthropic.com/v1/messages', respond: claude },
        { match: 'api.anthropic.com/v1/models', respond: { json: { data: [{ id: 'claude-haiku-5-5', display_name: 'Claude Haiku 5.5', created_at: '2026-09-01T00:00:00Z' }] } } },
      ],
    };
  },
  shots: [
    { id: '01-pick-muscles', label: 'Pick the muscles', caption: 'Load the plates you want to train; each shows how many exercises you can do.',
      run: async (h) => { await tapPlate(h, 'legs'); await tapPlate(h, 'glutes'); await tapPlate(h, 'core'); } },
    { id: '02-live-workout', label: 'Log it as you lift', caption: 'Sets prefilled, a rest timer, and a pinned header with kg lifted and milestones.', draft: true,
      run: async (h) => { await h.wait(400); await h.tap('[data-a="done"][data-v="1:1"]'); await h.wait(600); } },
    { id: '03-build-next', label: 'Next workout in one tap', caption: 'Build next turns your history and the coach’s advice into a ready plan.',
      run: async (h) => { await h.tap('[data-a="tab"][data-v="history"]'); await h.tap('[data-a="build-next-h"]', { after: 2500 }); } },
    { id: '04-exercise-demo', label: 'See how it’s done', caption: 'A start-to-end photo demo, the muscles it works and numbered steps.',
      run: async (h) => {
        await tapPlate(h, 'chest'); await h.tap('[data-a="browse"]');
        await h.tap('[data-a="open"][data-v="Dumbbell_Bench_Press"]', { after: 1500 });
        await h.tap('[data-a="frame"][data-v="1"]', { after: 300 });
      } },
    { id: '05-history-calendar', label: 'Your month at a glance', caption: 'Coloured dots show the muscle groups you trained each day.',
      run: async (h) => { await h.tap('[data-a="tab"][data-v="history"]'); } },
    { id: '06-progress', label: 'Progress and balance', caption: 'Sets per week by muscle group, and which group is most due.',
      run: async (h) => { await h.tap('[data-a="tab"][data-v="progress"]'); await h.scrollTo('.weeks', 150); } },
    { id: '07-ai-coach', label: 'Coach review after each workout', caption: 'What went well, what to watch, and what to train next and how hard.',
      run: async (h) => { await h.tap('[data-a="tab"][data-v="history"]'); await h.scrollTo('.coach', 108); } },
    { id: '08-strava-post', label: 'Strava post, written for you', caption: 'A title and description in a serious, funny or neutral tone, ready to paste.',
      run: async (h) => { await h.tap('[data-a="tab"][data-v="history"]'); await h.scrollTo('.sess-body', 70); await h.scrollTo('.strava', 300); } },
    { id: '09-launch', label: 'Launch screen', caption: 'The dumbbell draws itself, then “Pick. Lift. Log.” Tap to skip.', settle: 1400, after: 0 },
    { id: '10-settings', label: 'Settings', caption: 'Colours, layout and text size, your equipment, units and rest timer.',
      run: async (h) => { await h.tap('[data-a="settings"]', { after: 900 }); } },
    { id: '11-ai-settings', label: 'AI settings', caption: 'Your own Claude or OpenAI key, any model, and the tokens each feature used.',
      run: async (h) => {
        await h.tap('[data-a="settings"]', { after: 900 }); await h.tap('[data-act="ai-open"]', { after: 900 });
        await h.eval(() => { const el = document.getElementById('aisheet'); const what = el.querySelector('h3.sec'); el.scrollTop = what.getBoundingClientRect().top + el.scrollTop - 80; });
      } },
    { id: '12-update', label: 'New versions in the app', caption: 'Each release offers its three best features; Later asks again in two days.', olderVersion: '1.11.0', settle: 3600 },
    { id: '13-dark-mode', label: 'Dark mode', caption: 'Follows your iPhone. Here, a 20-minute hotel-room workout with one band.', dark: true,
      run: async (h) => {
        await h.tap('[data-a="builder"]');
        await h.tap('[data-a="b-chip"][data-v="e:dumbbell"]', { after: 200 });
        await h.tap('[data-a="b-chip"][data-v="e:barbell"]', { after: 200 });
        await h.tap('[data-a="b-min"][data-v="20"]', { after: 200 });
        await h.type('textarea[data-in="b-note"]', 'Hotel room on a work trip, one resistance band');
        await h.eval(() => document.activeElement && document.activeElement.blur());
        await h.scrollTo(124);
      } },
    { id: '14-widget', label: 'Your week at a glance', caption: 'The last workout and this week’s sessions on the Home Screen.', widget: 'medium' },
  ],
};
