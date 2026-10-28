# Blueprints

Go2FGym follows the shared blueprints in https://github.com/gadominas/app-blueprints.
The script's `BLUEPRINTS` block is the source of truth; this table mirrors it and adds deviations.

| Blueprint | Version | Since app version | Deviations |
| --- | --- | --- | --- |
| [in-app-updates](https://github.com/gadominas/app-blueprints/blob/in-app-updates-v1.0.0/blueprints/in-app-updates.md) | 1.0.0 | 1.7.0 | The page's update hook is `HG.showUpdate`; `window.__showUpdate` (the blueprint's name) calls it. Introduced in 1.5.0 and brought fully in line in 1.7.0 |
| [settings](https://github.com/gadominas/app-blueprints/blob/settings-v1.0.0/blueprints/settings.md) | 1.0.0 | 1.7.0 | The Settings icon sits in the Train tab header (the other screens have back bars); "Sans serif" keeps Go2FGym's condensed headline font; sheet CSS is scoped under `#cfgsheet` because the app already uses `.seg`, `.chip` and `.row`; the old colour names are kept as aliases of the shared tokens, plus app colours `--done` and `--p-iron` per palette; the other weight-plate colours are fixed artwork; equipment is a list of switches (at least one stays on) and a change rebuilds the library when Settings closes; changing the weight unit reloads the page when Settings closes; the page bridge is a message queue, so the Scriptable side answers with `HG.onSettings` |
| [ai-configuration](https://github.com/gadominas/app-blueprints/blob/ai-configuration-v1.0.0/blueprints/ai-configuration.md) | 1.0.0 | 1.6.0 | The “after each workout” jobs (analysis and Strava post) share the one What AI does switch; the default Strava tone is in Settings › AI coach |
