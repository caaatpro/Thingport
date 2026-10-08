import { Router } from "express";
import { prisma } from "../db";
import { requireAuth } from "../auth";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();
router.use(requireAuth);

// Member directory for the sharing picker. Any signed-in member can look up who to share with; this
// is a small single-instance team tool, so the roster (name + email) is intentionally visible to
// members. No passwords or tokens are exposed.
router.get(
  "/users",
  asyncHandler(async (req, res) => {
    const users = await prisma.user.findMany({
      select: { id: true, displayName: true, email: true },
      orderBy: { displayName: "asc" },
    });
    res.json(
      users.filter((u) => u.id !== req.userId).map((u) => ({ id: u.id, display_name: u.displayName, email: u.email })),
    );
  }),
);

export default router;
