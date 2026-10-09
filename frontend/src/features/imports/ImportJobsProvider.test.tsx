import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import type { ImportJob } from "@/api/imports";
import { renderWithProviders } from "@/test/render";

const onUnauthorized = vi.fn<() => void>();
vi.mock("@/app/auth", () => ({ useAuth: () => ({ onUnauthorized }) }));
const api = vi.hoisted(() => ({
  getActiveImportJob: vi.fn<() => Promise<ImportJob | null>>(),
  getImportJob: vi.fn<(id: string) => Promise<ImportJob>>(),
}));
vi.mock("@/api/imports", () => ({ importsApi: api }));

import { ImportJobsProvider } from "./ImportJobsProvider";
import { ImportProgress } from "./ImportProgress";

const base: ImportJob = {
  id: "j1",
  type: "COLLECTION",
  status: "RUNNING",
  source_url: "https://www.printables.com/collections/1",
  source_label: "My collection",
  provider: "printables",
  total: 4,
  processed: 1,
  imported: 1,
  already_in_library: 0,
  failed_count: 0,
  error_message: null,
  result_collection_id: null,
  result_print_id: null,
};

beforeEach(() => {
  api.getActiveImportJob.mockReset();
  api.getImportJob.mockReset();
});

describe("ImportJobsProvider", () => {
  it("resumes a running job, polls it, then refreshes the library and links to the result", async () => {
    api.getActiveImportJob.mockResolvedValue(base);
    api.getImportJob.mockResolvedValueOnce(base).mockResolvedValue({ ...base, status: "DONE", processed: 4, imported: 4 });

    const { queryClient } = renderWithProviders(
      <ImportJobsProvider>
        <ImportProgress />
      </ImportJobsProvider>,
    );
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    expect(await screen.findByText("Importing… 1 of 4")).toBeTruthy();
    const link = await screen.findByRole("link", { name: "Open library" }, { timeout: 4000 });
    expect(link.getAttribute("href")).toBe("/models");
    await waitFor(() => {
      const keys = invalidate.mock.calls.map(([filters]) => (filters?.queryKey ?? [])[0]);
      for (const prefix of ["prints", "collections", "collection", "categories", "dashboard", "tags", "authors"]) {
        expect(keys).toContain(prefix);
      }
    });
    expect(screen.queryByText(/Importing…/)).toBeNull();
  }, 10_000);

  it("renders nothing while idle", async () => {
    api.getActiveImportJob.mockResolvedValue(null);
    const { container } = renderWithProviders(
      <ImportJobsProvider>
        <ImportProgress />
      </ImportJobsProvider>,
    );
    await waitFor(() => expect(api.getActiveImportJob).toHaveBeenCalled());
    expect(container.querySelector("section")).toBeNull();
  });
});
