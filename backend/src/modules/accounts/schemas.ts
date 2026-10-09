import { z } from "zod";
import { VALID_SCOPES } from "./apiTokens";

export const registerSchema = z.object({
  displayName: z.string().trim().min(1, "Display name is required"),
  email: z.string().trim().email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  invite_token: z.string().min(1).optional(),
});

export const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string(),
});

export const verifyEmailSchema = z.object({ token: z.string().min(1) });

export const resendVerificationSchema = z.object({ email: z.string().trim().email() });

export const forgotPasswordSchema = z.object({ email: z.string().trim().email("Enter a valid email address") });

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  new_password: z.string().min(8, "Password must be at least 8 characters"),
});

export const updateProfileSchema = z
  .object({
    current_password: z.string().min(1, "Current password is required"),
    email: z.string().trim().email("Enter a valid email address").optional(),
    new_password: z.string().min(8, "Password must be at least 8 characters").optional(),
  })
  .refine((data) => data.email !== undefined || data.new_password !== undefined, { message: "Nothing to update" });

export const createTokenSchema = z.object({
  name: z.string().trim().min(1, "Give the token a name").max(60),
  scope: z
    .string()
    .refine((s) => VALID_SCOPES.includes(s), "Unknown scope")
    .default("grab"),
  expires_in_days: z.number().int().min(1).max(730).nullable().optional(),
});
