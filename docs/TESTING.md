# Testing

Go2FGym is one Scriptable script, so it can't run in a normal test runner. It follows the [testing recipe](https://github.com/gadominas/app-blueprints/blob/testing-v1.0.0/recipes/testing.md): the shared app-blueprints testkit runs the script in Node with stand-ins for Scriptable and the page in jsdom, on every push (`.github/workflows/tests.yml`).

## Run the tests

With [app-blueprints](https://github.com/gadominas/app-blueprints) cloned next to this repository:

```sh
(cd ../app-blueprints/testkit && npm ci)
node ../app-blueprints/testkit/bin/run.js    # everything: all must pass before a release
node ../app-blueprints/testkit/bin/lint.js   # the static checks only
```

`tests/app.config.js` holds Go2FGym's per-app values (folder, seeded settings, the accepted disclaimer).

## What's covered

- **Lint**: the static checks of the recipes, the bridge (portable-bridge) and the trace.
- **Conformance packs**: safe start-up, stability patterns, in-app updates, widgets and usage analytics.

## What isn't, yet

- **Go2FGym's own scenarios**: there are no cases in `tests/cases` yet (workouts, the library, the AI coach, Strava posts).
- **The network**: the exercise library, Strava and AI hosts aren't faked, so every `https://` request fails like a phone without a connection.
- **The phone itself**: sound, the widget on the Home Screen and the look in light and dark mode are still checked on an iPhone.
