# Rocky Mountain Radio — setup and testing guide

This guide applies to the **Combat Mode + Dual-Layer Edition**. Everything runs in a browser. GitHub Pages serves the HTML and audio; optional Firebase Realtime Database synchronizes GM commands to players **without port forwarding**.

## What changed in this version

- **Channel A — Radio:** Regular music, separate **Combat rotation**, and prerecorded announcements share one playback channel.
- **Channel B — Ambience:** A separate, continuously looping ambient track can play beneath the radio. Radio/combat changes do **not** pause, restart, or replace ambience.
- **Combat Mode toggle (GM only):** Press **ENGAGE COMBAT · SWITCH PLAYLIST** to play the first combat track. The regular song and playback position are saved. **END COMBAT · RESTORE RADIO** restores the earlier song and position (or returns to silence if the radio had been off).
- **Announcements:** A station ID or DJ announcement interrupts the active regular/combat song, then resumes that song at the saved position. Ambience continues.
- **Previous / Next and radio Pause / Resume** operate on whichever music rotation is currently selected. **OFF AIR** stops Channel A only; it does not stop ambience or cancel Combat Mode.

**Important:** The app has only **two audio layers**. Combat is an alternative Channel A playlist, **not** a third simultaneously playing track.

## A. First test — no accounts or hosting needed

1. Unzip the project. Keep `index.html`, `app.js`, `styles.css`, `playlist.json`, `config.js`, `firebase-rules.example.json`, and the `media/` directory together.
2. Open a terminal in the extracted project folder.
3. Run `python -m http.server 8000` (or `python3 -m http.server 8000`).
4. Open <http://localhost:8000/> in a browser. **Do not** double-click `index.html` — modern browsers generally block JSON/module loading over `file://`.
5. Check that the header says **LOCAL DEMO**. The GM console should already be unlocked.
6. Click **TUNE IN** (required by most browsers before sound can play).
7. In **Ambient environment**, click **Mountain Wind**.
8. In **Radio broadcast**, click **Highway Twilight**. You should hear both layers.
9. Click **ENGAGE COMBAT · SWITCH PLAYLIST**. The display should say **COMBAT MODE ACTIVE**, the normal Music rotation should be replaced by **Combat rotation**, and **Raiders at the Pass** should start. Wind should keep playing.
10. Click **NEXT SONG**. You should hear **Last Stand at the Dam**.
11. Click **PAUSE RADIO**. The combat cue should pause but Mountain Wind should continue. Click **RESUME RADIO** to unpause it.
12. Play **Station Identification** under announcements. It should interrupt combat audio, then return to the combat cue. The wind continues throughout.
13. Click **END COMBAT · RESTORE RADIO**. **Highway Twilight** should resume close to where it was when Combat Mode began (not restart). Wind should still play.
14. Click **STOP AMBIENCE**; the radio should keep playing.

*Local Demo synchronizes transport commands only between tabs with the same browser/origin; it is not a real multiplayer test.*

## B. Put the site on GitHub Pages

1. Sign in to <https://github.com/>. Create a **Public** repository named `rocky-mountain-radio` (or any name).
2. On the new repository page choose **Add file → Upload files** (for an empty repository use **uploading an existing file**).
3. Drag in the **contents** of your extracted folder, not the ZIP file or an extra enclosing folder. `index.html` should be visible at the root. Upload the complete `media/` directory, including the two demo combat MP3s.
4. **Commit changes**.
5. Open **Settings → Pages**. Under **Build and deployment**, choose **Deploy from a branch**, branch **main**, folder **/ (root)**, then **Save**.
6. After deployment, open `https://YOUR-USERNAME.github.io/rocky-mountain-radio/` (replace both the username and repository name as needed). Run the local-demo test from section A again.

At this point the website is online, but **different devices are not synchronized** until section C.

## C. Configure Firebase for synchronized play

**You only do this once per project.** The Firebase project provides timestamps and broadcasts commands, not audio streaming. MP3/OGG files are downloaded by each player's browser from GitHub Pages.

### 1) Create the project and database

