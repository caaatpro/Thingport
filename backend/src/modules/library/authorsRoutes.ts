import { createRouter } from "../../http/route";
import { toUserOut } from "../accounts/dto";
import { getAuthorOut, getLinkedAuthorsForUser, linkAuthorToUser } from "./authors";
import { toAuthorOut } from "./dto";

export const authorsApi = createRouter();

authorsApi.get("/author/:id", ({ params }) => getAuthorOut(params.id));

authorsApi.get("/me/author-links", async ({ userId }) => {
  const authors = await getLinkedAuthorsForUser(userId);
  return authors.map((a) => toAuthorOut(a, true));
});

authorsApi.post("/author/:id/link", async ({ userId, params }) => {
  const { author, user } = await linkAuthorToUser(userId, params.id);
  return { author: toAuthorOut(author, true), user: toUserOut(user) };
});
