import fs from "node:fs";
import path from "node:path";
import type { APIRequestContext, Page } from "@playwright/test";

export const ADMIN = { email: "admin@e2e.test", password: "E2e-admin-pass-1", name: "E2E Admin" };
export const MEMBER = { email: "member@e2e.test", password: "E2e-member-pass-1", name: "E2E Member" };

export const AUTH_DIR = path.join(import.meta.dirname, ".auth");

export type Seed = {
  adminToken: string;
  memberToken: string;
  memberId: string;
  models: { id: string; title: string }[];
  collection: { id: string; name: string; modelTitle: string };
};

export function readSeed(): Seed {
  return JSON.parse(fs.readFileSync(path.join(AUTH_DIR, "seed.json"), "utf8"));
}

/** A minimal valid ASCII STL box, so the server can render a thumbnail for it. */
export function stlBox(name: string, w = 20, d = 10, h = 5): string {
  const v = [
    [0, 0, 0],
    [w, 0, 0],
    [w, d, 0],
    [0, d, 0],
    [0, 0, h],
    [w, 0, h],
    [w, d, h],
    [0, d, h],
  ];
  const faces = [
    [0, 2, 1],
    [0, 3, 2],
    [4, 5, 6],
    [4, 6, 7],
    [0, 1, 5],
    [0, 5, 4],
    [1, 2, 6],
    [1, 6, 5],
    [2, 3, 7],
    [2, 7, 6],
    [3, 0, 4],
    [3, 4, 7],
  ];
  let out = `solid ${name}\n`;
  for (const f of faces) {
    out += "facet normal 0 0 0\nouter loop\n";
    for (const i of f) out += `vertex ${v[i].join(" ")}\n`;
    out += "endloop\nendfacet\n";
  }
  return `${out}endsolid ${name}\n`;
}

/** A name no earlier run has used, so specs can be repeated on the same stack. */
export const unique = (label: string) => `${label} ${Date.now().toString(36)}`;

export const authHeader = (token: string) => ({ Authorization: `Bearer ${token}` });

/** Errors a page logs to the console or throws; known noise (Gravatar 404s, favicon) is dropped. */
export function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    if (/Failed to load resource|favicon/i.test(m.text())) return;
    errors.push(`console: ${m.text()}`);
  });
  return errors;
}

export async function apiJson<T = unknown>(
  request: APIRequestContext,
  method: "get" | "post" | "patch" | "put" | "delete",
  url: string,
  token: string,
  data?: unknown,
): Promise<T> {
  const res = await request[method](url, { headers: authHeader(token), ...(data === undefined ? {} : { data }) });
  if (!res.ok()) throw new Error(`${method.toUpperCase()} ${url} -> ${res.status()} ${await res.text()}`);
  return (await res.json()) as T;
}
