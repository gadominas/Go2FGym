# Install guide

Go2FGym runs inside **Scriptable**, a free iOS app that runs JavaScript. You don't need a computer, an account or a developer licence.

**You need:** an iPhone or iPad, the free **[Scriptable](https://apps.apple.com/app/scriptable/id1405459188)** app, and about 40 MB of free space.

## 1. Install the script

### Option A: one-line installer (recommended, also used for updates)

1. Open **Scriptable** and tap **+** to create a new script.
2. Paste this line and tap **Run** (▶︎):
   ```js
   const s = await new Request("https://raw.githubusercontent.com/gadominas/Go2FGym/main/install.js").loadString(); await Function("module", "return (async () => {" + s + "\n})()")(module);
   ```
3. Tap **Open now**. **Go2FGym** is now in your Scripts list, saved in the same folder as the little script. You can keep that script for updates or delete it.

### Option B: manual

- **Download the file:** save [`Go2FGym.js`](../Go2FGym.js) to **iCloud Drive › Scriptable**. It shows up in Scriptable automatically.
- **Or copy and paste:** in Scriptable, tap **+**, paste the whole of `Go2FGym.js`, and name the script *Go2FGym*.

## 2. Download the exercise library (once)

1. Connect to **Wi-Fi** and run **Go2FGym**.
2. Read the safety disclaimer and tap **I understand and accept**. You're only asked once; it's always available under **Train › Disclaimer**.
3. Tap **Download library**. It fetches the exercise list and two photos for each exercise, about 36 MB in total.
4. **Keep the screen open** until it says the library is ready. That takes a few minutes.

If it's interrupted, just tap **Download library** or **Update library** again. Photos you already have are skipped.

From now on everything works offline.

## 3. Optional: add the widget

1. Long-press your Home Screen, tap **Edit › Add Widget**, choose **Scriptable**, and pick the small size.
2. Long-press the new widget, tap **Edit Widget**, and set **Script** to *Go2FGym* and **When Interacting** to *Run Script*.

The widget shows your last workout and how many you've done this week. Tapping it opens the app.

**Tip:** for an app-like icon, tap *⋯* on *Go2FGym* in Scriptable, then *Add to Home Screen*.

## 4. Optional: match your equipment

By default the library contains exercises for **bodyweight, dumbbells, a barbell and resistance bands**. A flat bench is assumed; it isn't listed as separate equipment in the data.

To add more:

1. In Scriptable, open `Go2FGym` for editing.
2. In the `CONFIG` block at the top, add items to `equipment`, for example:
   ```js
   equipment: ["body only", "dumbbell", "barbell", "bands", "kettlebells"],
   ```
   Available values: `body only`, `dumbbell`, `barbell`, `kettlebells`, `bands`, `e-z curl bar`, `medicine ball`, `exercise ball`, `foam roll`, `other`.
3. Run Go2FGym and tap **Train › Update library**.

You can also change `restSeconds` (default `90`) and `unit` (default `"kg"`) there.

## Updating

Run the one-line installer script again and tap **Update**. Your history and downloaded library are kept, because they live in a separate folder from the script.

If you installed manually, replace the script's contents with the new `Go2FGym.js`. Any changes you made to `CONFIG` need to be made again.

## Backup, restore and new phones

| What | Where |
|---|---|
| Library and photos | Scriptable's local folder, `Go2FGym/` (not backed up, re-download anytime) |
| Workout history | Scriptable's local folder, `Go2FGym/history.json` |
| History backup | **iCloud Drive › Scriptable › Go2FGym-backup › history.json**, updated after every save |
| CSV export | Same iCloud folder, `history.csv`, plus the share sheet |

**On a new phone**, install the script and run it. If the local history is missing and the iCloud backup exists, it's restored automatically. Then tap **Download library** again.

## Uninstall

Delete the **Go2FGym** script in Scriptable. The history backup lives in **Files › iCloud Drive › Scriptable › Go2FGym-backup**; delete that folder too if you want it gone. The local library and history are only removed when you delete Scriptable itself.

## Troubleshooting

| Problem | Try this |
|---|---|
| The download stopped or some photos failed | Tap **Update library** again. Only missing photos are downloaded. |
| An exercise says "Photos not downloaded" | Same: **Update library** |
| No beep when the rest timer ends | The beep follows the silent switch and volume. Turn the ringer on. |
| My workout disappeared after closing | Reopen the app; unfinished workouts are restored. A change made in the last second before closing might be lost. |
| History is empty after reinstalling | Check that **iCloud Drive › Scriptable › Go2FGym-backup › history.json** exists, then run the app again |
| A barbell exercise needs a squat rack I don't have | Skip it. The data doesn't separate rack and floor movements. |
| The installer says "Download failed" | Check your connection. The script is downloaded from `raw.githubusercontent.com`. |

Still stuck? Open an issue with a screenshot.
