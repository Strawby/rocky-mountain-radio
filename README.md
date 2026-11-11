# Rocky Mountain Radio 📻

A tiny, **GM-controlled synchronized Fallout-inspired radio** for tabletop games. It runs on **GitHub Pages** with **no build step and no port forwarding**. Players open one URL, press **Tune In** once, and hear the same songs, prerecorded announcements, and optional background ambience. The GM controls regular music, a separate combat rotation, recorded announcements, and an independent looping ambience layer: pausing or stopping the radio never interrupts the environment. The GM can also interrupt a song with a bulletin and resume it afterward.

It has an original post-apocalyptic radio interface and includes **seven original synthesized demo recordings** (two regular tunes, two combat cues, two ambient loops, and a test-signal station ID); **no copyrighted Fallout songs, logos, or recordings** are included. Replace the samples with music you have permission to share and your own recordings of the announcer.

## New: Combat Mode (GM-controlled)

This edition adds a prominent **ENGAGE COMBAT · SWITCH PLAYLIST** toggle to the Radio broadcast console. When enabled, it switches Channel A from the regular `music` track list to a new **`combat` track list** in `playlist.json`. You can use Previous/Next and Pause/Resume during combat. **END COMBAT · RESTORE RADIO** returns to the radio track and playback position from just before combat began. If the station was off before combat, it returns to off.

**Channel B ambience continues uninterrupted** during combat, radio pauses, announcements, and the transition back. Announcements interrupt and then resume the currently active regular or combat track.

The ZIP includes two original combat demonstration recordings in `media/`. **For full updated click-by-click instructions, two-device testing, and safe upgrade steps, read [SETUP-GUIDE.md](SETUP-GUIDE.md).**

**Existing Firebase users:** Re-publish the new database rules in `firebase-rules.example.json`, replacing `PASTE_YOUR_GM_UID_HERE` with your own GM UID. Older rules reject the new `combat` mode. **Preserve your existing `config.js`** rather than overwriting it with the blank template.

## Understand the two modes

- **Local demo mode (works immediately):** If `config.js` has no Firebase credentials, any tab can operate the GM controls. Playback commands sync **only between tabs in the same browser / local origin** using `BroadcastChannel` and `localStorage`. This **does NOT synchronize players on different devices**. It is meant for trying out the interface.
- **Live mode (for your actual sessions):** GitHub Pages serves the website and MP3 files. **Firebase Realtime Database** delivers play/pause/track/timestamp commands. Every player's browser streams the same file and corrects playback drift. Only the GM account can write playback changes, enforced by Firebase database rules. Firebase is the only extra service; you don't need a home server or router changes.

**Limitations:** This is synchronized *playback*, not a continuous audio stream. Listeners usually stay within roughly a second, not sample-perfect. Everyone must click **Tune In** once because browsers block unsolicited sound. Keep the GM tab open to automatically advance after songs and to resume after bulletins. If your computer sleeps or you close the GM tab, existing listeners can finish the current recording but it won't automatically advance. Avoid extremely large MP3s or audio hosts that don't support seeking.

## Quick preview (2 minutes)

