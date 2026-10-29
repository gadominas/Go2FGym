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

- **Update:** from 1.5.0 on, the app offers new versions itself, so just tap **Update now**. On older copies, run the same little script again. Workouts, history and the library are always kept.
- **Home Screen icon:** in Scriptable tap *⋯* on *Go2FGym* → *Add to Home Screen*.
- **Manual install:** create a new script and paste the whole [`Go2FGym.js`](Go2FGym.js) instead.
- Widget, extra equipment, backups and troubleshooting: **[install guide](docs/INSTALL.md)**.

<p align="center">
  <img src="docs/screenshots/01-pick-muscles.png" width="180" alt="Pick muscle groups by tapping weight plates">
  <img src="docs/screenshots/03-exercise-demo.png" width="180" alt="Exercise with start-to-end photo demo">
  <img src="docs/screenshots/05-log-sets.png" width="180" alt="Logging sets with the rest timer running">
  <img src="docs/screenshots/17-exercise-preview.png" width="180" alt="Quick exercise preview pop-up with a 10-second countdown">
</p>

## Why

Gym apps assume a gym. At home you have a bench, a barbell, some dumbbells and twenty minutes. Go2FGym only shows exercises you can actually do with that, tells you what you lifted last time, and gets out of the way.

## Features

### Train

| | |
|---|---|
| 🏋️ **Pick by muscle** | Tap the plates for chest, back, legs, shoulders, arms, glutes or core. You get only the exercises that train them. |
| 🖼 **See it done** | A start-to-end photo demo, numbered steps, and the muscles each exercise works. |
| 🏠 **Made for home** | 466 exercises for bodyweight, dumbbells, barbell and resistance bands. Own kettlebells, an E-Z bar or a medicine ball? Switch them on in **Settings › Library**. |
| ✍️ **Fast logging** | Weight and reps are prefilled from last time. Change what's different, tap ✓, done. |
| ⠿ **Your order** | Drag exercises by the ⠿ handle, or tap **↑ Up next** to put one right after the ones you've started (great for supersets). |
| ✅ **Complete and move on** | The round green check in an exercise's corner folds it into one line with kg lifted, reps, minutes and muscle group, then highlights and scrolls to the next one. Tap a folded line to review its sets; **↺ Resume** reopens it. |
| 👆 **Tap to start** | Tap an exercise or start typing in it and it's marked **In progress**. |
| ＋ **Add as you go** | **＋ Add exercises** in the workout header opens the list for that workout's muscles; **✓ Workout** takes you straight back. |
| 👁 **Quick preview** | The eye on each exercise in your workout shows it moving in a pop-up, with **Open exercise** for the full page. It closes itself after 10 seconds. |
| ⏱ **Rest timer** | Ticking a set starts a countdown with a beep (90 s, adjustable in Settings). Add 30 s or skip. |
| 💾 **Nothing lost** | An unfinished workout comes back when you reopen the app. History is mirrored to iCloud Drive. |
| ✈️ **Offline** | One download of about 36 MB, then no network needed. |

### Track

| | |
|---|---|
| 🗓 **Calendar** | Every workout on a month calendar, with coloured dots for the muscle groups trained each day and monthly totals per group. Tap a day to see it set by set. |
| 📈 **Progress** | Sets per week for 12 weeks stacked by muscle group, muscle balance for the last 4 weeks with the most-due group, your streak, and a trend for each main lift. Every exercise also shows your last performance. |
| 🕒 **Last workout at a glance** | A small chip at the top shows when you last trained, which muscle groups and for how long. Tap it to open that day. |
| 🏃 **Strava post** | A ready-made title and description for every workout in **Serious**, **Funny** or **Neutral** tone. Copy title, description or both, then paste into Strava. |
| 🗂 **History** | Every past workout set by set, one-tap **Repeat this workout**, and CSV export. |
| 📲 **Widget** | Your last workout and this week's count on the Home Screen. |

### AI coach (optional, Claude or OpenAI)

| | |
|---|---|
| ✨ **AI workout builder** | Say what to train (or let the AI decide), your equipment, how long and how hard. You get a plan from your own library with sets, reps, rest and weights from your history. |
| ⚡ **Build next** | One tap at the top of History or Progress builds your next workout straight from your history: the coach's suggestion or your most-due muscles, at your usual length. |
| 🧠 **Review after each workout** | What went well, what to watch, which muscle groups to focus on next and how hard, and when you've recovered. |
| 🔐 **Your own key** | Claude or OpenAI, any model your key can use, with token usage per day, feature and model. Keys stay in the iPhone Keychain. |

### Make it yours

