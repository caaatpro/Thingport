import type { ReactElement } from "react";
import { render, type RenderOptions } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "@mui/material/styles";
import { buildTheme } from "../theme";
import { ConfirmProvider } from "../components/ConfirmProvider";
import { ToastProvider } from "../components/ToastProvider";

type Options = Omit<RenderOptions, "wrapper"> & {
  route?: string;
  theme?: "light" | "dark";
};

/** Renders with what the real app provides around every page: theme, router, confirm and toast hosts. */
export function renderWithProviders(ui: ReactElement, { route = "/", theme = "light", ...options }: Options = {}) {
  return render(ui, {
    wrapper: ({ children }) => (
      <ThemeProvider theme={buildTheme(theme)}>
        <MemoryRouter initialEntries={[route]}>
          <ConfirmProvider>
            <ToastProvider>{children}</ToastProvider>
          </ConfirmProvider>
        </MemoryRouter>
      </ThemeProvider>
    ),
    ...options,
  });
}
