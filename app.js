import { CONFIG } from './config.js';

/* Rocky Mountain Radio: static site + optional Firebase Realtime Database.
   Only the GM sends transport commands. Every client computes the same playhead
   from a server timestamp and periodically corrects small audio clock drift. */

const $ = (id) => document.getElementById(id);
const audio = $('stationAudio');
const ambientAudio = $('ambientAudio');
const stationId = CONFIG.stationId || 'rocky-mountain-radio';
const demoKey = `rmr-demo-${stationId}`;
const hasFirebase = Boolean(CONFIG.gmUid && CONFIG.firebase &&
  ['apiKey', 'authDomain', 'databaseURL', 'projectId', 'appId'].every((k) => CONFIG.firebase[k]));

let library = { music: [], combat: [], announcements: [], ambience: [] };
let state = null;
let tuned = false;
let isGM = !hasFirebase;
let controlsOpen = !hasFirebase;
let offsetMs = 0;
let firebase = null;
let auth = null;
let dataRef = null;
let connected = false;
let advancingRevision = null;
let busyWriting = false;
let toastTimeout = null;
let seekDragging = false;
let ambienceSeekDragging = false;
let demoChannel = null;

const defaultAmbience = () => ({ trackId: null, playing: false,
  positionMs: 0, startedAt: Date.now(), revision: 0 });
const defaultState = () => ({ mode: 'off', trackId: null, playing: false,
  positionMs: 0, startedAt: Date.now(), revision: 0, resume: null,
  combatActive: false, combatReturn: null, ambience: defaultAmbience() });
// Existing Firebase stations without an ambience field remain compatible.
const normalizeState = (value) => {
  const fallback = defaultState();
  if (!value || typeof value !== 'object') return fallback;
  return { ...fallback, ...value,
    // Older deployments have no combat flag or stored pre-combat radio snapshot.
    combatActive: value.combatActive === true || (value.combatActive == null && value.mode === 'combat'),
    combatReturn: value.combatReturn && typeof value.combatReturn === 'object' ? value.combatReturn : null,
    ambience: { ...fallback.ambience, ...(value.ambience && typeof value.ambience === 'object' ? value.ambience : {}) } };
};
const now = () => Date.now() + offsetMs;
const currentPosition = (s = state) => {
  if (!s || !s.playing) return Math.max(0, Number(s?.positionMs || 0));
  return Math.max(0, Number(s.positionMs || 0) + Math.max(0, now() - Number(s.startedAt || now())));
};
const list = (kind) => kind === 'announcement' ? library.announcements
  : kind === 'ambience' ? library.ambience : kind === 'combat' ? library.combat : library.music;
const activeRotation = (s = state) => s?.combatActive ? 'combat' : 'music';
const trackFor = (s = state) => s ? list(s.mode).find((t) => t.id === s.trackId) : undefined;
const ambientTrackFor = (s = state?.ambience) => s ? library.ambience.find((t) => t.id === s.trackId) : undefined;
const ambientPosition = (s = state?.ambience) => {
  if (!s) return 0;
  const elapsed = currentPosition(s);
  const duration = durationMs(ambientTrackFor(s), ambientAudio);
  return duration > 0 ? elapsed % duration : elapsed;
};
const durationMs = (track, element = audio) => {
  if (!track) return 0;
  if (track.id === element.dataset.trackId && Number.isFinite(element.duration) && element.duration > 0) return element.duration * 1000;
  return Math.max(0, Number(track.duration || 0) * 1000);
};
const fmt = (ms) => {
  const secs = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
};
const notify = (message) => {
  const el = $('toast'); el.textContent = message; el.classList.add('visible');
  clearTimeout(toastTimeout); toastTimeout = setTimeout(() => el.classList.remove('visible'), 3800);
};
const hint = (message, warning = false) => {
  $('audioHint').textContent = message;
  $('audioHint').classList.toggle('warning', warning);
};
const updateConnection = (label, online = false, offline = false) => {
  $('connectionBadge').innerHTML = '<span class="dot"></span> ' + label;
  $('connectionBadge').classList.toggle('online', online);
  $('connectionBadge').classList.toggle('offline', offline);
};

