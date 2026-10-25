// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: red; icon-glyph: download;

// Go2FGym installer for Scriptable.
// Downloads the latest "Go2FGym" script from GitHub into your Scriptable scripts.
// Run it again any time to update. Workouts, history and the exercise library are stored separately and never touched.

const SOURCE = "https://raw.githubusercontent.com/gadominas/Go2FGym/main/Go2FGym.js";
const NAME = "Go2FGym";

async function say(title, message, buttons) {
  const a = new Alert();
  a.title = title;
  a.message = message;
  (buttons || ["OK"]).forEach((b) => a.addAction(b));
  return a.present();
}

// Save next to this script, so it lands in the same Scriptable folder (iCloud or local).
const here = module.filename;
const dir = here.substring(0, here.lastIndexOf("/"));
const fm = here.indexOf("/Mobile Documents/") >= 0 ? FileManager.iCloud() : FileManager.local();
const target = fm.joinPath(dir, NAME + ".js");
const exists = fm.fileExists(target);

let code = "";
try {
  const req = new Request(SOURCE);
  req.timeoutInterval = 30;
  code = await req.loadString();
  const status = req.response && req.response.statusCode;
  if (status && status !== 200) throw new Error("HTTP " + status);
  if (code.indexOf("Go2FGym") < 0 || code.indexOf("function webApp()") < 0) throw new Error("Unexpected file content");
} catch (e) {
  await say("Download failed", "Could not download Go2FGym.\n\n" + e.message + "\n\nCheck the internet connection and try again.");
  Script.complete();
  return;
}

if (exists) {
  const choice = await say("Update Go2FGym?", "A newer version will replace the current script. Your workouts, history and exercise library are kept.", ["Update", "Cancel"]);
  if (choice !== 0) {
    Script.complete();
    return;
  }
}

fm.writeString(target, code);

const done = await say(
  exists ? "Updated 🏋️" : "Installed 🏋️",
  "\"" + NAME + "\" is now in your Scriptable scripts.",
  ["Open now", "Close"]
);
if (done === 0) Safari.open("scriptable:///run?scriptName=" + encodeURIComponent(NAME));
Script.complete();
