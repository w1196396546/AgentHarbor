import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import "./i18n";
import "./transport/secure";
import "./styles/remote.css";
import { RemoteApp } from "./RemoteApp";
import { startRemote } from "./controller";
import { startSidebar } from "./sidebar";
import { applyTheme } from "./theme";
applyTheme();
flushSync(() =>
  createRoot(document.getElementById("root")).render(<RemoteApp />),
);
startRemote();
startSidebar();
