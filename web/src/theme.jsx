import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "./components/ui/button";

const themeKey = "codex.remote.theme";

export const currentTheme = () =>
  document.documentElement.classList.contains("dark") ? "dark" : "light";

function subscribe(listener) {
  window.addEventListener("remote-theme", listener);
  return () => window.removeEventListener("remote-theme", listener);
}

export function applyTheme(theme) {
  if (!theme) {
    try {
      theme = localStorage.getItem(themeKey);
    } catch {}
  }
  theme = theme === "light" ? "light" : "dark";
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.removeAttribute("data-style");
  document.documentElement.style.colorScheme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", theme === "dark" ? "#0c1015" : "#ffffff");
  try {
    localStorage.removeItem("codex.remote.style");
    localStorage.setItem(themeKey, theme);
  } catch {}
  window.dispatchEvent(new Event("remote-theme"));
  return theme;
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, currentTheme);
  const label = /^(zh|ja)/.test(document.documentElement.lang)
    ? "切换外观 / Theme"
    : "Switch appearance";
  return (
    <Button
      className="icon-button theme-toggle"
      variant="ghost"
      type="button"
      aria-label={label}
      title={label}
      onClick={() => applyTheme(theme === "dark" ? "light" : "dark")}
    >
      {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
    </Button>
  );
}