| | |
|---|---|
| 🎛 **Settings** | Equipment, kg or lb, rest timer, backup, AI coach and updates in one sheet, behind the sliders icon. Changes apply at once. |
| 🎨 **Look** | Auto (light or dark) or six palettes, Comfortable, Compact or a one-line Tiny layout, four text sizes, condensed or serif headlines. |
| ⬆️ **In-app updates** | New versions are offered in the app with their three best features. **Update now**, or **Later** to be asked again in two days. |

<p align="center">
  <img src="docs/screenshots/06-history.png" width="180" alt="Calendar with muscle-group dots per day">
  <img src="docs/screenshots/11-progress.png" width="180" alt="Progress: sets per week by muscle group and muscle balance">
  <img src="docs/screenshots/13-lifts.png" width="180" alt="Lift trends">
  <img src="docs/screenshots/12-strava-post.png" width="180" alt="Strava title and description in Funny mode">
</p>

<p align="center">
  <img src="docs/screenshots/08-ai-build-workout.png" width="180" alt="AI workout builder: muscles, equipment, time and intensity">
  <img src="docs/screenshots/09-ai-plan.png" width="180" alt="AI-built workout plan with sets, weights and rest">
  <img src="docs/screenshots/10-ai-coach.png" width="180" alt="AI review after a workout">
  <img src="docs/screenshots/15-ai-settings.png" width="180" alt="AI settings: Claude and OpenAI keys, models and token usage">
</p>

<p align="center">
  <img src="docs/screenshots/14-settings.png" width="180" alt="Settings: colours, layout, text size, units and equipment">
  <img src="docs/screenshots/16-update.png" width="180" alt="Update sheet with the new version's best features">
  <img src="docs/screenshots/07-dark-mode.png" width="180" alt="Dark mode">
  <img src="docs/screenshots/02-exercise-list.png" width="180" alt="Exercise list filtered by muscle and equipment">
</p>

<p align="center">
  <img src="docs/screenshots/04-steps-and-progress.png" width="180" alt="Steps, last time and progress chart">
  <img src="docs/screenshots/18-complete-and-reorder.png" width="180" alt="Completed exercise folded into one line, next exercise highlighted">
</p>

## Setting up the AI coach

Uses Claude or OpenAI with **your own API key**. Everything else in the app works without it, and the AI buttons stay hidden until you add a key.

