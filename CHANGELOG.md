# Changelog

All notable changes to Go2FGym. Generated from `releases.json`; edit that file, not this one.

## 1.10.0 (2026-10-29): Fewer mis-taps

- ✅ **Complete in the corner**: The round green check sits at the top of each exercise, away from the set ticks.
- 👆 **Tap to start**: Tap an exercise or start typing in it and it's marked In progress.
- 🔍 **Review finished exercises**: Tap a completed exercise to see its sets; ↺ Resume only when you mean it.

**Changes**

- Complete moved from next to Add set to a round green check in the top-right corner of each exercise; Remove moved to the bottom row
- Tapping an exercise card, or typing in its weight or reps, marks it In progress and highlights it; an exercise that was only tapped steps back when you start another
- Tapping a completed exercise opens a review with every set and the start and finish time, plus Exercise page and ↺ Resume
- ↺ Resume reopens a completed exercise as In progress

**Fixes**

- Complete sat right below the last set's tick, so it was easy to hit by mistake
- Tapping a completed exercise reopened it instead of just showing it

## 1.9.0 (2026-10-29): Train in your own order

- ⠿ **Drag to reorder**: Hold the ⠿ handle on any exercise and drag it where you want it.
- ↑ **Up next**: One tap moves an exercise right after the ones you've started, ideal for supersets.
- ✅ **Complete and move on**: Complete folds an exercise into one line with kg, reps and time, and jumps to the next.

**Changes**

- Drag and drop exercises in a workout by the ⠿ handle, with touch or mouse; the list scrolls while you drag
- ↑ Up next moves an exercise right after the exercises in progress, or to the top of the open ones
- ✓ Complete marks the remaining logged sets done, folds the exercise into one line (muscle group, kg lifted, reps, minutes spent) and moves it to the completed stack at the top
- The next exercise is highlighted (In progress or Up now) and scrolled into view
- Tap a completed line to reopen it
- Each ticked set records its time, so time spent per exercise is shown

## 1.8.0 (2026-10-29): Easier to get around

- ＋ **Add exercises anytime**: ＋ Add exercises in the workout header opens the list for that workout's muscles.
- 👁 **Quick preview**: Tap the eye on any exercise in your workout to see it moving, without leaving.
- 🧭 **Clear way back**: Bigger back buttons, and a Workout button on every Train screen while you train.

**Changes**

- ＋ Add exercises in the Workout header and under the exercises opens the exercise list filtered to the workout's muscle groups, with a short hint
- ✓ Workout (n) button in the header of the exercise list and exercise pages while a workout is running
- Built plans: Start in the header, Start and add exercises at the bottom, and ‹ Options instead of ‹ Settings
- Preview pop-up from the eye button on workout and plan exercises: photo demo, muscles, last time, and Open exercise; closes itself after 10 seconds with a countdown
- Back buttons are now clearly visible buttons instead of small text links
- Empty Workout tab offers Choose muscles and, with an AI key, Build next workout

## 1.7.2 (2026-10-29): No more black screen

- 🖤 **Opens reliably**: If iOS fails to start the screen on opening, the app now notices and reloads it by itself.

**Changes**

- Startup problems are noted in startup-log.txt next to the app's data, to help track down rare issues

**Fixes**

- Opening the app sometimes showed a black screen until it was closed and opened again

## 1.7.1 (2026-10-28): A tidier header

- 🧹 **Tidier header**: The Settings button now sits neatly in the top bar at every text size.

**Fixes**

- The Settings button on the Train tab overlapped the line under the Go2FGym header
- With Large or Larger text, the 7AM Club link pushed the Settings button off the screen

## 1.7.0 (2026-10-28): Settings, your way

- 🎛 **A real Settings screen**: Equipment, kg or lb, rest timer, backup and AI coach in one place, behind the sliders icon.
- 🎨 **Colours and layout**: Six palettes or Auto, plus Compact and a one-line Tiny layout for long lists.
- 🔠 **Text size and font**: Pick Small to Larger text and the condensed or a serif headline font.

**Changes**

- New Settings sheet (sliders icon on the Train tab): Appearance, Workout, Library, History, AI coach, Updates, Timing, Downloads and Built with; changes apply at once, nothing to edit in the code
- Appearance shared with the other apps: Auto plus six palettes (Go2FGym red in all), Comfortable, Compact or Tiny layout, four text sizes, condensed or serif headlines
- Tiny layout: one line per exercise without photos and one line per workout in History; logging sets stays full size
- Equipment and exercise types are switches; the library updates when you close Settings, and Update library fetches photos for new equipment
- Rest timer and photo downloads are adjustable with ranges and Reset
- Check for updates now, in Settings › Updates
- Settings are saved in settings.json in iCloud Drive › Scriptable › Go2FGym, so updates no longer undo your changes
- AI settings moved from the Train tab footer into Settings › AI coach
- Built with: the blueprints this app follows, with links to read them

## 1.6.0 (2026-10-28): Your AI coach, Claude or OpenAI

