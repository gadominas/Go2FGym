// Go2FGym's per-app values for the app-blueprints testkit (recipes/testing.md › Per-app values). Starting point: packs only.
module.exports = {
  name: 'Go2FGym',
  script: '../Go2FGym.js',
  folder: 'Go2FGym',
  settings: { usageAsked: true, shareUsage: false, aiInvite: { off: true } },
  // The disclaimer accepted (on the phone, not in iCloud): without it nothing else is shown
  seed: (h) => ({ files: { [h.local('Go2FGym/disclaimer-accepted.json')]: JSON.stringify({ version: 2, acceptedAt: '2026-10-01T08:00:00Z' }) } }),
  offline: ['https://'],   // the app's own hosts aren't faked yet: they fail like a phone without a connection
  legacyCases: true,
};
