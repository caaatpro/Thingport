import fs from "node:fs";
import path from "node:path";
import { request, type FullConfig } from "@playwright/test";
import { ADMIN, AUTH_DIR, MEMBER, authHeader, stlBox, type Seed } from "./helpers";

type Session = { token: string; user: { id: string; role: string } };

async function ensureUser(api: Awaited<ReturnType<typeof request.newContext>>, who: typeof ADMIN): Promise<Session> {
  const registered = await api.post("/api/register", {
    data: { displayName: who.name, email: who.email, password: who.password },
  });
  if (registered.ok()) return (await registered.json()) as Session;
  const login = await api.post("/api/login", { data: { email: who.email, password: who.password } });
  if (!login.ok()) throw new Error(`Could not register or sign in ${who.email}: ${await login.text()}`);
  return (await login.json()) as Session;
}

/** localStorage as the app keeps it, so a test can start already signed in. */
function storageState(baseURL: string, session: Session) {
  return {
    cookies: [],
    origins: [
      {
        origin: new URL(baseURL).origin,
        localStorage: [
          { name: "thingport_auth_token", value: session.token },
          { name: "thingport_auth_user", value: JSON.stringify(session.user) },
        ],
      },
    ],
  };
}

export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0].use.baseURL!;
  const api = await request.newContext({ baseURL });
  fs.mkdirSync(AUTH_DIR, { recursive: true });

  const admin = await ensureUser(api, ADMIN);
  if (admin.user.role !== "ADMIN") {
    throw new Error("The first account on the stack isn't an admin: start from a fresh database (scripts/e2e.sh does).");
  }
  const member = await ensureUser(api, MEMBER);

  // Three models for the admin, one of them in a collection.
  const titles = ["Gridfinity bin", "Cable clip", "Phone stand"];
  const models: Seed["models"] = [];
  for (const [i, title] of titles.entries()) {
    const existing = await api.get("/api/prints", { headers: authHeader(admin.token), params: { q: title } });
    const found = ((await existing.json()) as { id: string; title?: string; name: string }[]).find(
      (p) => (p.title || p.name) === title,
    );
    if (found) {
      models.push({ id: found.id, title });
      continue;
    }
    const upload = await api.post("/api/upload", {
      headers: authHeader(admin.token),
      multipart: { files: { name: `${title}.stl`, mimeType: "model/stl", buffer: Buffer.from(stlBox(title, 20 + i * 5)) } },
    });
    if (!upload.ok()) throw new Error(`Seeding "${title}" failed: ${await upload.text()}`);
    const id = ((await upload.json()) as { prints: { id: string }[] }).prints[0].id;
    await api.post(`/api/print/${id}/meta`, { headers: authHeader(admin.token), data: { title } });
    models.push({ id, title });
  }

  const collections = (await (await api.get("/api/collections", { headers: authHeader(admin.token) })).json()) as {
    id: string;
    name: string;
  }[];
  let collection = collections.find((c) => c.name === "E2E collection");
  if (!collection) {
    collection = (await (
      await api.post("/api/collections", { headers: authHeader(admin.token), data: { name: "E2E collection" } })
    ).json()) as { id: string; name: string };
    await api.post(`/api/collection/${collection.id}/items/${models[0].id}`, { headers: authHeader(admin.token) });
  }

  const seed: Seed = {
    adminToken: admin.token,
    memberToken: member.token,
    memberId: member.user.id,
    models,
    collection: { id: collection.id, name: collection.name, modelTitle: models[0].title },
  };
  fs.writeFileSync(path.join(AUTH_DIR, "seed.json"), JSON.stringify(seed));
  fs.writeFileSync(path.join(AUTH_DIR, "admin.json"), JSON.stringify(storageState(baseURL, admin)));
  fs.writeFileSync(path.join(AUTH_DIR, "member.json"), JSON.stringify(storageState(baseURL, member)));
  await api.dispose();
}
