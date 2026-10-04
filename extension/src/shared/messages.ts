// Typed runtime messages between the content script/popup and the background. Replies use a
// `{ ok, data } | { ok: false, error }` envelope: `send` returns it, `request` throws on error.

import type { Print } from "./api";

export type ExtensionState = {
  configured: boolean;
  disabled: boolean;
  instanceUrl: string;
  /** Who the stored token belongs to, for display. */
  account: string;
  /** Thingport answered 401: the token was revoked or has expired, so it needs replacing. */
  tokenRejected: boolean;
  shareMakerworldSession: boolean;
};

export type RecentImport = {
  printId: string;
  title: string | null;
  url: string;
  thumbDataUrl: string | null;
  instanceUrl: string;
  /** The account the import was made with; recent imports are scoped to instance + account. */
  email: string;
};

/** See content/makerworld/downloadResolver.ts. */
/** `design` is absent when the page data couldn't be trusted to be this model's. */
export type ResolvedDownload = {
  downloadUrl: string;
  instanceId: string | null;
  design?: Record<string, unknown> | null;
  /** Cults3D: title/description/image read off the page. */
  pageMeta?: Record<string, unknown> | null;
  /** Cults3D: one captured link per file of the order. */
  files?: { url: string; filename: string }[];
};

export type ImportSinglePayload = {
  url: string;
  entries?: string[];
  collectionId?: string | null;
  resolved?: ResolvedDownload | null;
  title?: string | null;
};

export type MakerworldJob = {
  tabId: number;
  originalUrl: string;
  collectionId: string | null;
  urls: string[];
  index: number;
  imported: number;
  total: number;
  awaitingLoad: boolean;
};

export type MakerworldJobError = { message: string; imported: number; total: number };

export type ApiCallPayload = { method: string; path: string; body?: unknown };

export type BackgroundMessages = {
  GET_STATE: { payload: void; result: ExtensionState };
  SAVE_CONFIG: { payload: { instanceUrl: string; token: string }; result: null };
  SET_DISABLED: { payload: { disabled: boolean }; result: null };
  SET_SHARE_MAKERWORLD_SESSION: { payload: { share: boolean }; result: null };
  DISCONNECT: { payload: void; result: null };
  GET_RECENT_IMPORTS: { payload: void; result: RecentImport[] };
  OPEN_SETUP: { payload: void; result: "popup" | "tab" };
  SET_TAB_ICON_STATE: { payload: { active: boolean }; result: null };
  API_CALL: { payload: ApiCallPayload; result: unknown };
  IMPORT_SINGLE: { payload: ImportSinglePayload; result: Print | null };
  START_MAKERWORLD_COLLECTION_JOB: {
    payload: { urls: string[]; collectionId: string | null; originalUrl: string };
    result: null;
  };
  ABORT_MAKERWORLD_COLLECTION_JOB: { payload: void; result: null };
  FORCE_ADVANCE_MAKERWORLD_JOB: { payload: void; result: null };
  ARM_DOWNLOAD_CAPTURE: { payload: void; result: null };
  AWAIT_DOWNLOAD_CAPTURE: { payload: void; result: string | null };
  RESOLVE_CULTS3D_FILE: { payload: { url: string }; result: { url: string; filename: string | null } };
  GET_MAKERWORLD_JOB: { payload: void; result: { job: MakerworldJob | null; error: MakerworldJobError | null } };
};

export type ContentMessages = {
  RESOLVE_MAKERWORLD_DOWNLOAD_URL: { payload: void; result: ResolvedDownload | null };
  /** From the popup's "Import this page" button. False when this page has no import panel to open. */
  OPEN_IMPORT_PANEL: { payload: void; result: boolean };
};

type AnyMessages = Record<string, { payload: unknown; result: unknown }>;
export type Reply<T> = { ok: true; data: T } | { ok: false; error: string };
type Envelope<M extends AnyMessages, K extends keyof M> = { type: K; payload: M[K]["payload"] };
type PayloadArgs<P> = [P] extends [void] ? [] : [P];

export type BackgroundType = keyof BackgroundMessages;
export type BackgroundResult<K extends BackgroundType> = BackgroundMessages[K]["result"];

export function send<K extends BackgroundType>(
  type: K,
  ...payload: PayloadArgs<BackgroundMessages[K]["payload"]>
): Promise<Reply<BackgroundResult<K>>> {
  const message: Envelope<BackgroundMessages, K> = { type, payload: payload[0] as BackgroundMessages[K]["payload"] };
  return chrome.runtime.sendMessage(message);
}

export async function request<K extends BackgroundType>(
  type: K,
  ...payload: PayloadArgs<BackgroundMessages[K]["payload"]>
): Promise<BackgroundResult<K>> {
  const reply = await send(type, ...payload);
  if (!reply) throw new Error("No response from the extension background");
  if (!reply.ok) throw new Error(reply.error);
  return reply.data;
}

export async function sendToTab<K extends keyof ContentMessages>(
  tabId: number,
  type: K,
): Promise<Reply<ContentMessages[K]["result"]> | undefined> {
  return chrome.tabs.sendMessage(tabId, { type, payload: undefined });
}

type Handler<M extends AnyMessages, K extends keyof M> = (
  payload: M[K]["payload"],
  sender: chrome.runtime.MessageSender,
) => Promise<M[K]["result"]> | M[K]["result"];
export type Handlers<M extends AnyMessages> = { [K in keyof M]: Handler<M, K> };

/** Message types not in `handlers` are left for other listeners. */
export function listen<M extends AnyMessages>(handlers: Partial<Handlers<M>>): void {
  chrome.runtime.onMessage.addListener((message: { type?: string; payload?: unknown }, sender, sendResponse) => {
    const handler = message && typeof message.type === "string" ? handlers[message.type as keyof M] : undefined;
    if (!handler) return undefined;
    Promise.resolve()
      .then(() => handler(message.payload as never, sender))
      .then(
        (data) => sendResponse({ ok: true, data }),
        (err: unknown) => sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) }),
      );
    return true; // keep the channel open for the async sendResponse above
  });
}
