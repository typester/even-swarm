import {
  AppLocationAccuracy,
  type EvenAppBridge,
} from "@evenrealities/even_hub_sdk";
import { log } from "./log";

export type LatLng = { latitude: number; longitude: number };

export class NoLocationError extends Error {
  readonly glassesText = "No location: allow it for the Even app";

  constructor() {
    super(
      "Couldn't get your location. Allow the Even app to use location (on Android: Allow all the time)."
    );
    this.name = "NoLocationError";
  }
}

const HOST_TIMEOUT_MS = 15000;
// The host may never answer (an Even app without the location API, the simulator);
// stop waiting a little after its own timeout so the glasses never spin forever.
const GUARD_TIMEOUT_MS = 20000;

export async function getLocation(bridge: EvenAppBridge | null): Promise<LatLng> {
  return bridge ? getHostLocation(bridge) : getBrowserLocation();
}

async function getHostLocation(bridge: EvenAppBridge): Promise<LatLng> {
  const startedAt = performance.now();
  const elapsed = () => ((performance.now() - startedAt) / 1000).toFixed(1);
  log(`[location] getAppLocation accuracy=high timeoutMs=${HOST_TIMEOUT_MS}`);

  let guard: ReturnType<typeof setTimeout> | undefined;
  try {
    const fix = await Promise.race([
      bridge.getAppLocation({
        accuracy: AppLocationAccuracy.High,
        timeoutMs: HOST_TIMEOUT_MS,
      }),
      new Promise<never>((_, reject) => {
        guard = setTimeout(
          () => reject(new Error(`No answer from Even app (${elapsed()} s)`)),
          GUARD_TIMEOUT_MS
        );
      }),
    ]);
    if (!fix) {
      log(`[location] null after ${elapsed()} s`);
      throw new NoLocationError();
    }
    const ageS =
      fix.timestamp && fix.timestamp > 1e12
        ? Math.round((Date.now() - fix.timestamp) / 1000)
        : null;
    log(
      `[location] fix in ${elapsed()} s, accuracy=${fix.accuracy ?? "?"} m, age=${ageS ?? "?"} s`
    );
    return { latitude: fix.latitude, longitude: fix.longitude };
  } finally {
    clearTimeout(guard);
  }
}

function getBrowserLocation(): Promise<LatLng> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        }),
      reject,
      { enableHighAccuracy: true, timeout: 15000 }
    );
  });
}
