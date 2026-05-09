import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "even-toolkit/web/button";
import { EmptyState } from "even-toolkit/web/empty-state";
import { ListItem } from "even-toolkit/web/list-item";
import { Loading } from "even-toolkit/web/loading";
import type { EvenAppBridge } from "@evenrealities/even_hub_sdk";
import { useGlasses } from "../hooks/useGlasses";
import { getLocation, setCompanionStatusHandler } from "../location";
import { log, setLogHandler } from "../log";
import { searchVenues, checkin, type Venue } from "../foursquare";

type AppState = "loading" | "error" | "ready" | "checking-in";

function formatDistance(meters: number): string {
  return meters < 1000 ? `${meters}m` : `${(meters / 1000).toFixed(1)}km`;
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "code" in err && "message" in err) {
    const geo = err as GeolocationPositionError;
    return `code=${geo.code} ${geo.message}`;
  }
  return String(err);
}

interface AppScreenProps {
  token: string;
  bridge: EvenAppBridge | null;
  debugEnabled: boolean;
  onLogout: () => void;
  onCompanionStatusChange: (s: string) => void;
}

export function AppScreen({
  token,
  bridge,
  debugEnabled,
  onLogout,
  onCompanionStatusChange,
}: AppScreenProps) {
  const [appState, setAppState] = useState<AppState>("loading");
  const [venues, setVenues] = useState<Venue[]>([]);
  const [status, setStatus] = useState("Loading...");
  const [debugLog, setDebugLog] = useState<string[]>([]);
  const [debugApiResponse, setDebugApiResponse] = useState("");

  const appStateRef = useRef(appState);
  appStateRef.current = appState;
  const venuesRef = useRef(venues);
  venuesRef.current = venues;
  const glassesRef = useRef<ReturnType<typeof useGlasses> | null>(null);

  // Forward companion status up for debug panel
  useEffect(() => {
    setCompanionStatusHandler(onCompanionStatusChange);
    return () => {
      setCompanionStatusHandler(null);
    };
  }, [onCompanionStatusChange]);

  // Register log handler for debug panel
  useEffect(() => {
    setLogHandler((msg) => {
      const entry = `${new Date().toISOString().slice(11, 23)} ${msg}`;
      setDebugLog((prev) => [entry, ...prev].slice(0, 50));
    });
    return () => setLogHandler(null);
  }, []);

  const loadVenues = useCallback(async () => {
    const currentState = appStateRef.current;
    if (currentState === "loading" || currentState === "checking-in") {
      log(`[loadVenues] skip: state=${currentState}`);
      return;
    }
    log("[loadVenues] start");

    setAppState("loading");
    setStatus("Getting location...");
    await glassesRef.current?.showText("Getting location...");

    try {
      const { latitude, longitude } = await getLocation();

      setStatus("Searching venues...");
      await glassesRef.current?.showText("Searching venues...");

      const { venues: found, debugText } = await searchVenues(
        token,
        latitude,
        longitude
      );
      setDebugApiResponse(debugText);

      if (found.length === 0) {
        setAppState("error");
        setStatus("No venues found nearby");
        await glassesRef.current?.showList(["No venues found | Tap to retry"], "error");
        return;
      }

      setAppState("ready");
      setVenues(found);
      setStatus(`Found ${found.length} venues — tap to check in`);
      await glassesRef.current?.showList(
        found.map((v) => `${v.name} | ${formatDistance(v.distance)}`),
        "venues"
      );
    } catch (err) {
      if (err instanceof Error && err.message === "UNAUTHORIZED") {
        onLogout();
        return;
      }
      const msg = errorMessage(err);
      setAppState("error");
      setStatus(`Error: ${msg}`);
      await glassesRef.current?.showList([`${msg} | Tap to retry`], "error");
    }
  }, [token, onLogout]);

  const doCheckin = useCallback(
    async (idx: number) => {
      if (appStateRef.current !== "ready") return;
      const venue = venuesRef.current[idx];
      if (!venue) return;

      log(`[state] ${appStateRef.current} → checking-in`);
      setAppState("checking-in");
      setStatus(`Checking in to ${venue.name}...`);
      await glassesRef.current?.showText(`Checking in...\n${venue.name}`);

      try {
        const name = await checkin(token, venue.id);
        setStatus(`Checked in to ${name}!`);
        await glassesRef.current?.showText(`Checked in!\n${name}`);

        glassesRef.current?.scheduleCheckinCleanup(() => {
          window.location.reload();
        });
      } catch (err) {
        const msg = errorMessage(err);
        setAppState("ready");
        setStatus(`Check-in failed: ${msg}`);
        await glassesRef.current?.showText(`Failed:\n${msg}`);
      }
    },
    [token]
  );

  const glasses = useGlasses({
    bridge,
    onVenueListClick: doCheckin,
    onErrorRetry: loadVenues,
    onForegroundEnter: loadVenues,
  });
  glassesRef.current = glasses;

  // Initial venue load on mount
  useEffect(() => {
    loadVenues();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="px-4 py-4">
      {/* Status + logout row */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-subtitle text-text-dim">
          {status}
        </span>
        <Button size="sm" variant="ghost" onClick={onLogout}>
          Logout
        </Button>
      </div>

      {/* Main content */}
      {appState === "loading" && (
        <div className="flex justify-center py-8">
          <Loading />
        </div>
      )}

      {appState === "error" && (
        <EmptyState
          title="Couldn't load venues"
          description={status.replace("Error: ", "")}
          action={{ label: "Retry", onClick: loadVenues }}
        />
      )}

      {(appState === "ready" || appState === "checking-in") && (
        <div className="flex flex-col gap-2">
          {venues.map((v, i) => (
            <ListItem
              key={v.id}
              title={v.name}
              subtitle={`${v.category} · ${formatDistance(v.distance)}${v.address ? ` · ${v.address}` : ""}`}
              onPress={() => doCheckin(i)}
            />
          ))}
        </div>
      )}

      {/* Debug panels — only visible when debugEnabled */}
      {debugEnabled && debugLog.length > 0 && (
        <div className="mt-6 max-h-48 overflow-y-auto bg-surface-light rounded-[6px] p-2 font-mono text-[10px] text-positive break-all scrollbar-hide">
          {debugLog.map((entry, i) => (
            <div key={i}>{entry}</div>
          ))}
        </div>
      )}

      {debugEnabled && debugApiResponse && (
        <pre className="mt-4 text-[10px] text-text-dim whitespace-pre-wrap break-all font-mono">
          {debugApiResponse}
        </pre>
      )}
    </div>
  );
}
