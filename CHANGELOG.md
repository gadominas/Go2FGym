# Changelog

All notable changes to Go2FGym. Generated from `releases.json`; edit that file, not this one.

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
