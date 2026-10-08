// Shadow-rooted host for all in-page UI, isolated from the provider page's styles.

import { createIcon } from "../shared/icon";
import css from "./styles/content.scss?inline";

const HOST_ID = "thingport-grab-host";

let shadowRoot: ShadowRoot | null = null;
let panelEl: HTMLDivElement | null = null;
let contentEl: HTMLDivElement | null = null;

export function mountHost(): ShadowRoot {
  const host = document.createElement("div");
  host.id = HOST_ID;
  document.documentElement.appendChild(host);
  shadowRoot = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = css;
  shadowRoot.appendChild(style);
  return shadowRoot;
}

export function getShadowRoot(): ShadowRoot | null {
  return shadowRoot;
}

export function unmountHost(): void {
  document.getElementById(HOST_ID)?.remove();
  shadowRoot = null;
  panelEl = null;
  contentEl = null;
}

type FabOptions = { variant?: "in-library" | "inactive"; label: string; title?: string; onClick: () => void };

export function mountFab(root: ShadowRoot, { variant, label, title, onClick }: FabOptions): void {
  const button = document.createElement("button");
  button.type = "button";
  button.className = variant ? `tg-fab tg-fab--${variant}` : "tg-fab";
  button.setAttribute("aria-label", label);
  if (title) button.title = title;
  button.appendChild(createIcon());
  button.addEventListener("click", onClick);
  root.appendChild(button);
}

/** `onFirstOpen` runs once. Returns the toggle for the icon's click handler. */
export function mountPanel(root: ShadowRoot, onFirstOpen: () => void): () => void {
  const panel = document.createElement("div");
  panel.className = "tg-panel";
  panel.hidden = true;

  // Outside contentEl so it survives re-renders.
  const closeBtn = document.createElement("button");
  closeBtn.className = "tg-close";
  closeBtn.type = "button";
  closeBtn.setAttribute("aria-label", "Close");
  closeBtn.textContent = "×";
  closeBtn.addEventListener("click", () => setPanelOpen(false));
  panel.appendChild(closeBtn);

  const content = document.createElement("div");
  content.className = "tg-panel__content";
  panel.appendChild(content);
  root.appendChild(panel);

  panelEl = panel;
  contentEl = content;
  let loaded = false;
  return () => {
    const open = Boolean(panel.hidden);
    setPanelOpen(open);
    if (open && !loaded) {
      loaded = true;
      onFirstOpen();
    }
  };
}

export function setPanelOpen(open: boolean): void {
  if (panelEl) panelEl.hidden = !open;
}

export function isPanelMounted(): boolean {
  return contentEl !== null;
}

export function isPanelOpen(): boolean {
  return panelEl !== null && !panelEl.hidden;
}

export function renderPanel(html: string): void {
  // The panel may have been torn down mid-flow; the background work continues regardless.
  if (!contentEl) return;
  contentEl.innerHTML = html;
}

export function panelQuery<T extends Element = HTMLElement>(selector: string): T | null {
  return panelEl ? panelEl.querySelector<T>(selector) : null;
}

export function panelQueryAll<T extends Element = HTMLElement>(selector: string): T[] {
  return panelEl ? [...panelEl.querySelectorAll<T>(selector)] : [];
}

export function onPanelAction(action: string, handler: () => void): void {
  panelQuery(`[data-action="${action}"]`)?.addEventListener("click", handler);
}
