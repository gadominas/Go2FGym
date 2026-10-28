# Blueprints

Go2FGym follows the shared app blueprints in [gadominas/app-blueprints](https://github.com/gadominas/app-blueprints), so it looks and behaves like the other apps. Coding agents: read that repository's [AGENTS.md](https://github.com/gadominas/app-blueprints/blob/main/AGENTS.md) before changing these parts.

| Blueprint | Blueprint date | Applied in version | Deviations |
| --- | --- | --- | --- |
| [in-app-updates](https://github.com/gadominas/app-blueprints/blob/main/blueprints/in-app-updates.md) | 2026-10-27 | 1.2.0 | none |
| [ai-configuration](https://github.com/gadominas/app-blueprints/blob/main/blueprints/ai-configuration.md) | 2026-10-28 | 1.6.0 | AI settings and usage live in `go2fgym-ai-settings.json` and `go2fgym-usage.json`; the AI coach builds its prompt and JSON schema in the page and the Scriptable side sends it through `aiCall`; there is no Settings screen, so “AI settings” is a link at the bottom of the Train tab; the “What AI does” switch also respects `ai.autoAnalyze` and `ai.autoStrava` in `CONFIG` |
