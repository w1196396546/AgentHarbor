import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, Monitor, Plus } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Modal } from "./workspace-surfaces";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "./ui/dropdown-menu";

export function DeviceSwitcher({ pairRequested = false }) {
  const id = useId(),
    dialog = useRef(),
    [devices, setDevices] = useState([]),
    [open, setOpen] = useState(
      () =>
        pairRequested &&
        window.RemoteSecure.available() &&
        new URLSearchParams(location.search).get("pair") === "1",
    ),
    [code, setCode] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const t = (value) =>
    window.REMOTE_I18N?.[document.documentElement.lang]?.[value] || value;
  useEffect(() => {
    const refresh = () => {
      try {
        setDevices(window.RemoteSecure.devices());
      } catch (error) {
        setError(error.message);
      }
    };
    refresh();
    window.addEventListener("remote-devices-changed", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("remote-devices-changed", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  useEffect(() => {
    if (open && !dialog.current.open) dialog.current.showModal();
    else if (!open && dialog.current.open) dialog.current.close();
  }, [open]);
  return (
    <div className="device-switcher" hidden={!devices.length}>
      <Label htmlFor={id + "-computer"}>
        <Monitor size={14} />
        <span data-t="Computer">{t("Computer")}</span>
      </Label>
      <div className="device-switcher-controls">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                id={id + "-computer"}
                className="device-switcher-trigger"
                aria-label={t("Switch computer")}
              />
            }
          >
            <span>
              {devices.find(
                (device) => device.device_id === window.RemoteSecure.deviceID(),
              )?.name ||
                devices
                  .find(
                    (device) =>
                      device.device_id === window.RemoteSecure.deviceID(),
                  )
                  ?.device_id.slice(0, 8) ||
                t("Choose a computer")}
            </span>
            <ChevronDown size={14} />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {devices.map((device) => (
              <DropdownMenuItem
                key={device.device_id}
                onClick={() => {
                  try {
                    window.RemoteSecure.select(device.device_id);
                    location.assign("/");
                  } catch (error) {
                    setError(error.message);
                  }
                }}
              >
                <span>{device.name || device.device_id.slice(0, 8)}</span>
                {window.RemoteSecure.deviceID() === device.device_id && (
                  <Check size={14} />
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t("Pair another computer")}
          onClick={() => {
            setError("");
            setOpen(true);
          }}
        >
          <Plus size={15} />
        </Button>
      </div>
      <p role="alert" className="device-switcher-error" hidden={!error || open}>
        {t(error)}
      </p>
      <Modal
        ref={dialog}
        aria-labelledby={id + "-title"}
        onCancel={(event) => {
          if (busy) event.preventDefault();
          else setOpen(false);
        }}
        onClose={() => {
          if (!busy) {
            setOpen(false);
            setCode("");
          }
        }}
      >
        <form
          className="device-pair-form"
          onSubmit={async (event) => {
            event.preventDefault();
            if (busy) return;
            setBusy(true);
            setError("");
            try {
              await window.RemoteSecure.pair(code.trim());
              setCode("");
              location.assign("/");
            } catch (error) {
              setError(error.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <h2 id={id + "-title"} data-t="Pair another computer">
            {t("Pair another computer")}
          </h2>
          <Label htmlFor={id + "-key"} data-t="Authorization code">
            {t("Authorization code")}
          </Label>
          <Input
            id={id + "-key"}
            value={code}
            onChange={(event) => setCode(event.target.value)}
            type="password"
            autoComplete="off"
            spellCheck={false}
            autoCapitalize="off"
            maxLength={160}
            disabled={busy}
            required
          />
          <p role="alert" hidden={!error}>
            {t(error)}
          </p>
          <div className="dialog-actions">
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => setOpen(false)}
              data-t="Cancel"
            >
              {t("Cancel")}
            </Button>
            <Button
              type="submit"
              variant="glass"
              disabled={busy}
              data-t="Pair browser"
            >
              {t("Pair browser")}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export function DeviceConnect({ device, disabled }) {
  const [error, setError] = useState("");
  let remembered = false;
  try {
    remembered = window.RemoteSecure.devices().some(
      (value) => value.device_id === device.id,
    );
  } catch {}
  return remembered ? (
    <>
      <Button
        type="button"
        variant="glass"
        disabled={disabled || device.revoked}
        onClick={() => {
          try {
            window.RemoteSecure.select(device.id);
            location.assign("/");
          } catch (error) {
            setError(error.message);
          }
        }}
      >
        连接
      </Button>
      {error && <p role="alert">{error}</p>}
    </>
  ) : (
    !device.revoked && (
      <a href="/?pair=1" className="back-chat">
        配对此浏览器
      </a>
    )
  );
}
