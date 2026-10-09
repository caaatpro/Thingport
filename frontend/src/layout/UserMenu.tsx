import { useState } from "react";
import { Link } from "react-router-dom";
import { Box, LogOut, Monitor, Moon, Sun, User } from "lucide-react";
import { useAuth } from "@/app/auth";
import { useTheme } from "@/app/theme";
import type { ThemeSelection } from "@/constants/settingsOptions";
import { SELF_AUTHOR_ID } from "@/constants/selfAuthor";
import { useGravatarUrl } from "@/hooks/useGravatarUrl";
import { Avatar, Button, IconButton, Popover, Segmented, buttonStyles, cn, type SegmentedOption } from "@/ui";

const THEMES: SegmentedOption<ThemeSelection>[] = [
  { value: "light", label: <Sun className="size-4" aria-hidden />, "aria-label": "Light" },
  { value: "dark", label: <Moon className="size-4" aria-hidden />, "aria-label": "Dark" },
  { value: "system", label: <Monitor className="size-4" aria-hidden />, "aria-label": "System" },
];

const itemClass = cn(buttonStyles({ variant: "ghost", size: "md" }), "w-full justify-start px-2.5 font-normal text-fg");

/** Identity, quick links, theme and sign-out. */
export function UserMenu() {
  const { user, logout } = useAuth();
  const { selection, setSelection } = useTheme();
  const avatarUrl = useGravatarUrl(user?.email, 96);
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      align="end"
      className="w-64 p-1.5"
      trigger={
        <IconButton label="User actions" className="rounded-full">
          <Avatar src={avatarUrl} name={user?.display_name} size={32} />
        </IconButton>
      }
    >
      <div className="flex items-center gap-3 px-2.5 py-2">
        <Avatar src={avatarUrl} size={36} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-fg">{user?.display_name}</p>
          <p className="truncate text-xs text-muted">{user?.email}</p>
        </div>
      </div>
      <div className="my-1.5 h-px bg-border" />
      <Link to="/profile" onClick={close} className={itemClass}>
        <User className="size-4" aria-hidden />
        Profile
      </Link>
      <Link to={`/authors/${SELF_AUTHOR_ID}`} onClick={close} className={itemClass}>
        <Box className="size-4" aria-hidden />
        My models
      </Link>
      <div className="flex items-center justify-between gap-2 px-2.5 py-2">
        <span className="text-sm text-fg">Theme</span>
        <Segmented label="Theme" size="sm" value={selection} onChange={setSelection} options={THEMES} />
      </div>
      <div className="my-1.5 h-px bg-border" />
      <Button
        variant="ghost"
        className="w-full justify-start px-2.5 font-normal text-fg"
        icon={<LogOut className="size-4" aria-hidden />}
        onClick={() => {
          close();
          logout();
        }}
      >
        Log out
      </Button>
    </Popover>
  );
}
