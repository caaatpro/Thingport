import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminOverview } from "@/api/admin";
import { renderWithProviders } from "@/test/render";
import type { AnyFn } from "@/test/types";

const adminApi = vi.hoisted(() => ({ getOverview: vi.fn<AnyFn>(), retryFailedProcessing: vi.fn<AnyFn>() }));
vi.mock("@/api/admin", async (importOriginal) => ({ ...(await importOriginal<object>()), adminApi }));

const { default: AdminPage } = await import("./index");

const overview = (patch: Partial<AdminOverview> = {}): AdminOverview => ({
  users: { total: 5, admins: 2, disabled: 1, active_7d: 3, pending_invitations: 0 },
  library: { models: 120, collections: 8, model_bytes: 3 * 1024 ** 3 },
  processing: { queued: 0, processing: 0, failed: 0 },
  imports: { running: 0, failed_24h: 0 },
  ...patch,
});

beforeEach(() => {
  adminApi.getOverview.mockReset();
  adminApi.getOverview.mockResolvedValue(overview());
  adminApi.retryFailedProcessing.mockResolvedValue({ ok: true, retried: 2 });
});

describe("AdminPage", () => {
  it("summarises users and the library", async () => {
    renderWithProviders(<AdminPage />);
    expect(await screen.findByText("5")).toBeInTheDocument();
    expect(screen.getByText("3 active this week")).toBeInTheDocument();
    expect(screen.getByText("1 disabled")).toBeInTheDocument();
    expect(screen.getByText("3.0 GB")).toBeInTheDocument();
    expect(screen.getByText("120 models")).toBeInTheDocument();
    expect(screen.getByText("8 collections")).toBeInTheDocument();
  });

  it("says when nothing is running", async () => {
    renderWithProviders(<AdminPage />);
    expect(await screen.findByText("Nothing running")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry failed" })).toBeNull();
  });

  it("shows pending work and import problems", async () => {
    adminApi.getOverview.mockResolvedValue(
      overview({ processing: { queued: 2, processing: 1, failed: 0 }, imports: { running: 1, failed_24h: 3 } }),
    );
    renderWithProviders(<AdminPage />);
    expect(await screen.findByText("3 processing")).toBeInTheDocument();
    expect(screen.getByText("1 imports running")).toBeInTheDocument();
    expect(screen.getByText("3 imports failed in 24 h")).toBeInTheDocument();
  });

  it("offers to retry failed processing, then refreshes", async () => {
    adminApi.getOverview.mockResolvedValueOnce(overview({ processing: { queued: 0, processing: 0, failed: 4 } }));
    renderWithProviders(<AdminPage />);
    expect(await screen.findByText("4 failed")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry failed" }));
    await waitFor(() => expect(adminApi.retryFailedProcessing).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Retrying 2 failed items.")).toBeInTheDocument();
    await waitFor(() => expect(adminApi.getOverview).toHaveBeenCalledTimes(2));
  });

  it("links to every admin section", async () => {
    renderWithProviders(<AdminPage />);
    await screen.findByText("Nothing running");
    for (const [name, path] of [
      ["Users", "/admin-users"],
      ["Settings", "/admin-settings"],
      ["Rendering", "/admin-rendering"],
      ["Logs", "/admin-logs"],
      ["Triggers", "/admin-triggers"],
      ["Connections", "/admin-connections"],
    ] as const) {
      // The Users card in the summary and its section tile both lead there, so look at all matches.
      const hrefs = screen.getAllByRole("link", { name: new RegExp(`^${name}`, "i") }).map((a) => a.getAttribute("href"));
      expect(hrefs).toContain(path);
    }
  });

  it("still shows the sections when the overview can't load", async () => {
    adminApi.getOverview.mockRejectedValue(new Error("down"));
    renderWithProviders(<AdminPage />);
    expect(await screen.findByRole("link", { name: /^Users/ })).toBeInTheDocument();
    expect(screen.queryByText("Nothing running")).toBeNull();
  });
});
