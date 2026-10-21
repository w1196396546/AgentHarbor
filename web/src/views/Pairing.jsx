import { Button } from "../components/ui/button";
import { Panel } from "../components/ui/panel";
import { Label } from "../components/ui/label";
import { Input } from "../components/ui/input";
import { ThemeToggle } from "../theme";
import { DeviceSwitcher } from "../components/DeviceSwitcher";

export function Pairing() {
  return (
    <>
      <div id="notice" role="status" aria-live="polite"></div>
      <Panel
        id="pair"
        title="anywhereToAgent"
        actions={<ThemeToggle />}
        hidden
        className="pair-card"
      >
        <div className="pair-mark" data-icon="codex"></div>
        <p className="eyebrow">anywhereToAgent</p>
        <h1 data-t="Your computer, within reach."></h1>
        <p data-t="Scan the QR code on the remote connection page in agentTools, or enter its authorization code."></p>
        <DeviceSwitcher />
        <form id="pairForm">
          <Label htmlFor="pairKey" data-t="Authorization code"></Label>
          <Input
            id="pairKey"
            type="password"
            autoComplete="off"
            required
            maxLength="160"
            spellCheck="false"
            autoCapitalize="off"
          />
          <Button
            variant="glass"
            type="submit"
            className="primary"
            data-t="Pair browser"
          ></Button>
        </form>
        <p
          className="pair-note"
          data-t="This browser stays authorized for 30 days. You can revoke it at any time in agentTools."
        ></p>
        <a
          className="pair-admin"
          href="/account"
          data-t="My account and devices"
        ></a>
      </Panel>
    </>
  );
}
