const API_BASE = "https://api.foursquare.com/v2";
const API_VERSION = "20231231";
const TOKEN_KEY = "foursquare_access_token";

const REDIRECT_URI = "https://typester.github.io/even-swarm/callback.html";

export function getAuthUrl(clientId: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "token",
    redirect_uri: REDIRECT_URI,
  });
  return `https://foursquare.com/oauth2/authenticate?${params}`;
}

export function openAuthPopup(clientId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = getAuthUrl(clientId);
    const popup = window.open(url, "foursquare_auth", "width=600,height=700");

    if (!popup) {
      reject(new Error("Popup blocked"));
      return;
    }

    const onMessage = (e: MessageEvent) => {
      if (e.data?.access_token) {
        window.removeEventListener("message", onMessage);
        storeToken(e.data.access_token);
        resolve(e.data.access_token);
      }
    };
    window.addEventListener("message", onMessage);

    // タイムアウト or ポップアップが閉じられた場合
    const timer = setInterval(() => {
      if (popup.closed) {
        clearInterval(timer);
        window.removeEventListener("message", onMessage);
        reject(new Error("Auth cancelled"));
      }
    }, 500);
  });
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
