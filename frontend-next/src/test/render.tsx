import type { ReactElement } from "react";
import { render, type RenderOptions } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { ConfirmProvider, ToastProvider, TooltipProvider } from "@/ui";

type Options = Omit<RenderOptions, "wrapper"> & { route?: string };

/** Renders inside the providers a page expects (router, query client, toasts, confirm, tooltips). */
export function renderWithProviders(ui: ReactElement, { route = "/", ...options }: Options = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return {
    queryClient,
    ...render(ui, {
      wrapper: ({ children }) => (
        <ToastProvider>
          <QueryClientProvider client={queryClient}>
            <TooltipProvider>
              <ConfirmProvider>
                <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
              </ConfirmProvider>
            </TooltipProvider>
          </QueryClientProvider>
        </ToastProvider>
      ),
      ...options,
    }),
  };
}
