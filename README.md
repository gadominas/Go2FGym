# Go2FGym

**Go to the f\*\*\*g gym.** A home-gym coach for your iPhone: pick the muscles, see how each exercise is done, log every set, and watch the numbers go up.
Runs in [Scriptable](https://scriptable.app) and works fully offline.

> Inspired by the early risers of the **[7AM Club](https://www.instagram.com/7amclub__/)** community.

<p align="center">
  <img src="docs/screenshots/01-pick-muscles.png" width="230" alt="Pick muscle groups by tapping weight plates">
  <img src="docs/screenshots/03-exercise-demo.png" width="230" alt="Exercise with start-to-end photo demo">
  <img src="docs/screenshots/05-log-sets.png" width="230" alt="Logging sets with the rest timer running">
</p>

## Why

Gym apps assume a gym. At home you have a bench, a barbell, some dumbbells and twenty minutes. Go2FGym only shows exercises you can actually do with that, tells you what you lifted last time, and gets out of the way.

## Features

| | |
|---|---|
| 🏋️ **Pick by muscle** | Tap the plates for chest, back, legs, shoulders, arms, glutes or core. You get only the exercises that train them. |
| 🖼 **See it done** | A start-to-end photo demo, numbered steps, and the muscles each exercise works. |
| 🏠 **Made for home** | 446 exercises for bodyweight, dumbbells and barbell. Own kettlebells, bands or an EZ bar? Add them with one line. |
| ✍️ **Fast logging** | Weight and reps are prefilled from last time. Change what's different, tap ✓, done. |
| ⏱ **Rest timer** | Ticking a set starts a 90 s countdown with a beep. Add 30 s or skip. |
| 📈 **Progress** | Each exercise shows your last performance and a trend of your estimated one-rep max. |
| 🗓 **History** | Weekly totals, every past workout set by set, one-tap **Repeat this workout**, and CSV export. |
| ✈️ **Offline** | One download of about 35 MB, then no network needed. |
| 💾 **Nothing lost** | An unfinished workout comes back when you reopen the app. History is mirrored to iCloud Drive. |
| 📲 **Widget** | Your last workout and this week's count on the Home Screen. |
| 🌗 **Light and dark** | Follows your iPhone's appearance. |

<p align="center">
  <img src="docs/screenshots/02-exercise-list.png" width="180" alt="Exercise list filtered by muscle and equipment">
  <img src="docs/screenshots/04-steps-and-progress.png" width="180" alt="Steps, last time and progress chart">
  <img src="docs/screenshots/06-history.png" width="180" alt="Workout history">
  <img src="docs/screenshots/07-dark-mode.png" width="180" alt="Dark mode">
</p>

## Install

1. Install the free **[Scriptable](https://apps.apple.com/app/scriptable/id1405459188)** app.
2. In Scriptable, tap **+**, paste [`Install Go2FGym.js`](Install%20Go2FGym.js), and tap **Run** (▶).
3. Open **Go2FGym**, tap **Download library** on Wi-Fi, and keep the screen open for a few minutes.

Manual install, the widget, adding equipment, backups and troubleshooting: see the **[install guide](docs/INSTALL.md)**.

## Using it

| To… | Do this |
|---|---|
| Choose what to train | Tap one or more plates, then **Show exercises** |
| Narrow the list | Use the muscle, equipment and type chips, or search |
| See how it's done | Tap an exercise. **Start**, **Play** and **End** control the demo. |
| Add to today's workout | Tap **+** in the list, or **Add to workout** on the exercise |
| Log a set | Check weight and reps, then tap **✓**. Leave weight empty for bodyweight. |
| Add or remove a set | **Add set** copies the previous one; **×** removes a set |
| Finish | **Finish workout**, then tap again to save |
| Do a past workout again | **History**, open the workout, **Repeat this workout** |
| Export | **History › Export CSV** |
| Get new exercises or missing photos | **Train › Update library** |

## Configuration

Settings live in the `CONFIG` block at the top of `Go2FGym.js`:

| Setting | Default | What it does |
|---|---|---|
| `unit` | `"kg"` | Weight unit shown and exported |
| `restSeconds` | `90` | Rest timer length |
| `equipment` | bodyweight, dumbbell, barbell | Equipment you own. Also available: `kettlebells`, `bands`, `e-z curl bar`, `medicine ball`, `exercise ball`, `foam roll`, `other` |
| `skipCategories` | strongman, olympic weightlifting | Exercise types hidden from the library |
| `icloudBackup` | `true` | Mirror history to iCloud Drive › Scriptable › Go2FGym-backup |

After changing `equipment`, tap **Update library** to download the extra photos.

## Your data

- **Everything stays on your phone.** No account, no server, no tracking.
- The only network use is downloading the exercise library from GitHub.
- History is a plain JSON file in Scriptable's folder, with a copy in iCloud Drive if enabled.

## Credits

Exercise data and photos: **[free-exercise-db](https://github.com/yuhonas/free-exercise-db)** by yuhonas, released into the public domain, based on [exercises.json](https://github.com/wrkout/exercises.json) by Ollie Jennings.

Go2FGym gives exercise instructions, not medical advice. Warm up, learn the form with light weights, and use safety stops or a spotter for heavy barbell work.

## License

[MIT](LICENSE) © 2026 Gediminas Siutilas. Exercise data and photos are public domain.
