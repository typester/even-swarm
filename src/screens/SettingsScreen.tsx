import { Button } from "even-toolkit/web/button";
import { Page } from "even-toolkit/web/page";
import { Toggle } from "even-toolkit/web/toggle";
import { SettingsGroup } from "even-toolkit/web/settings-group";

interface SettingsScreenProps {
  debugEnabled: boolean;
  onToggle: (enabled: boolean) => void;
  onLogout: () => void;
}

export function SettingsScreen({ debugEnabled, onToggle, onLogout }: SettingsScreenProps) {
  return (
    <Page>
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

        <div className="mt-6">
          <Button variant="danger" className="w-full" onClick={onLogout}>
            Logout
          </Button>
        </div>
      </div>
    </Page>
  );
}
