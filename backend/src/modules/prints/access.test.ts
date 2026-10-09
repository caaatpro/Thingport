import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../db";
import type { CollectionRole } from "../../generated/prisma/client";
import {
  collectionReadWhere,
  printReadWhere,
  printWriteWhere,
  requireCollectionRole,
  roleAtLeast,
  rolesAtLeast,
  sharedWithMeWhere,
  viewerRolesByPrint,
} from "./access";

describe("collection role ladder (pure)", () => {
  it("lists every role at or above the minimum, lowest first", () => {
    expect(rolesAtLeast("VIEW")).toEqual(["VIEW", "UPLOAD", "EDIT", "DELETE"]);
    expect(rolesAtLeast("UPLOAD")).toEqual(["UPLOAD", "EDIT", "DELETE"]);
    expect(rolesAtLeast("EDIT")).toEqual(["EDIT", "DELETE"]);
    expect(rolesAtLeast("DELETE")).toEqual(["DELETE"]);
  });

  it("roleAtLeast compares along VIEW < UPLOAD < EDIT < DELETE and refuses no role", () => {
    expect(roleAtLeast("EDIT", "UPLOAD")).toBe(true);
    expect(roleAtLeast("EDIT", "EDIT")).toBe(true);
    expect(roleAtLeast("UPLOAD", "EDIT")).toBe(false);
    expect(roleAtLeast("VIEW", "UPLOAD")).toBe(false);
    expect(roleAtLeast("DELETE", "DELETE")).toBe(true);
    expect(roleAtLeast(null, "VIEW")).toBe(false);
    expect(roleAtLeast(undefined, "VIEW")).toBe(false);
  });

  it("builds where-clauses that name the user and (for writes) only roles at the level", () => {
    expect(collectionReadWhere("u1")).toEqual({
      OR: [{ userId: "u1" }, { shares: { some: { sharedWithUserId: "u1" } } }],
    });
    expect(printReadWhere("u1")).toEqual({ OR: [{ userId: "u1" }, sharedWithMeWhere("u1")] });
    expect(printWriteWhere("u1", "EDIT")).toEqual({
      OR: [
        { userId: "u1" },
        {
          collectionItems: {
            some: { collection: { shares: { some: { sharedWithUserId: "u1", role: { in: ["EDIT", "DELETE"] } } } } },
          },
        },
      ],
    });
  });
});

const readable = (userId: string, id: string) =>
  prisma.print.count({ where: { id, ...printReadWhere(userId) } }).then((n) => n > 0);
const writable = (userId: string, id: string, min: CollectionRole) =>
  prisma.print.count({ where: { id, ...printWriteWhere(userId, min) } }).then((n) => n > 0);

