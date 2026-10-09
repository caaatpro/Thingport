import { providerHeaders } from "../http";

export const MAKERWORLD_REFERER = "https://makerworld.com/";

/** `accept` differs per endpoint family: the cloud API also takes text/plain, the rest are plain JSON. */
export function makerworldHeaders(accept: string, bearerToken?: string | null): Record<string, string> {
  return providerHeaders({
    Accept: accept,
    Referer: MAKERWORLD_REFERER,
    ...(bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {}),
  });
}
