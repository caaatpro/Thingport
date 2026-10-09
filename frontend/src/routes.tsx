import { lazy, Suspense } from "react";
import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { useAuth } from "@/app/auth";
import AppLayout from "@/layout/AppLayout";
import { PageLoading } from "@/ui";

// One chunk per page: the shell loads fast and three.js only arrives with a model page.
const DashboardPage = lazy(() => import("@/pages/DashboardPage"));
const ModelsPage = lazy(() => import("@/pages/ModelsPage"));
const ModelDetailPage = lazy(() => import("@/pages/ModelDetailPage"));
const CollectionsPage = lazy(() => import("@/pages/CollectionsPage"));
const CollectionDetailPage = lazy(() => import("@/pages/CollectionDetailPage"));
const TagsPage = lazy(() => import("@/pages/TagsPage"));
const TagDetailPage = lazy(() => import("@/pages/TagDetailPage"));
const AuthorPage = lazy(() => import("@/pages/AuthorPage"));
const ProfilePage = lazy(() => import("@/pages/ProfilePage"));
const ChangeEmailPage = lazy(() => import("@/pages/ProfilePage/ChangeEmailPage"));
const ChangePasswordPage = lazy(() => import("@/pages/ProfilePage/ChangePasswordPage"));
const DownloadPage = lazy(() => import("@/pages/DownloadPage"));
const AdminPage = lazy(() => import("@/pages/AdminPage"));
const AdminSettingsPage = lazy(() => import("@/pages/AdminSettingsPage"));
const RenderingPage = lazy(() => import("@/pages/RenderingPage"));
const UsersPage = lazy(() => import("@/pages/UsersPage"));
const LogsPage = lazy(() => import("@/pages/LogsPage"));
const TriggersPage = lazy(() => import("@/pages/TriggersPage"));
const ConnectionsPage = lazy(() => import("@/pages/ConnectionsPage"));
const AuthPage = lazy(() => import("@/pages/AuthPage"));
const VerifyEmailPage = lazy(() => import("@/pages/VerifyEmailPage"));
const ResetPasswordPage = lazy(() => import("@/pages/ResetPasswordPage"));

function RequireAdmin() {
  const { isAdmin } = useAuth();
  return isAdmin ? <Outlet /> : <Navigate to="/" replace />;
}

/** Signed-out visitors only ever see the sign-in family; everything else needs a session. */
export default function AppRoutes() {
  const { token, health } = useAuth();
  const authRequired = health?.auth_required ?? true;

  return (
    <Suspense fallback={<PageLoading />}>
      {authRequired && !token ? (
        <Routes>
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="*" element={<AuthPage />} />
        </Routes>
      ) : (
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/models" element={<ModelsPage />} />
            <Route path="/models/collections" element={<CollectionsPage />} />
            <Route path="/models/collections/:collectionId" element={<CollectionDetailPage />} />
            <Route path="/models/tags" element={<TagsPage />} />
            <Route path="/models/tags/:tagName" element={<TagDetailPage />} />
            <Route path="/models/:printId" element={<ModelDetailPage />} />
            <Route path="/authors/:authorId" element={<AuthorPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/profile/email" element={<ChangeEmailPage />} />
            <Route path="/profile/password" element={<ChangePasswordPage />} />
            <Route path="/downloads" element={<DownloadPage />} />
            <Route element={<RequireAdmin />}>
              <Route path="/admin" element={<AdminPage />} />
              <Route path="/admin-settings" element={<AdminSettingsPage />} />
              <Route path="/admin-rendering" element={<RenderingPage />} />
              <Route path="/admin-users" element={<UsersPage />} />
              <Route path="/admin-logs" element={<LogsPage />} />
              <Route path="/admin-triggers" element={<TriggersPage />} />
              <Route path="/admin-connections" element={<ConnectionsPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      )}
    </Suspense>
  );
}
