import { Button } from "even-toolkit/web/button";
import { Page } from "even-toolkit/web/page";
import { DebugInfoPanel } from "../components/DebugInfoPanel";
import * as foursquare from "../foursquare";

const FOURSQUARE_CLIENT_ID = import.meta.env.VITE_FOURSQUARE_CLIENT_ID as string;

interface LoginScreenProps {
  debugEnabled: boolean;
  companionStatus: string;
}

export function LoginScreen({ debugEnabled, companionStatus }: LoginScreenProps) {
  return (
    <Page>
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
