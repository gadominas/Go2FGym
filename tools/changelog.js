#!/usr/bin/env node
// Regenerates CHANGELOG.md from releases.json. Run from the repository root: node tools/changelog.js
const fs = require('fs');
const data = JSON.parse(fs.readFileSync('releases.json', 'utf8'));
const out = [`# Changelog`, ``, `All notable changes to ${data.name}. Generated from \`releases.json\`; edit that file, not this one.`, ``];
for (const r of data.releases) {
  out.push(`## ${r.version} (${r.date}): ${r.title}`, ``);
  for (const h of r.highlights || []) out.push(`- ${h.icon} **${h.title}**: ${h.text}`);
  if ((r.changes || []).length) { out.push(``, `**Changes**`, ``); r.changes.forEach(c => out.push(`- ${c}`)); }
  if ((r.fixes || []).length) { out.push(``, `**Fixes**`, ``); r.fixes.forEach(c => out.push(`- ${c}`)); }
  out.push(``);
}
fs.writeFileSync('CHANGELOG.md', out.join('\n'));
console.log('CHANGELOG.md updated with ' + data.releases.length + ' releases');
