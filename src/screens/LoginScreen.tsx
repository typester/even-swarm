import { Button } from "even-toolkit/web/button";
import { Page } from "even-toolkit/web/page";
import { IcSettings } from "even-toolkit/web/icons/svg-icons";
import { DebugInfoPanel } from "../components/DebugInfoPanel";
import * as foursquare from "../foursquare";

const FOURSQUARE_CLIENT_ID = import.meta.env.VITE_FOURSQUARE_CLIENT_ID as string;

interface LoginScreenProps {
  debugEnabled: boolean;
  companionStatus: string;
  isInEvenHub: boolean;
  onOpenSettings: () => void;
}

export function LoginScreen({ debugEnabled, companionStatus, isInEvenHub, onOpenSettings }: LoginScreenProps) {
  return (
    <Page>
      {isInEvenHub && (
        <div className="flex justify-end px-4 pt-2">
          <Button size="icon" variant="ghost" onClick={onOpenSettings} aria-label="Settings">
            <IcSettings width={20} height={20} />
          </Button>
        </div>
      )}
      <div className="flex flex-col items-center px-4 py-8">
        <p className="text-normal-body text-text-dim mb-6 text-center">
          Connect your Foursquare account to check in from your glasses.
        </p>
        <Button
          variant="highlight"
          onClick={() => foursquare.redirectToAuth(FOURSQUARE_CLIENT_ID)}
        >
          Login with Foursquare
        </Button>
        {debugEnabled && <DebugInfoPanel companionStatus={companionStatus} />}
      </div>
    </Page>
  );
}
