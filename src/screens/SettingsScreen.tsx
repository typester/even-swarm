import { Toggle } from "even-toolkit/web/toggle";
import { SettingsGroup } from "even-toolkit/web/settings-group";

interface SettingsScreenProps {
  debugEnabled: boolean;
  onToggle: (enabled: boolean) => void;
}

export function SettingsScreen({ debugEnabled, onToggle }: SettingsScreenProps) {
  return (
    <div className="px-4 py-4">
      <SettingsGroup label="Debug">
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <div className="text-normal-title">Debug mode</div>
            <div className="text-detail text-text-dim mt-0.5">
              Shows version info, event log, and API response panels.
            </div>
          </div>
          <Toggle checked={debugEnabled} onChange={onToggle} />
        </div>
      </SettingsGroup>
    </div>
  );
}
