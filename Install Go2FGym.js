// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: red; icon-glyph: download;

// Go2FGym installer: paste into a new Scriptable script and tap ▶.
// Run it again any time to update. Your workouts and library are kept.
const req = new Request("https://raw.githubusercontent.com/gadominas/Go2FGym/main/Go2FGym.js");
const code = await req.loadString();
const ok = req.response.statusCode === 200 && code.includes("function webApp");
if (ok) {
  let fm; try { fm = FileManager.iCloud(); } catch (e) { fm = FileManager.local(); }
  fm.writeString(fm.joinPath(fm.documentsDirectory(), "Go2FGym.js"), code);
}
const alert = new Alert();
alert.title = ok ? "Go2FGym is installed" : "Download failed";
alert.message = ok ? "Open Go2FGym from your Scripts list." : "Check your internet connection and try again.";
alert.addAction("OK");
await alert.present();