1. Visit <https://console.firebase.google.com/> and create a project, e.g. **Rocky Mountain Radio**. Google Analytics is optional.
2. Register a **Web app** from **Project overview** or **Project settings → Your apps**. No Firebase Hosting needed. Keep its `firebaseConfig` snippet open.
3. Under **Build → Realtime Database**, click **Create database**, select a region and start in **locked mode**. Copy the exact database URL displayed there (often `https://PROJECT-default-rtdb.firebaseio.com`, but regions can change the hostname).
4. Under **Build → Authentication → Sign-in method**, enable **Anonymous** and **Email/Password**.
5. Under **Authentication → Users**, choose **Add user**, create an account for the GM, and copy its **UID** (the randomly generated user ID, not the email or password).
6. Under **Authentication → Settings → Authorized domains**, ensure your GitHub Pages hostname (like `YOUR-USERNAME.github.io`) is listed. You may also need to add `localhost` for local Firebase testing.

### 2) Publish secure Realtime Database rules — required for Combat Mode

1. Open `firebase-rules.example.json` included in the **new ZIP**.
2. Replace `PASTE_YOUR_GM_UID_HERE` with the UID from Firebase Authentication → Users, keeping its quotes.
3. If you changed `stationId` in `config.js`, replace the `rocky-mountain-radio` station key in the rules too.
4. In Firebase, go to **Realtime Database → Rules**, paste the edited complete JSON, and click **Publish**.

**Existing deployments must re-publish the new rules.** The old example allowed only `music`, `announcement`, and `off` mode; it would reject `combat` writes. The updated rules still restrict station writes to the designated GM UID. **Never** change `.write` to `true` for everyone.

### 3) Edit `config.js`

Keep the structure; fill in the fields using your actual Firebase Web app settings and GM UID:

```js
export const CONFIG = {
  stationId: "rocky-mountain-radio",
  gmUid: "YOUR_FIREBASE_GM_USER_UID",
  firebase: {
    apiKey: "YOUR_FIREBASE_WEB_API_KEY",
    authDomain: "YOUR-PROJECT.firebaseapp.com",
    databaseURL: "https://YOUR-ACTUAL-REALTIME-DATABASE-URL",
    projectId: "YOUR-PROJECT-ID",
    appId: "YOUR-FIREBASE-WEB-APP-ID"
  }
};
```

The web app config identifiers are intentionally public. **Never** publish your GM email/password or a Firebase service-account key. Your security depends on Firebase Authentication and the rules from step 2.

Commit the edited `config.js` to GitHub, let Pages redeploy, then refresh your website. You should see **LIVE CONNECTION** rather than **LOCAL DEMO**. Select **GM ACCESS**, sign in with your GM email/password, and confirm that **DIRECTOR ONLINE** appears. Players do *not* sign in; their browsers use anonymous authentication.

## D. Real multiplayer test — GM computer plus phone

1. On the GM computer, visit your GitHub Pages site, log in using **GM ACCESS**, and press **TUNE IN**.
2. On a phone or second computer, open the **same** URL, **do not** log in, and press **TUNE IN**. Both devices should say **LIVE CONNECTION**. Set volume low or use headphones to prevent echoes.
3. GM: Start **Mountain Wind**. Verify both devices hear wind.
4. GM: Play **Highway Twilight**. Verify both devices hear music **and** wind.
5. GM: Engage Combat Mode. Verify **both devices switch** to **Raiders at the Pass**, while wind continues on both.
6. GM: Click **NEXT SONG**. Both should switch to **Last Stand at the Dam**.
7. GM: Click **PAUSE RADIO**. **Both combat tracks stop, both wind loops continue.** Resume the radio and repeat with a different ambient track if desired.
8. GM: Play **Station Identification**. Both devices should hear it and then return to the combat cue; ambience should continue through both transitions.
9. GM: End Combat Mode. Both devices should return to **Highway Twilight** at approximately the saved position, with no ambient restart.
10. GM: Click **STOP AMBIENCE**; both ambient loops stop and radio keeps playing.
11. Phone: Adjust **RADIO** and **AMBIENCE** sliders. The phone's mix should change but the computer's sliders should *not* change (volume is local per listener).

