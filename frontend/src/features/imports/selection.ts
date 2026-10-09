/** Checklist helpers shared by the ZIP and collection modals. */
export function toggleInSet<T>(set: ReadonlySet<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

/** Collection entries already in the library are never selectable (importing them would do nothing). */
export function defaultCollectionSelection(entries: { design_id: string; already_imported: boolean }[]): Set<string> {
  return new Set(entries.filter((e) => !e.already_imported).map((e) => e.design_id));
}
