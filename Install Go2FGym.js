// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: red; icon-glyph: download;

// Installs or updates "Go2FGym" from GitHub. Run it again any time to update.
// Your workout history and exercise library are kept.
const URL = 'https://raw.githubusercontent.com/gadominas/Go2FGym/main/Go2FGym.js';
const NAME = 'Go2FGym';

const req = new Request(URL);
const code = await req.loadString();
if (!req.response || req.response.statusCode !== 200 || !code.includes('function webApp')) {
  const a = new Alert();
  a.title = 'Download failed';
  a.message = `Could not download the script (HTTP ${req.response ? req.response.statusCode : '?'}). Check your connection and try again.`;
  a.addAction('OK'); await a.present();
} else {
  let fm; try { fm = FileManager.iCloud(); } catch (e) { fm = FileManager.local(); }
  const path = fm.joinPath(fm.documentsDirectory(), `${NAME}.js`);
  const existed = fm.fileExists(path);
  fm.writeString(path, code);
  const a = new Alert();
  a.title = existed ? 'Updated' : 'Installed';
  a.message = `"${NAME}" is in your Scriptable library. Open it from the Scripts list.`;
  a.addAction('OK'); await a.present();
}
Script.complete();
