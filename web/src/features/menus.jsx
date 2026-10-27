import { renderView, clearView } from "../render";
import { RemoteIcon as Icon } from "../components/RemoteIcon";

export function createMenus({ $, t, ownerEpoch, Action, canConfigure }) {
  function renderPlan(plan) {
    $("planProgress").hidden = !plan?.plan?.length;
    renderView(
      $("planProgress"),
      plan?.plan?.length ? (
        <div className="plan-progress">
          <h3>{t("Current plan")}</h3>
          {plan.explanation && <p>{plan.explanation}</p>}
          {plan.plan.map((step, index) => (
            <div key={index} className="plan-step" data-state={step.status}>
              <Icon
                name={
                  step.status === "completed"
                    ? "check"
                    : step.status === "inProgress"
                      ? "clock"
                      : "plan"
                }
              />
              <span>{step.step}</span>
            </div>
          ))}
        </div>
      ) : null,
    );
  }
  function closeMenu() {
    const trigger = $("menu")._trigger;
    $("menu").hidden = true;
    clearView($("menu"));
    if (trigger) trigger.setAttribute("aria-expanded", "false");
    $("menu")._trigger = null;
  }
  function showMenu(trigger, entries) {
    const epoch = ownerEpoch(),
      configuration = [
        "model",
        "effort",
        "reasoningModel",
        "mode",
        "permission",
      ].includes(trigger.id);
    closeMenu();
    const menu = $("menu");
    menu._trigger = trigger;
    renderView(
      menu,
      entries.map((entry, index) =>
        entry.heading ? (
          <div key={index} className="menu-section">
            {t(entry.heading)}
          </div>
        ) : entry.note ? (
          <p key={index} className="menu-note">
            {t(entry.note)}
          </p>
        ) : (
          <Action
            key={index}
            role="menuitemradio"
            aria-checked={!!entry.selected}
            disabled={entry.disabled}
            aria-disabled={entry.disabled || undefined}
            title={entry.reason ? t(entry.reason) : undefined}
            action={async () => {
              if (
                entry.disabled ||
                (configuration && (!canConfigure() || epoch !== ownerEpoch()))
              )
                return;
              closeMenu();
              await entry.action();
              trigger.focus({ preventScroll: true });
            }}
          >
            <Icon name={entry.selected ? "check" : entry.icon || "file"} />
            <span className="menu-copy">
              <span>{t(entry.label)}</span>
              {entry.description && <small>{t(entry.description)}</small>}
              {entry.reason && (
                <small className="menu-reason">{t(entry.reason)}</small>
              )}
            </span>
          </Action>
        ),
      ),
    );
    menu.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    const rect = trigger.getBoundingClientRect(),
      width = Math.min(340, innerWidth - 24);
    menu.style.width = width + "px";
    menu.style.left =
      Math.max(12, Math.min(innerWidth - width - 12, rect.left)) + "px";
    menu.style.top = Math.max(12, rect.top - menu.offsetHeight - 9) + "px";
    if (rect.top < menu.offsetHeight + 25)
      menu.style.top =
        Math.min(innerHeight - menu.offsetHeight - 12, rect.bottom + 8) + "px";
    menu.querySelector("button:not(:disabled)")?.focus({ preventScroll: true });
  }

  return { showMenu, closeMenu, renderPlan };
}
