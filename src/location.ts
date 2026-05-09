import { log } from "./log";

export type LatLng = { latitude: number; longitude: number };

const COMPANION_URL = "http://127.0.0.1:44423/location";

let _onCompanionStatus: ((s: string) => void) | null = null;

export function setCompanionStatusHandler(
  handler: ((s: string) => void) | null
) {
  _onCompanionStatus = handler;
}

function setCompanionStatus(s: string) {
  _onCompanionStatus?.(s);
}

export async function getLocation(useCompanionApp: boolean): Promise<LatLng> {
  if (useCompanionApp) {
    log(`[location] fetching ${COMPANION_URL}`);
    let res: Response;
    try {
      res = await fetch(COMPANION_URL, {
        signal: AbortSignal.timeout(5000),
      });
    } catch (e) {
      log(`[location] fetch error: ${String(e)}`);
      throw e;
    }
    if (res.ok) {
      const data = (await res.json()) as LatLng;
      setCompanionStatus("ok");
      return { latitude: data.latitude, longitude: data.longitude };
    }
    if (res.status === 503) {
      setCompanionStatus("503 no fix");
      throw new Error("GPS signal lost");
    }
    setCompanionStatus(`http ${res.status}`);
    throw new Error(`Companion returned ${res.status}`);
  }

  setCompanionStatus("disabled");
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
