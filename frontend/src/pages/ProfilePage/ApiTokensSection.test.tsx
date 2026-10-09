import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { tokensApi, type ApiToken } from "@/api/tokens";
import { renderWithProviders } from "@/test/render";
import { copyText } from "@/utils/copyText";
import { ApiTokensSection, tokenDetails } from "./ApiTokensSection";

vi.mock("@/utils/copyText", () => ({ copyText: vi.fn<(text: string) => Promise<boolean>>() }));

const token = (over: Partial<ApiToken> = {}): ApiToken => ({
  id: "t1",
  name: "Laptop",
  prefix: "tp_ab",
  scope: "import",
  created_at: "2026-01-01T00:00:00Z",
  last_used_at: null,
  expires_at: null,
  ...over,
});

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(tokensApi, "list");
  vi.spyOn(tokensApi, "create");
  vi.spyOn(tokensApi, "revoke");
});

describe("ApiTokensSection", () => {
  it("lists tokens with their scope and last use", async () => {
    vi.mocked(tokensApi.list).mockResolvedValue([
      token(),
      token({ id: "t2", name: "Desktop", last_used_at: "2026-02-02T00:00:00Z" }),
    ]);
    renderWithProviders(<ApiTokensSection />);
    expect(await screen.findByText("Laptop")).toBeInTheDocument();
    expect(screen.getAllByText("import")).toHaveLength(2);
    expect(screen.getByText(/Never used/)).toBeInTheDocument();
    expect(screen.getByText(/Last used/)).toBeInTheDocument();
  });

  it("shows the new secret once, copies it, and drops it when dismissed", async () => {
    vi.mocked(tokensApi.list).mockResolvedValue([]);
    vi.mocked(tokensApi.create).mockResolvedValue({ ...token(), token: "tp_secret_value" });
    vi.mocked(copyText).mockResolvedValue(true);
    renderWithProviders(<ApiTokensSection />);
    await userEvent.type(await screen.findByLabelText("Token name"), "  CI box ");
    await userEvent.click(screen.getByRole("button", { name: "Create token" }));
    expect(tokensApi.create).toHaveBeenCalledWith("CI box", null);
    expect(await screen.findByLabelText("New token")).toHaveValue("tp_secret_value");
    await userEvent.click(screen.getByRole("button", { name: "Copy" }));
    expect(copyText).toHaveBeenCalledWith("tp_secret_value");
    expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByLabelText("New token")).toBeNull();
  });

  it("keeps Create disabled until a name is typed", async () => {
    vi.mocked(tokensApi.list).mockResolvedValue([]);
    renderWithProviders(<ApiTokensSection />);
    expect(await screen.findByRole("button", { name: "Create token" })).toBeDisabled();
  });

  it("revokes only after confirmation", async () => {
    vi.mocked(tokensApi.list).mockResolvedValue([token()]);
    vi.mocked(tokensApi.revoke).mockResolvedValue();
    renderWithProviders(<ApiTokensSection />);
    await userEvent.click(await screen.findByRole("button", { name: "Revoke Laptop" }));
    const dialog = await screen.findByRole("dialog");
    expect(tokensApi.revoke).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole("button", { name: "Revoke" }));
    await waitFor(() => expect(tokensApi.revoke).toHaveBeenCalledWith("t1"));
  });
});

describe("tokenDetails", () => {
  it("mentions expiry only when set", () => {
    expect(tokenDetails(token())).not.toMatch(/Expires/);
    expect(tokenDetails(token({ expires_at: "2027-01-01T00:00:00Z" }))).toMatch(/Expires/);
  });
});
