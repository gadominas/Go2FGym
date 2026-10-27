# Releasing a new version

`releases.json` is the single source of truth for versions and release notes. The app reads it from GitHub to decide whether to offer an update, and uses it to pitch the update to users.

## Steps

1. **Bump the version** in `Go2FGym.js`: `const VERSION = '1.6.0';`. Use [semantic versioning](https://semver.org): a new feature bumps the middle number, a fix-only release the last.
2. **Add a release at the top of `releases.json`**, with the same version.
3. **Regenerate the changelog**: `node tools/changelog.js`.
4. **Commit everything to `main`**: the script, `releases.json` and `CHANGELOG.md`.

Users see the update the next time they open Go2FGym. GitHub can take a few minutes to serve new files.

## Release entry format

```json
{
  "version": "1.6.0",
  "date": "2026-11-02",
  "title": "Short headline for the update sheet",
  "highlights": [
    { "icon": "🔔", "title": "Feature name", "text": "One sentence on what it does for the user." },
    { "icon": "⬆️", "title": "Feature name", "text": "One sentence on what it does for the user." },
    { "icon": "✨", "title": "Feature name", "text": "One sentence on what it does for the user." }
  ],
  "changes": ["Everything new, one line each"],
  "fixes": ["Every bug fixed, one line each"]
}
```

## Writing good highlights

The three highlights are the update pitch. They are the first thing a user reads before deciding to update.

- **Exactly three**, ordered by how much a user will care.
- **Title:** two to four words, naming the benefit rather than the implementation.
- **Text:** one sentence, under 100 characters, saying what the user can now do.
- **Icon:** one emoji.

If a user skipped several versions, the pitch shows the newest release's highlights first and fills any gaps from older releases they missed.

## Behaviour in the app

- Go2FGym checks `releases.json` once per run, in the background, without slowing the start.
- **Update now** downloads the script over the current one; the user reopens Go2FGym to start the new version.
- **Later**, or tapping outside the sheet, hides the pitch for two days.
- Users can turn checks off with `checkUpdates: false` in the `CONFIG` block.

## Testing an update

Temporarily set `VERSION` in your copy of the script lower than the newest entry in `releases.json` on GitHub, then open the app.

- The sheet shows the newest version, its title and three highlights; with two or more versions behind it says "and N more updates".
- **Later** closes it, and reopening the app shows nothing for two days. To reset that while testing, run `Keychain.remove('go2fgym-update-snooze')` in a scratch Scriptable script.
- **Update now** ends on "✓ Done"; reopening the app shows the new version at the bottom of the Train screen.
- In flight mode the app opens normally with no sheet or error.
