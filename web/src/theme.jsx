import { useState, useRef, useEffect, useSyncExternalStore } from "react";
import { Moon, Sun, Palette, Check } from "lucide-react";
import { Button } from "./components/ui/button";

const themeKey = "codex.remote.theme";
const styleKey = "codex.remote.style";

export const STYLES = [
  {
    id: "liquid",
    name: "Liquid Glass",
    nameZh: "Apple 液态玻璃",
    desc: "macOS 拟态美学 · 流光磨砂 · 纯净通透",
    color: "#2997ff",
  },
  {
    id: "cursor",
    name: "Cursor",
    nameZh: "Cursor 极客",
    desc: "高精 IDE 质感 · 科技青蓝 · 紧凑锐利",
    color: "#38bdf8",
  },
  {
    id: "claude",
    name: "Claude",
    nameZh: "Claude 暖雅",
    desc: "经典暖雅陶色 · 柔和圆角 · 舒适排版",
    color: "#e07a5f",
  },
  {
    id: "codex",
    name: "Codex",
    nameZh: "Codex 黑曜石",
    desc: "黑曜石极客风 · 荧光翠绿 · 终端美学",
    color: "#10b981",
  },
  {
    id: "minimal",
    name: "Minimal",
    nameZh: "Minimal 极简",
    desc: "高对比极简黑白 · 纯净无干扰",
    color: "#a1a1aa",
  },
];

export const currentTheme = () =>
  document.documentElement.classList.contains("dark") ? "dark" : "light";

export const currentStyle = () =>
  document.documentElement.getAttribute("data-style") || "cursor";

function subscribe(listener) {
  window.addEventListener("remote-theme", listener);
  return () => window.removeEventListener("remote-theme", listener);
}

export function applyStyle(style) {
  if (!style) {
    try {
      style = localStorage.getItem(styleKey);
    } catch {}
  }
  if (!STYLES.some((s) => s.id === style)) style = "cursor";
  document.documentElement.setAttribute("data-style", style);
  try {
    localStorage.setItem(styleKey, style);
  } catch {}
  window.dispatchEvent(new Event("remote-theme"));
  return style;
}

export function applyTheme(theme) {
  if (!theme) {
    try {
      theme = localStorage.getItem(themeKey);
    } catch {}
  }
  theme = theme === "light" ? "light" : "dark";
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", theme === "dark" ? "#0d0e12" : "#f8fafc");

  if (!document.documentElement.getAttribute("data-style")) {
    applyStyle();
  }
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
          localStorage.setItem(themeKey, next);
        } catch {}
      }}
    >
      {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
    </Button>
  );
}

export function StyleToggle() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const current = useSyncExternalStore(subscribe, currentStyle);
  const isZh = /^(zh|ja)/.test(document.documentElement.lang);
  const found = STYLES.find((s) => s.id === current) || STYLES[0];

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    const handleEsc = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [open]);

  const label = isZh
    ? `主题风格: ${found.nameZh}`
    : `Theme style: ${found.name}`;

  return (
    <div className="style-toggle-container" ref={containerRef}>
      <Button
        className="icon-button style-toggle"
        variant="ghost"
        type="button"
        aria-label={label}
        title={label}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((prev) => !prev)}
      >
        <Palette size={16} />
      </Button>

      {open && (
        <div
          className="style-dropdown"
          role="menu"
          aria-label={isZh ? "选择主题风格" : "Select Theme Style"}
        >
          <div className="style-dropdown-header">
            {isZh ? "选择主题风格" : "Select Theme Style"}
          </div>
          {STYLES.map((item) => {
            const isSelected = item.id === current;
            return (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                className="style-option"
                data-active={isSelected}
                onClick={() => {
                  applyStyle(item.id);
                  setOpen(false);
                }}
              >
                <span
                  className="style-dot"
                  style={{ backgroundColor: item.color }}
                />
                <div className="style-option-text">
                  <span className="style-option-name">
                    {isZh ? item.nameZh : item.name}
                  </span>
                  <span className="style-option-desc">{item.desc}</span>
                </div>
                {isSelected && (
                  <Check size={14} className="style-option-check" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
