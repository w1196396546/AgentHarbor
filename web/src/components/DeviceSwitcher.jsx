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
    [statuses, setStatuses] = useState({}),
    [connection, setConnection] = useState("Checking…"),
    checks = useRef(),
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
    const update = (event) => {
      const device = event.detail;
      if (device?.id) {
        setStatuses((previous) => ({
          ...previous,
          [device.id]: device.online,
        }));
        if (device.connection) setConnection(device.connection);
      }
    };
    window.addEventListener("remote-device-status", update);
    return () => {
      window.removeEventListener("remote-device-status", update);
      checks.current?.abort();
    };
  }, []);
  async function refreshStatuses() {
    checks.current?.abort();
    const controller = new AbortController();
    checks.current = controller;
    const timeout = setTimeout(() => controller.abort(), 10000);
    setStatuses((previous) =>
      Object.fromEntries(
        devices.map((device) => [
          device.device_id,
          device.device_id === window.RemoteSecure.deviceID()
            ? previous[device.device_id]
            : undefined,
        ]),
      ),
    );
    await Promise.allSettled(
      devices.map(async (device) => {
        try {
          const response = await fetch("/api/device", {
            headers: { "X-Remote-Device": device.device_id },
            cache: "no-store",
            signal: controller.signal,
          });
          if (!response.ok) return;
          const value = await response.json();
          if (
            controller.signal.aborted ||
            value.id !== device.device_id ||
            typeof value.online !== "boolean"
          )
            return;
          setStatuses((previous) => ({
            ...previous,
            [device.device_id]: value.online === true,
          }));
        } catch {}
      }),
    );
    clearTimeout(timeout);
  }
  const selected = devices.find(
      (device) => device.device_id === window.RemoteSecure.deviceID(),
    ),
    statusText = (online) =>
      online === true ? "Online" : online === false ? "Offline" : "Checking…";
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
        <DropdownMenu
          onOpenChange={(isOpen) => {
            if (isOpen) refreshStatuses();
            else checks.current?.abort();
          }}
        >
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
            <span className="device-switcher-selection">
              <span className="device-switcher-name">
                <i
                  className="device-online-dot"
                  data-online={String(statuses[selected?.device_id])}
                  aria-hidden="true"
                />
                <span id={pairRequested ? "deviceName" : undefined}>
                  {selected?.name ||
                    selected?.device_id.slice(0, 8) ||
                    t("Choose a computer")}
                </span>
              </span>
              <span
                id={pairRequested ? "connectionLabel" : undefined}
                data-t={connection}
              >
                {t(connection)}
              </span>
            </span>
            <ChevronDown size={14} />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {devices.map((device) => (
              <DropdownMenuItem
                key={device.device_id}
                className="device-switcher-option"
                onClick={() => {
                  try {
                    window.RemoteSecure.select(device.device_id);
                    location.assign("/");
                  } catch (error) {
                    setError(error.message);
                  }
                }}
              >
                <i
                  className="device-online-dot"
                  data-online={String(statuses[device.device_id])}
                  aria-hidden="true"
                />
                <span className="device-switcher-option-name">
                  {device.name || device.device_id.slice(0, 8)}
                </span>
                <span
                  className="device-switcher-option-status"
                  data-t={statusText(statuses[device.device_id])}
                >
                  {t(statusText(statuses[device.device_id]))}
                </span>
                {window.RemoteSecure.deviceID() === device.device_id && (
                  <Check size={14} />
                )}
              </DropdownMenuItem>
            ))}
            <DropdownMenuItem
              onClick={() =>
                document.getElementById("deviceDialog").showModal()
              }
            >
              {t("Connected computer")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="icon-button"
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