1. Create a key at [console.anthropic.com](https://console.anthropic.com/settings/keys) (Claude) or [platform.openai.com](https://platform.openai.com/api-keys) (OpenAI).
2. In Go2FGym tap the **sliders icon** on the Train tab, then **AI settings › Add key**. The key is typed into a native iOS prompt, stored in the iPhone's Keychain and only sent to its own provider. Here you can also pick any model your key can use, test the connection, and see your token usage per day, feature and model.
3. Pick what to train, your equipment, 20 to 60 minutes and Easy, Moderate or Hard, add a note if you like ("lower back is sore"), and tap **Build workout**.
4. Check the plan, then **Start this workout**. After **Finish workout** the AI coach reviews it and writes a Strava title and description. Both are saved with the workout in **History**.

Without a key, the Strava post's **Neutral** tone still works as a basic summary built on the phone, labelled “Template — no AI”. Everything the AI writes is labelled with the provider that wrote it. To stop the automatic review and Strava post after each workout, turn off the switch under **AI settings › What AI does**.

The AI only chooses exercises from your library, keeps weights at or close to what you lifted last time, and avoids loading anything you mention in the note. Check every weight anyway: it can be wrong.

**What's sent to the AI provider in use:** exercise names and muscles, your sets, weights and dates, the options you chose and your note. No name, account or location. Requests are billed to your own Claude or OpenAI account. Remove a key under **AI settings**.

This app follows the shared [app blueprints](https://github.com/gadominas/app-blueprints) (see [docs/BLUEPRINTS.md](docs/BLUEPRINTS.md)).

## Updates and what's new

Go2FGym checks for a new version each time it opens. When there is one, a sheet shows its three best features with **Update now** and **Later** (asks again in two days). After updating, close the app and open it again. Your workouts and library are kept.

Every version is listed in the **[changelog](CHANGELOG.md)**. The version you have is shown at the bottom of the Train screen. To turn the checks off, switch off **Settings › Updates › Offer new versions**.

## Using it

| To… | Do this |
|---|---|
| Choose what to train | Tap one or more plates, then **Show exercises** |
| Narrow the list | Use the muscle, equipment and type chips, or search |
| See how it's done | Tap an exercise. **Start**, **Play** and **End** control the demo. |
| Add to today's workout | Tap **+** in the list, or **Add to workout** on the exercise |
| Add more during a workout | **＋ Add exercises** at the top of the Workout tab, tap **+**, then **✓ Workout** at the top to go back |
| Change the order of exercises | Drag the **⠿** handle, or tap **↑ Up next** on the one you want to do next |
| Finish an exercise | The round green **✓** in its top-right corner |
| Check a finished exercise | Tap its one-line summary to see the sets; **↺ Resume** to keep working on it |
| Quickly see how an exercise is done | Tap the **eye** next to it in your workout or a built plan; **Open exercise** for the full page |
| Log a set | Check weight and reps, then tap **✓**. Leave weight empty for bodyweight. |
| Add or remove a set | **Add set** copies the previous one; **×** removes a set |
| Finish | **Finish workout**, then tap again to save |
| Do a past workout again | **History**, open the workout, **Repeat this workout** |
| Let AI build a workout | **Train › ✨ Build a workout with AI** |
| Get your next workout in one tap | **✨ Build next** at the top of History or Progress. It uses the coach's last suggestion (or your most-due muscles), your usual workout length and all your equipment, and goes straight to the plan. **‹ Options** adjusts it; **Start ›** or **Start and add exercises** begins it. |
| Get AI feedback on a past workout | **History**, open it, **✨ Analyze with AI coach** |
| See your month | **History › Calendar**, tap a day; **‹ ›** change month |
| See your trends | **Progress** tab; tap a lift for its details |
| Post to Strava | **History**, open the workout, pick **Serious**, **Funny** or **Neutral** under *Strava post*, then **Copy both** |
| Export | **History › Export CSV** |
| Get new exercises or missing photos | **Train › Update library** (bottom of the Train screen) |
| Change look, units, equipment or rest time | The **sliders icon** at the top of the Train tab |
| Update the app | **Update now** on the update sheet, or **Settings › Updates › Check for updates now** |

## Settings

Tap the **sliders icon** at the top of the Train tab. Changes apply right away (no Save) and are kept in iCloud Drive › Scriptable › Go2FGym › `settings.json`; your workouts and library stay where they were.

| Section | What you can change |
|---|---|
| **Appearance** | Colours (Auto or six palettes, Go2FGym red in all), layout (Comfortable, Compact, or Tiny: one line per exercise without photos and one line per workout in History), text size, headline font (the condensed Go2FGym font or serif) |
| **Workout** | Weight unit, kg or lb (shown and exported) |
| **Library** | The equipment you own (body weight, dumbbells, barbell, bands, kettlebells, E-Z curl bar, medicine ball, exercise ball, foam roller, other) and whether strongman and Olympic weightlifting exercises are included. After adding equipment, tap **Update library** to download its photos |
| **History** | Back up history to iCloud Drive › Scriptable › Go2FGym-backup |
| **AI coach** | AI settings (keys, models, token usage, and the “after each workout” switch) and the default Strava post tone |
| **Updates** | Offer new versions (**Later** waits two days) and **Check for updates now** |
| **Timing, Downloads** | Rest timer length (30–300 s, default 90) and how many photos download at once (1–12, default 6), each with Reset |
| **Built with** | The [shared blueprints](https://github.com/gadominas/app-blueprints) this app follows (see [docs/BLUEPRINTS.md](docs/BLUEPRINTS.md)) |

## Your data

- **Everything stays on your phone.** No account, no server, no tracking.
- Network use: downloading the exercise library from GitHub and, only if you add a key, the AI coach requests to Claude or OpenAI described above.
- History is a plain JSON file in Scriptable's folder, with a copy in iCloud Drive if enabled.

## Credits

Exercise data and photos: **[free-exercise-db](https://github.com/yuhonas/free-exercise-db)** by yuhonas, released into the public domain, based on [exercises.json](https://github.com/wrkout/exercises.json) by Ollie Jennings.


## Disclaimer

**Use Go2FGym and do these exercises at your own risk.** The app gives general exercise information, not medical, physiotherapy or coaching advice, and the exercise data may contain mistakes. Check with a doctor before starting, especially with an injury or health condition. Learn each movement with light weights, use safety stops or a spotter for heavy barbell work, and stop if you feel pain.

Plans, weights and analysis from the optional AI coach are generated automatically by a language model and can be wrong.

To the fullest extent permitted by law, the author is not responsible or liable for any injury, health problem, loss or damage arising from using the app or doing the exercises. The app asks you to accept this on first launch.

## License

[MIT](LICENSE) © 2026 Gediminas Siutilas. Exercise data and photos are public domain.
