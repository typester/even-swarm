import {
  waitForEvenAppBridge,
  ListContainerProperty,
  ListItemContainerProperty,
  TextContainerProperty,
  CreateStartUpPageContainer,
  RebuildPageContainer,
  EvenAppBridge,
  OsEventTypeList,
} from "@evenrealities/even_hub_sdk";
import * as foursquare from "./foursquare";
import appJson from "../app.json";

const FOURSQUARE_CLIENT_ID = import.meta.env
  .VITE_FOURSQUARE_CLIENT_ID as string;

// Phone UI elements
const loginSection = document.getElementById("login-section")!;
const appSection = document.getElementById("app-section")!;
const loginBtn = document.getElementById("login-btn")!;
const logoutBtn = document.getElementById("logout-btn")!;
const retryRowEl = document.getElementById("retry-row")!;
const retryBtn = document.getElementById("retry-btn")!;
const statusEl = document.getElementById("status")!;
const venueListEl = document.getElementById("venue-list")!;

// App state
type AppState = "loading" | "error" | "ready" | "checking-in";
let appState: AppState = "error";

// Debug log
const debugLogEl = document.getElementById("debug-log");
function log(msg: string) {
  console.log(msg);
  if (debugLogEl) {
    const line = document.createElement("div");
    line.textContent = `${new Date().toISOString().slice(11, 23)} ${msg}`;
    debugLogEl.prepend(line);
    while (debugLogEl.children.length > 50) debugLogEl.lastChild?.remove();
  }
}

function setState(s: AppState) {
  log(`[state] ${appState} → ${s}`);
  appState = s;
}
let venues: foursquare.Venue[] = [];
let token: string | null = null;
let bridge: EvenAppBridge | null = null;
let checkinReloadTimeout: ReturnType<typeof setTimeout> | null = null;

// --- Phone UI ---

function showLogin() {
  loginSection.style.display = "block";
  appSection.style.display = "none";
}

function showApp() {
  loginSection.style.display = "none";
  appSection.style.display = "block";
}

function setStatus(text: string) {
  statusEl.textContent = text;
}

function showRetry() {
  retryRowEl.style.display = "block";
}

function hideRetry() {
  retryRowEl.style.display = "none";
}

function renderPhoneVenues() {
  venueListEl.innerHTML = venues
    .map(
      (v, i) =>
        `<div class="venue" data-index="${i}">
          <strong>${escapeHtml(v.name)}</strong>
          <span>${escapeHtml(v.category)} · ${formatDistance(v.distance)}</span>
          ${v.address ? `<span style="color:#666;font-size:0.75rem">${escapeHtml(v.address)}</span>` : ""}
        </div>`
    )
    .join("");

  venueListEl.querySelectorAll(".venue").forEach((el) => {
    el.addEventListener("click", () => {
      const idx = parseInt(el.getAttribute("data-index")!);
      doCheckin(idx);
    });
  });
}

// --- Glasses UI ---

async function showGlassesText(text: string) {
  if (!bridge) return;

  const tc = new TextContainerProperty();
  tc.containerID = 1;
  tc.containerName = "status";
  tc.xPosition = 0;
  tc.yPosition = 0;
  tc.width = 576;
  tc.height = 288;
  tc.content = text;

  const page = new RebuildPageContainer();
  page.containerTotalNum = 1;
  page.textObject = [tc];

  await bridge.rebuildPageContainer(page);
}

async function showGlassesVenueList() {
  if (!bridge || venues.length === 0) return;
  try {
    await _showGlassesVenueList();
  } catch (err) {
    console.error("showGlassesVenueList error:", err);
    await showGlassesText(`List error:\n${errorMessage(err)}`);
  }
}

async function _showGlassesVenueList() {
  const itemContainer = new ListItemContainerProperty();
  itemContainer.itemCount = venues.length;
  itemContainer.itemWidth = 576;
  itemContainer.isItemSelectBorderEn = 1;
  itemContainer.itemName = venues.map((v) =>
    `${v.name} | ${formatDistance(v.distance)}`
  );

  const lc = new ListContainerProperty();
  lc.containerID = 1;
  lc.containerName = "venues";
  lc.xPosition = 0;
  lc.yPosition = 0;
  lc.width = 576;
  lc.height = 288;
  lc.isEventCapture = 1;
  lc.itemContainer = itemContainer;

  const page = new RebuildPageContainer();
  page.containerTotalNum = 1;
  page.listObject = [lc];

  await bridge!.rebuildPageContainer(page);
}

