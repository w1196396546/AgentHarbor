import { cn } from "../lib/utils";

// Native modal lifecycle keeps controller cancellation and browser focus restoration atomic.
export function Modal({ className, ...props }) {
  return (
    <dialog
      data-slot="dialog-content"
      className={cn("bg-popover workspace-modal", className)}
      {...props}
    />
  );
}
export function MenuSurface({ className, ...props }) {
  return (
    <div
      data-slot="dropdown-menu-content"
      role="menu"
      className={cn("bg-popover menu", className)}
      {...props}
    />
  );
}
export function SearchField({ children, className, ...props }) {
  return (
    <label
      data-slot="input-group"
      className={cn("workspace-search", className)}
      {...props}
    >
      {children}
    </label>
  );
}
export function Sidebar({ children, ...props }) {
  return (
    <aside data-slot="sidebar-inner" {...props}>
      {children}
    </aside>
  );
}
export function DecisionSurface({ children, ...props }) {
  return (
    <section data-slot="ask-card" {...props}>
      {children}
    </section>
  );
}
