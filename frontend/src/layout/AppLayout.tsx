import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/app/auth";
import { GlobalDropZone, ImportJobsProvider, ImportProgress } from "@/features/imports";
import { Alert } from "@/ui";
import { BackToTop } from "./BackToTop";
import { MobileNav, Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

/** The signed-in frame: sidebar on the left, top bar and the routed page on the right. */
export default function AppLayout() {
  const { health } = useAuth();
  const { pathname } = useLocation();
  // The drawer is open for the page it was opened on, so following any link closes it.
  const [navPath, setNavPath] = useState<string | null>(null);
  const navOpen = navPath === pathname;

  return (
    <ImportJobsProvider>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[90] focus:rounded-control focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:shadow-overlay"
      >
        Skip to content
      </a>
      <div className="flex min-h-screen">
        <Sidebar />
        <MobileNav open={navOpen} onOpenChange={(next) => setNavPath(next ? pathname : null)} />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar onOpenNav={() => setNavPath(pathname)} />
          <main
            id="main"
            tabIndex={-1}
            className="mx-auto w-full max-w-[1720px] flex-1 px-4 pt-6 pb-24 focus:outline-none md:px-8"
          >
            {health?.ok === false ? (
              <Alert tone="danger" title="Can’t reach the server" className="mb-6">
                Thingport’s service isn’t responding. Check that it’s running, then reload the page.
              </Alert>
            ) : null}
            <Outlet />
          </main>
        </div>
      </div>
      <GlobalDropZone />
      <ImportProgress />
      <BackToTop />
    </ImportJobsProvider>
  );
}