async function loadLibrary() {
  try {
    const response = await fetch('./playlist.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    for (const kind of ['music', 'combat', 'announcements', 'ambience']) {
      if (!Array.isArray(data[kind])) throw new Error(`playlist.json must contain a ${kind} array`);
      const ids = new Set();
      library[kind] = data[kind].filter((t) => {
        if (typeof t.id !== 'string' || typeof t.src !== 'string' || !t.id || !t.src || ids.has(t.id)) return false;
        ids.add(t.id); return true;
      });
    }
    renderLibrary();
  } catch (error) {
    notify('Could not load playlist.json. Serve the folder over HTTP (see README).');
    hint(`Playlist load error: ${error.message}`, true);
  }
}

function renderLibrary() {
  for (const [kind, destination] of [['music', 'musicList'], ['combat', 'combatList'], ['announcement', 'announcementList'], ['ambience', 'ambienceList']]) {
    const root = $(destination); root.replaceChildren();
    if (!list(kind).length) {
      const empty = document.createElement('p'); empty.textContent = 'No recordings added yet.'; root.append(empty); continue;
    }
    for (const track of list(kind)) {
      const row = document.createElement('div'); row.className = 'track-row';
      row.dataset.kind = kind; row.dataset.trackId = track.id;
      if ((kind === 'ambience' ? state?.ambience?.trackId : state?.mode === kind ? state?.trackId : null) === track.id) row.classList.add('active');
      const info = document.createElement('div'); info.className = 'track-info';
      const name = document.createElement('strong'); name.textContent = track.title || track.id;
      const artist = document.createElement('small'); artist.textContent = track.artist || 'Unknown artist';
      info.append(name, artist);
      const button = document.createElement('button'); button.className = 'track-play';
      button.type = 'button'; button.title = `Broadcast ${track.title || track.id}`;
      button.setAttribute('aria-label', `Broadcast ${track.title || track.id}`); button.textContent = '▶';
      button.addEventListener('click', () => kind === 'ambience' ? playAmbience(track.id) : playTrack(kind, track.id));
      row.append(info, button); root.append(row);
    }
  }
}

function updatePanel() {
  $('gmPanel').hidden = !controlsOpen;
  $('controlPanel').hidden = !isGM;
  $('loginPanel').hidden = isGM || !hasFirebase;
  $('demoWarning').hidden = hasFirebase;
  $('signOutButton').hidden = !hasFirebase || !auth?.currentUser || auth.currentUser.isAnonymous;
  $('gmBadge').textContent = !hasFirebase ? 'LOCAL DEMO' : isGM ? 'GM CONNECTED' : 'AUTHENTICATION REQUIRED';
  $('gmAccessButton').textContent = controlsOpen ? '✕ CLOSE CONSOLE' : '⚙ GM CONTROLS';
  $('resumeNotice').hidden = !(isGM && state?.mode === 'announcement' && state.resume);
  $('resumeNoticeText').textContent = state?.resume?.mode === 'combat'
    ? 'ANNOUNCEMENT INTERRUPTING COMBAT MUSIC' : 'ANNOUNCEMENT INTERRUPTING MUSIC';
  $('combatToggle').textContent = state?.combatActive ? '◀ END COMBAT · RESTORE RADIO' : '⚔ ENGAGE COMBAT · SWITCH PLAYLIST';
  $('combatToggle').setAttribute('aria-pressed', String(Boolean(state?.combatActive)));
  $('combatToggle').classList.toggle('active', Boolean(state?.combatActive));
  $('combatToggle').disabled = busyWriting || (!state?.combatActive && !library.combat.length);
  $('normalMusicSection').hidden = Boolean(state?.combatActive);
  $('combatMusicSection').hidden = !state?.combatActive;
  $('pauseButton').querySelector('span').textContent = state?.playing ? 'PAUSE RADIO' : 'RESUME RADIO';
  $('ambientPauseButton').querySelector('span').textContent = state?.ambience?.playing ? 'PAUSE AMBIENCE' : 'RESUME AMBIENCE';
  const noAudio = !trackFor();
  $('pauseButton').disabled = noAudio || busyWriting;
  $('backButton').disabled = !list(activeRotation()).length || busyWriting;
  $('nextButton').disabled = !list(activeRotation()).length || busyWriting;
  $('stopButton').disabled = !state || state.mode === 'off' || busyWriting;
  const hasAmbient = Boolean(ambientTrackFor());
  $('ambientPauseButton').disabled = !hasAmbient || busyWriting;
  $('ambientBackButton').disabled = !library.ambience.length || busyWriting;
  $('ambientNextButton').disabled = !library.ambience.length || busyWriting;
  $('ambientStopButton').disabled = !hasAmbient || busyWriting;
}

