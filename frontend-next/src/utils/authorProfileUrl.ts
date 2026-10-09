import type { Author } from "../api/prints";

/** MakerWorld's Author.links are the creator's bio links, so its profile URL is built from the
 * numeric id (/u/<id> always resolves). Thingiverse and Printables store it as links[0]. */
export function authorProfileUrl(author: Pick<Author, "provider" | "external_id" | "links">): string | null {
  if (author.provider === "makerworld") {
    return `https://makerworld.com/en/u/${author.external_id}`;
  }
  return author.links[0] ?? null;
}
