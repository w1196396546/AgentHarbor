import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
const roots = new WeakMap();
// Commit before the controller measures menus, restores focus or scrolls to output.
export function renderView(node, children) {
  let root = roots.get(node);
  if (!root) {
    root = createRoot(node);
    roots.set(node, root);
  }
  flushSync(() => root.render(children));
}
export function clearView(node) {
  if (roots.has(node)) renderView(node, null);
  else node.replaceChildren();
}
