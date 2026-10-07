import React from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import Alert from "@mui/material/Alert";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import BlockIcon from "@mui/icons-material/Block";
import DeleteForeverIcon from "@mui/icons-material/DeleteForever";
import DeleteSweepIcon from "@mui/icons-material/DeleteSweep";
import EditIcon from "@mui/icons-material/Edit";
import HistoryIcon from "@mui/icons-material/History";
import KeyIcon from "@mui/icons-material/Key";
import LogoutIcon from "@mui/icons-material/Logout";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import PersonAddIcon from "@mui/icons-material/PersonAddAlt1";
import RestoreIcon from "@mui/icons-material/CheckCircleOutline";
import SearchIcon from "@mui/icons-material/Search";
import ShieldIcon from "@mui/icons-material/AdminPanelSettings";
import PersonIcon from "@mui/icons-material/Person";
import { UnauthorizedError } from "../../api/client";
import { adminApi, type AdminUser } from "../../api/admin";
import { useConfirm } from "../../components/ConfirmProvider";
import { useToast } from "../../components/ToastProvider";
import { formatFileSize } from "../../utils/fileSize";
import CreateUserDialog from "./CreateUserDialog";
import { DeleteUserDialog, EditUserDialog, ResetLinkDialog, SignOutDialog } from "./UserDialogs";
import RegistrationsPanel from "./RegistrationsPanel";

type Props = {
  onUnauthorized?: () => void;
  /** The signed-in admin: can't change their own role, disable or delete themselves. */
  currentUserId?: string;
};

type Filter = "all" | "admins" | "members" | "disabled";
type Dialog = { kind: "edit" | "reset" | "signOut" | "delete"; user: AdminUser } | null;

const DAY_MS = 24 * 3600 * 1000;

