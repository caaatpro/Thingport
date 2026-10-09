import { Menu } from "lucide-react";
import { AddMenu } from "@/features/imports";
import { IconButton } from "@/ui";
import { GlobalSearch } from "./GlobalSearch";
import { NotificationBell } from "./NotificationBell";
import { UserMenu } from "./UserMenu";

type Props = {
  /** Opens the navigation drawer (phones and narrow windows). */
  onOpenNav: () => void;
};

/** Sticky, translucent bar: hamburger (small screens), search in the middle, then Add, notifications, account. */
export function TopBar({ onOpenNav }: Props) {
  return (
    <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-2 border-b border-border bg-bg/80 px-3 backdrop-blur-md md:gap-3 md:px-8">
      <IconButton label="Open menu" className="md:hidden" onClick={onOpenNav}>
        <Menu className="size-5" aria-hidden />
      </IconButton>
      <div className="mx-auto min-w-0 max-w-xl flex-1">
        <GlobalSearch />
      </div>
      <div className="flex shrink-0 items-center gap-1 md:gap-2">
        <AddMenu />
        <NotificationBell />
        <UserMenu />
      </div>
    </header>
  );
}
