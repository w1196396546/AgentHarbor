import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowLeft,
  LogOut,
  Monitor,
  RefreshCw,
  ShieldCheck,
  Unplug,
} from "lucide-react";
import { Button } from "./components/ui/button";
import { Panel } from "./components/ui/panel";
import { Label } from "./components/ui/label";
import { Input } from "./components/ui/input";
import { DeviceConnect } from "./components/DeviceSwitcher";
import "./transport/secure";
import { Tag } from "./components/ui/tag";
import {
  Empty,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "./components/ui/empty";
import { ThemeToggle, applyTheme } from "./theme";
import "./styles/admin.css";
import "./styles/account.css";

function AccountApp() {
  const [account, setAccount] = useState(null),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [factor, setFactor] = useState(""),
    [factorEmail, setFactorEmail] = useState(""),
    [code, setCode] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true);
  async function api(path = "", body) {
    const response = await fetch("/api/account" + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "X-Remote-Request": "1",
        ...(window.RemoteSecure.deviceID()
          ? { "X-Remote-Device": window.RemoteSecure.deviceID() }
          : {}),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
    if (response.status === 204) return;
    const result = await response.json();
    if (!response.ok) {
      if (response.status === 401 && path !== "/login") setAccount(null);
      throw Object.assign(new Error(result.error || "请求失败，请重试。"), {
        status: response.status,
      });
    }
    return result;
  }
  async function refresh() {
    setAccount(await api());
  }
  useEffect(() => {
    refresh()
      .catch((error) => {
        if (error.status !== 401) setNotice(error.message);
      })
      .finally(() => setLoading(false));
  }, []);
  async function run(action) {
    if (busy) return;
    setBusy(true);
    setNotice("");
    try {
      await action();
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="admin-dashboard account-dashboard">
      <section className="admin-main">
        <div className="admin-content">
          <header className="admin-page-heading">
            <div>
              <p className="admin-eyebrow">anywhereToAgent</p>
              <h1>我的设备</h1>
              <p>
                {account
                  ? account.user.username || account.user.email
                  : "使用 FullCupAI 账户管理你的远程设备。"}
              </p>
              {account?.user.username && <p>{account.user.email}</p>}
            </div>
            <ThemeToggle />
          </header>
          <p role="alert" className="admin-notice" hidden={!notice}>
            {notice}
          </p>
          {loading ? (
            <p role="status" className="section-note">
              正在读取账户…
            </p>
          ) : !account ? (
            <Panel
              title="登录 FullCupAI"
              className="admin-section account-login-panel"
            >
              <form
                className="account-login-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  run(async () => {
                    let result;
                    try {
                      result = await api(
                        "/login",
                        factor
                          ? { temp_token: factor, code }
                          : { email, password },
                      );
                    } finally {
                      setPassword("");
                    }
                    if (result.requires_2fa) {
                      setFactor(result.temp_token);
                      setFactorEmail(result.user_email_masked || "");
                      return;
                    }
                    setFactor("");
                    setFactorEmail("");
                    setCode("");
                    await refresh();
                  });
                }}
              >
                {factor ? (
                  <>
                    <p className="account-factor-note">
                      输入 FullCupAI 动态验证码
                      {factorEmail ? "（" + factorEmail + "）" : ""}。
                    </p>
                    <Label htmlFor="account-code">动态验证码</Label>
                    <Input
                      id="account-code"
                      value={code}
                      onChange={(event) => setCode(event.target.value)}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={16}
                      disabled={busy}
                      required
                    />
                  </>
                ) : (
                  <>
                    <Label htmlFor="account-email">邮箱</Label>
                    <Input
                      id="account-email"
                      type="email"
                      autoComplete="username"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      maxLength={320}
                      disabled={busy}
                      required
                    />
                    <Label htmlFor="account-password">密码</Label>
                    <Input
                      id="account-password"
                      type="password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      maxLength={4096}
                      disabled={busy}
                      required
                    />
                  </>
                )}
                <div className="dialog-actions">
                  {factor && (
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => {
                        setFactor("");
                        setFactorEmail("");
                        setCode("");
                      }}
                    >
                      返回
                    </Button>
                  )}
                  <Button type="submit" variant="glass" disabled={busy}>
                    {busy ? "正在登录…" : factor ? "验证并登录" : "登录"}
                  </Button>
                </div>
                <p className="section-note">
                  与 agentTools 使用同一个 FullCupAI 账户。
                </p>
              </form>
            </Panel>
          ) : (
            <>
              <div className="account-toolbar">
                <span>{account.devices.length} 台设备</span>
                {account.current_device && !account.current_device.user_id && (
                  <Button
                    type="button"
                    variant="glass"
                    disabled={busy}
                    onClick={() => run(async () => setAccount(await api("/claim", {})))}
                  >
                    绑定当前设备
                  </Button>
                )}
                <Button
                  type="button"
                  variant="glass"
                  disabled={busy}
                  onClick={() => run(refresh)}
                >
                  <RefreshCw size={16} />
                  刷新
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      await api("/logout", {});
                      setAccount(null);
                    })
                  }
                >
                  <LogOut size={16} />
                  退出登录
                </Button>
              </div>
              <Panel title="远程设备" className="admin-section">
                {account.devices.length ? (
                  account.devices.map((device) => (
                    <Device
                      key={device.id}
                      device={device}
                      busy={busy}
                      save={(body) =>
                        run(async () => {
                          await api("/device", body);
                          await refresh();
                        })
                      }
                    />
                  ))
                ) : (
                  <Empty>
                    <EmptyMedia>
                      <Monitor size={28} />
                    </EmptyMedia>
                    <EmptyTitle>还没有远程设备</EmptyTitle>
                    <EmptyDescription>
                      在电脑上登录相同的 FullCupAI
                      账户并连接远程服务，设备会自动出现在这里。
                    </EmptyDescription>
                  </Empty>
                )}
              </Panel>
            </>
          )}
          <footer className="admin-footnote account-footer">
            <a href="/" className="back-chat">
              <ArrowLeft size={14} />
              返回远程会话
            </a>
            <a href="/admin/" className="back-chat">
              <ShieldCheck size={14} />
              管理员
            </a>
          </footer>
        </div>
      </section>
    </main>
  );
}

