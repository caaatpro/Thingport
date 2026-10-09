import { useState, type ReactNode } from "react";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { ConfirmProvider, ToastProvider, TooltipProvider } from "../ui";
import { AuthProvider, useAuth } from "./auth";
import { createQueryClient } from "./queryClient";
import { ThemeProvider } from "./theme";

function QueryBoundary({ children }: { children: ReactNode }) {
  const { onUnauthorized } = useAuth();
  // Created once. `onUnauthorized` is stable (see AuthProvider), so capturing it here is safe.
  const [client] = useState<QueryClient>(() => createQueryClient(onUnauthorized));
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** Order matters: toasts first (auth shows one), then auth, then everything that needs a signed-in user. */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <AuthProvider>
        <ThemeProvider>
          <QueryBoundary>
            <TooltipProvider>
              <ConfirmProvider>
                <BrowserRouter>{children}</BrowserRouter>
              </ConfirmProvider>
            </TooltipProvider>
          </QueryBoundary>
        </ThemeProvider>
      </AuthProvider>
    </ToastProvider>
  );
}