function updateDisplay() {
  document.body.classList.toggle('combat-active', Boolean(state?.combatActive));
  $('combatStatus').hidden = !state?.combatActive;
  const track = trackFor();
  const broadcasting = Boolean(state?.mode !== 'off' && track && state?.playing);
  $('onAirLight').classList.toggle('lit', broadcasting);
  $('radioState').textContent = broadcasting ? 'ON AIR' : track ? 'PAUSED' : 'OFF AIR';
  $('radioSubstate').textContent = broadcasting ? 'TRANSMITTING LIVE' : track ? 'SIGNAL ON HOLD' : 'AWAITING TRANSMISSION';
  $('programLabel').textContent = state?.mode === 'announcement' ? 'SPECIAL BULLETIN'
    : state?.combatActive ? 'COMBAT FREQUENCY · ALERT' : broadcasting ? 'LIVE TRANSMISSION' : 'BROADCAST STATUS';
  $('trackTitle').textContent = track?.title || 'Waiting for a transmission';
  $('trackArtist').textContent = track?.artist || '';
  document.querySelector('.record-art').classList.toggle('spinning', broadcasting && tuned);
  $('stationMessage').textContent = state?.mode === 'announcement'
    ? 'Announcement playing. The previous track will resume afterward.'
    : state?.combatActive ? 'Combat music selected. Ambient playback continues independently.'
    : broadcasting ? 'Broadcast playing. Adjust each audio layer independently.'
    : 'Select a track to begin playback.';
  $('tuneLabel').textContent = tuned ? 'LEAVE FREQUENCY' : 'TUNE IN';
  $('tuneIcon').textContent = tuned ? '■' : '▶';
  const ambiance = ambientTrackFor();
  $('ambientTitle').textContent = ambiance?.title || 'No ambient soundscape selected';
  $('ambientArtist').textContent = ambiance?.artist || 'Start an ambient track from the GM console.';
  $('ambientState').textContent = ambiance ? (state.ambience.playing ? 'PLAYING · LOOPING' : 'PAUSED') : 'OFF';
  $('ambientLive').classList.toggle('lit', Boolean(ambiance && state.ambience.playing));
  updatePanel();
  // Avoid rebuilding the library when nothing has changed.
  document.querySelectorAll('.track-row').forEach((row) => {
    const activeId = row.dataset.kind === 'ambience' ? state?.ambience?.trackId
      : state?.mode === row.dataset.kind ? state?.trackId : null;
    row.classList.toggle('active', Boolean(activeId && row.dataset.trackId === activeId));
  });
  updateProgress();
  updateAmbientProgress();
}
function updateProgress() {
  const track = trackFor();
  const duration = durationMs(track);
  const elapsed = track ? currentPosition() : 0;
  $('elapsedLabel').textContent = fmt(elapsed);
  $('durationLabel').textContent = duration ? fmt(duration) : '—:——';
  $('progressFill').style.width = duration ? `${Math.min(100, elapsed / duration * 100)}%` : '0%';
  if (duration && !seekDragging) $('gmSeek').value = String(Math.min(1000, Math.floor(elapsed / duration * 1000)));
  $('gmSeek').disabled = !(isGM && duration);
  updateWave(Boolean(track && state?.playing && tuned));
}
function updateAmbientProgress() {
  const track = ambientTrackFor();
  const duration = durationMs(track, ambientAudio);
  const elapsed = track ? ambientPosition() : 0;
  $('ambientElapsedLabel').textContent = fmt(elapsed);
  $('ambientDurationLabel').textContent = duration ? fmt(duration) : '—:——';
  if (!ambienceSeekDragging) $('ambientSeek').value = duration ? String(Math.min(1000, Math.floor(elapsed / duration * 1000))) : '0';
  $('ambientSeek').disabled = !(isGM && duration && track);
  $('ambientProgressFill').style.width = duration ? `${Math.min(100, elapsed / duration * 100)}%` : '0%';
}
function updateWave(active) {
  const width = 100, sections = 32;
  let d = '';
  for (let i = 0; i <= sections; i++) {
    const x = i * width / sections;
    const envelope = Math.pow(Math.sin(Math.PI * i / sections), 1.2);
    const y = active ? 30 + Math.sin(i * 1.55 + Date.now() / 150) * Math.cos(i * .71 + Date.now() / 420) * envelope * 21 : 30;
    d += `${i ? ' L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  $('wavePath').setAttribute('d', d);
}

function syncAudio() {
  const track = trackFor();
  if (!tuned || !track || state?.mode === 'off') { audio.pause(); return; }
  let src;
  try { src = new URL(track.src, document.baseURI).href; }
  catch { hint('Invalid audio URL in playlist.json', true); return; }
  const changed = audio.dataset.trackId !== track.id || audio.dataset.audioSrc !== src;
  if (changed) {
    audio.pause(); audio.dataset.trackId = track.id; audio.dataset.audioSrc = src;
    audio.src = src; audio.load();
  }
  const expected = currentPosition() / 1000;
  if (audio.readyState >= HTMLMediaElement.HAVE_METADATA && Number.isFinite(expected)) {
    const max = Number.isFinite(audio.duration) && audio.duration > 0 ? Math.max(0, audio.duration - .16) : expected;
    const target = Math.max(0, Math.min(max, expected));
    if (changed || Math.abs(audio.currentTime - target) > .65) {
      try { audio.currentTime = target; } catch { /* Wait for metadata. */ }
    }
  }
  if (state.playing) {
    if (audio.paused) {
      audio.play().then(() => {
        if (tuned) hint('You are tuned in. GM controls the broadcast.');
      }).catch(() => hint('Your browser blocked playback. Tap LEAVE FREQUENCY, then TUNE IN again.', true));
    }
  } else { audio.pause(); }
}

// A second HTMLAudioElement plays ambience concurrently with the radio.
// It uses its own independent clock so changing radio transport cannot reset it.
function syncAmbience() {
  const ambient = state?.ambience;
  const track = ambientTrackFor();
  if (!tuned || !track) { ambientAudio.pause(); return; }
  let src;
  try { src = new URL(track.src, document.baseURI).href; }
  catch { hint('Invalid ambience URL in playlist.json.', true); return; }
  const changed = ambientAudio.dataset.trackId !== track.id || ambientAudio.dataset.audioSrc !== src;
  ambientAudio.loop = true;
  if (changed) {
    ambientAudio.pause();
    ambientAudio.dataset.trackId = track.id; ambientAudio.dataset.audioSrc = src;
    ambientAudio.src = src; ambientAudio.load();
  }
  const expected = ambientPosition() / 1000;
  if (ambientAudio.readyState >= HTMLMediaElement.HAVE_METADATA && Number.isFinite(expected)) {
    const max = Number.isFinite(ambientAudio.duration) && ambientAudio.duration > 0 ? Math.max(0, ambientAudio.duration - .08) : expected;
    const target = Math.max(0, Math.min(max, expected));
    if (changed || Math.abs(ambientAudio.currentTime - target) > .65) {
      try { ambientAudio.currentTime = target; } catch { /* metadata pending */ }
    }
  }
  if (ambient.playing) {
    if (ambientAudio.paused) ambientAudio.play().catch(() => {
      hint('Your browser blocked audio. Click LEAVE FREQUENCY, then TUNE IN again.', true);
    });
  } else { ambientAudio.pause(); }
}

function onState(next) {
  const previous = state;
  state = normalizeState(next);
  if (advancingRevision !== null && state.revision !== advancingRevision) advancingRevision = null;
  if (!previous || previous.revision !== state.revision || previous.trackId !== state.trackId || previous.playing !== state.playing) syncAudio();
  if (!previous || previous.ambience.revision !== state.ambience.revision || previous.ambience.trackId !== state.ambience.trackId || previous.ambience.playing !== state.ambience.playing) syncAmbience();
  updateDisplay();
}
function setTuned(value) {
  tuned = value;
  if (tuned) {
    // This is triggered by an actual click; a browser gesture unlocks audio.
    syncAudio();
    syncAmbience();
    if (!trackFor() && !ambientTrackFor()) hint('Tuned in. Waiting for the GM to start playback.');
  } else { audio.pause(); ambientAudio.pause(); hint('Audio muted on this device. The shared radio and ambience keep going.'); }
  updateDisplay();
}

// Each command updates only the requested layer's transport clock/revision.
// We write a single station snapshot so local demo and Firebase see an atomic mix.
async function send(next, layer = 'radio') {
  if (!isGM || busyWriting) return;
  busyWriting = true; updatePanel();
  const base = normalizeState(state);
  const timestamp = hasFirebase ? firebase.serverTimestamp() : Date.now();
  const payload = layer === 'ambience'
    ? { ...base, ambience: {
        trackId: next.trackId ?? null, playing: Boolean(next.playing),
        positionMs: Math.max(0, Number(next.positionMs) || 0),
        revision: Number(base.ambience.revision || 0) + 1,
        startedAt: timestamp
      } }
    : { ...base,
        mode: next.mode, trackId: next.trackId ?? null, playing: Boolean(next.playing),
        positionMs: Math.max(0, Number(next.positionMs) || 0),
        resume: next.resume ?? null,
        combatActive: next.combatActive === undefined ? base.combatActive : Boolean(next.combatActive),
        combatReturn: next.combatReturn === undefined ? base.combatReturn : (next.combatReturn ?? null),
        revision: Number(base.revision || 0) + 1,
        startedAt: timestamp
      };
  try {
    if (!hasFirebase) {
      localStorage.setItem(demoKey, JSON.stringify(payload));
      onState(payload);
      demoChannel?.postMessage(payload);
    } else {
      await firebase.set(dataRef, payload);
    }
  } catch (error) { notify(`Broadcast command failed: ${error.message}`); advancingRevision = null; }
  finally { busyWriting = false; updatePanel(); }
}
// Combat takes over only Channel A. We save the exact radio state to restore on exit;
// Channel B's playing soundscape, playhead, and revision are never touched.
function radioSnapshot(s = state) {
  return { mode: s?.mode || 'off', trackId: s?.trackId ?? null,
    playing: Boolean(s?.playing), positionMs: currentPosition(s), resume: s?.resume || null };
}
async function toggleCombat() {
  if (!isGM || busyWriting) return;
  if (state?.combatActive) {
    const previous = state.combatReturn;
    const target = previous && ['music', 'announcement', 'off'].includes(previous.mode)
      ? previous : { mode: 'off', trackId: null, playing: false, positionMs: 0, resume: null };
    await send({ ...target, combatActive: false, combatReturn: null });
    return;
  }
  if (!library.combat.length) { notify('Add combat tracks to playlist.json first.'); return; }
  if (!tuned) setTuned(true);
  await send({ mode: 'combat', trackId: library.combat[0].id, playing: true,
    positionMs: 0, resume: null, combatActive: true, combatReturn: radioSnapshot() });
}
async function playTrack(kind, trackId) {
  if (!isGM || !list(kind).some((t) => t.id === trackId)) return;
  if (!tuned) setTuned(true); // GM hears radio for song and bulletin completion.
  let resume = null;
  if (kind === 'announcement') {
    if (state?.mode === 'announcement') resume = state.resume || null;
    else if (['music', 'combat'].includes(state?.mode) && trackFor())
      resume = { mode: state.mode, trackId: state.trackId,
        positionMs: currentPosition(), playing: state.playing };
  }
  await send({ mode: kind, trackId, playing: true, positionMs: 0, resume });
}
async function pauseResume() {
  if (!trackFor()) return;
  await send({ ...state, positionMs: currentPosition(), playing: !state.playing });
}
async function stop() { await send({ mode: 'off', trackId: null, playing: false, positionMs: 0, resume: null }); }
async function adjacentMusic(direction) {
  const kind = activeRotation();
  const tracks = list(kind);
  if (!tracks.length) return;
  const currentId = state?.mode === 'announcement' ? state.resume?.trackId : state?.trackId;
  const currentIndex = tracks.findIndex((t) => t.id === currentId);
  const nextIndex = currentIndex < 0 ? 0 : (currentIndex + direction + tracks.length) % tracks.length;
  await playTrack(kind, tracks[nextIndex].id);
}
async function restoreRadio() {
  if (!isGM || state?.mode !== 'announcement') return;
  const resume = state.resume;
  const mode = resume?.mode === 'combat' ? 'combat' : 'music'; // Supports old saved bulletins.
  if (!resume || !list(mode).some((t) => t.id === resume.trackId)) { await stop(); return; }
  await send({ mode, trackId: resume.trackId,
    playing: resume.playing !== false, positionMs: Number(resume.positionMs) || 0, resume: null });
}
// Ambient files loop locally and never trigger radio's auto-next logic.
async function playAmbience(trackId) {
  if (!isGM || !library.ambience.some((t) => t.id === trackId)) return;
  if (!tuned) setTuned(true);
  await send({ trackId, playing: true, positionMs: 0 }, 'ambience');
}
async function pauseResumeAmbience() {
  if (!ambientTrackFor()) return;
  await send({ ...state.ambience, positionMs: ambientPosition(), playing: !state.ambience.playing }, 'ambience');
}
async function stopAmbience() {
  await send({ ...defaultAmbience(), playing: false }, 'ambience');
}
async function adjacentAmbience(direction) {
  if (!library.ambience.length) return;
  const index = library.ambience.findIndex((t) => t.id === state?.ambience?.trackId);
  const nextIndex = index < 0 ? 0 : (index + direction + library.ambience.length) % library.ambience.length;
  await playAmbience(library.ambience[nextIndex].id);
}

async function ended() {
  if (!isGM || !state?.playing || advancingRevision === state.revision || busyWriting) return;
  advancingRevision = state.revision;
  if (state.mode === 'announcement') await restoreRadio();
  else if (state.mode === 'music' || state.mode === 'combat') await adjacentMusic(1);
  else advancingRevision = null;
}

function hookButtons() {
  $('tuneButton').addEventListener('click', () => setTuned(!tuned));
  const volume = Number(localStorage.getItem('rmr-volume') || 75);
  $('volumeSlider').value = String(Math.min(100, Math.max(0, volume)));
  audio.volume = Number($('volumeSlider').value) / 100;
  $('volumeLabel').textContent = `${$('volumeSlider').value}%`;
  $('volumeSlider').addEventListener('input', (event) => {
    audio.volume = Number(event.target.value) / 100;
    $('volumeLabel').textContent = `${event.target.value}%`;
    localStorage.setItem('rmr-volume', String(event.target.value));
  });
  const ambientVolume = Number(localStorage.getItem('rmr-ambience-volume') ?? 45);
  $('ambientVolumeSlider').value = String(Math.min(100, Math.max(0, ambientVolume)));
  ambientAudio.volume = Number($('ambientVolumeSlider').value) / 100;
  $('ambientVolumeLabel').textContent = `${$('ambientVolumeSlider').value}%`;
  $('ambientVolumeSlider').addEventListener('input', (event) => {
    ambientAudio.volume = Number(event.target.value) / 100;
    $('ambientVolumeLabel').textContent = `${event.target.value}%`;
    localStorage.setItem('rmr-ambience-volume', String(event.target.value));
  });
  $('gmAccessButton').addEventListener('click', () => {
    controlsOpen = !controlsOpen; updatePanel();
    if (controlsOpen) $('gmPanel').scrollIntoView({ block: 'start', behavior: 'smooth' });
  });
  $('combatToggle').addEventListener('click', toggleCombat);
  $('pauseButton').addEventListener('click', pauseResume);
  $('backButton').addEventListener('click', () => adjacentMusic(-1));
  $('nextButton').addEventListener('click', () => adjacentMusic(1));
  $('stopButton').addEventListener('click', stop);
  $('resumeMusicButton').addEventListener('click', restoreRadio);
  $('ambientPauseButton').addEventListener('click', pauseResumeAmbience);
  $('ambientBackButton').addEventListener('click', () => adjacentAmbience(-1));
  $('ambientNextButton').addEventListener('click', () => adjacentAmbience(1));
  $('ambientStopButton').addEventListener('click', stopAmbience);
  $('ambientSeek').addEventListener('pointerdown', () => { ambienceSeekDragging = true; });
  $('ambientSeek').addEventListener('pointerup', () => { ambienceSeekDragging = false; });
  $('ambientSeek').addEventListener('change', async (event) => {
    ambienceSeekDragging = false;
    const dur = durationMs(ambientTrackFor(), ambientAudio);
    if (dur > 0 && isGM) await send({ ...state.ambience, positionMs: dur * (Number(event.target.value) / 1000) }, 'ambience');
  });
  $('gmSeek').addEventListener('pointerdown', () => { seekDragging = true; });
  $('gmSeek').addEventListener('pointerup', () => { seekDragging = false; });
  $('gmSeek').addEventListener('change', async (event) => {
    seekDragging = false;
    const dur = durationMs(trackFor());
    if (dur > 0 && isGM) await send({ ...state, positionMs: dur * (Number(event.target.value) / 1000) });
  });
  $('loginForm').addEventListener('submit', async (event) => {
    event.preventDefault(); $('loginError').textContent = '';
    try {
      if (!auth || !firebase) throw new Error('Firebase is not connected.');
      await firebase.signInWithEmailAndPassword(auth, $('gmEmail').value.trim(), $('gmPassword').value);
      $('gmPassword').value = '';
      if (auth.currentUser?.uid !== CONFIG.gmUid) {
        $('loginError').textContent = 'This account is not the configured GM UID. See README.';
        return;
      }
      notify('Broadcast console unlocked.');
    } catch (error) { $('loginError').textContent = `Sign-in failed: ${error.message}`; }
  });
  $('signOutButton').addEventListener('click', async () => {
    try { await firebase.signOut(auth); notify('Signed out of the console.'); }
    catch (error) { notify(`Could not sign out: ${error.message}`); }
  });
  audio.addEventListener('loadedmetadata', () => { syncAudio(); updateProgress(); });
  ambientAudio.addEventListener('loadedmetadata', () => { syncAmbience(); updateAmbientProgress(); });
  ambientAudio.addEventListener('error', () => {
    if (ambientAudio.src) hint('The ambience file could not be loaded. Check playlist.json.', true);
  });
  audio.addEventListener('ended', ended);
  audio.addEventListener('error', () => {
    if (audio.src) hint('The recording could not be loaded. Check its path/URL in playlist.json.', true);
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { syncAudio(); syncAmbience(); } });
  window.addEventListener('storage', (event) => {
    if (!hasFirebase && event.key === demoKey && event.newValue) {
      try { onState(JSON.parse(event.newValue)); } catch { /* ignore malformed storage */ }
    }
  });
}

function startDemo() {
  updateConnection('LOCAL DEMO', false);
  $('modeDescription').textContent = 'LOCAL PREVIEW • SAME-BROWSER TABS ONLY';
  $('gmPanel').hidden = false;
  try { onState(JSON.parse(localStorage.getItem(demoKey) || 'null') || defaultState()); }
  catch { onState(defaultState()); }
  if ('BroadcastChannel' in window) {
    demoChannel = new BroadcastChannel(demoKey);
    demoChannel.onmessage = (event) => { if (event.data) onState(event.data); };
  }
}

async function startFirebase() {
  updateConnection('CONNECTING');
  $('modeDescription').textContent = 'SHARED FREQUENCY • LIVE SYNC ENABLED';
  try {
    const ver = '11.10.0';
    const [{ initializeApp }, authModule, dbModule] = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${ver}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${ver}/firebase-auth.js`),
      import(`https://www.gstatic.com/firebasejs/${ver}/firebase-database.js`)
    ]);
    const app = initializeApp(CONFIG.firebase);
    auth = authModule.getAuth(app);
    const db = dbModule.getDatabase(app);
    firebase = { ...authModule, ...dbModule };
    dataRef = dbModule.ref(db, `stations/${stationId}`);
    dbModule.onValue(dbModule.ref(db, '.info/serverTimeOffset'), (snapshot) => {
      offsetMs = Number(snapshot.val()) || 0;
    });
    dbModule.onValue(dbModule.ref(db, '.info/connected'), (snapshot) => {
      connected = snapshot.val() === true;
      updateConnection(connected ? 'LIVE CONNECTION' : 'RECONNECTING', connected, !connected);
    });
    let stationUnsubscribe = null;
    authModule.onAuthStateChanged(auth, async (user) => {
      isGM = Boolean(user && !user.isAnonymous && user.uid === CONFIG.gmUid);
      updatePanel();
      // Re-subscribe on identity changes. A listener started before auth or
      // surviving a sign-out can fail permanently with permission_denied.
      if (stationUnsubscribe) { stationUnsubscribe(); stationUnsubscribe = null; }
      if (user) {
        stationUnsubscribe = dbModule.onValue(dataRef, (snapshot) => onState(snapshot.val()), (error) => {
          updateConnection('ACCESS ERROR', false, true);
          notify(`Database read failed: ${error.message}. Check your rules.`);
        });
      }
      if (!user) {
        try { await authModule.signInAnonymously(auth); }
        catch (error) { notify(`Anonymous sign-in failed: ${error.message}. Enable it in Firebase.`); }
      }
      if (user && !user.isAnonymous && !isGM) {
        $('loginError').textContent = 'Signed in, but this account UID is not listed as the GM in config.js.';
      }
    });
  } catch (error) {
    updateConnection('SETUP ERROR', false, true);
    $('modeDescription').textContent = 'FIREBASE SETUP ERROR • SEE README';
    hint(`Could not connect to Firebase: ${error.message}`, true);
    notify('Firebase connection failed. Double-check config.js and the Firebase console.');
  }
}

async function main() {
  hookButtons();
  await loadLibrary();
  if (hasFirebase) await startFirebase(); else startDemo();
  setInterval(() => {
    updateProgress();
    updateAmbientProgress();
    if (tuned && state?.playing && trackFor()) syncAudio();
    if (tuned && state?.ambience?.playing && ambientTrackFor()) syncAmbience();
    if (isGM && state?.playing && trackFor()) {
      const duration = durationMs(trackFor());
      if (duration > 0 && currentPosition() >= duration - 150) ended();
    }
  }, 1000);
}
main();
