import { AlertTriangle, Plus, Search, RefreshCw, Folder, ChevronDown, LogOut, PanelLeft, FileDiff, File, Pencil, X, ListTodo, ShieldCheck, Square, ArrowUp, ArrowDown, CircleHelp, Check, Clock, Terminal, Brain, Wrench, Globe, Copy, Image, Link, ExternalLink, Bot, Settings, ArrowLeft, Download, Pin, Sparkles } from "lucide-react";

function BrandIcon(props) {
  return <img src="/icon.svg" alt="" {...props} />;
}

const icons = {
  warning: AlertTriangle,
  brand: BrandIcon,
  codex: BrandIcon,
  claude: Sparkles,
  plus: Plus,
  search: Search,
  refresh: RefreshCw,
  folder: Folder,
  chevron: ChevronDown,
  logout: LogOut,
  sidebar: PanelLeft,
  diff: FileDiff,
  file: File,
  edit: Pencil,
  close: X,
  plan: ListTodo,
  shield: ShieldCheck,
  stop: Square,
  up: ArrowUp,
  down: ArrowDown,
  question: CircleHelp,
  check: Check,
  clock: Clock,
  terminal: Terminal,
  brain: Brain,
  tool: Wrench,
  globe: Globe,
  copy: Copy,
  image: Image,
  link: Link,
  external: ExternalLink,
  agent: Bot,
  settings: Settings,
  back: ArrowLeft,
  download: Download,
  pin: Pin,
};
export function RemoteIcon({ name, className = "", ...props }) {
  const Icon = icons[name] || File;
  return <Icon className={`icon ${className}`} aria-hidden="true" {...props} />;
}
