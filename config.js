/**
 * Leave Firebase fields empty to run a local, same-browser-tab demo.
 * For a real synchronized station, follow README.md and fill these in.
 * Firebase web config / apiKey / GM UID are public identifiers, NOT secrets.
 * Access control is enforced by your Firebase Realtime Database rules.
 */
export const CONFIG = {
  stationId: "rocky-mountain-radio",
  gmUid: "",
  firebase: {
    apiKey: "",
    authDomain: "",
    databaseURL: "",
    projectId: "",
    appId: ""
  }
};
