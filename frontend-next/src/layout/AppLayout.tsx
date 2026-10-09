import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

/** The signed-in frame: sidebar on the left, top bar and the routed page on the right. */
export default function AppLayout() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="mx-auto w-full max-w-[1720px] flex-1 px-4 pt-6 pb-24 md:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
