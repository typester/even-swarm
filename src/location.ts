export type LatLng = { latitude: number; longitude: number };

const COMPANION_URL = "http://127.0.0.1:38080/location";

let _onCompanionStatus: ((s: string) => void) | null = null;

export function setCompanionStatusHandler(
  handler: ((s: string) => void) | null
) {
  _onCompanionStatus = handler;
}

function setCompanionStatus(s: string) {
  _onCompanionStatus?.(s);
}

export async function getLocation(): Promise<LatLng> {
  try {
    const res = await fetch(COMPANION_URL, {
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = (await res.json()) as LatLng;
      setCompanionStatus("ok");
      return { latitude: data.latitude, longitude: data.longitude };
    }
    if (res.status === 503) {
      setCompanionStatus("503 no fix");
      throw new Error("No GPS fix available");
    }
    setCompanionStatus(`http ${res.status}`);
    throw new Error(`Companion returned ${res.status}`);
  } catch (err) {
    if (
      err instanceof Error &&
      err.message !== "No GPS fix available" &&
      !err.message.startsWith("Companion")
    ) {
      const name = err.name;
      setCompanionStatus(`unreachable (${name}), trying geolocation`);
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
    throw err;
  }
}
