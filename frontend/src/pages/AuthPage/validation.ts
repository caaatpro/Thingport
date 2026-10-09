export const MIN_PASSWORD_LENGTH = 8;

/** The message to show for a new password that isn't acceptable yet, or null when it is. */
export function checkNewPassword(password: string, confirm: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return "Password must be at least 8 characters";
  if (password !== confirm) return "Passwords do not match";
  return null;
}