describe("access rules against the database", () => {
  const stamp = Date.now();
  const userIds: string[] = [];
  let owner: string;
  let stranger: string;
  const sharedUsers = {} as Record<CollectionRole, string>;
  let directRecipient: string;
  let collectionId: string;
  let inCollectionPrint: string;
  let directPrint: string;
  let privatePrint: string;

  async function user(tag: string): Promise<string> {
    const u = await prisma.user.create({
      data: { email: `access-${tag}-${stamp}@example.com`, passwordHash: "x", displayName: `Access ${tag}` },
    });
    userIds.push(u.id);
    return u.id;
  }

  async function makePrint(name: string): Promise<string> {
    const p = await prisma.print.create({
      data: { userId: owner, name: `${name}-${stamp}`, nameNormalized: `${name}-${stamp}`.toLowerCase() },
    });
    return p.id;
  }

  beforeAll(async () => {
    owner = await user("owner");
    stranger = await user("stranger");
    directRecipient = await user("direct");
    const roles: CollectionRole[] = ["VIEW", "UPLOAD", "EDIT", "DELETE"];
    for (const role of roles) sharedUsers[role] = await user(role.toLowerCase());

    inCollectionPrint = await makePrint("in-collection");
    directPrint = await makePrint("direct");
    privatePrint = await makePrint("private");
    const collection = await prisma.collection.create({
      data: {
        userId: owner,
        name: `Access ${stamp}`,
        nameNormalized: `access ${stamp}`,
        items: { create: [{ printId: inCollectionPrint }] },
        shares: { create: roles.map((role) => ({ sharedWithUserId: sharedUsers[role], role })) },
      },
    });
    collectionId = collection.id;
    await prisma.printShare.create({ data: { printId: directPrint, sharedWithUserId: directRecipient } });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it("reads: owner, direct recipient and collection recipients see the model; strangers don't", async () => {
    expect(await readable(owner, privatePrint)).toBe(true);
    expect(await readable(stranger, privatePrint)).toBe(false);
    expect(await readable(directRecipient, directPrint)).toBe(true);
    expect(await readable(stranger, directPrint)).toBe(false);
    for (const id of Object.values(sharedUsers)) expect(await readable(id, inCollectionPrint)).toBe(true);
    expect(await readable(stranger, inCollectionPrint)).toBe(false);
    // Sharing one model of the owner never exposes the others.
    expect(await readable(directRecipient, privatePrint)).toBe(false);
    expect(await readable(sharedUsers.DELETE, privatePrint)).toBe(false);
  });

  it("sharedWithMeWhere matches direct and collection shares, not owned or unrelated models", async () => {
    const found = async (userId: string) =>
      (
        await prisma.print.findMany({
          where: { id: { in: [privatePrint, directPrint, inCollectionPrint] }, ...sharedWithMeWhere(userId) },
          select: { id: true },
        })
      )
        .map((p) => p.id)
        .toSorted();
    expect(await found(directRecipient)).toEqual([directPrint]);
    expect(await found(sharedUsers.VIEW)).toEqual([inCollectionPrint]);
    expect(await found(owner)).toEqual([]);
    expect(await found(stranger)).toEqual([]);
  });

  it("writes: the owner always, collection recipients only at or above the required role", async () => {
    expect(await writable(owner, inCollectionPrint, "DELETE")).toBe(true);
    const expected: Record<CollectionRole, Record<CollectionRole, boolean>> = {
      VIEW: { VIEW: true, UPLOAD: false, EDIT: false, DELETE: false },
      UPLOAD: { VIEW: true, UPLOAD: true, EDIT: false, DELETE: false },
      EDIT: { VIEW: true, UPLOAD: true, EDIT: true, DELETE: false },
      DELETE: { VIEW: true, UPLOAD: true, EDIT: true, DELETE: true },
    };
    for (const held of Object.keys(expected) as CollectionRole[]) {
      for (const needed of Object.keys(expected[held]) as CollectionRole[]) {
        expect(await writable(sharedUsers[held], inCollectionPrint, needed), `${held} needing ${needed}`).toBe(
          expected[held][needed],
        );
      }
    }
  });

  it("writes: a direct per-model share and strangers never grant write access", async () => {
    expect(await writable(directRecipient, directPrint, "VIEW")).toBe(false);
    expect(await writable(stranger, inCollectionPrint, "VIEW")).toBe(false);
    expect(await writable(sharedUsers.DELETE, privatePrint, "VIEW")).toBe(false);
  });

  it("viewerRolesByPrint reports the role per shared model and omits owned and unshared ones", async () => {
    const ids = [privatePrint, directPrint, inCollectionPrint];
    expect((await viewerRolesByPrint(sharedUsers.EDIT, ids)).get(inCollectionPrint)).toBe("EDIT");
    expect((await viewerRolesByPrint(sharedUsers.VIEW, ids)).get(inCollectionPrint)).toBe("VIEW");
    expect((await viewerRolesByPrint(owner, ids)).size).toBe(0);
    expect((await viewerRolesByPrint(stranger, ids)).size).toBe(0);
    expect((await viewerRolesByPrint(directRecipient, ids)).size).toBe(0);
    expect((await viewerRolesByPrint(sharedUsers.EDIT, [])).size).toBe(0);
  });

  it("viewerRolesByPrint takes the strongest role when a model is in several shared collections", async () => {
    const second = await prisma.collection.create({
      data: {
        userId: owner,
        name: `Access two ${stamp}`,
        nameNormalized: `access two ${stamp}`,
        items: { create: [{ printId: inCollectionPrint }] },
        shares: { create: [{ sharedWithUserId: sharedUsers.VIEW, role: "DELETE" }] },
      },
    });
    try {
      expect((await viewerRolesByPrint(sharedUsers.VIEW, [inCollectionPrint])).get(inCollectionPrint)).toBe("DELETE");
    } finally {
      await prisma.collection.delete({ where: { id: second.id } });
    }
  });

  it("requireCollectionRole: 404 when unreadable, 403 below the role, ok at or above it and for the owner", async () => {
    await expect(requireCollectionRole(stranger, collectionId, "VIEW")).rejects.toMatchObject({ status: 404 });
    await expect(requireCollectionRole(sharedUsers.VIEW, collectionId, "UPLOAD")).rejects.toMatchObject({
      status: 403,
    });
    await expect(requireCollectionRole(sharedUsers.UPLOAD, collectionId, "EDIT")).rejects.toMatchObject({
      status: 403,
    });
    await expect(requireCollectionRole(sharedUsers.EDIT, collectionId, "DELETE")).rejects.toMatchObject({
      status: 403,
    });
    expect(await requireCollectionRole(sharedUsers.UPLOAD, collectionId, "UPLOAD")).toMatchObject({
      isOwner: false,
      role: "UPLOAD",
    });
    expect(await requireCollectionRole(sharedUsers.DELETE, collectionId, "DELETE")).toMatchObject({ role: "DELETE" });
    expect(await requireCollectionRole(owner, collectionId, "DELETE")).toMatchObject({ isOwner: true, role: null });
  });
});
