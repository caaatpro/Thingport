import { useAuth } from "@/app/auth";
import { Avatar, Button } from "@/ui";

/** Minimal top bar; the shell work replaces it with search, add menu, notifications and the user menu. */
export function TopBar() {
  const { user, logout } = useAuth();
  return (
    <div className="sticky top-0 z-40 flex h-16 items-center justify-end gap-3 border-b border-border bg-bg/80 px-4 backdrop-blur md:px-8">
      <Avatar name={user?.display_name} />
      <Button variant="ghost" size="sm" onClick={logout}>
        Sign out
      </Button>
    </div>
  );
}