**Timing:** This is approximate playback synchronization, not a bit-identical broadcast. Browser policies require each listener to press Tune In once. Keep the GM tab active for automatic song advancement and post-announcement restoration.

## E. Add your own combat music

1. Export a track you have permission to distribute as **MP3 or OGG**.
2. Put it inside `media/`, e.g. `media/dumont-raider-fight.mp3`, and commit/upload it to GitHub.
3. Edit `playlist.json`. Find the top-level **`combat`** array, and add a new entry **inside that array**, separated from neighboring entries by commas:

```json
{
  "id": "dumont-raider-fight",
  "title": "Battle for Dumont",
  "artist": "Original combat soundtrack",
  "src": "media/dumont-raider-fight.mp3",
  "duration": 142
}
```

4. Use a unique `id`, an accurate `duration` (seconds), and the exact case-sensitive file path. The browser will use the MP3's real duration once it loads.
5. Commit `playlist.json`. Refresh **all** players' pages after redeployment, ideally between sessions.

Track categories in `playlist.json`:

| Array | Audio purpose | Playback behavior |
| --- | --- | --- |
| `music` | Regular radio station songs | Channel A; sequential next song |
| `combat` | Combat music | Channel A while Combat Mode is enabled; sequential next combat track |
| `announcements` | Miss Melody's DJ bulletins | Temporarily replaces Channel A song, then resumes it |
| `ambience` | Wind, rain, machinery, city noise, etc. | Channel B, independently looping |

You may replace the included demo songs with your own licensed or original files. **Do not upload copyrighted commercial Fallout music to a public GitHub Pages repository without permission.**

## F. Updating a prior dual-layer installation

1. **Back up your existing `config.js` and customized `playlist.json` first.** They may contain your working Firebase configuration and track list.
2. Replace `index.html`, `app.js`, `styles.css` with the new files. Keep your **existing Firebase credentials** in `config.js` — do not overwrite them with the ZIP's blank demo settings.
3. In `playlist.json`, preserve your `music`, `announcements`, and `ambience` arrays, then add a `combat` array with your combat MP3 entries. Alternatively, merge your own tracks into the new `playlist.json`.
4. Upload the new `media/raiders-at-the-pass.mp3` and `media/last-stand-at-the-dam.mp3` if you want the included combat demos.
5. **IMPORTANT: publish the updated Firebase rules** from the new `firebase-rules.example.json` in the Firebase Console, after substituting your GM UID. Old rules do **not** allow combat mode.
6. Commit your updates and have everyone refresh the site; an incognito/private window helps rule out stale cached files.
7. Use section D to verify both layers and Combat Mode on two devices.

## G. Common problems

| Symptom | Check |
| --- | --- |
| Site says `LOCAL DEMO` | Firebase configuration or GM UID is blank; not synced across devices |
| `ACCESS ERROR` or combat button says command failed | Publish updated rules with `combat` mode; check correct GM UID, authentication and station ID |
| GM console shows login instead of controls | Sign in with the designated Firebase GM account; check `config.js` UID |
| Tracks don't play on a phone | Press **TUNE IN** on that phone; check volume, battery-saver restrictions, audio file paths |
| Combat playlist says no tracks / toggle disabled | Add entries to `combat` in `playlist.json`; check JSON commas and spelling |
| New combat MP3 gives silence | Open its GitHub Pages file URL directly; check exact filename and case |
| Ambient sound stops when radio pauses | Reload the newest files and make sure ambience was started from **Ambient environment**, not the radio music list |
| Radio does not auto-advance | Keep the GM browser tab active; browsers may suspend background audio on sleeping devices |
| Changes don't appear | Wait for Pages deployment, reload, and check that the latest `playlist.json` is served |
| `file://` won't load | Use a local HTTP server (`python -m http.server 8000`) or GitHub Pages |

**No server-side audio relay:** Each device downloads audio directly; Firebase only syncs the transport clock and mode. You can run the website only for session time if you prefer — nothing requires your home PC to be online once Pages is deployed.
