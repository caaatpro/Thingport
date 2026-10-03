function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`popup.html is missing #${id}`);
  return el as T;
}

export const els = {
  instanceRow: byId("instance-row"),
  instanceUrlText: byId("instance-url-text"),
  editInstanceBtn: byId<HTMLButtonElement>("edit-instance-btn"),
  configuredView: byId("configured-view"),
  enabledSwitch: byId<HTMLInputElement>("enabled-switch"),
  shareSessionSwitch: byId<HTMLInputElement>("share-session-switch"),
  accountText: byId("account-text"),
  pageTitle: byId("page-title"),
  pageHint: byId("page-hint"),
  pageAction: byId<HTMLButtonElement>("page-action"),
  pageLinks: byId("page-links"),
  pageError: byId("page-error"),
  rejectedBanner: byId("rejected-banner"),
  disconnectBtn: byId<HTMLButtonElement>("disconnect-btn"),
  recentSection: byId("recent-section"),
  recentGrid: byId("recent-grid"),
  configuredError: byId("configured-error"),
  setupForm: byId<HTMLFormElement>("setup-form"),
  instanceUrlInput: byId<HTMLInputElement>("instance-url"),
  tokenInput: byId<HTMLInputElement>("token"),
  saveBtn: byId<HTMLButtonElement>("save-btn"),
  cancelBtn: byId<HTMLButtonElement>("cancel-btn"),
  error: byId("error"),
};

export function showError(message: string, el: HTMLElement = els.error): void {
  el.textContent = message;
  el.classList.add("error--visible");
}

export function clearError(el: HTMLElement = els.error): void {
  el.textContent = "";
  el.classList.remove("error--visible");
}
