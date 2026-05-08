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

const FOURSQUARE_CLIENT_ID = import.meta.env
  .VITE_FOURSQUARE_CLIENT_ID as string;

// Phone UI elements
const loginSection = document.getElementById("login-section")!;
const appSection = document.getElementById("app-section")!;
const loginBtn = document.getElementById("login-btn")!;
const logoutBtn = document.getElementById("logout-btn")!;
const statusEl = document.getElementById("status")!;
const venueListEl = document.getElementById("venue-list")!;

// App state
let venues: foursquare.Venue[] = [];
let token: string | null = null;
let bridge: EvenAppBridge | null = null;

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

function renderPhoneVenues() {
  venueListEl.innerHTML = venues
    .map(
      (v, i) =>
        `<div class="venue" data-index="${i}">
          <strong>${escapeHtml(v.name)}</strong>
          <span>${escapeHtml(v.category)} · ${formatDistance(v.distance)}</span>
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

  const itemContainer = new ListItemContainerProperty();
  itemContainer.itemCount = venues.length;
  itemContainer.itemWidth = 576;
  itemContainer.isItemSelectBorderEn = 1;
  itemContainer.itemName = venues.map(
    (v) => `${v.name}  ${formatDistance(v.distance)}`
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

  await bridge.rebuildPageContainer(page);
}

// --- Core logic ---

function getLocation(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 10000,
    });
  });
}

async function loadVenues() {
  if (!token) return;

  setStatus("Getting location...");
  await showGlassesText("Getting location...");

  try {
    const pos = await getLocation();
    const { latitude, longitude } = pos.coords;

    setStatus("Searching venues...");
    await showGlassesText("Searching venues...");

    venues = await foursquare.searchVenues(token, latitude, longitude);

    if (venues.length === 0) {
      setStatus("No venues found nearby");
      await showGlassesText("No venues found");
      return;
    }

    setStatus(`Found ${venues.length} venues — tap to check in`);
    renderPhoneVenues();
    await showGlassesVenueList();
  } catch (err: unknown) {
    console.error("loadVenues error:", err);
    const msg = errorMessage(err);
    setStatus(`Error: ${msg}`);
    await showGlassesText(`Error:\n${msg}`);
  }
}

async function doCheckin(index: number) {
  if (!token || !venues[index]) return;

  const venue = venues[index];
  setStatus(`Checking in to ${venue.name}...`);
  await showGlassesText(`Checking in...\n${venue.name}`);

  try {
    const name = await foursquare.checkin(token, venue.id);
    setStatus(`Checked in to ${name}!`);
    await showGlassesText(`Checked in!\n${name}`);

    // Exit app after brief confirmation
    setTimeout(() => {
      bridge?.shutDownPageContainer(0);
    }, 2000);
  } catch (err: unknown) {
    console.error("doCheckin error:", err);
    const msg = errorMessage(err);
    setStatus(`Check-in failed: ${msg}`);
    await showGlassesText(`Failed:\n${msg}`);
  }
}

// --- Glasses bridge init ---

async function initGlasses() {
  bridge = await Promise.race([
    waitForEvenAppBridge().then((b) => b as EvenAppBridge | null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
  ]);

  if (!bridge) {
    console.log("Even Hub bridge not available, phone-only mode");
    return;
  }

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
    // List item click → check in
    if (event.listEvent) {
      const evt = event.listEvent;
      if (
        (evt.eventType === OsEventTypeList.CLICK_EVENT ||
          evt.eventType === undefined) &&
        evt.currentSelectItemIndex !== undefined
      ) {
        doCheckin(evt.currentSelectItemIndex);
      }
    }

    // Foreground enter → refresh
    if (event.sysEvent?.eventType === OsEventTypeList.FOREGROUND_ENTER_EVENT) {
      loadVenues();
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
    const reasons: Record<number, string> = {
      1: "Location permission denied",
      2: "Location unavailable",
      3: "Location request timed out",
    };
    return reasons[geo.code] || geo.message;
  }
  return String(err);
}

// --- Main ---

function renderDebugInfo() {
  const redirectUri = window.location.origin + window.location.pathname;
  const hrefEl = document.getElementById("debug-href");
  const originEl = document.getElementById("debug-origin");
  const redirectEl = document.getElementById("debug-redirect");
  if (hrefEl) hrefEl.textContent = `href: ${window.location.href}`;
  if (originEl) originEl.textContent = `origin: ${window.location.origin}`;
  if (redirectEl) redirectEl.textContent = `redirect_uri: ${redirectUri}`;
}

async function main() {
  renderDebugInfo();
  token = foursquare.getToken();

  if (!token) {
    showLogin();
    loginBtn.addEventListener("click", async () => {
      loginBtn.setAttribute("disabled", "true");
      setStatus("Opening login...");
      try {
        token = await foursquare.openAuthPopup(FOURSQUARE_CLIENT_ID);
        showApp();
        await initGlasses();
        await loadVenues();
      } catch (err: unknown) {
        loginBtn.removeAttribute("disabled");
        const msg = err instanceof Error ? err.message : String(err);
        setStatus(`Login failed: ${msg}`);
      }
    });
    return;
  }

  showApp();
  logoutBtn.addEventListener("click", () => {
    foursquare.clearToken();
    window.location.reload();
  });

  await initGlasses();
  await loadVenues();
}

main();