async function showGlassesRetry(errorMsg: string) {
  if (!bridge) return;

  const itemContainer = new ListItemContainerProperty();
  itemContainer.itemCount = 1;
  itemContainer.itemWidth = 576;
  itemContainer.isItemSelectBorderEn = 1;
  itemContainer.itemName = [`${errorMsg} | Tap to retry`];

  const lc = new ListContainerProperty();
  lc.containerID = 1;
  lc.containerName = "error";
  lc.xPosition = 0;
  lc.yPosition = 0;
  lc.width = 576;
  lc.height = 288;
  lc.isEventCapture = 1;
  lc.itemContainer = itemContainer;

  const page = new RebuildPageContainer();
  page.containerTotalNum = 1;
  page.listObject = [lc];

  await bridge.rebuildPageContainer(page);
}

// --- Core logic ---


type LatLng = { latitude: number; longitude: number };

const COMPANION_URL = "http://127.0.0.1:38080/location";

const companionDebugEl = document.getElementById("debug-companion");
function setCompanionDebug(s: string) {
  if (companionDebugEl) companionDebugEl.textContent = `companion: ${s}`;
}

async function getLocation(): Promise<LatLng> {
  try {
    const res = await fetch(COMPANION_URL, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const data = (await res.json()) as LatLng;
      setCompanionDebug("ok");
      return { latitude: data.latitude, longitude: data.longitude };
    }
    if (res.status === 503) {
      setCompanionDebug("503 no fix");
      throw new Error("No GPS fix available");
    }
    setCompanionDebug(`http ${res.status}`);
    throw new Error(`Companion returned ${res.status}`);
  } catch (err) {
    if (err instanceof Error && err.message !== "No GPS fix available" && !err.message.startsWith("Companion")) {
      // Companion unreachable → fall back to navigator.geolocation (desktop dev / simulator).
      const name = err.name;
      setCompanionDebug(`unreachable (${name}), trying geolocation`);
      return new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
          reject,
          { enableHighAccuracy: true, timeout: 15000 },
        );
      });
    }
    throw err;
  }
}

async function loadVenues() {
  if (!token) { log("[loadVenues] skip: no token"); return; }
  if (appState === "loading" || appState === "checking-in") {
    log(`[loadVenues] skip: state=${appState}`);
    return;
  }
  log("[loadVenues] start");

  setState("loading");
  hideRetry();
  setStatus("Getting location...");
  await showGlassesText("Getting location...");

  try {
    const { latitude, longitude } = await getLocation();

    setStatus("Searching venues...");
    await showGlassesText("Searching venues...");

    venues = await foursquare.searchVenues(token, latitude, longitude);

    if (venues.length === 0) {
      setState("error");
      setStatus("No venues found nearby");
      showRetry();
      await showGlassesRetry("No venues found");
      return;
    }

    setState("ready");
    setStatus(`Found ${venues.length} venues — tap to check in`);
    renderPhoneVenues();
    await showGlassesVenueList();
  } catch (err: unknown) {
    console.error("loadVenues error:", err);
    if (err instanceof Error && err.message === "UNAUTHORIZED") {
      await clearToken();
      window.location.reload();
      return;
    }
    const msg = errorMessage(err);
    setState("error");
    setStatus(`Error: ${msg}`);
    showRetry();
    await showGlassesRetry(msg);
  }
}

async function doCheckin(index: number) {
  if (!token || !venues[index] || appState !== "ready") return;

  setState("checking-in");
  const venue = venues[index];
  setStatus(`Checking in to ${venue.name}...`);
  await showGlassesText(`Checking in...\n${venue.name}`);

  try {
    const name = await foursquare.checkin(token, venue.id);
    setStatus(`Checked in to ${name}!`);
    await showGlassesText(`Checked in!\n${name}`);

    log("[doCheckin] scheduling shutdown(0) + reload at +2000ms");
    setTimeout(() => { log("[timer] shutDownPageContainer(0)"); bridge?.shutDownPageContainer(0); }, 2000);
    checkinReloadTimeout = setTimeout(() => { log("[timer] window.location.reload()"); window.location.reload(); }, 2000);
  } catch (err: unknown) {
    console.error("doCheckin error:", err);
    const msg = errorMessage(err);
    setState("ready");
    setStatus(`Check-in failed: ${msg}`);
    await showGlassesText(`Failed:\n${msg}`);
  }
}

// --- Token storage (bridge-backed with localStorage fallback) ---

async function saveToken(t: string) {
  localStorage.setItem(foursquare.TOKEN_KEY, t);
  if (bridge) await bridge.setLocalStorage(foursquare.TOKEN_KEY, t);
}

async function loadToken(): Promise<string | null> {
  if (bridge) {
    const t = await bridge.getLocalStorage(foursquare.TOKEN_KEY);
    if (t) return t;
  }
  return localStorage.getItem(foursquare.TOKEN_KEY);
}

async function clearToken() {
  localStorage.removeItem(foursquare.TOKEN_KEY);
  if (bridge) await bridge.setLocalStorage(foursquare.TOKEN_KEY, "");
}

// --- Glasses bridge init ---