function Device({ device, busy, save }) {
  const [name, setName] = useState(device.name),
    [confirm, setConfirm] = useState(false);
  useEffect(() => setName(device.name), [device.name]);
  useEffect(() => {
    if (device.revoked) setConfirm(false);
  }, [device.revoked]);
  return (
    <div className="relay-device account-device">
      <span className="device-illustration">
        <Monitor size={24} />
      </span>
      <div className="relay-device-info">
        <Label htmlFor={"name-" + device.id}>设备名称</Label>
        <Input
          id={"name-" + device.id}
          value={name}
          maxLength={128}
          disabled={busy || device.revoked}
          onChange={(event) => setName(event.target.value)}
        />
        <code>{device.id}</code>
        <p>
          {device.last_seen
            ? "最后连接：" + new Date(device.last_seen).toLocaleString()
            : "尚未连接"}
        </p>
      </div>
      <Tag
        className="device-status"
        data-online={String(device.online && !device.revoked)}
      >
        {device.revoked ? "已撤销" : device.online ? "在线" : "离线"}
      </Tag>
      <div className="account-device-actions">
        <DeviceConnect device={device} disabled={busy} />
        <Button
          type="button"
          variant="ghost"
          disabled={
            busy ||
            device.revoked ||
            name.trim() === device.name ||
            !name.trim()
          }
          onClick={() => save({ id: device.id, name: name.trim() })}
        >
          保存名称
        </Button>
        <Button
          type="button"
          variant={confirm ? "destructive" : "ghost"}
          disabled={busy || device.revoked}
          onClick={() =>
            confirm ? save({ id: device.id, revoke: true }) : setConfirm(true)
          }
        >
          <Unplug size={14} />
          {confirm ? "确认撤销" : "撤销设备"}
        </Button>
        {confirm && (
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => setConfirm(false)}
          >
            取消
          </Button>
        )}
      </div>
      {confirm && (
        <p className="account-revoke-note" role="status">
          撤销后将断开此设备及其浏览器授权，需要在 agentTools 中重新登记。
        </p>
      )}
    </div>
  );
}
applyTheme();
createRoot(document.getElementById("root")).render(<AccountApp />);
