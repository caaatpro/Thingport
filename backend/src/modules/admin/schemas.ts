import { z } from "zod";

const roleSchema = z.enum(["ADMIN", "MEMBER"]);

export const createUserSchema = z.object({
  email: z.string().trim().email("Enter a valid email address"),
  display_name: z.string().trim().min(1, "Enter a name").max(80),
  role: roleSchema.default("MEMBER"),
  // Optional: a strong one is generated (and shown once) when omitted.
  password: z.string().min(8, "Password must be at least 8 characters").optional(),
});

export const updateUserSchema = z
  .object({
    display_name: z.string().trim().min(1).max(80),
    role: roleSchema,
    disabled: z.boolean(),
  })
  .partial();

export const signOutSchema = z.object({ revoke_tokens: z.boolean().default(false) });

export const inviteSchema = z.object({ email: z.string().trim().email("Enter a valid email address") });

/** Blank or non-string values mean "not given", as the legacy hand-parsed query did. */
const optionalText = z.preprocess((v) => (typeof v === "string" && v ? v : undefined), z.string().optional());

function toDate(raw: string | undefined): Date | undefined {
  return raw === undefined ? undefined : new Date(raw);
}

export const logsQuerySchema = z
  .object({ user_id: optionalText, from: optionalText, to: optionalText })
  .transform((q, ctx) => {
    const from = toDate(q.from);
    const to = toDate(q.to);
    if (Number.isNaN(from?.getTime()) || Number.isNaN(to?.getTime())) {
      ctx.addIssue({ code: "custom", message: "Invalid date" });
      return z.NEVER;
    }
    return { user_id: q.user_id, from, to };
  });
