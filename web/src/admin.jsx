import { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowLeft,
  ArrowRight,
  CircleCheck,
  Monitor,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Unplug,
} from "lucide-react";
import { RemoteIcon } from "./components/RemoteIcon";
import { Button } from "./components/ui/button";
import { Panel } from "./components/ui/panel";
import { Label } from "./components/ui/label";
import { Input } from "./components/ui/input";
import {
  Empty,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "./components/ui/empty";
import { Modal } from "./components/workspace-surfaces";
import { Tag } from "./components/ui/tag";
import { ThemeToggle, applyTheme } from "./theme";
import "./styles/admin.css";

function AdminApp() {
  const [state, setState] = useState(null),
    [token, setToken] = useState(""),
    [loginError, setLoginError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [loadError, setLoadError] = useState(""),
    [disableUser, setDisableUser] = useState(null),
    [revoke, setRevoke] = useState(null);
  const generation = useRef(0),
    timer = useRef(),
    dialog = useRef();
  const api = useCallback(async (path, body) => {
    const response = await fetch("/api/admin/" + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "X-Codex-Admin": "1",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
    if (response.status === 401) {
      generation.current++;
      clearTimeout(timer.current);
      setState(null);
      setRevoke(null);
      throw Object.assign(
        new Error(
          path === "login"
            ? "管理凭证无效，请从服务器上的 admin-token 文件获取。"
            : "请重新登录管理页。",
        ),
        { status: response.status },
      );
    }
    if (response.status === 204) return;
    const raw = await response.text();
    if (!response.ok)
      throw new Error(raw.trim().slice(0, 300) || "请求失败，请重试。");
    return JSON.parse(raw);
  }, []);
  const refresh = useCallback(async () => {
    clearTimeout(timer.current);
    const epoch = generation.current;
    const value = await api("state");
    if (epoch !== generation.current) return;
    setState(value);
    timer.current = setTimeout(
      () => refresh().catch((error) => setNotice(error.message)),
      15000,
    );
  }, [api]);
  const loadState = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      await refresh();
    } catch (error) {
      if (error.status !== 401) setLoadError(error.message);
    } finally {
      setLoading(false);
    }
  }, [refresh]);
  useEffect(() => {
    loadState();
    const stop = () => {
      generation.current++;
      clearTimeout(timer.current);
    };
    window.addEventListener("pagehide", stop);
    const resume = (event) => {
      if (event.persisted) refresh().catch((error) => setNotice(error.message));
    };
    window.addEventListener("pageshow", resume);
    return () => {
      stop();
      window.removeEventListener("pagehide", stop);
      window.removeEventListener("pageshow", resume);
    };
  }, [loadState, refresh]);
  useEffect(() => {
    if (revoke && !dialog.current.open) dialog.current.showModal();
    else if (!revoke && dialog.current.open) dialog.current.close();
  }, [revoke]);
  const run = async (action) => {
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
  };
  return (
    <>
      <main id="login" hidden={!!state} className="admin-login">
        <Panel
          title="AgentHarbor"
          actions={<ThemeToggle />}
          className="login-panel"
        >
          <div className="login-content">
            <span className="admin-mark">
              <RemoteIcon name="brand" />
            </span>
            <span className="admin-eyebrow">RELAY CONSOLE</span>
            <h1>管理你的中转服务</h1>
            <p>查看连接状态，管理已登记的电脑。</p>
            {loading ? (
              <p role="status">正在读取管理状态…</p>
            ) : loadError ? (
              <Empty>
                <EmptyTitle>无法读取管理状态</EmptyTitle>
                <EmptyDescription role="alert">{loadError}</EmptyDescription>
                <EmptyDescription>
                  请检查网络连接，然后重新读取管理状态。
                </EmptyDescription>
                <Button type="button" onClick={loadState}>
                  <RefreshCw size={16} />
                  重新读取管理状态
                </Button>
              </Empty>
            ) : (
              <>
                <form
                  id="loginForm"
                  aria-busy={busy}
                  onSubmit={async (event) => {
                    event.preventDefault();
                    if (busy) return;
                    setBusy(true);
                    setLoginError("");
                    try {
                      generation.current++;
                      await api("login", { token: token.trim() });
                      setToken("");
                      await refresh();
                    } catch (error) {
                      setLoginError(error.message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <Label htmlFor="token">管理员凭证</Label>
                  <Input
                    id="token"
                    data-slot="input"
                    type="password"
                    autoComplete="off"
                    required
                    value={token}
                    aria-invalid={!!loginError}
                    aria-describedby={
                      loginError ? "loginError loginHelp" : "loginHelp"
                    }
                    onChange={(event) => {
                      setToken(event.target.value);
                      setLoginError("");
                    }}
                    placeholder="输入 admin-token"
                  />
                  <p id="loginError" role="alert">
                    {loginError}
                  </p>
                  <Button
                    type="submit"
                    variant="default"
                    data-strong
                    disabled={busy}
                  >
                    {busy ? "正在登录…" : "进入控制台"} <ArrowRight size={16} />
                  </Button>
                </form>
                <p id="loginHelp" className="login-note">
                  使用服务器上的 admin-token
                  登录。客户端配对授权码不能用于管理登录。
                </p>
              </>
            )}
            <a className="back-chat" href="/">
              <ArrowLeft size={14} />
              返回远程会话
            </a>
          </div>
        </Panel>
      </main>
      <main id="dashboard" hidden={!state} className="admin-dashboard">
        <aside className="admin-sidebar">
          <a href="/admin/" className="admin-brand">
            <span className="admin-brand-icon">
              <RemoteIcon name="brand" />
            </span>
            <span>
              AgentHarbor<strong>Relay console</strong>
            </span>
          </a>
          <p className="sidebar-caption">服务管理</p>
          <nav>
            <a className="admin-nav" href="#devices">
              <Monitor size={16} />
              连接设备
            </a>
            <a className="admin-nav" href="#users">
              <ShieldCheck size={16} />
              用户管理
            </a>
            <a className="admin-nav" href="#configuration">
              <Settings2 size={16} />
              服务配置
            </a>
            <a className="admin-nav" href="#credentials">
              <ShieldCheck size={16} />
              管理凭证
            </a>
          </nav>
          <div className="admin-sidebar-bottom">
            <a className="back-chat" href="/">
              <ArrowLeft size={15} />
              返回远程会话
            </a>
            <div className="admin-account">
              <span>管理员</span>
              <ThemeToggle />
              <Button
                id="logout"
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    generation.current++;
                    clearTimeout(timer.current);
                    await api("logout", {});
                    setState(null);
                    setRevoke(null);
                  })
                }
              >
                退出登录
              </Button>
            </div>
          </div>
        </aside>
        <section className="admin-main">
          <header className="admin-topbar">
            <span>
              控制台 <span className="separator">/</span> 中转服务
            </span>
            <Tag icon={<CircleCheck size={12} />} className="service-status">
              运行中
            </Tag>
          </header>
          <div className="admin-content">
            <div className="admin-page-heading">
              <div>
                <h1>中转服务概览</h1>
                <p>查看设备连接状态，管理用户与服务配置。</p>
              </div>
              <Button
                id="refresh"
                variant="outline"
                disabled={busy}
                onClick={() => run(refresh)}
              >
                <RefreshCw size={15} />
                刷新
              </Button>
            </div>
            <p
              id="notice"
              className="admin-notice"
              role="status"
              hidden={!notice}
            >
              {notice}
            </p>
            <div className="admin-stats">
              <Panel title="当前在线">
                <strong>
                  {state?.status.online ?? 0}
                  <small>台电脑</small>
                </strong>
                <span className="stat-note">
                  <i />
                  当前客户端连接
                </span>
              </Panel>
              <Panel title="已登记设备">
                <strong>
                  {state?.status.registered ?? 0}
                  <small>台设备</small>
                </strong>
                <span className="stat-note">可信的客户端连接</span>
              </Panel>
              <Panel title="新设备登记">
                <strong className="registration-state">
                  {state?.config.registration_enabled === false
                    ? "已关闭"
                    : "已开启"}
                </strong>
                <span className="stat-note">由服务启动配置管理</span>
              </Panel>
            </div>
            <Panel
              id="devices"
              title="已登记客户端"
              className="admin-section"
              actions={
                <span id="deviceCount">
                  · {state?.status.online ?? 0} 在线 /{" "}
                  {state?.status.registered ?? 0} 台
                </span>
              }
            >
              <div id="deviceList">
                {state?.devices?.length ? (
                  state.devices.map((device) => (
                    <div key={device.id} className="relay-device">
                      <span className="device-illustration">
                        <Monitor size={24} />
                      </span>
                      <div className="relay-device-info">
                        <h2>{device.name || "未命名电脑"}</h2>
                        <code>{device.id}</code>
                        <p>
                          {device.user_id
                            ? "FullCupAI 用户 #" + device.user_id
                            : "旧版未绑定账户"}
                        </p>
                        <p>
                          {device.last_seen
                            ? "最后连接：" +
                              new Date(device.last_seen).toLocaleString()
                            : "尚未连接"}
                        </p>
                      </div>
                      <Tag
                        className="device-status"
                        data-online={String(device.online)}
                      >
                        {device.revoked
                          ? "已撤销"
                          : device.online
                            ? "在线"
                            : "离线"}
                      </Tag>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy || !!device.revoked}
                        onClick={() => setRevoke(device)}
                      >
                        <Unplug size={14} />
                        撤销设备
                      </Button>
                    </div>
                  ))
                ) : (
                  <Empty className="empty-devices">
                    <EmptyMedia>
                      <Monitor size={32} />
                    </EmptyMedia>
                    <EmptyTitle>等待你的第一台电脑</EmptyTitle>
                    <EmptyDescription>
                      在 agentTools 的「远程连接」页面填写本服务地址并连接。
                    </EmptyDescription>
                  </Empty>
                )}
              </div>
            </Panel>
            <Panel id="users" title="FullCupAI 用户" className="admin-section">
              {state?.users?.length ? (
                state.users.map((user) => (
                  <div key={user.id} className="relay-device">
                    <span className="device-illustration">
                      <ShieldCheck size={24} />
                    </span>
                    <div className="relay-device-info">
                      <h2>{user.username || user.email}</h2>
                      <p>
                        {user.email} · #{user.id}
                      </p>
                      <p>
                        {
                          state.devices.filter(
                            (device) => device.user_id === user.id,
                          ).length
                        }{" "}
                        台设备
                      </p>
                      {disableUser === user.id && (
                        <p role="status">
                          停用将断开该用户的设备并撤销浏览器授权。恢复后需重新登录和配对。
                        </p>
                      )}
                    </div>
                    <Tag className="device-status">
                      {user.disabled ? "已停用" : "正常"}
                    </Tag>
                    <Button
                      variant={
                        disableUser === user.id ? "destructive" : "ghost"
                      }
                      disabled={busy}
                      onClick={() => {
                        if (!user.disabled && disableUser !== user.id) {
                          setDisableUser(user.id);
                          return;
                        }
                        run(async () => {
                          setState(
                            await api("user", {
                              id: user.id,
                              disabled: !user.disabled,
                            }),
                          );
                          setDisableUser(null);
                        });
                      }}
                    >
                      {user.disabled
                        ? "恢复用户"
                        : disableUser === user.id
                          ? "确认停用"
                          : "停用用户"}
                    </Button>
                    {disableUser === user.id && (
                      <Button
                        variant="ghost"
                        disabled={busy}
                        onClick={() => setDisableUser(null)}
                      >
                        取消
                      </Button>
                    )}
                  </div>
                ))
              ) : (
                <p className="section-note">
                  用户登录或设备连接后自动同步 FullCupAI 资料。
                </p>
              )}
            </Panel>
            <div className="admin-settings-grid">
              <Panel
                id="configuration"
                title="服务配置"
                className="admin-section"
              >
                <dl id="configValues" className="config-values">
                  {[
                    ["公网地址", state?.config.public_url],
                    ["监听地址", state?.config.listen_address],
                    ["数据目录", state?.config.data_dir],
                    [
                      "接受新客户端",
                      state?.config.registration_enabled === false
                        ? "已关闭"
                        : "已开启",
                    ],
                  ].map(([name, value]) => (
                    <div key={name}>
                      <dt>{name}</dt>
                      <dd>{value || "默认"}</dd>
                    </div>
                  ))}
                </dl>
                <p className="section-note">
                  修改启动配置后，重启中转服务使其生效。
                </p>
              </Panel>
              <Panel
                id="credentials"
                title="管理凭证"
                className="admin-section"
              >
                <div className="credential-content">
                  <ShieldCheck size={22} />
                  <h3>独立的管理员权限</h3>
                  <p>从服务器的私有文件获取凭证。</p>
                  <span>凭证文件</span>
                  <code id="credentialPath">{state?.credential_path}</code>
                </div>
              </Panel>
            </div>
            <footer className="admin-footnote">
              <ShieldCheck size={13} />
              浏览器授权和共享项目由各自的 agentTools 客户端管理。
            </footer>
          </div>
        </section>
      </main>
      <Modal
        ref={dialog}
        id="revokeDialog"
        aria-labelledby="revokeTitle"
        onCancel={(event) => {
          if (busy) event.preventDefault();
          else setRevoke(null);
        }}
        onClose={() => {
          if (!busy) setRevoke(null);
        }}
      >
        <h2 id="revokeTitle">撤销设备连接？</h2>
        <p id="revokeDescription">{revoke?.name || revoke?.id}</p>
        <p>
          设备连接及其所有浏览器授权将失效。需要在 agentTools
          中重新登记设备，才能恢复连接。
        </p>
        <div className="dialog-actions">
          <Button
            id="cancelRevoke"
            variant="ghost"
            disabled={busy}
            onClick={() => setRevoke(null)}
          >
            取消
          </Button>
          <Button
            id="confirmRevoke"
            variant="destructive"
            disabled={busy}
            onClick={() =>
              run(async () => {
                generation.current++;
                clearTimeout(timer.current);
                const value = await api("revoke-device", { id: revoke.id });
                setState(value);
                setRevoke(null);
                await refresh();
              })
            }
          >
            撤销设备
          </Button>
        </div>
      </Modal>
    </>
  );
}
applyTheme();
createRoot(document.getElementById("root")).render(<AdminApp />);
