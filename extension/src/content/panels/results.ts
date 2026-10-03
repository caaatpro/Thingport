import { escapeHtml } from "../runtime";

export function statusHtml(text: string): string {
  return `<div class="tg-status">${escapeHtml(text)}</div>`;
}

export function successHtml(link: string, note?: string | null, title = "Imported!"): string {
  return `
    <div class="tg-title">${escapeHtml(title)}</div>
    ${note ? `<div class="tg-hint">${escapeHtml(note)}</div>` : ""}
    <a class="tg-btn" href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">Open in Thingport</a>
  `;
}

export function errorHtml(err: unknown, hint?: string): string {
  const message = err instanceof Error ? err.message : String(err);
  return `<div class="tg-title tg-title--error">Something went wrong</div><div class="tg-hint">${escapeHtml(message)}</div>${
    hint ? `<div class="tg-hint">${escapeHtml(hint)}</div>` : ""
  }`;
}
