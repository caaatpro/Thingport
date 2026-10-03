// Cults3D hands its free files to a signed-in browser only: the page's Download button submits a form
// (with a CSRF token) to /free_orders. So the page's own button is clicked and the browser download it
// starts is captured and cancelled (see background/downloadCapture.ts); the backend then fetches that
// link. Paid models have no such form, so they resolve to null and the import explains why.

import type { ResolvedDownload } from "../../shared/messages";
import { send } from "../../shared/messages";

function findFreeDownloadButton(): HTMLElement | null {
  const form = document.querySelector<HTMLFormElement>('form[action*="/free_orders"]');
  return form?.querySelector<HTMLElement>('button, input[type="submit"]') ?? null;
}

function text(value: unknown, max: number): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
}

function jsonLdObjects(): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const data: unknown = JSON.parse(script.textContent || "");
      for (const item of Array.isArray(data) ? data : [data]) {
        if (item && typeof item === "object") out.push(item as Record<string, unknown>);
      }
    } catch {
      // malformed block: ignore
    }
  }
  return out;
}

function metaContent(property: string): string | null {
  return text(document.querySelector<HTMLMetaElement>(`meta[property="${property}"]`)?.content, 5000);
}

/** Title, description and cover image from the page's JSON-LD / Open Graph tags. */
export function readCults3dPageMeta(): Record<string, unknown> {
  const ld = jsonLdObjects().find((o) => o.name || o.image) ?? {};
  const image = Array.isArray(ld.image) ? ld.image[0] : ld.image;
  const creator = ld.creator ?? ld.author;
  const creatorName =
    creator && typeof creator === "object" ? (creator as Record<string, unknown>).name : creator;
  const h1 = document.querySelector("h1")?.textContent;
  return {
    title: text(h1, 200) ?? text(ld.name, 200) ?? metaContent("og:title"),
    description: text(ld.description, 5000) ?? metaContent("og:description"),
    image: text(image, 2000) ?? metaContent("og:image"),
    creator: text(creatorName, 120),
    tags: typeof ld.keywords === "string" ? ld.keywords.split(",").map((t) => t.trim()).filter(Boolean) : [],
  };
}

/** Null when there's no free download here (paid model, or signed out) or nothing was captured. */
export async function resolveCults3dDownloadUrl(): Promise<ResolvedDownload | null> {
  const button = findFreeDownloadButton();
  if (!button) return null;
  const armed = await send("ARM_DOWNLOAD_CAPTURE");
  if (!armed || !armed.ok) return null;
  button.click();
  const res = await send("AWAIT_DOWNLOAD_CAPTURE");
  const downloadUrl = res && res.ok ? res.data : null;
  return downloadUrl ? { downloadUrl, instanceId: null, pageMeta: readCults3dPageMeta() } : null;
}