/** Accounts of the instance, with search, filters and everything an admin needs to manage them. */
export default function UsersPage({ onUnauthorized, currentUserId }: Props) {
  const { t, i18n } = useTranslation(["app", "common"]);
  const navigate = useNavigate();
  const confirm = useConfirm();
  const showToast = useToast();
  // Fixed at mount: "last active" doesn't need to tick, and render must stay pure.
  const [now] = React.useState(() => Date.now());
  const [users, setUsers] = React.useState<AdminUser[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState<Filter>("all");
  const [menu, setMenu] = React.useState<{ anchor: HTMLElement; user: AdminUser } | null>(null);
  const [dialog, setDialog] = React.useState<Dialog>(null);
  const [createOpen, setCreateOpen] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      setUsers(await adminApi.listUsers());
      setError(null);
    } catch (err) {
      if (err instanceof UnauthorizedError) onUnauthorized?.();
      else setError(t("adminSettings.users.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [onUnauthorized, t]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const visible = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((u) => {
      if (filter === "admins" && u.role !== "ADMIN") return false;
      if (filter === "members" && u.role !== "MEMBER") return false;
      if (filter === "disabled" && !u.disabled) return false;
      return !q || u.email.toLowerCase().includes(q) || u.display_name.toLowerCase().includes(q);
    });
  }, [users, query, filter]);

  const counts = React.useMemo(
    () => ({
      total: users.length,
      admins: users.filter((u) => u.role === "ADMIN").length,
      disabled: users.filter((u) => u.disabled).length,
    }),
    [users],
  );

  const fail = (err: unknown) => {
    if (err instanceof UnauthorizedError) onUnauthorized?.();
    else showToast({ message: err instanceof Error ? err.message : String(err), severity: "error" });
  };

  const changed = (message?: string) => {
    if (message) showToast({ message });
    void load();
  };

  const update = async (user: AdminUser, patch: Parameters<typeof adminApi.updateUser>[1], message: string) => {
    try {
      await adminApi.updateUser(user.id, patch);
      changed(message);
    } catch (err) {
      fail(err);
    }
  };

  const roleLabel = (role: AdminUser["role"]) =>
    role === "ADMIN" ? t("adminSettings.users.roleAdmin") : t("adminSettings.users.roleMember");

  const toggleDisabled = async (user: AdminUser) => {
    if (!user.disabled) {
      const ok = await confirm({
        title: t("adminSettings.users.disableConfirm.title", { name: user.display_name }),
        message: t("adminSettings.users.disableConfirm.message"),
        confirmLabel: t("adminSettings.users.disableConfirm.confirm"),
        destructive: true,
      });
      if (!ok) return;
    }
    await update(
      user,
      { disabled: !user.disabled },
      t(user.disabled ? "adminSettings.users.enabledDone" : "adminSettings.users.disabledDone", {
        name: user.display_name,
      }),
    );
  };

  const deleteModels = async (user: AdminUser) => {
    const ok = await confirm({
      title: t("adminSettings.users.deleteModels.title", { name: user.display_name }),
      message: t("adminSettings.users.deleteModels.message", { count: user.print_count }),
      destructive: true,
    });
    if (!ok) return;
    try {
      const res = await adminApi.deleteAllPrintsForUser(user.id);
      changed(t("adminSettings.users.deleteModels.done", { count: res.deleted }));
    } catch (err) {
      fail(err);
    }
  };

  const lastActive = (iso: string | null) => {
    if (!iso) return t("adminSettings.users.never");
    const diff = new Date(iso).getTime() - now;
    const rtf = new Intl.RelativeTimeFormat(i18n.language, { numeric: "auto" });
    const days = Math.round(diff / DAY_MS);
    if (Math.abs(days) >= 1) return rtf.format(days, "day");
    const hours = Math.round(diff / 3600000);
    if (Math.abs(hours) >= 1) return rtf.format(hours, "hour");
    return rtf.format(Math.round(diff / 60000), "minute");
  };

  const formatDate = (iso: string) => new Date(iso).toLocaleDateString(i18n.language);

  const closeMenu = () => setMenu(null);
  const menuUser = menu?.user ?? null;
  const isSelf = menuUser?.id === currentUserId;

  return (
    <Stack spacing={3}>
      <RegistrationsPanel onUnauthorized={onUnauthorized} />

      {error && (
        <Alert severity="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Stack spacing={1.5}>
        <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} alignItems={{ md: "center" }}>
          <TextField
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("adminSettings.users.searchPlaceholder")}
            size="small"
            sx={{ width: { xs: "100%", md: 320 } }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            }}
          />
          <ToggleButtonGroup
            exclusive
            size="small"
            value={filter}
            onChange={(_e, next: Filter | null) => next && setFilter(next)}
          >
            <ToggleButton value="all">{t("adminSettings.users.filterAll")}</ToggleButton>
            <ToggleButton value="admins">{t("adminSettings.users.filterAdmins")}</ToggleButton>
            <ToggleButton value="members">{t("adminSettings.users.filterMembers")}</ToggleButton>
            <ToggleButton value="disabled" disabled={counts.disabled === 0}>
              {t("adminSettings.users.filterDisabled")}
            </ToggleButton>
          </ToggleButtonGroup>
          <Box sx={{ flex: 1 }} />
          <Typography variant="body2" color="text.secondary">
            {t("adminSettings.users.summary", counts)}
          </Typography>
          <Button variant="contained" startIcon={<PersonAddIcon />} onClick={() => setCreateOpen(true)}>
            {t("adminSettings.users.addUser")}
          </Button>
        </Stack>

        {loading ? (
          <Stack alignItems="center" sx={{ py: 4 }}>
            <CircularProgress size={22} />
          </Stack>
        ) : (
          <Paper variant="outlined">
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>{t("adminSettings.users.columnUser")}</TableCell>
                    <TableCell>{t("adminSettings.users.columnRole")}</TableCell>
                    <TableCell>{t("adminSettings.users.columnStatus")}</TableCell>
                    <TableCell align="right">{t("adminSettings.users.columnModels")}</TableCell>
                    <TableCell align="right">{t("adminSettings.users.columnStorage")}</TableCell>
                    <TableCell>{t("adminSettings.users.columnLastActive")}</TableCell>
                    <TableCell>{t("adminSettings.users.columnCreated")}</TableCell>
                    <TableCell padding="checkbox" />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {visible.map((u) => (
                    <TableRow key={u.id} hover sx={u.disabled ? { opacity: 0.6 } : undefined}>
                      <TableCell>
                        <Stack direction="row" spacing={1.5} alignItems="center">
                          <Avatar sx={{ width: 32, height: 32, fontSize: 14 }}>
                            {(u.display_name || u.email).slice(0, 1).toUpperCase()}
                          </Avatar>
                          <Box sx={{ minWidth: 0 }}>
                            <Stack direction="row" spacing={0.75} alignItems="center">
                              <Typography variant="body2" fontWeight={600} noWrap>
                                {u.display_name}
                              </Typography>
                              {u.id === currentUserId && (
                                <Chip
                                  size="small"
                                  label={t("adminSettings.users.you")}
                                  sx={{ height: 18, fontSize: 11 }}
                                />
                              )}
                            </Stack>
                            <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
                              {u.email}
                            </Typography>
                          </Box>
                        </Stack>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={roleLabel(u.role)}
                          size="small"
                          color={u.role === "ADMIN" ? "primary" : "default"}
                          variant={u.role === "ADMIN" ? "filled" : "outlined"}
                        />
                      </TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                          <Chip
                            size="small"
                            label={
                              u.disabled
                                ? t("adminSettings.users.statusDisabled")
                                : t("adminSettings.users.statusActive")
                            }
                            color={u.disabled ? "error" : "success"}
                            variant={u.disabled ? "filled" : "outlined"}
                          />
                          {!u.email_verified && (
                            <Chip
                              size="small"
                              color="warning"
                              variant="outlined"
                              label={t("adminSettings.users.statusUnverified")}
                            />
                          )}
                        </Stack>
                      </TableCell>
                      <TableCell align="right">{u.print_count}</TableCell>
                      <TableCell align="right">{u.storage_bytes ? formatFileSize(u.storage_bytes) : "—"}</TableCell>
                      <TableCell>
                        <Tooltip title={u.last_login_at ? new Date(u.last_login_at).toLocaleString(i18n.language) : ""}>
                          <span>{lastActive(u.last_login_at)}</span>
                        </Tooltip>
                      </TableCell>
                      <TableCell>{formatDate(u.created_at)}</TableCell>
                      <TableCell padding="checkbox">
                        <IconButton
                          size="small"
                          aria-label={t("adminSettings.users.actions.open")}
                          onClick={(e) => setMenu({ anchor: e.currentTarget, user: u })}
                        >
                          <MoreVertIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                  {visible.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} align="center" sx={{ py: 4, color: "text.secondary" }}>
                        {t("adminSettings.users.noMatches")}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        )}
      </Stack>

      <Menu anchorEl={menu?.anchor} open={Boolean(menu)} onClose={closeMenu}>
        {menuUser && [
          <MenuItem
            key="edit"
            onClick={() => {
              setDialog({ kind: "edit", user: menuUser });
              closeMenu();
            }}
          >
            <ListItemIcon>
              <EditIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>{t("adminSettings.users.actions.edit")}</ListItemText>
          </MenuItem>,
          !isSelf && (
            <MenuItem
              key="role"
              onClick={() => {
                const next = menuUser.role === "ADMIN" ? "MEMBER" : "ADMIN";
                closeMenu();
                void update(
                  menuUser,
                  { role: next },
                  t("adminSettings.users.roleChanged", { name: menuUser.display_name, role: roleLabel(next) }),
                );
              }}
            >
              <ListItemIcon>
                {menuUser.role === "ADMIN" ? <PersonIcon fontSize="small" /> : <ShieldIcon fontSize="small" />}
              </ListItemIcon>
              <ListItemText>
                {menuUser.role === "ADMIN"
                  ? t("adminSettings.users.actions.makeMember")
                  : t("adminSettings.users.actions.makeAdmin")}
              </ListItemText>
            </MenuItem>
          ),
          <MenuItem
            key="reset"
            onClick={() => {
              setDialog({ kind: "reset", user: menuUser });
              closeMenu();
            }}
          >
            <ListItemIcon>
              <KeyIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>{t("adminSettings.users.actions.resetPassword")}</ListItemText>
          </MenuItem>,
          <MenuItem
            key="signout"
            onClick={() => {
              setDialog({ kind: "signOut", user: menuUser });
              closeMenu();
            }}
          >
            <ListItemIcon>
              <LogoutIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>{t("adminSettings.users.actions.signOut")}</ListItemText>
          </MenuItem>,
          <MenuItem
            key="activity"
            onClick={() => {
              closeMenu();
              navigate(`/admin-logs?user=${menuUser.id}`);
            }}
          >
            <ListItemIcon>
              <HistoryIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>{t("adminSettings.users.actions.viewActivity")}</ListItemText>
          </MenuItem>,
          <Divider key="divider" />,
          !isSelf && (
            <MenuItem
              key="disable"
              onClick={() => {
                closeMenu();
                void toggleDisabled(menuUser);
              }}
            >
              <ListItemIcon>
                {menuUser.disabled ? <RestoreIcon fontSize="small" /> : <BlockIcon fontSize="small" />}
              </ListItemIcon>
              <ListItemText>
                {menuUser.disabled ? t("adminSettings.users.actions.enable") : t("adminSettings.users.actions.disable")}
              </ListItemText>
            </MenuItem>
          ),
          <MenuItem
            key="models"
            disabled={menuUser.print_count === 0}
            onClick={() => {
              closeMenu();
              void deleteModels(menuUser);
            }}
            sx={{ color: "error.main" }}
          >
            <ListItemIcon sx={{ color: "inherit" }}>
              <DeleteSweepIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>{t("adminSettings.users.actions.deleteModels")}</ListItemText>
          </MenuItem>,
          !isSelf && (
            <MenuItem
              key="delete"
              onClick={() => {
                setDialog({ kind: "delete", user: menuUser });
                closeMenu();
              }}
              sx={{ color: "error.main" }}
            >
              <ListItemIcon sx={{ color: "inherit" }}>
                <DeleteForeverIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>{t("adminSettings.users.actions.deleteUser")}</ListItemText>
            </MenuItem>
          ),
        ]}
      </Menu>

      <CreateUserDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => void load()}
        onUnauthorized={onUnauthorized}
      />
      <EditUserDialog
        user={dialog?.kind === "edit" ? dialog.user : null}
        onClose={() => setDialog(null)}
        onChanged={changed}
        onUnauthorized={onUnauthorized}
      />
      <ResetLinkDialog
        user={dialog?.kind === "reset" ? dialog.user : null}
        onClose={() => setDialog(null)}
        onUnauthorized={onUnauthorized}
      />
      <SignOutDialog
        user={dialog?.kind === "signOut" ? dialog.user : null}
        onClose={() => setDialog(null)}
        onChanged={changed}
        onUnauthorized={onUnauthorized}
      />
      <DeleteUserDialog
        user={dialog?.kind === "delete" ? dialog.user : null}
        onClose={() => setDialog(null)}
        onChanged={changed}
        onUnauthorized={onUnauthorized}
      />
    </Stack>
  );
}
