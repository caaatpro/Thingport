export type QueueStatus = "uploading" | "ready" | "failed";
export type QueueItem = { id: string; name: string; status: QueueStatus; error?: string; printId?: string };

export type QueueAction =
  | { type: "add"; items: QueueItem[] }
  | { type: "update"; id: string; patch: Partial<Omit<QueueItem, "id">> }
  | { type: "clearFinished" };

/** Items keep the order they were dropped in; finished ones can be cleared while others still run. */
export function queueReducer(state: QueueItem[], action: QueueAction): QueueItem[] {
  switch (action.type) {
    case "add":
      return [...state, ...action.items];
    case "update":
      return state.map((item) => (item.id === action.id ? { ...item, ...action.patch } : item));
    case "clearFinished":
      return state.filter((item) => item.status === "uploading");
  }
}

export function queueSummary(items: QueueItem[]) {
  const active = items.filter((i) => i.status === "uploading").length;
  const failed = items.filter((i) => i.status === "failed").length;
  const ready = items.filter((i) => i.status === "ready").length;
  return { active, failed, ready, total: items.length };
}

export function queueTitle(items: QueueItem[]): string {
  const { active, failed, ready } = queueSummary(items);
  if (active > 0) return `Uploading ${active} ${active === 1 ? "file" : "files"}…`;
  if (failed > 0 && ready > 0) return `${ready} uploaded, ${failed} failed`;
  if (failed > 0) return failed === 1 ? "Upload failed" : `${failed} uploads failed`;
  return "Upload complete";
}

export type UploadOutcome = { printId?: string };

/**
 * Uploads one at a time, in order: it keeps server load sane and the queue readable. A failure marks that item
 * and moves on; `isFatal` (e.g. a 401) marks it and fails everything still waiting, since they would all fail too.
 * Resolves with how many succeeded.
 */
export async function runUploadQueue<T>(
  items: { id: string; payload: T }[],
  upload: (payload: T) => Promise<UploadOutcome>,
  dispatch: (action: QueueAction) => void,
  isFatal: (err: unknown) => boolean = () => false,
  fatalMessage = "Session expired",
): Promise<number> {
  let succeeded = 0;
  for (let i = 0; i < items.length; i++) {
    const { id, payload } = items[i];
    try {
      const outcome = await upload(payload);
      dispatch({ type: "update", id, patch: { status: "ready", printId: outcome.printId } });
      succeeded += 1;
    } catch (err) {
      if (isFatal(err)) {
        for (const rest of items.slice(i)) {
          dispatch({ type: "update", id: rest.id, patch: { status: "failed", error: fatalMessage } });
        }
        break;
      }
      dispatch({
        type: "update",
        id,
        patch: { status: "failed", error: err instanceof Error ? err.message : undefined },
      });
    }
  }
  return succeeded;
}
