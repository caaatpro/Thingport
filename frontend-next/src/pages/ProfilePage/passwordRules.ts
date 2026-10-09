export const MIN_PASSWORD_LENGTH = 8;

/** The first problem with a new password, or null when it is acceptable. */
export function passwordProblem(password: string, confirmation: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  if (password !== confirmation) return "Passwords do not match";
  return null;
}
