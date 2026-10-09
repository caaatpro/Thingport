import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LogEntry } from "@/api/admin";
import { renderWithProviders } from "@/test/render";
import type { AnyFn } from "@/test/types";

const adminApi = vi.hoisted(() => ({ listLogs: vi.fn<AnyFn>(), listUsers: vi.fn<AnyFn>() }));
vi.mock("@/api/admin", async (importOriginal) => ({ ...(await importOriginal<object>()), adminApi }));

const { default: LogsPage } = await import("./index");

const entry = (i: number, patch: Partial<LogEntry> = {}): LogEntry => ({
  id: `log-${i}`,
  user_id: "anna",
  user_display_name: "Anna Ivanova",
  user_email: "anna@example.test",
  action: "model_uploaded",
  target_id: null,
  details: { name: `Model ${i}` },
  created_at: "2026-01-02T10:00:00.000Z",
  ...patch,
});

beforeEach(() => {
  adminApi.listUsers.mockResolvedValue([]);
  adminApi.listLogs.mockResolvedValue([entry(1)]);
});

describe("LogsPage", () => {
  it("filters by the user in the address, and describes each action", async () => {
    adminApi.listLogs.mockResolvedValue([
      entry(1),
      entry(2, { action: "import_completed", details: { provider: "thingiverse", imported: 4, failed: 1 } }),
    ]);
    renderWithProviders(<LogsPage />, { route: "/admin-logs?user=anna" });
    expect(await screen.findByText("Model 1")).toBeInTheDocument();
    expect(screen.getByText("thingiverse — 4 imported, 1 failed")).toBeInTheDocument();
    expect(screen.getByText("Import completed")).toBeInTheDocument();
    expect(adminApi.listLogs).toHaveBeenCalledWith(expect.objectContaining({ userId: "anna" }));
  });

  it("shows a hundred entries at a time", async () => {
    adminApi.listLogs.mockResolvedValue(Array.from({ length: 120 }, (_, i) => entry(i)));
    renderWithProviders(<LogsPage />);
    expect(await screen.findByText("Showing 100 of 120")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Show more" }));
    expect(await screen.findByText("Showing 120 of 120")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();
  });

  it("says so when nothing matches, and offers a retry when loading fails", async () => {
    adminApi.listLogs.mockResolvedValueOnce([]);
    const { unmount } = renderWithProviders(<LogsPage />);
    expect(await screen.findByText("No log entries for this filter.")).toBeInTheDocument();
    unmount();
    adminApi.listLogs.mockRejectedValueOnce(new Error("down")).mockResolvedValueOnce([entry(7)]);
    renderWithProviders(<LogsPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.getByText("Model 7")).toBeInTheDocument());
  });
});
