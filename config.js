/**
 * Rocky Mountain Radio Firebase web configuration.
 * Complete gmUid and databaseURL after setting up Firebase Authentication
 * and Realtime Database. While either is empty, the app remains in LOCAL DEMO.
 *
 * Firebase web API keys and app IDs are public identifiers; enforce access
 * using the repository's Realtime Database rules and the correct GM UID.
 */
export const CONFIG = {
  stationId: "rocky-mountain-radio",
  gmUid: "",
  firebase: {
    apiKey: "AIzaSyDraVIIpQ4OwnoOh38wd8XAfUcwMHAGu34",
    authDomain: "rocky-mountain-radio.firebaseapp.com",
    databaseURL: "https://rocky-mountain-radio-default-rtdb.firebaseio.com",
    projectId: "rocky-mountain-radio",
    appId: "1:728663078710:web:f7cc20c759760bbe916597"
  }
};
