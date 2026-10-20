import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "./components/ui/button";
const key = "codex.remote.theme";
const currentTheme = () =>
  document.documentElement.classList.contains("dark") ? "dark" : "light";
function subscribe(listener) {
  window.addEventListener("remote-theme", listener);
  return () => window.removeEventListener("remote-theme", listener);
}
export function applyTheme(theme) {
  if (!theme) {
    try {
      theme = localStorage.getItem(key);
    } catch {}
  }
  theme = theme === "light" ? "light" : "dark";
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", theme === "dark" ? "#18191b" : "#f4f4f5");
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
      onClick={() => {
        const next = theme === "dark" ? "light" : "dark";
        applyTheme(next);
        try {
          localStorage.setItem(key, next);
        } catch {}
      }}
    >
      {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
    </Button>
  );
}