async function connectBridge() {
  bridge = await Promise.race([
    waitForEvenAppBridge().then((b) => b as EvenAppBridge | null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
  ]);
  if (!bridge) console.log("Even Hub bridge not available, phone-only mode");
}

async function setupGlassesUI() {
  if (!bridge) return;

  const tc = new TextContainerProperty();
  tc.containerID = 1;
  tc.containerName = "status";
  tc.xPosition = 0;
  tc.yPosition = 0;
  tc.width = 576;
  tc.height = 288;
  tc.content = "Loading...";

  const startPage = new CreateStartUpPageContainer();
  startPage.containerTotalNum = 1;
  startPage.textObject = [tc];

  await bridge.createStartUpPageContainer(startPage);

  bridge.onEvenHubEvent((event) => {
    log(`[event] raw=${JSON.stringify(event)}`);

    if (event.listEvent) {
      const evt = event.listEvent;
      log(`[listEvent] container=${evt.containerName} eventType=${evt.eventType} idx=${evt.currentSelectItemIndex} appState=${appState}`);

      const isClick =
        evt.eventType === OsEventTypeList.CLICK_EVENT ||
        evt.eventType === undefined;

      if (isClick) {
        // Protobuf omits zero-valued numeric fields, so index 0 arrives as undefined.
        const idx = evt.currentSelectItemIndex ?? 0;

        if (evt.containerName === "error") {
          log(`[listEvent] error retry → loadVenues()`);
          loadVenues();
        } else if (evt.containerName === "venues") {
          log(`[listEvent] venue selected idx=${idx} → doCheckin()`);
          doCheckin(idx);
        } else {
          log(`[listEvent] no match (container=${evt.containerName})`);
        }
      } else {
        log(`[listEvent] not a click event`);
      }
    }
    if (event.sysEvent) {
      const sys = event.sysEvent;
      log(`[sysEvent] eventType=${sys.eventType} appState=${appState}`);
      if (sys.eventType === OsEventTypeList.DOUBLE_CLICK_EVENT) {
        log(`[sysEvent] DOUBLE_CLICK → shutDownPageContainer(1), reloadTimeout=${checkinReloadTimeout !== null}`);
        if (checkinReloadTimeout) {
          clearTimeout(checkinReloadTimeout);
          checkinReloadTimeout = null;
        }
        bridge?.shutDownPageContainer(1);
      } else if (sys.eventType === OsEventTypeList.FOREGROUND_ENTER_EVENT) {
        log(`[sysEvent] FOREGROUND_ENTER → loadVenues()`);
        loadVenues();
      }
    }
  });
}

// --- Helpers ---

function formatDistance(meters: number): string {
  return meters < 1000 ? `${meters}m` : `${(meters / 1000).toFixed(1)}km`;
}

function escapeHtml(s: string): string {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  // GeolocationPositionError
  if (err && typeof err === "object" && "code" in err && "message" in err) {
    const geo = err as GeolocationPositionError;
    return `code=${geo.code} ${geo.message}`;
  }
  return String(err);
}

// --- Main ---

async function renderDebugInfo() {
  const redirectUri = window.location.origin + window.location.pathname;
  const hrefEl = document.getElementById("debug-href");
  const originEl = document.getElementById("debug-origin");
  const redirectEl = document.getElementById("debug-redirect");
  if (hrefEl) hrefEl.textContent = `href: ${window.location.href}`;
  if (originEl) originEl.textContent = `origin: ${window.location.origin}`;
  if (redirectEl) redirectEl.textContent = `redirect_uri: ${redirectUri}`;

  const versionEl = document.getElementById("debug-version");
  if (versionEl) versionEl.textContent = `app version: ${appJson.version}`;

  const geoEl = document.getElementById("debug-geo");
  if (geoEl) {
    const hasApi = "geolocation" in navigator;
    if (!hasApi) {
      geoEl.textContent = "geo: API unavailable";
    } else {
      try {
        const perm = await navigator.permissions.query({ name: "geolocation" });
        geoEl.textContent = `geo: ${perm.state}`;
      } catch {
        geoEl.textContent = "geo: permissions API unavailable";
      }
    }
  }

}

async function main() {
  await renderDebugInfo();
  await connectBridge();

  const callbackToken = foursquare.handleAuthCallback();
  if (callbackToken) {
    token = callbackToken;
    await saveToken(token);
  } else {
    token = await loadToken();
  }

  if (!token) {
    showLogin();
    loginBtn.addEventListener("click", () => {
      foursquare.redirectToAuth(FOURSQUARE_CLIENT_ID);
    });
    return;
  }

  showApp();
  logoutBtn.addEventListener("click", async () => {
    await clearToken();
    window.location.reload();
  });
  retryBtn.addEventListener("click", () => { log("[retryBtn] clicked"); loadVenues(); });

  await setupGlassesUI();
  await loadVenues();
}

main();
