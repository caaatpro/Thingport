import { parse } from "../http/validate";

/** @deprecated Use `parse` from "../http/validate", or the `body`/`query` options of `createRouter()`. */
export const parseBody = parse;
