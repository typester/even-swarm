const API_BASE = "https://api.foursquare.com/v2";
const API_VERSION = "20231231";
export const TOKEN_KEY = "foursquare_access_token";

const REDIRECT_URI = "https://typester.github.io/even-swarm/callback.html";

export function getAuthUrl(clientId: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "token",
    redirect_uri: REDIRECT_URI,
    state: window.location.href,
  });
  return `https://foursquare.com/oauth2/authenticate?${params}`;
}

export function redirectToAuth(clientId: string): void {
  window.location.href = getAuthUrl(clientId);
}

export function handleAuthCallback(): string | null {
  const hash = window.location.hash;
  if (!hash) return null;
  const params = new URLSearchParams(hash.slice(1));
  const token = params.get("access_token");
  if (token) {
    history.replaceState(null, "", window.location.pathname);
  }
  return token;
}

export interface Venue {
  id: string;
  name: string;
  category: string;
  distance: number;
  address: string;
}

export async function searchVenues(
  token: string,
  lat: number,
  lng: number
): Promise<Venue[]> {
  const params = new URLSearchParams({
    ll: `${lat},${lng}`,
    oauth_token: token,
    v: API_VERSION,
    limit: "10",
    intent: "checkin",
  });

  const res = await fetch(`${API_BASE}/venues/search?${params}`);
  const data = await res.json();

  if (data.meta?.code !== 200) {
    if (data.meta?.code === 401) throw new Error("UNAUTHORIZED");
    throw new Error(data.meta?.errorDetail || "Venue search failed");
  }

  const debugEl = document.getElementById("debug-api-response");
  if (debugEl) {
    const curl = `curl "${API_BASE}/venues/search?ll=${lat},${lng}&oauth_token=${token}&v=${API_VERSION}&limit=10&intent=checkin"`;
    debugEl.textContent = curl + "\n\n" + JSON.stringify(data.response, null, 2);
  }

  return data.response.venues.map((v: any) => ({
    id: v.id,
    name: v.name,
    category:
      v.categories?.[0]?.shortName || v.categories?.[0]?.name || "",
    distance: v.location?.distance ?? 0,
    address: [v.location?.address, v.location?.city].filter(Boolean).join(", "),
  }));
}

export async function checkin(
  token: string,
  venueId: string
): Promise<string> {
  const params = new URLSearchParams({
    venueId,
    oauth_token: token,
    v: API_VERSION,
  });

  // Use query params (not body) to avoid CORS preflight
  const res = await fetch(`${API_BASE}/checkins/add?${params}`, {
    method: "POST",
  });
  const data = await res.json();

  if (data.meta?.code !== 200) {
    throw new Error(data.meta?.errorDetail || "Check-in failed");
  }

  return data.response.checkin.venue?.name || "Unknown venue";
}
