import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { requireAuth, requireSession } from "../auth";
import { HttpError } from "../utils/fileUtils";
import { parseBody } from "../utils/validate";
import { asyncHandler } from "../utils/asyncHandler";
import { createLog } from "../services/auditLog";
import { generateApiToken, MAX_TOKENS_PER_USER, toApiTokenOut, VALID_SCOPES } from "../services/apiTokenService";

const router = Router();
router.use(requireAuth);

// Who the calling API token belongs to, so a client (the extension) can confirm it's connected and
// show the account. Allowed for the "grab" scope; a session isn't an API token, so it gets a 400.
router.get(
  "/token/self",
  asyncHandler(async (req, res) => {
    if (!req.apiToken) throw new HttpError(400, "This endpoint is for API tokens");
    const token = await prisma.apiToken.findUnique({
      where: { id: req.apiToken.id },
      include: { user: { select: { displayName: true, email: true } } },
    });
    if (!token) throw new HttpError(401, "Unauthorized");
    res.json({
      ...toApiTokenOut(token),
      user: { display_name: token.user.displayName, email: token.user.email },
    });
  }),
);

// --- Management. Session only: a token can't list, create or revoke tokens. ------------------------

router.get(
  "/tokens",
  requireSession,
  asyncHandler(async (req, res) => {
    const rows = await prisma.apiToken.findMany({ where: { userId: req.userId }, orderBy: { createdAt: "desc" } });
    res.json(rows.map(toApiTokenOut));
  }),
);

const createSchema = z.object({
  name: z.string().trim().min(1, "Give the token a name").max(60),
  scope: z
    .string()
    .refine((s) => VALID_SCOPES.includes(s), "Unknown scope")
    .default("grab"),
  expires_in_days: z.number().int().min(1).max(730).nullable().optional(),
});

router.post(
  "/tokens",
  requireSession,
  asyncHandler(async (req, res) => {
    const body = parseBody(createSchema, req.body);
    const existing = await prisma.apiToken.count({ where: { userId: req.userId } });
    if (existing >= MAX_TOKENS_PER_USER) {
      throw new HttpError(400, `You can have at most ${MAX_TOKENS_PER_USER} API tokens. Revoke one first.`);
    }
    const { token, prefix, tokenHash } = generateApiToken();
    const row = await prisma.apiToken.create({
      data: {
        userId: req.userId!,
        name: body.name,
        prefix,
        tokenHash,
        scope: body.scope,
        expiresAt: body.expires_in_days ? new Date(Date.now() + body.expires_in_days * 24 * 60 * 60 * 1000) : null,
      },
    });
    // The secret is returned exactly once; only its hash is stored.
    res.status(201).json({ ...toApiTokenOut(row), token });
    void createLog({ userId: req.userId!, action: "token_created", targetId: row.id, details: { name: row.name } });
  }),
);

router.delete(
  "/tokens/:id",
  requireSession,
  asyncHandler(async (req, res) => {
    const result = await prisma.apiToken.deleteMany({ where: { id: req.params.id, userId: req.userId } });
    if (result.count === 0) throw new HttpError(404, "Token not found");
    res.json({ ok: true });
    void createLog({ userId: req.userId!, action: "token_revoked", targetId: req.params.id });
  }),
);

export default router;
