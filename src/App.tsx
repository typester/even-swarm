import { useEffect, useState } from "react";
import { AppShell } from "even-toolkit/web";
import { Button } from "even-toolkit/web/button";
import { Loading } from "even-toolkit/web/loading";
import { NavHeader } from "even-toolkit/web/nav-header";
import { IcSettings, IcChevronBack } from "even-toolkit/web/icons/svg-icons";
import { waitForEvenAppBridge, type EvenAppBridge } from "@evenrealities/even_hub_sdk";
import { storageGet, storageSet, storageRemove } from "./storage";
import { setDebugLogEnabled } from "./log";
import { handleAuthCallback, TOKEN_KEY } from "./foursquare";
import { LoginScreen } from "./screens/LoginScreen";
import { AppScreen } from "./screens/AppScreen";
import { SettingsScreen } from "./screens/SettingsScreen";

const DEBUG_KEY = "swarm-debug-enabled";

type Screen = "loading" | "login" | "app" | "settings";

export function App() {
  const [bridge, setBridge] = useState<EvenAppBridge | null>(null);
  const [bridgeReady, setBridgeReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [debugEnabled, setDebugEnabled] = useState(false);
  const [screen, setScreen] = useState<Screen>("loading");
  const [previousScreen, setPreviousScreen] = useState<"login" | "app">("login");
  const [companionStatus, setCompanionStatus] = useState("—");

  // Step 1: connect glasses bridge (3s timeout)
  useEffect(() => {
    let cancelled = false;
    Promise.race([
      waitForEvenAppBridge(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
    ]).then((b) => {
      if (!cancelled) {
        setBridge(b as EvenAppBridge | null);
        setBridgeReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Step 2: after bridge ready, load debug mode and token
  useEffect(() => {
    if (!bridgeReady) return;

    async function init(b: EvenAppBridge | null) {
      const debugRaw = await storageGet(DEBUG_KEY, b);
      const debug = debugRaw === "true";
      setDebugEnabled(debug);
      setDebugLogEnabled(debug);

      const callbackToken = handleAuthCallback();
      if (callbackToken) {
        await storageSet(TOKEN_KEY, callbackToken, b);
        setToken(callbackToken);
        setScreen("app");
        return;
      }

      const saved = await storageGet(TOKEN_KEY, b);
      setToken(saved);
      setScreen(saved ? "app" : "login");
    }

    init(bridge).catch(console.error);
  }, [bridgeReady, bridge]);

  const openSettings = () => {
    setPreviousScreen(screen === "settings" ? previousScreen : (screen as "login" | "app"));
    setScreen("settings");
  };

  const goBack = () => setScreen(previousScreen);

  const handleLogout = async () => {
    await storageRemove(TOKEN_KEY, bridge);
    setToken(null);
    setScreen("login");
  };

  const handleDebugToggle = async (enabled: boolean) => {
    await storageSet(DEBUG_KEY, String(enabled), bridge);
    setDebugEnabled(enabled);
    setDebugLogEnabled(enabled);
  };

  if (screen === "loading") {
    return (
      <div className="h-dvh flex items-center justify-center bg-bg">
        <Loading />
      </div>
    );
  }

  const headerNode =
    screen === "settings" ? (
      <NavHeader
        title="Settings"
        left={
          <Button size="icon" variant="ghost" onClick={goBack} aria-label="Back">
            <IcChevronBack width={20} height={20} />
          </Button>
        }
      />
    ) : (
      <NavHeader
        title="Checkin"
        right={
          <Button
            size="icon"
            variant="ghost"
            onClick={openSettings}
            aria-label="Settings"
          >
            <IcSettings width={20} height={20} />
          </Button>
        }
      />
    );

  return (
    <AppShell header={headerNode}>
      {screen === "login" && (
        <LoginScreen
          debugEnabled={debugEnabled}
          companionStatus={companionStatus}
        />
      )}
      {screen === "app" && token && (
        <AppScreen
          token={token}
          bridge={bridge}
          debugEnabled={debugEnabled}
          onLogout={handleLogout}
          onCompanionStatusChange={setCompanionStatus}
        />
      )}
      {screen === "settings" && (
        <SettingsScreen
          debugEnabled={debugEnabled}
          onToggle={handleDebugToggle}
          onLogout={handleLogout}
        />
      )}
    </AppShell>
  );
}
