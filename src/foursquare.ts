const API_BASE = "https://api.foursquare.com/v2";
const API_VERSION = "20231231";
const TOKEN_KEY = "swarm_access_token";

export function getAuthUrl(clientId: string): string {
  const redirectUri = window.location.origin + window.location.pathname;
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "token",
    redirect_uri: redirectUri,
  });
  return `https://foursquare.com/oauth2/authenticate?${params}`;
}

export function handleAuthCallback(): string | null {
  const hash = window.location.hash;
  if (!hash) return null;
  const params = new URLSearchParams(hash.slice(1));
  const token = params.get("access_token");
  if (token) {
    storeToken(token);
    history.replaceState(null, "", window.location.pathname);
  }
  return token;
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function storeToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export interface Venue {
  id: string;
  name: string;
  category: string;
  distance: number;
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
    if (data.meta?.code === 401) {
      clearToken();
      window.location.reload();
    }
    throw new Error(data.meta?.errorDetail || "Venue search failed");
  }

  return data.response.venues.map((v: any) => ({
    id: v.id,
    name: v.name,
    category:
      v.categories?.[0]?.shortName || v.categories?.[0]?.name || "",
    distance: v.location?.distance ?? 0,
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