1. Download/unzip the project.
2. Run a static server inside this folder (opening `index.html` directly as `file://` won't load JSON modules):

   ```bash
   python -m http.server 8000
   ```

3. Open `http://localhost:8000/` in a browser.
4. The GM console appears below the radio in demo mode. Click any track's **▶**, then **Tune In** to hear it. Open another tab to see local tab synchronization.

## Deploy to GitHub Pages

1. Create a GitHub repository, e.g. `rocky-mountain-radio`.
2. Upload all files from **inside this folder to the repository root** (including the `media/` folder and `.nojekyll`). Or use Git from a terminal.
3. In the repository, choose **Settings → Pages → Build and deployment → Deploy from a branch**. Select `main` and `/ (root)`; save.
4. After GitHub finishes deploying, open `https://YOUR-USERNAME.github.io/rocky-mountain-radio/`.
5. Without Firebase, this is still just demo mode. Follow the next section to make playback synchronized between real players.

GitHub Pages serves static files, not multiplayer message relays. The included Firebase integration solves that with no port forwarding.

## Enable actual multiplayer synchronization (Firebase)

### A. Create a free Firebase project

1. Go to <https://console.firebase.google.com/> and **Add project**.
2. In **Project settings → Your apps**, register a **Web app**. Copy its `firebaseConfig` values (API key, auth domain, database URL, project ID, app ID). The **databaseURL** often does not appear until you create the Realtime Database; copy it in the next step if necessary.
3. Under **Build → Realtime Database**, click **Create database**. Select your region, choose **locked mode** initially, and finish. Copy the exact **Database URL** (e.g. `https://YOUR-PROJECT-default-rtdb.firebaseio.com` or a regional URL).
4. Under **Build → Authentication → Sign-in method**, enable both **Anonymous** and **Email/Password**. Anonymous sign-in lets listeners connect automatically without setting up accounts.
5. In **Authentication → Users**, choose **Add user** and create a GM email/password account. Copy this account's **User UID** from the user list (not the email address). Use a strong unique password. Don't put the password in any repository.
6. Under **Authentication → Settings → Authorized domains**, add `YOUR-USERNAME.github.io` if it isn't there. Add `localhost` if required for testing.

### B. Secure the database BEFORE using it

1. Open `firebase-rules.example.json`.
2. Replace `PASTE_YOUR_GM_UID_HERE` with the exact GM UID you copied.
3. If you changed `stationId` in `config.js`, also replace the `rocky-mountain-radio` node name in the rules.
4. In Firebase **Realtime Database → Rules**, paste the edited JSON and click **Publish**.

**Do not use public write rules** (`.write: true`). The website's JavaScript is public on GitHub Pages, so hiding an admin button alone would not protect it. The supplied Firebase database rules allow any Firebase-authenticated user to *read* the station, but only your exact GM UID can *write* it. The station data is not private; don't put secret information there.

### C. Configure the radio

Open `config.js` and set the values:

```js
export const CONFIG = {
  stationId: "rocky-mountain-radio",
  gmUid: "PASTE_GM_USER_UID_HERE",
  firebase: {
    apiKey: "AIza...",
    authDomain: "YOUR-PROJECT.firebaseapp.com",
    databaseURL: "https://YOUR-PROJECT-default-rtdb.firebaseio.com",
    projectId: "YOUR-PROJECT",
    appId: "1:123456:web:..."
  }
};
```

These are **public Firebase project identifiers**, not a password. Database security comes from the Firebase Authentication identity **and the rules**. You must configure both.

Commit/upload your edited `config.js` to GitHub, then refresh the deployed page. The badge should change from **LOCAL DEMO** to **LIVE CONNECTION**.

### D. Start broadcasting

1. Open your GitHub Pages URL. Press **GM CONTROLS**.
2. Sign in with the email/password of the GM account created in Firebase.
3. Select a song. Your browser will tune in; if audio is blocked, click **Leave Frequency** then **Tune In**.
4. Share the same GitHub Pages URL with your players. They **only need to click Tune In**. They do not need Firebase accounts, passwords, special software, or Foundry modules.
5. Press an announcement's ▶ during a song. Everyone switches to the recording at roughly the same moment; when it finishes, music resumes where it left off. **END ANNOUNCEMENT · RESUME TRACK** works too.

## Adding your actual music and voice recordings

1. Export the audio as **MP3 or OGG**. A bitrate of about 96–160 kbps is usually plenty for a radio effect.
2. Put files under `media/`, e.g. `media/georgetown-bulletin.mp3`.
3. Edit `playlist.json` and add an item to the relevant `music`, `combat`, `announcements`, or `ambience` array:

   ```json
   {
     "id": "georgetown-power-news",
     "title": "Georgetown Restores Power",
     "artist": "Rocky Mountain Radio · News",
     "src": "media/georgetown-bulletin.mp3",
     "duration": 37
   }
   ```

4. Set `duration` to the **audio's length in seconds** (it is used for progress/automatic next-track). Browser metadata takes priority after the audio loads. Use unique IDs. Commit and push the media file **and** `playlist.json`.
5. Have everyone refresh the page after changing the playlist, ideally between sessions.

You can also use absolute HTTPS URLs to directly hosted MP3/OGG files, but they should be playable in browsers and support seeking. A YouTube page URL will **not** work as an HTML audio source. Avoid including material you don't have rights to redistribute—GitHub Pages is publicly accessible.

## How the broadcast works

The shared database record tracks both layers (the `ambience` field is optional for older station records):

```json
{
  "mode": "music",
  "trackId": "highway-twilight",
  "playing": true,
  "positionMs": 0,
  "startedAt": 1800000000000,
  "revision": 17,
  "resume": null,
  "ambience": {
    "trackId": "mountain-wind",
    "playing": true,
    "positionMs": 0,
    "startedAt": 1800000000000,
    "revision": 4
  }
}
```

Firebase supplies a server timestamp whenever the GM changes playback. Listeners estimate the station time using Firebase's reported server offset, calculate the current playback position, and periodically seek when they drift by more than about 0.65 seconds. There is **no per-player play button controlling the server**: Tune In / volume affects only that person's browser. All broadcast controls are GM-only.

**Privacy/cost notes:** The Realtime Database receives playback commands and the minimal anonymous Firebase authentication identity for every listener, not microphone audio. The sound files are fetched directly from your site. Firebase and GitHub Pages have quotas/usage policies; a small tabletop group should generate relatively few database updates, but check current free-tier quotas and hosting policies yourself.

## Troubleshooting

- **It says LOCAL DEMO:** `config.js` still has blank Firebase fields or GM UID. Demo tabs do not synchronize across devices.
- **ACCESS ERROR / permission denied:** Publish rules and ensure Anonymous authentication is enabled. The GM UID in the rules must match the signed-in GM account.
- **SETUP ERROR / missing or bad credentials:** Recheck the Firebase web app config including `databaseURL` (a Realtime Database URL, not a Firestore URL).
- **Your account is not the GM:** Copy the UID from Firebase Authentication → Users into both `config.js` and the rules. The email address is not a UID.
- **Song doesn't play:** Click Tune In. Verify the MP3 URL actually returns an audio file (not a YouTube page or GitHub HTML page). Check the browser's developer console and permissions.
- **Players hear silence but you're hearing audio:** Make sure all players have clicked **Tune In**, that your page shows **LIVE CONNECTION**, and that all devices opened the same repository URL with the same `config.js`.
- **Music doesn't auto-advance:** Keep the GM's browser tab open. Tab suspension and power-saving may still interrupt timing; use **NEXT SONG** as needed.
- **The audio stutters or lags:** Audio downloads come from the file host and clients occasionally resync; use modest bitrates and stable hosting. Not suitable for beat-matched professional DJ mixing.
- **Files don't load when double-clicked:** Run a local HTTP server instead of `file://`.

## Built with

Plain HTML, CSS, and JavaScript; Firebase's modular browser SDK in live mode. No frontend framework, build tools, backend server, port forwarding, paid audio service, or Foundry module required.

## NEW: Dual-layer radio and ambience mixer

The website now has **two independent synchronized audio layers**:

| Layer | GM controls | Behavior |
|---|---|---|
| **Radio (Channel A)** | Switch regular/combat rotation, play songs, interrupt with announcements, pause/resume, previous/next, seek, off air | Regular and combat songs and bulletins share one audio channel; bulletins interrupt the song and restore it afterward. |
| **Ambience (Channel B)** | Select any ambience track, pause/resume, previous/next, seek, stop | Loops in a separate browser audio element, without stopping or restarting when the radio changes. |

Every listener has their own **RADIO** and **AMBIENCE** volume sliders. These volumes affect only their own device; the GM's track and playback commands affect everyone. The single **Tune In** button enables/disables *both* audio layers on that browser.

To try it, play **Mountain Wind** or **Wasteland Rain** from the *Ambient environment* console, start a song on the *Radio broadcast* deck, then press **PAUSE RADIO**. The ambience will continue to play and loop. You can stop the ambience without changing the radio, too. The same independent commands are stored in Firebase for all listeners when live mode is configured.

### Add custom ambient recordings

Add an `ambience` item to `playlist.json` and put the matching MP3/OGG in `media/`. Example:

```json
"ambience": [
  {
    "id": "georgetown-night",
    "title": "Georgetown After Dark",
    "artist": "Crickets, electrical hum and a distant caravan",
    "src": "media/georgetown-night.mp3",
    "duration": 180
  }
]
```

The sample `playlist.json` includes two original synthesized 30-second ambient loops. For smooth looping, edit your audio files to have seamless beginnings/ends. Accurate `duration` values help browsers stay in sync; the player uses the actual duration reported by the audio element when available. Browsers may not be perfectly sample-synchronized, but they will periodically correct audio drift.

**Updating an existing live site:** Deploy the updated `index.html`, `app.js`, `styles.css`, `playlist.json`, ambient MP3s, and rules. Publish the updated `firebase-rules.example.json` with your actual GM UID substituted in Firebase **Realtime Database → Rules**. Existing station records without an ambience field are automatically handled; the first new GM command adds that field. Ask players to refresh the page after redeploying.

## Local volume scale (0–200%)

Both Radio and Ambience have independent, per-listener volume controls. The scale is intentionally quiet for tabletop voice-chat use: **new 100% equals the old 10% audio level**, and **new 200% equals the old 100% audio level**. From 0–100, the slider increases gain smoothly from silence to 10% of the original maximum; from 100–200, it increases from 10% to the original maximum. No amplification above the original maximum occurs.

A listener's previous settings are migrated once: old values at or below 10% keep the same actual volume, while louder saved values are limited to the new 100% for a quieter first visit. Each listener can adjust their own level afterward. Neither slider changes any other listener's volume, and neither affects Firebase synchronization or combat mode.
