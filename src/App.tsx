import { useEffect, useState } from "react";
import { Button } from "even-toolkit/web/button";
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
      // Load debug mode
      const debugRaw = await storageGet(DEBUG_KEY, b);
      const debug = debugRaw === "true";
      setDebugEnabled(debug);
      setDebugLogEnabled(debug);

      // Handle OAuth callback first
      const callbackToken = handleAuthCallback();
      if (callbackToken) {
        await storageSet(TOKEN_KEY, callbackToken, b);
        setToken(callbackToken);
        setScreen("app");
        return;
      }

      // Load persisted token
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

  const mainTitle = (
    <div>
      <div className="text-large-title">Checkin</div>
      <div className="text-detail text-text-dim">
        Swarm check-in for Even G2
      </div>
    </div>
  );

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
        title={mainTitle}
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

  if (screen === "loading") {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-subtitle text-[color:var(--color-text-dim)]">
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <div className="sticky top-0 z-10 border-b border-border">
        {headerNode}
      </div>
      <div className="flex-1 overflow-y-auto max-w-lg mx-auto w-full">
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
          />
        )}
      </div>
    </div>
  );
}
