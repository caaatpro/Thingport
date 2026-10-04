// Where a Cults3D file link actually leads. /downloads/... answers with a redirect to a signed file URL
// that the backend can fetch on its own, but only the signed-in browser can follow the first hop. With
// host access to cults3d.com the background can do that with the user's cookies and read the final URL
// without downloading the file (the body is aborted once the headers are in).

const RESOLVE_TIMEOUT_MS = 15000;

export type ResolvedFileLink = { url: string; filename: string | null };

function isCults3dUrl(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  return url.protocol === "https:" && (host === "cults3d.com" || host.endsWith(".cults3d.com"));
}

/** `filename="a b.stl"` or RFC 5987 `filename*=UTF-8''a%20b.stl`. */
export function filenameFromDisposition(header: string | null): string | null {
  if (!header) return null;
  const star = header.match(/filename\*\s*=\s*[^']*'[^']*'([^;]+)/i);
  if (star) {
    try {
      return decodeURIComponent(star[1].trim());
    } catch {
      // fall through to the plain form
    }
  }
  const plain = header.match(/filename\s*=\s*"?([^";]+)"?/i);
  return plain ? plain[1].trim() : null;
}

export async function resolveCults3dFileLink(link: string): Promise<ResolvedFileLink> {
  const url = new URL(link);
  if (!isCults3dUrl(url)) throw new Error("Not a Cults3D link");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RESOLVE_TIMEOUT_MS);
  try {
    const res = await fetch(url.href, { credentials: "include", redirect: "follow", signal: controller.signal });
    const finalUrl = res.url;
    const type = res.headers.get("content-type") || "";
    const filename = filenameFromDisposition(res.headers.get("content-disposition"));
    controller.abort(); // headers are enough; don't pull the file itself
    if (!res.ok) throw new Error(`Cults3D answered ${res.status} for the file link`);
    if (/text\/html/i.test(type)) throw new Error("Cults3D answered with a web page instead of the file");
    return { url: finalUrl, filename };
  } finally {
    clearTimeout(timeout);
  }
}
