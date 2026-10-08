import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../test/render";
import type { AnyFn } from "../test/types";

const usersApi = vi.hoisted(() => ({ list: vi.fn<AnyFn>() }));
vi.mock("../api/users", () => ({ usersApi }));

const { default: ShareDialog } = await import("./ShareDialog");

const members = [
  { id: "u1", display_name: "Anna Ivanova", email: "anna@example.test" },
  { id: "u2", display_name: "Boris Petrov", email: "boris@example.test" },
];

function open(overrides: Partial<React.ComponentProps<typeof ShareDialog>> = {}) {
  const props = {
    open: true,
    onClose: vi.fn<AnyFn>(),
    name: "Benchy",
    loadShares: vi.fn<AnyFn>().mockResolvedValue([]),
    saveShares: vi.fn<AnyFn>().mockResolvedValue(undefined),
    ...overrides,
  };
  renderWithProviders(<ShareDialog {...props} />);
  return props;
}

beforeEach(() => usersApi.list.mockResolvedValue(members));

describe("ShareDialog", () => {
  it("starts private and lists the other members", async () => {
    open();
    expect(screen.getByText('Share "Benchy"')).toBeInTheDocument();
    expect(await screen.findByText("Anna Ivanova")).toBeInTheDocument();
    expect(screen.getByText("Boris Petrov")).toBeInTheDocument();
    expect(screen.getByText(/Private — only you can see this/)).toBeInTheDocument();
  });

  it("pre-selects the people it is already shared with", async () => {
    open({ loadShares: vi.fn<AnyFn>().mockResolvedValue([{ user_id: "u2", display_name: "Boris", email: "b" }]) });
    await screen.findByText("Anna Ivanova");
    expect(await screen.findByText("Shared with 1 person.")).toBeInTheDocument();
  });

  it("saves the picked members and closes", async () => {
    const props = open();
    await userEvent.click(await screen.findByText("Anna Ivanova"));
    expect(screen.getByText("Shared with 1 person.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(props.saveShares).toHaveBeenCalledWith(["u1"], expect.anything()));
    expect(props.onClose).toHaveBeenCalled();
  });

  it("can take a person back out before saving", async () => {
    const props = open();
    await userEvent.click(await screen.findByText("Anna Ivanova"));
    await userEvent.click(screen.getByText("Anna Ivanova"));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(props.saveShares).toHaveBeenCalledWith([], expect.anything()));
  });

  it("filters the member list by name or email", async () => {
    open();
    await screen.findByText("Anna Ivanova");
    await userEvent.type(screen.getByPlaceholderText("Search members…"), "boris@");
    expect(screen.queryByText("Anna Ivanova")).toBeNull();
    expect(screen.getByText("Boris Petrov")).toBeInTheDocument();
  });

  it("shows the server's message when saving fails and stays open", async () => {
    const props = open({
      saveShares: vi.fn<AnyFn>().mockRejectedValue(new Error("Share list contains an unknown user")),
    });
    await userEvent.click(await screen.findByText("Anna Ivanova"));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Share list contains an unknown user")).toBeInTheDocument();
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it("explains when there is nobody to share with", async () => {
    usersApi.list.mockResolvedValue([]);
    open();
    expect(await screen.findByText("No other members to share with yet.")).toBeInTheDocument();
  });

  it("shows a collection's hint when given", async () => {
    open({ hint: "Everyone you pick sees every model." });
    await screen.findByText("Anna Ivanova");
    expect(screen.getByText("Everyone you pick sees every model.")).toBeInTheDocument();
    expect(within(screen.getByRole("dialog")).getByText('Share "Benchy"')).toBeInTheDocument();
  });

  it("with roles: new people start as viewers and the picked permission is saved", async () => {
    const props = open({
      withRoles: true,
      loadShares: vi
        .fn<AnyFn>()
        .mockResolvedValue([{ user_id: "u2", display_name: "Boris", email: "b", role: "edit" }]),
    });
    await userEvent.click(await screen.findByText("Anna Ivanova"));
    const select = screen.getByRole("combobox", { name: "Permission for Anna Ivanova" });
    expect(select).toHaveTextContent("Can view");
    await userEvent.click(select);
    await userEvent.click(await screen.findByRole("option", { name: "Can upload" }));
    expect(screen.getByRole("combobox", { name: "Permission for Boris Petrov" })).toHaveTextContent("Can edit");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(props.saveShares).toHaveBeenCalledWith(["u2", "u1"], { u2: "edit", u1: "upload" }));
  });

  it("without roles: no permission pickers are shown", async () => {
    open();
    await userEvent.click(await screen.findByText("Anna Ivanova"));
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
});
