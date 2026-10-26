# Go2FGym

**Go to the f\*\*\*g gym.** A home-gym coach for your iPhone: pick the muscles, see how each exercise is done, log every set, and watch the numbers go up.
Runs in [Scriptable](https://scriptable.app) and works fully offline.

> Inspired by the early risers of the **[7AM Club](https://www.instagram.com/7amclub__/)** community.

## Install

1. Get **[Scriptable](https://apps.apple.com/app/scriptable/id1405459188)** (free) from the App Store.
2. In Scriptable tap **+**, paste this line and tap **▶︎**:
   ```js
   const s = await new Request("https://raw.githubusercontent.com/gadominas/Go2FGym/main/install.js").loadString(); await Function("module", "return (async () => {" + s + "\n})()")(module);
   ```
3. Tap **Open now**, accept the disclaimer, and tap **Download library** on Wi-Fi (about 36 MB, once). After that it works offline.

- **Update:** run the same little script again. Workouts, history and the library are kept.
- **Home Screen icon:** in Scriptable tap *⋯* on *Go2FGym* → *Add to Home Screen*.
- **Manual install:** create a new script and paste the whole [`Go2FGym.js`](Go2FGym.js) instead.
- Widget, extra equipment, backups and troubleshooting: **[install guide](docs/INSTALL.md)**.

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
| 🏠 **Made for home** | 466 exercises for bodyweight, dumbbells, barbell and resistance bands. Own kettlebells or an EZ bar? Add them with one line. |
| ✍️ **Fast logging** | Weight and reps are prefilled from last time. Change what's different, tap ✓, done. |
| ⏱ **Rest timer** | Ticking a set starts a 90 s countdown with a beep. Add 30 s or skip. |
| 📈 **Progress** | Each exercise shows your last performance and a trend of your estimated one-rep max. |
| 🗓 **Calendar** | Every workout on a month calendar, with coloured dots for the muscle groups trained each day and monthly totals per group. Tap a day to see it set by set. |
| 📈 **Progress** | Sets per week for 12 weeks stacked by muscle group, muscle balance for the last 4 weeks with the most-due group, your streak, and a trend for each of your main lifts. |
| 🏃 **Strava post** | A ready-made title and description for every workout in **Serious**, **Funny** or **Neutral** tone. Copy title, description or both, then paste into Strava. |
| 🗂 **History** | Every past workout set by set, one-tap **Repeat this workout**, and CSV export. |
| ✈️ **Offline** | One download of about 36 MB, then no network needed. |
| 💾 **Nothing lost** | An unfinished workout comes back when you reopen the app. History is mirrored to iCloud Drive. |
| ✨ **AI workout builder** | Say what to train (or let the AI decide), which equipment you have, how long and how hard. You get a plan from your own library with sets, reps, rest and weights based on your history. Review it, then start with one tap. |
| ✨ **AI coach after each workout** | What went well, what to watch, which muscle groups to focus on next and how hard, when you've recovered, and a one-tap **Build this next workout**. |
| 📲 **Widget** | Your last workout and this week's count on the Home Screen. |
| 🌗 **Light and dark** | Follows your iPhone's appearance. |

<p align="center">
  <img src="docs/screenshots/06-history.png" width="180" alt="Calendar with muscle-group dots per day">
  <img src="docs/screenshots/11-progress.png" width="180" alt="Progress: sets per week by muscle group and muscle balance">
  <img src="docs/screenshots/13-lifts.png" width="180" alt="Lift trends">
  <img src="docs/screenshots/12-strava-post.png" width="180" alt="Strava title and description in Funny mode">
</p>

<p align="center">
  <img src="docs/screenshots/08-ai-build-workout.png" width="180" alt="AI workout builder: muscles, equipment, time and intensity">
  <img src="docs/screenshots/09-ai-plan.png" width="180" alt="AI-built workout plan with sets, weights and rest">
  <img src="docs/screenshots/10-ai-coach.png" width="180" alt="AI coach analysis after a workout">
</p>

<p align="center">
  <img src="docs/screenshots/02-exercise-list.png" width="180" alt="Exercise list filtered by muscle and equipment">
  <img src="docs/screenshots/04-steps-and-progress.png" width="180" alt="Steps, last time and progress chart">
  <img src="docs/screenshots/07-dark-mode.png" width="180" alt="Dark mode">
</p>

## AI coach (optional)

Uses the OpenAI API with **your own API key**. Everything else in the app works without it.

1. Create a key at [platform.openai.com](https://platform.openai.com/api-keys).
2. In Go2FGym tap **✨ Build a workout with AI**, paste the key and tap **Save**. It's stored in the iPhone's Keychain and only sent to OpenAI.
3. Pick what to train, your equipment, 20 to 60 minutes and Easy, Moderate or Hard, add a note if you like ("lower back is sore"), and tap **Build workout**.
4. Check the plan, then **Start this workout**. After **Finish workout** the AI coach reviews it and writes a Strava title and description. Both are saved with the workout in **History**.

Without a key, the Strava post's **Neutral** tone still works as a basic summary built on the phone.

The AI only chooses exercises from your library, keeps weights at or close to what you lifted last time, and avoids loading anything you mention in the note. Check every weight anyway: it can be wrong.

**What's sent to OpenAI:** exercise names and muscles, your sets, weights and dates, the options you chose and your note. No name, account or location. Requests are billed to your OpenAI account. Remove the key under **Train › AI key**.

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
| Let AI build a workout | **Train › ✨ Build a workout with AI** |
| Get AI feedback on a past workout | **History**, open it, **✨ Analyze with AI coach** |
| See your month | **History › Calendar**, tap a day; **‹ ›** change month |
| See your trends | **Progress** tab; tap a lift for its details |
| Post to Strava | **History**, open the workout, pick **Serious**, **Funny** or **Neutral** under *Strava post*, then **Copy both** |
| Export | **History › Export CSV** |
| Get new exercises or missing photos | **Train › Update library** |

## Configuration

Settings live in the `CONFIG` block at the top of `Go2FGym.js`:

| Setting | Default | What it does |
|---|---|---|
| `unit` | `"kg"` | Weight unit shown and exported |
| `restSeconds` | `90` | Rest timer length |
| `equipment` | bodyweight, dumbbell, barbell, bands | Equipment you own. Also available: `kettlebells`, `e-z curl bar`, `medicine ball`, `exercise ball`, `foam roll`, `other` |
| `skipCategories` | strongman, olympic weightlifting | Exercise types hidden from the library |
| `icloudBackup` | `true` | Mirror history to iCloud Drive › Scriptable › Go2FGym-backup |
| `ai.model` | `"gpt-5.4-mini"` | OpenAI model for the AI coach |
| `ai.reasoning` | `"low"` | `"low"` is quick; `"medium"` plans a bit more carefully but slower |
| `ai.autoAnalyze` | `true` | Analyze each workout right after you finish it |
| `ai.autoStrava` | `true` | Also write a Strava title and description after each workout |
| `ai.stravaMode` | `"funny"` | Default Strava tone: `"serious"`, `"funny"` or `"neutral"` |

After changing `equipment`, tap **Update library** to download the extra photos.

## Your data

- **Everything stays on your phone.** No account, no server, no tracking.
- Network use: downloading the exercise library from GitHub and, only if you add a key, the AI coach requests to OpenAI described above.
- History is a plain JSON file in Scriptable's folder, with a copy in iCloud Drive if enabled.

## Credits

Exercise data and photos: **[free-exercise-db](https://github.com/yuhonas/free-exercise-db)** by yuhonas, released into the public domain, based on [exercises.json](https://github.com/wrkout/exercises.json) by Ollie Jennings.


## Disclaimer

**Use Go2FGym and do these exercises at your own risk.** The app gives general exercise information, not medical, physiotherapy or coaching advice, and the exercise data may contain mistakes. Check with a doctor before starting, especially with an injury or health condition. Learn each movement with light weights, use safety stops or a spotter for heavy barbell work, and stop if you feel pain.

Plans, weights and analysis from the optional AI coach are generated automatically by a language model and can be wrong.

To the fullest extent permitted by law, the author is not responsible or liable for any injury, health problem, loss or damage arising from using the app or doing the exercises. The app asks you to accept this on first launch.

## License

[MIT](LICENSE) © 2026 Gediminas Siutilas. Exercise data and photos are public domain.
