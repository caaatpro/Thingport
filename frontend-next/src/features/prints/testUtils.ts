import type { Print } from "@/api/prints";

/** A minimal valid Print for component tests. */
export function makePrint(overrides: Partial<Print> = {}): Print {
  return {
    id: "p1",
    name: "benchy.stl",
    title: "Benchy",
    tags: [],
    created_at: "2026-01-02T03:04:05Z",
    plates: [],
    preview_images: [],
    supporting_file_count: 0,
    view_count: 3,
    print_count: 1,
    is_favorite: false,
    ...overrides,
  };
}