- 🤖 **Claude or OpenAI**: Workout plans, reviews and Strava posts now work with either provider. Switch any time in AI settings.
- 🧠 **Pick any model**: Load the models your own key can use, choose one and test the connection.
- 📊 **See your token usage**: Tokens per day, feature and model, so you always know what AI costs you.

**Changes**

- New AI settings sheet (Train tab › AI settings): Claude and OpenAI keys, model picker loaded from your key, connection test, token usage per day, feature and model
- Keys are entered in a native secure prompt and stored in the iOS Keychain; the page only ever sees them masked
- Every AI coach request goes through one shared AI call, following the app-blueprints AI configuration
- One switch under What AI does turns the after-workout review and Strava post on or off
- Without a key, AI-only buttons are hidden and the Strava post offers the Neutral template, labelled “Template — no AI”
- Workout plans, reviews and Strava posts are labelled with the provider that wrote them
- Your existing OpenAI key moves over automatically
- The thinking-effort setting is gone: choose a model instead

## 1.5.0 (2026-10-27): Never miss an update

- 🔔 **Update reminders**: The app tells you when a new version is out, and waits two days if you tap Later.
- ⬆️ **One-tap update**: Update right from the app. No need to run the installer again.
- ✨ **See what's new first**: Every update shows its three best features before you install it.

**Changes**

- Update check on start, with an update sheet showing the release's three highlights
- Update now downloads the new version over the running script after checking it is newer and really Go2FGym
- Later, or tapping outside the sheet, snoozes the offer for two days
- Version shown at the bottom of the Train screen
- checkUpdates setting to turn update checks off
- releases.json, CHANGELOG.md and docs/RELEASING.md for release notes

## 1.4.0 (2026-10-27): Your next workout in one tap

- ⚡ **Instant next workout**: Build next creates a plan straight from your history, no form to fill in.
- 🕒 **Last workout at a glance**: A small chip at the top shows when you last trained, which muscles and how long.
- 👆 **Buttons where you need them**: Build workout and Build next now sit in the header of their screens.

**Changes**

- Build next in History and Progress builds the plan immediately from the coach's suggestion or your most-due muscle groups, your usual workout length and all your equipment
- Loading screen while the next workout is built; Settings opens the pre-filled form
- Last-workout chip in the top bar, tap it to open that day in History
- Build workout button moved to the builder's header
- Export CSV moved to the bottom of History

**Fixes**

- A stray white dot showed at the top of the screen
- The last-workout chip sat under the camera on iPhones with a Dynamic Island

## 1.3.0 (2026-10-26): See your progress

- 🗓 **Training calendar**: See every workout on a month calendar, with dots for the muscle groups trained.
- 📈 **Progress charts**: Weekly sets by muscle group, muscle balance, your streak and a trend for each lift.
- 🏃 **Strava posts**: Get a ready-made Strava title and description in a serious, funny or neutral tone.

**Changes**

- History opens on a month calendar with monthly totals per muscle group; List view still available
- New Progress tab: 12 weeks of sets stacked by muscle group, 4-week muscle balance with the most-due group, weekly streak, lift trends
- Strava title and description per workout in Serious, Funny or Neutral tone, written automatically after each workout; copy title, description or both
- Neutral Strava post works without an AI key

**Fixes**

- The AI review of a workout could be overwritten when the Strava post was saved right after it

## 1.2.0 (2026-10-26): Meet your AI coach

- ✨ **AI-built workouts**: Pick muscles, equipment, time and intensity, and get a plan with weights from your history.
- 🧠 **Post-workout review**: After each workout, see what went well, what to focus on next and how hard.
- 🔐 **Your own OpenAI key**: Uses your OpenAI key, kept in the iPhone Keychain. Everything else works without it.

**Changes**

- AI workout builder using only exercises from your library, with sets, reps, rest, weights and form cues
- Plan preview with warm-up and cool-down; Start this workout pre-fills every set and uses each exercise's rest time
- Automatic AI review after Finish workout, saved with the workout in History
- Disclaimer updated to cover AI suggestions and asked again once
- One-line installer, like Reading Stars

## 1.1.0 (2026-10-21): Safer training, more equipment

- 🟢 **Resistance bands**: 20 band exercises join the library, from pull-aparts to banded squats.
- 🛡 **Train-safe reminders**: A short own-risk notice to accept once, and a safety tip on every exercise.
- 📸 **Missing-photo hint**: The app tells you when some exercises still need their photos downloaded.

**Changes**

- Resistance bands added to the default equipment
- Own-risk disclaimer to accept on first launch, always available from the Train screen
- Safety note under each exercise's steps
- Hint on the Train screen when exercises are missing photos

## 1.0.0 (2026-10-20): Your home gym coach

- 🏋️ **Pick by muscle**: Tap the plates for the muscles you want and get exercises you can do at home.
- 🖼 **See it done**: Start-to-end photo demos and step-by-step instructions for 446 exercises.
- ⏱ **Log every set**: Weights and reps prefilled from last time, with a rest timer after each set.

**Changes**

- Offline exercise library from free-exercise-db for bodyweight, dumbbell and barbell
- Workout logging with rest timer, history, CSV export and iCloud backup
- Home Screen widget with your last workout and weekly count
- Compact header with a credit to the 7AM Club community
