// Cults3D hands its free files to a signed-in browser only. Pressing the page's Download button submits a
// CSRF-protected form (POST /free_orders) that redirects to an order page listing every file with its own
// /downloads/... link. Navigating there would destroy this content script mid-import, so the form is
// submitted with fetch() instead, the order page is read from the response, and each file's link is
// started as a download that the background captures and cancels (see background/downloadCapture.ts).
// The backend then fetches the captured links. Paid models have no such form, so they resolve to null.

import type { ResolvedDownload } from "../../shared/messages";
import { send } from "../../shared/messages";

// A file name on its own line, optionally followed by its size ("corner cap.stl 220 KB"). Names contain spaces.
const FILE_NAME =
  /^\s*([^\n/\\]+?\.(?:stl|3mf|obj|step|stp|ply|amf|gcode|zip|f3d|f3z|scad|svg|dxf|blend|fbx))(?:\s+[\d.,]+\s*[KMG]?B)?\s*$/im;
const MAX_FILES = 50;
const FETCH_TIMEOUT_MS = 15000;

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
  const creatorName = creator && typeof creator === "object" ? (creator as Record<string, unknown>).name : creator;
  const h1 = document.querySelector("h1")?.textContent;
  return {
    title: text(h1, 200) ?? text(ld.name, 200) ?? metaContent("og:title"),
    description: text(ld.description, 5000) ?? metaContent("og:description"),
    image: text(image, 2000) ?? metaContent("og:image"),
    creator: text(creatorName, 120),
    tags:
      typeof ld.keywords === "string"
        ? ld.keywords
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
        : [],
  };
}

/** "Download" links of an order page, each with the file name written next to it. */
export function parseOrderFiles(doc: Document, base: string): { url: string; filename: string }[] {
  const files: { url: string; filename: string }[] = [];
  const seen = new Set<string>();
  for (const a of doc.querySelectorAll<HTMLAnchorElement>('a[href*="/downloads/"]')) {
    if (!/^\s*download\s*$/i.test(a.textContent || "")) continue;
    let url: URL;
    try {
      url = new URL(a.getAttribute("href") || "", base);
    } catch {
      continue;
    }
    if (url.protocol !== "https:" || url.hostname.toLowerCase().replace(/^www\./, "") !== "cults3d.com") continue;
    if (seen.has(url.href)) continue;
    // The file name sits in the same row, a few levels up from the button.
    let filename = "";
    for (let node: Element | null = a.parentElement, depth = 0; node && depth < 4 && !filename; depth++) {
      const m = (node.textContent || "").match(FILE_NAME);
      if (m) filename = m[1];
      node = node.parentElement;
    }
    seen.add(url.href);
    files.push({ url: url.href, filename });
    if (files.length >= MAX_FILES) break;
  }
  return files;
}

async function fetchOrderPage(): Promise<{ doc: Document; url: string } | null> {
  const onOrderPage = /\/orders\/\d+/.test(location.pathname);
  if (onOrderPage) return { doc: document, url: location.href };
  const form = document.querySelector<HTMLFormElement>('form[action*="/free_orders"]');
  if (!form) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const body = new URLSearchParams();
    for (const [key, value] of new FormData(form)) if (typeof value === "string") body.append(key, value);
    const res = await fetch(new URL(form.getAttribute("action") || "", location.href).href, {
      method: "POST",
      body,
      credentials: "same-origin",
      headers: { Accept: "text/html" },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const doc = new DOMParser().parseFromString(await res.text(), "text/html");
    return { doc, url: res.url };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/** Starts one file's download and returns the link the browser resolved it to (null if none). */
async function captureFileUrl(fileUrl: string): Promise<string | null> {
  const armed = await send("ARM_DOWNLOAD_CAPTURE");
  if (!armed || !armed.ok) return null;
  const link = document.createElement("a");
  link.href = fileUrl;
  link.setAttribute("download", "");
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  const res = await send("AWAIT_DOWNLOAD_CAPTURE");
  return res && res.ok ? res.data : null;
}

/** Null when there's no free download here (paid model, signed out) or no file link could be captured. */
export async function resolveCults3dDownloadUrl(): Promise<ResolvedDownload | null> {
  const order = await fetchOrderPage();
  if (!order) return null;
  const listed = parseOrderFiles(order.doc, order.url);
  const files: { url: string; filename: string }[] = [];
  for (const file of listed) {
    const captured = await captureFileUrl(file.url);
    if (captured) files.push({ url: captured, filename: file.filename });
  }
  if (!files.length) return null;
  return { downloadUrl: files[0].url, instanceId: null, pageMeta: readCults3dPageMeta(), files };
}
