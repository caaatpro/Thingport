// Formats staged files (the fixes are committed with them), then lints the whole affected project,
// which avoids mapping staged paths into each project's cwd.
module.exports = {
  "*": "prettier --write --ignore-unknown",
  "backend/prisma/schema.prisma": () =>
    "npm --prefix backend exec -- prisma format --schema backend/prisma/schema.prisma",
  "backend/**/*.{ts,tsx}": () => "npm --prefix backend run lint",
  "frontend/**/*.{ts,tsx}": () => "npm --prefix frontend run lint",
  "extension/**/*.ts": () => "npm --prefix extension run lint",
};
