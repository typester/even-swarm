import { Button } from "even-toolkit/web/button";
import { Page } from "even-toolkit/web/page";
import { Toggle } from "even-toolkit/web/toggle";
import { SettingsGroup } from "even-toolkit/web/settings-group";
import { IcChevronBack } from "even-toolkit/web/icons/svg-icons";
import appJson from "../../app.json";

interface SettingsScreenProps {
  debugEnabled: boolean;
  onToggle: (enabled: boolean) => void;
  onLogout: () => void;
  isInEvenHub: boolean;
  onBack: () => void;
}

export function SettingsScreen({ debugEnabled, onToggle, onLogout, isInEvenHub, onBack }: SettingsScreenProps) {
  return (
    <Page>
      {isInEvenHub && (
        <div className="flex justify-start px-4 pt-2">
          <Button size="icon" variant="ghost" onClick={onBack} aria-label="Back">
            <IcChevronBack width={20} height={20} />
          </Button>
        </div>
      )}
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

        <div className="mt-6 text-center text-detail text-text-dim">
          v{appJson.version}
        </div>
      </div>
    </Page>
  );
}
