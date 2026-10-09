import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makePrint } from "@/features/prints/testUtils";
import { renderWithProviders } from "@/test/render";
import type { AnyFn } from "@/test/types";

const api = vi.hoisted(() => ({
  listFiles: vi.fn<AnyFn>(),
  recordDownload: vi.fn<AnyFn>(),
  downloadZip: vi.fn<AnyFn>(),
}));
vi.mock("@/api/prints", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/api/prints")>();
  return {
    ...original,
    printsApi: { ...original.printsApi, ...api, fileUrl: (rel: string) => `http://api.test${rel}` },
  };
});
const save = vi.hoisted(() => ({ saveResponseToDisk: vi.fn<AnyFn>() }));
vi.mock("@/utils/downloadResponse", () => save);
vi.mock("@/features/media/PlateThumbnail", () => ({ default: () => <span data-testid="plate-thumb" /> }));

const { ModelFilesPanel } = await import("./ModelFilesPanel");

const plate = (id: string, filename: string, position: number, extra = {}) => ({
  id,
  print_id: "p1",
  position,
  filename,
  mime: "model/stl",
  size: 2048,
  url: `/plate/${id}/${filename}`,
  ...extra,
});

const fetchMock = vi.fn<AnyFn>();
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValue({ ok: true, status: 200 });
  api.listFiles.mockResolvedValue([]);
  api.recordDownload.mockResolvedValue({ ok: true });
});

describe("ModelFilesPanel", () => {
  it("lists plates in order with type, size, dimensions and triangles", () => {
    const print = makePrint({
      plates: [
        plate("b", "lid.stl", 1),
        plate("a", "Benchy.stl", 0, { dim_mm: { x: 60.4, y: 31, z: 48.6 }, triangle_count: 225154 }),
      ],
    });
    renderWithProviders(<ModelFilesPanel print={print} />);
    const names = screen.getAllByText(/\.stl$/).map((n) => n.textContent);
    expect(names).toEqual(["Benchy.stl", "lid.stl"]);
    expect(screen.getByText(/STL · 2.0 KB · 60×31×49 mm · 225,154 triangles/)).toBeInTheDocument();
    expect(screen.getByText("Files (2)")).toBeInTheDocument();
  });

  it("offers a real download link per file and records the use on a plain click", async () => {
    const print = makePrint({ plates: [plate("a", "Benchy.stl", 0)] });
    renderWithProviders(<ModelFilesPanel print={print} />);
    const link = screen.getByRole("link", { name: "Download Benchy.stl" });
    expect(link).toHaveAttribute("href", "http://api.test/plate/a/Benchy.stl");
    expect(screen.queryByRole("button", { name: /Download all/ })).not.toBeInTheDocument();
    await userEvent.click(link);
    await waitFor(() => expect(save.saveResponseToDisk).toHaveBeenCalledWith(expect.anything(), "Benchy.stl"));
    await waitFor(() => expect(api.recordDownload).toHaveBeenCalledWith("p1"));
  });

  it("leaves a modified click to the browser (open in new tab)", async () => {
    const print = makePrint({ plates: [plate("a", "Benchy.stl", 0)] });
    renderWithProviders(<ModelFilesPanel print={print} />);
    const user = userEvent.setup();
    await user.keyboard("{Control>}");
    await user.click(screen.getByRole("link", { name: "Download Benchy.stl" }));
    await user.keyboard("{/Control}");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("downloads everything as a zip when there are several files", async () => {
    api.downloadZip.mockResolvedValue({});
    const print = makePrint({ plates: [plate("a", "a.stl", 0), plate("b", "b.stl", 1)] });
    renderWithProviders(<ModelFilesPanel print={print} />);
    await userEvent.click(screen.getByRole("button", { name: "Download all (zip)" }));
    await waitFor(() => expect(api.downloadZip).toHaveBeenCalledWith({ print_ids: ["p1"] }));
  });

  it("shows supporting files and the removable prepared print, and downloads them", async () => {
    api.listFiles.mockResolvedValue([
      { id: "f1", filename: "assembly.pdf", mime: "application/pdf", size: 1048576, url: "/print/p1/files/f1" },
    ]);
    const print = makePrint({
      plates: [plate("a", "a.stl", 0)],
      supporting_file_count: 1,
      slicer_url: "/print/p1/prepared/x.gcode.3mf",
      slicer_filename: "x.gcode.3mf",
      prepared_print: { removable: true, printer: "X1C", material: "PLA", estimated_seconds: 3900 },
    });
    renderWithProviders(<ModelFilesPanel print={print} />);
    expect(await screen.findByText("assembly.pdf")).toBeInTheDocument();
    expect(screen.getByText("Supporting file · 1.0 MB")).toBeInTheDocument();
    expect(screen.getByText("Prepared print · X1C · PLA · 1 h 5 min")).toBeInTheDocument();
    expect(screen.getByText("Files (3)")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("link", { name: "Download assembly.pdf" }));
    await waitFor(() => expect(save.saveResponseToDisk).toHaveBeenCalledWith(expect.anything(), "assembly.pdf"));
    expect(api.recordDownload).not.toHaveBeenCalled();
  });

  it("does not list a non-removable prepared print as a separate file", () => {
    const print = makePrint({
      plates: [plate("a", "a.gcode.3mf", 0)],
      slicer_url: "/plate/a/a.gcode.3mf",
      slicer_filename: "a.gcode.3mf",
      prepared_print: { removable: false },
    });
    renderWithProviders(<ModelFilesPanel print={print} />);
    expect(screen.getByText("File (1)")).toBeInTheDocument();
  });

  it("flags files that are processing or failed, and tells you when a download fails", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    const print = makePrint({
      plates: [
        plate("a", "a.stl", 0, { processing_status: "processing" }),
        plate("b", "b.stl", 1, { processing_status: "failed" }),
      ],
    });
    renderWithProviders(<ModelFilesPanel print={print} />);
    expect(screen.getByText("Processing")).toBeInTheDocument();
    expect(screen.getByText("Processing failed")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("link", { name: "Download a.stl" }));
    expect(await screen.findByText("Download failed. Try again.")).toBeInTheDocument();
    expect(save.saveResponseToDisk).not.toHaveBeenCalled();
  });
});
