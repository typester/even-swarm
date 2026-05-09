import { useEffect, useState } from "react";
import appJson from "../../app.json";

interface DebugInfoPanelProps {
  companionStatus: string;
}

export function DebugInfoPanel({ companionStatus }: DebugInfoPanelProps) {
  const [geo, setGeo] = useState("geo: checking...");

  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setGeo("geo: API unavailable");
      return;
    }
    navigator.permissions
      .query({ name: "geolocation" })
      .then((perm) => setGeo(`geo: ${perm.state}`))
      .catch(() => setGeo("geo: permissions API unavailable"));
  }, []);

  const redirectUri =
    window.location.origin + window.location.pathname;

  return (
    <div className="mt-6 p-3 bg-surface-light border border-border rounded-[6px] font-mono text-xs text-text-dim break-all">
      <div className="font-semibold text-text-dim mb-1">
        Debug
      </div>
      <div>app version: {appJson.version}</div>
      <div>href: {window.location.href}</div>
      <div>origin: {window.location.origin}</div>
      <div>redirect_uri: {redirectUri}</div>
      <div>{geo}</div>
      <div>companion: {companionStatus}</div>
    </div>
  );
}
