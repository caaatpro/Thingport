// The grayed-out icon's dialog. Setup happens in an extension page: saving needs a host-permission
// prompt, and the token never enters this page's DOM.

import { send } from "../shared/messages";
import { fillIcons } from "../shared/icon";

let open: { backdrop: HTMLElement; onKeydown: (event: KeyboardEvent) => void } | null = null;

export function openSetupModal(root: ShadowRoot): void {
  if (open) return;
  const backdrop = document.createElement("div");
  backdrop.className = "tg-modal-backdrop";
  backdrop.innerHTML = `
    <div class="tg-modal" role="dialog" aria-modal="true" aria-labelledby="tg-setup-title">
      <button class="tg-close" type="button" aria-label="Close">×</button>
      <div class="tg-modal__header">
        <span class="tg-modal__icon" data-icon></span>
        <div class="tg-title" id="tg-setup-title">Connect Thingport Grab</div>
      </div>
      <div class="tg-hint">
        To import from this page, Thingport Grab needs to know where your Thingport instance is
        and an API token to use it with:
      </div>
      <ul class="tg-modal__list">
        <li><strong>Instance URL</strong>, e.g. https://thingport.example.com</li>
        <li>An <strong>API token</strong>, created in Thingport under Profile → API tokens (revocable any time)</li>
      </ul>
      <div class="tg-hint">
        Your account password is never asked for. The token is stored only in this browser's
        extension storage and sent only to your own instance. You can also open this any time from
        the Thingport Grab icon in your browser toolbar.
      </div>
      <button class="tg-btn" type="button" data-action="open-setup">Open setup</button>
      <div class="tg-hint tg-modal__status" hidden></div>
    </div>
  `;

  fillIcons(backdrop);
  const openBtn = backdrop.querySelector<HTMLButtonElement>("[data-action=open-setup]")!;
  const statusEl = backdrop.querySelector<HTMLElement>(".tg-modal__status")!;
  openBtn.addEventListener("click", async () => {
    openBtn.disabled = true;
    const res = await send("OPEN_SETUP");
    openBtn.disabled = false;
    if (res?.ok && res.data === "popup") return;
    statusEl.hidden = false;
    statusEl.textContent = res?.ok
      ? "Setup opened in a new tab -- you'll be brought back here once it's saved."
      : "Couldn't open setup automatically -- click the Thingport Grab icon in your browser toolbar (it may be under the Extensions menu).";
  });

  const onKeydown = (event: KeyboardEvent) => {
    if (event.key === "Escape") closeSetupModal();
  };
  document.addEventListener("keydown", onKeydown, true);
  backdrop.querySelector(".tg-close")!.addEventListener("click", closeSetupModal);
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) closeSetupModal();
  });

  root.appendChild(backdrop);
  open = { backdrop, onKeydown };
  openBtn.focus();
}

export function closeSetupModal(): void {
  if (!open) return;
  document.removeEventListener("keydown", open.onKeydown, true);
  open.backdrop.remove();
  open = null;
}
