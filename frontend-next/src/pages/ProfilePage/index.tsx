import { Link } from "react-router-dom";
import { useAuth } from "@/app/auth";
import { useTheme } from "@/app/theme";
import { THEME_OPTIONS } from "@/constants/settingsOptions";
import { useGravatarUrl } from "@/hooks/useGravatarUrl";
import { Avatar, Badge, Button, Card, PageHeader, Segmented } from "@/ui";
import { ApiTokensSection } from "./ApiTokensSection";
import { AuthorPreviewSetting } from "./AuthorPreviewSetting";
import { MakerworldCookieSection } from "./MakerworldCookieSection";
import { Section } from "./Section";
import { SlicerPicker } from "./SlicerPicker";

function ThemeSetting() {
  const { selection, setSelection } = useTheme();
  const current = THEME_OPTIONS.find((o) => o.id === selection);
  return (
    <Section title="Theme" description={current?.description}>
      <Segmented label="Theme" value={selection} onChange={setSelection} options={THEME_OPTIONS.map((o) => ({ value: o.id, label: o.label }))} />
    </Section>
  );
}

export default function ProfilePage() {
  const { user } = useAuth();
  const avatarUrl = useGravatarUrl(user?.email, 128);

  return (
    <div className="flex max-w-xl flex-col gap-8">
      <PageHeader title="Profile" className="mb-0" />

      <Card padding="lg" className="flex flex-col gap-5">
        <div className="flex items-center gap-4">
          <Avatar src={avatarUrl} name={user?.display_name} size={64} />
          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-fg">{user?.display_name}</p>
            {user?.role === "ADMIN" ? <Badge tone="accent">Admin</Badge> : null}
          </div>
        </div>
        <dl className="flex flex-col gap-3 border-t border-border pt-4 text-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <dt className="sr-only">Email</dt>
              <dd className="truncate text-fg">{user?.email}</dd>
              {user?.pending_email ? <dd className="text-xs text-muted">Pending confirmation for {user.pending_email}</dd> : null}
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/profile/email">Change email</Link>
            </Button>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div>
              <dt className="sr-only">Password</dt>
              <dd className="text-fg">••••••••</dd>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/profile/password">Change password</Link>
            </Button>
          </div>
        </dl>
      </Card>

      <ThemeSetting />
      <SlicerPicker />
      <MakerworldCookieSection />
      <AuthorPreviewSetting />
      <ApiTokensSection />
    </div>
  );
}
