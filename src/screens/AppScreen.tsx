import { useCallback, useEffect, useRef, useState } from "react";
import { EmptyState } from "even-toolkit/web/empty-state";
import { ListItem } from "even-toolkit/web/list-item";
import { Loading } from "even-toolkit/web/loading";
import { Page } from "even-toolkit/web/page";
import { Button } from "even-toolkit/web/button";
import { IcSettings } from "even-toolkit/web/icons/svg-icons";
import type { EvenAppBridge } from "@evenrealities/even_hub_sdk";
import type { Glasses } from "../hooks/useGlasses";
import { getLocation, NoLocationError } from "../location";
import { log, setLogHandler } from "../log";
import { searchVenues, checkin, type Venue } from "../foursquare";

type AppState = "idle" | "loading" | "error" | "ready" | "checking-in";

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
  glasses: Glasses;
  debugEnabled: boolean;
  onLogout: () => void;
  isInEvenHub: boolean;
  onOpenSettings: () => void;
}

export function AppScreen({
  token,
  bridge,
  glasses,
  debugEnabled,
  onLogout,
  isInEvenHub,
  onOpenSettings,
}: AppScreenProps) {
  const [appState, setAppState] = useState<AppState>("idle");
  const [venues, setVenues] = useState<Venue[]>([]);
  const [status, setStatus] = useState("");
  const [debugLog, setDebugLog] = useState<string[]>([]);
  const [debugApiResponse, setDebugApiResponse] = useState("");

  const appStateRef = useRef(appState);
  appStateRef.current = appState;
  const venuesRef = useRef(venues);
  venuesRef.current = venues;

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
    await glasses.show({ kind: "text", text: "Getting location...", menu: true });

    try {
      const { latitude, longitude } = await getLocation(bridge);

      await glasses.show({ kind: "text", text: "Searching venues...", menu: true });

      const { venues: found, debugText } = await searchVenues(
        token,
        latitude,
        longitude
      );
      setDebugApiResponse(debugText);

      if (found.length === 0) {
        setAppState("error");
        setStatus("No venues found nearby");
        await glasses.show({
          kind: "list",
          name: "error",
          items: ["No venues found | Tap to retry"],
          menu: true,
        });
        return;
      }

      setAppState("ready");
      setVenues(found);
      setStatus("");
      await glasses.show({
        kind: "list",
        name: "venues",
        items: found.map((v) => `${v.name} | ${formatDistance(v.distance)}`),
        menu: true,
      });
    } catch (err) {
      if (err instanceof Error && err.message === "UNAUTHORIZED") {
        onLogout();
        return;
      }
      const msg = errorMessage(err);
      setAppState("error");
      setStatus(msg);
      const short = err instanceof NoLocationError ? err.glassesText : msg;
      await glasses.show({
        kind: "list",
        name: "error",
        items: [`${short} | Tap to retry`],
        menu: true,
      });
    }
  }, [token, onLogout, bridge, glasses]);

  const doCheckin = useCallback(
    async (idx: number) => {
      if (appStateRef.current !== "ready") return;
      const venue = venuesRef.current[idx];
      if (!venue) return;

      log(`[state] ${appStateRef.current} → checking-in`);
      setAppState("checking-in");
      setStatus(`Checking in to ${venue.name}...`);
      await glasses.show({ kind: "text", text: `Checking in...\n${venue.name}` });

      try {
        const name = await checkin(token, venue.id);
        setStatus(`Checked in to ${name}!`);
        await glasses.show({ kind: "text", text: `Checked in!\n${name}` });
        glasses.scheduleAutoExit(2000);
      } catch (err) {
        const msg = errorMessage(err);
        setAppState("ready");
        setStatus(`Check-in failed: ${msg}`);
        await glasses.show({ kind: "text", text: `Failed:\n${msg}`, menu: true });
      }
    },
    [token, glasses]
  );

  useEffect(() => {
    glasses.setHandlers({ onVenueSelect: doCheckin, onRetry: loadVenues, onReload: loadVenues });
    return () => glasses.setHandlers({});
  }, [glasses, doCheckin, loadVenues]);

  useEffect(() => {
    loadVenues();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Page>
      {isInEvenHub && (
        <div className="flex justify-end px-4 pt-2">
          <Button size="icon" variant="ghost" onClick={onOpenSettings} aria-label="Settings">
            <IcSettings width={20} height={20} />
          </Button>
        </div>
      )}

      {(appState === "idle" || appState === "loading") && (
        <div className="flex justify-center py-8">
          <Loading />
        </div>
      )}

      {appState === "error" && (
        <EmptyState
          title="Couldn't load venues"
          description={status}
          action={{ label: "Retry", onClick: loadVenues }}
        />
      )}

      {appState === "checking-in" && status && (
        <div className="text-detail text-text-dim text-center py-2 px-4">{status}</div>
      )}

      {(appState === "ready" || appState === "checking-in") && (
        <div className="flex flex-col">
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

      {debugEnabled && debugLog.length > 0 && (
        <div className="mx-4 mt-6 max-h-48 overflow-y-auto bg-surface-light rounded-[6px] p-2 font-mono text-detail text-positive break-all scrollbar-hide">
          {debugLog.map((entry, i) => (
            <div key={i}>{entry}</div>
          ))}
        </div>
      )}

      {debugEnabled && debugApiResponse && (
        <pre className="mx-4 mt-4 text-detail text-text-dim whitespace-pre-wrap break-all font-mono">
          {debugApiResponse}
        </pre>
      )}
    </Page>
  );
}
