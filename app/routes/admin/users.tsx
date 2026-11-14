import {
  data,
  Link,
  redirect,
  useFetcher,
  useNavigate,
  useSearchParams,
} from "react-router";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  createColumnHelper,
  flexRender,
  type SortingState,
  type FilterFn,
} from "@tanstack/react-table";
import { FaMagnifyingGlass } from "react-icons/fa6";
import type { Route } from "./+types/users";
import { appContext } from "~/context";
import { EmailService } from "~/lib/email-service";
import { EmailInUse, SignInAccountConflict, UserStore } from "~/lib/user-store";
import { isRoot, requireAdmin } from "~/lib/authorize.server";
import { showToast } from "~/components/toaster";
import { DateDisplay } from "~/components/date-display";
import { useEffect, useMemo, useRef, useState } from "react";
import { hasAdminAccess, isRootRole } from "~/lib/website-role";

type AdminUser = Awaited<ReturnType<typeof loader>>["users"][number];
type DeletedUser = Awaited<ReturnType<typeof loader>>["deletedUsers"][number];

const columnHelper = createColumnHelper<AdminUser>();

function getAccountState(user: AdminUser) {
  if (user.cognito_status === null) {
    return {
      label: "Cognito account missing",
      detail: "No matching sign-in account",
      badgeClass: "badge-error",
    };
  }

  if (user.cognito_status === "CONFIRMED") {
    return {
      label: "Active",
      detail: "Password established",
      badgeClass: "badge-success",
    };
  }

  if (user.cognito_status === "FORCE_CHANGE_PASSWORD") {
    if (!user.temporary_password_expires_at) {
      return {
        label: "Password change required",
        detail: "Temporary password expiry unknown",
        badgeClass: "badge-warning",
      };
    }

    if (Date.parse(user.temporary_password_expires_at) <= Date.now()) {
      return {
        label: "Temporary password expired",
        detail: "Send a new temporary password",
        badgeClass: "badge-error",
      };
    }

    return {
      label: "Password change required",
      detail: "Temporary password pending",
      badgeClass: "badge-warning",
    };
  }

  if (user.cognito_status === "RESET_REQUIRED") {
    return {
      label: "Password reset required",
      detail: "User must complete account recovery",
      badgeClass: "badge-warning",
    };
  }

  if (user.cognito_status === "UNKNOWN") {
    return {
      label: "Status unknown",
      detail: "Cognito did not report an account state",
      badgeClass: "badge-neutral",
    };
  }

  return {
    label: user.cognito_status,
    detail: "Cognito account state",
    badgeClass: "badge-neutral",
  };
}

const fuzzyGlobalFilter: FilterFn<AdminUser> = (row, _columnId, value) => {
  const user = row.original;
  const accountState = getAccountState(user);
  const haystack = [
    user.first_name,
    user.last_name,
    user.email,
    user.user_id,
    user.website_role,
    user.note ?? "",
    accountState.label,
    accountState.detail,
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(String(value).trim().toLowerCase());
};

export function meta({}: Route.MetaArgs) {
  return [
    { title: "User Administration - Admin - Amelia Rescue" },
    { name: "description", content: "Manage users" },
  ];
}

export const handle = {
  breadcrumb: "Users",
};

export async function loader({ context }: Route.LoaderArgs) {
  const ctx = context.get(appContext);

  if (!ctx?.user || !hasAdminAccess(ctx.user.website_role)) {
    throw redirect("/");
  }

  const userStore = UserStore.make();
  const allUsers = (await userStore.listUsersWithAccountStatus(true)).sort(
    (a, b) => {
      const firstNameComparison = a.first_name.localeCompare(b.first_name);
      if (firstNameComparison !== 0) {
        return firstNameComparison;
      }

      const lastNameComparison = a.last_name.localeCompare(b.last_name);
      if (lastNameComparison !== 0) {
        return lastNameComparison;
      }

      return a.email.localeCompare(b.email);
    },
  );

  const users = allUsers.filter((user) => !user.deleted_at);
  const deletedUsers = allUsers
    .filter((user) => user.deleted_at)
    .map((user) => ({
      user_id: user.user_id,
      first_name: user.first_name,
      last_name: user.last_name,
      email: user.email,
      note: user.note,
      deleted_at: user.deleted_at as string,
    }));

  return {
    users,
    deletedUsers,
    canDeletePermanently: isRootRole(ctx.user.website_role),
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const ctx = requireAdmin(context);

  const formData = await request.formData();
  const intent = formData.get("intent");
  const userId = formData.get("userId");

  if (intent === "delete" && typeof userId === "string") {
    const userStore = UserStore.make();
    try {
      const target = await userStore.getUser(userId, { includeDeleted: true });
      if (isRootRole(target.website_role) && !isRoot(ctx)) {
        return data(
          { success: false, error: "Only root users can delete root users." },
          { status: 403 },
        );
      }
      await userStore.softDelete(userId);
      return data({ success: true, intent: "delete" });
    } catch (error) {
      if (error instanceof Error) {
        return data({ success: false, error: error.message }, { status: 500 });
      }

      return data(
        { success: false, error: "Failed to delete user" },
        { status: 500 },
      );
    }
  }

  if (intent === "restore" && typeof userId === "string") {
    const userStore = UserStore.make();
    try {
      const { user, temporaryPassword, temporaryPasswordExpiresAt } =
        await userStore.restoreUser(userId);
      await EmailService.make().sendTemporaryPasswordEmail({
        user,
        temporaryPassword,
        temporaryPasswordExpiresAt,
        reason: "restored",
      });
      return data({
        success: true,
        intent: "restore",
        userEmail: user.email,
      });
    } catch (error) {
      if (error instanceof EmailInUse) {
        return data(
          {
            success: false,
            error: `${error.message} They were probably re-onboarded as a new user, so this old record can't be restored.`,
          },
          { status: 409 },
        );
      }
      if (error instanceof SignInAccountConflict) {
        return data({ success: false, error: error.message }, { status: 409 });
      }
      return data(
        {
          success: false,
          error:
            error instanceof Error ? error.message : "Failed to restore user",
        },
        { status: 500 },
      );
    }
  }

  if (intent === "delete-permanently" && typeof userId === "string") {
    if (!isRoot(ctx)) {
      return data(
        {
          success: false,
          error: "Only root users can permanently delete users.",
        },
        { status: 403 },
      );
    }
    const userStore = UserStore.make();
    try {
      const target = await userStore.getUser(userId, { includeDeleted: true });
      if (!target.deleted_at) {
        return data(
          {
            success: false,
            error: "Delete the user first, then delete them permanently.",
          },
          { status: 400 },
        );
      }
      const confirmation = String(formData.get("confirmEmail") ?? "");
      if (confirmation.trim().toLowerCase() !== target.email.toLowerCase()) {
        return data(
          { success: false, error: "The email you typed doesn't match." },
          { status: 400 },
        );
      }
      await userStore.deletePermanently(userId);
      return data({
        success: true,
        intent: "delete-permanently",
        userEmail: target.email,
      });
    } catch (error) {
      return data(
        {
          success: false,
          error:
            error instanceof Error
              ? error.message
              : "Failed to permanently delete user",
        },
        { status: 500 },
      );
    }
  }

  if (intent === "set-temporary-password" && typeof userId === "string") {
    const userStore = UserStore.make();
    const emailService = EmailService.make();

    try {
      const { user, temporaryPassword, temporaryPasswordExpiresAt } =
        await userStore.setTemporaryPassword(userId);
      await emailService.sendTemporaryPasswordEmail({
        user,
        temporaryPassword,
        temporaryPasswordExpiresAt,
      });

      return data({
        success: true,
        intent: "set-temporary-password",
        userEmail: user.email,
      });
    } catch (error) {
      if (error instanceof Error) {
        return data({ success: false, error: error.message }, { status: 500 });
      }

      return data(
        { success: false, error: "Failed to delete user" },
        { status: 500 },
      );
    }
  }

  return data({ success: false, error: "Invalid request" }, { status: 400 });
}

export default function AdminUsers({ loaderData }: Route.ComponentProps) {
  const { users, deletedUsers, canDeletePermanently } = loaderData;
  const fetcher = useFetcher<typeof action>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const hasShownToast = useRef(false);
  const hasShownRedirectToast = useRef(false);
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null);
  const [deleteUserName, setDeleteUserName] = useState<string>("");
  const [tempPasswordUserId, setTempPasswordUserId] = useState<string | null>(
    null,
  );
  const [tempPasswordUserName, setTempPasswordUserName] = useState<string>("");
  const [tempPasswordUserEmail, setTempPasswordUserEmail] =
    useState<string>("");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState(
    () => searchParams.get("q") ?? "",
  );
  const [view, setView] = useState<"active" | "deleted">(() =>
    searchParams.get("view") === "deleted" ? "deleted" : "active",
  );
  const [restoreTarget, setRestoreTarget] = useState<DeletedUser | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<DeletedUser | null>(null);
  const [purgeConfirmation, setPurgeConfirmation] = useState("");

  const openRestoreModal = (user: DeletedUser) => {
    setRestoreTarget(user);
    (
      document.getElementById("restore_modal") as HTMLDialogElement
    )?.showModal();
  };

  const closeRestoreModal = () => {
    setRestoreTarget(null);
    (document.getElementById("restore_modal") as HTMLDialogElement)?.close();
  };

  const openPurgeModal = (user: DeletedUser) => {
    setPurgeTarget(user);
    setPurgeConfirmation("");
    (document.getElementById("purge_modal") as HTMLDialogElement)?.showModal();
  };

  const closePurgeModal = () => {
    setPurgeTarget(null);
    setPurgeConfirmation("");
    (document.getElementById("purge_modal") as HTMLDialogElement)?.close();
  };

  const filteredDeletedUsers = useMemo(() => {
    const query = globalFilter.trim().toLowerCase();
    if (!query) return deletedUsers;
    return deletedUsers.filter((user) =>
      [user.first_name, user.last_name, user.email, user.user_id, user.note]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [deletedUsers, globalFilter]);

  const openDeleteModal = (userId: string, userName: string) => {
    setDeleteUserId(userId);
    setDeleteUserName(userName);
    (document.getElementById("delete_modal") as HTMLDialogElement)?.showModal();
  };

  const closeDeleteModal = () => {
    setDeleteUserId(null);
    setDeleteUserName("");
    (document.getElementById("delete_modal") as HTMLDialogElement)?.close();
  };

  const openTempPasswordModal = (
    userId: string,
    userName: string,
    userEmail: string,
  ) => {
    setTempPasswordUserId(userId);
    setTempPasswordUserName(userName);
    setTempPasswordUserEmail(userEmail);
    (
      document.getElementById("temp_password_modal") as HTMLDialogElement
    )?.showModal();
  };

  const closeTempPasswordModal = () => {
    setTempPasswordUserId(null);
    setTempPasswordUserName("");
    setTempPasswordUserEmail("");
    (
      document.getElementById("temp_password_modal") as HTMLDialogElement
    )?.close();
  };

  useEffect(() => {
    if (hasShownRedirectToast.current) {
      return;
    }

    if (searchParams.get("toast") !== "user-created") {
      return;
    }

    hasShownRedirectToast.current = true;
    showToast({
      message: "User created successfully!",
      type: "alert-success",
      duration: 60_000,
    });

    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.delete("toast");
    const nextSearch = nextSearchParams.toString();
    navigate(
      {
        pathname: "/admin/users",
        search: nextSearch ? `?${nextSearch}` : "",
      },
      { replace: true },
    );
  }, [navigate, searchParams]);

  useEffect(() => {
    const isIdle = fetcher.state === "idle";

    if (!isIdle) {
      hasShownToast.current = false;
      return;
    }

    if (!fetcher.data || hasShownToast.current) {
      return;
    }

    if ("success" in fetcher.data && fetcher.data.success === true) {
      const actionIntent =
        "intent" in fetcher.data ? fetcher.data.intent : undefined;
      const userEmail =
        "userEmail" in fetcher.data ? fetcher.data.userEmail : undefined;

      hasShownToast.current = true;
      if (actionIntent === "delete") {
        closeDeleteModal();
        showToast({
          message: "User deleted successfully!",
          type: "alert-success",
        });
        return;
      }

      if (actionIntent === "restore") {
        closeRestoreModal();
        showToast({
          message: `User restored. Temporary password emailed to ${userEmail}.`,
          type: "alert-success",
          duration: 10_000,
        });
        return;
      }

      if (actionIntent === "delete-permanently") {
        closePurgeModal();
        showToast({
          message: `${userEmail} was permanently deleted.`,
          type: "alert-success",
        });
        return;
      }

      if (actionIntent === "set-temporary-password") {
        closeTempPasswordModal();
      }

      showToast({
        message:
          actionIntent === "set-temporary-password" &&
          typeof userEmail === "string"
            ? `Temporary password email sent to ${userEmail}.`
            : "Action completed successfully!",
        type: "alert-success",
      });
      return;
    }

    if ("error" in fetcher.data && typeof fetcher.data.error === "string") {
      hasShownToast.current = true;
      showToast({
        message: fetcher.data.error,
        type: "alert-error",
      });
    }
  }, [fetcher.state, fetcher.data]);

  const columns = useMemo(
    () => [
      columnHelper.accessor((row) => `${row.first_name} ${row.last_name}`, {
        id: "name",
        header: "Name",
        cell: (info) => {
          const user = info.row.original;
          return (
            <Link
              to={`/admin/update-user/${user.user_id}`}
              className="group hover:bg-base-200 block rounded-lg px-1 py-1 transition-colors"
            >
              <div className="text-base-content decoration-base-content/50 font-medium underline underline-offset-2">
                {user.first_name} {user.last_name}
              </div>
              <div className="text-base-content/70 decoration-base-content/30 group-hover:text-base-content text-sm underline underline-offset-2">
                {user.email}
              </div>
            </Link>
          );
        },
      }),
      columnHelper.accessor((row) => getAccountState(row).label, {
        id: "account_status",
        header: "Account Status",
        cell: (info) => {
          const user = info.row.original;
          const state = getAccountState(user);
          const showExpiration =
            user.cognito_status === "FORCE_CHANGE_PASSWORD" &&
            user.temporary_password_expires_at;

          return (
            <div className="flex max-w-64 flex-col items-start gap-1">
              <span className={`badge ${state.badgeClass}`}>{state.label}</span>
              <span className="text-base-content/70 text-xs">
                {showExpiration ? (
                  <>
                    {state.label === "Temporary password expired"
                      ? "Expired "
                      : "Expires "}
                    <DateDisplay
                      value={user.temporary_password_expires_at}
                      format="shortDateTime"
                    />
                  </>
                ) : (
                  state.detail
                )}
              </span>
            </div>
          );
        },
      }),
      columnHelper.accessor("website_role", {
        id: "website_role",
        header: "Website Role",
        cell: (info) => (
          <span className="badge badge-neutral">{info.getValue()}</span>
        ),
      }),
      columnHelper.accessor((row) => row.note ?? "", {
        id: "note",
        header: "Note",
        cell: (info) => (
          <span className="whitespace-normal">{info.getValue() || "—"}</span>
        ),
      }),
      columnHelper.accessor((row) => row.last_login_at ?? "", {
        id: "last_login",
        header: "Last Login",
        cell: (info) => {
          const value = info.getValue();
          return (
            <span className="text-sm">
              {value
                ? `${value.slice(0, 10)} ${value.slice(11, 16)} UTC`
                : "Never"}
            </span>
          );
        },
      }),
      columnHelper.display({
        id: "actions",
        header: () => <span className="block text-right">Actions</span>,
        cell: (info) => {
          const user = info.row.original;
          return (
            <div className="dropdown dropdown-end block text-right">
              <button
                type="button"
                tabIndex={0}
                className="btn btn-primary btn-sm whitespace-nowrap"
                disabled={fetcher.state !== "idle"}
              >
                Actions
              </button>
              <ul
                tabIndex={0}
                className="menu dropdown-content bg-base-100 rounded-box z-20 w-64 p-2 text-left shadow-lg"
              >
                <li>
                  <button
                    type="button"
                    className="text-warning"
                    disabled={fetcher.state !== "idle"}
                    onClick={() =>
                      openTempPasswordModal(
                        user.user_id,
                        `${user.first_name} ${user.last_name}`,
                        user.email,
                      )
                    }
                  >
                    Send New Temporary Password
                  </button>
                </li>
                <li>
                  <Link to={`/admin/update-user/${user.user_id}`}>Edit</Link>
                </li>
                <li>
                  <button
                    type="button"
                    className="text-error"
                    disabled={fetcher.state !== "idle"}
                    onClick={() =>
                      openDeleteModal(
                        user.user_id,
                        `${user.first_name} ${user.last_name}`,
                      )
                    }
                  >
                    Delete
                  </button>
                </li>
              </ul>
            </div>
          );
        },
      }),
    ],
    [fetcher.state],
  );

  const table = useReactTable({
    data: users,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: fuzzyGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const rows = table.getRowModel().rows;

  return (
    <>
      <div className="breadcrumbs mb-4 text-sm">
        <ul>
          <li>
            <Link to="/">Home</Link>
          </li>
          <li>
            <Link to="/admin">Admin</Link>
          </li>
          <li>Users</li>
        </ul>
      </div>

      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">User Administration</h1>
          <p className="text-base-content/70 mt-1 text-sm">
            Manage accounts, resend access via temporary passwords, and update
            user records.
          </p>
        </div>
        <Link to="/admin/create-user" className="btn btn-primary">
          Create New User
        </Link>
      </div>

      <div role="tablist" className="tabs tabs-border mb-4">
        <button
          type="button"
          role="tab"
          className={`tab ${view === "active" ? "tab-active" : ""}`}
          aria-selected={view === "active"}
          onClick={() => setView("active")}
        >
          Active ({users.length})
        </button>
        <button
          type="button"
          role="tab"
          className={`tab ${view === "deleted" ? "tab-active" : ""}`}
          aria-selected={view === "deleted"}
          onClick={() => setView("deleted")}
        >
          Deleted ({deletedUsers.length})
        </button>
      </div>

      <div className="card bg-base-100 shadow-xl">
        <div className="card-body">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="card-title">
              {view === "active"
                ? `Users (${rows.length} of ${users.length})`
                : `Deleted users (${filteredDeletedUsers.length} of ${deletedUsers.length})`}
            </h2>
            <label className="input input-bordered flex items-center gap-2 sm:w-80">
              <FaMagnifyingGlass className="h-4 w-4 opacity-70" />
              <input
                type="search"
                className="grow"
                placeholder="Search by name, email, ID, role, or note"
                value={globalFilter}
                onChange={(event) => setGlobalFilter(event.target.value)}
              />
            </label>
          </div>

          {view === "deleted" ? (
            <div className="overflow-x-auto">
              <p className="text-base-content/70 text-sm">
                Deleted users can't sign in. Restoring someone brings back their
                certifications and history and emails them a temporary password.
              </p>
              <table className="table min-w-max">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Deleted</th>
                    <th>Note</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDeletedUsers.map((user) => (
                    <tr key={user.user_id}>
                      <td className="align-top">
                        <div className="font-medium">
                          {user.first_name} {user.last_name}
                        </div>
                        <div className="text-base-content/70 text-sm">
                          {user.email}
                        </div>
                      </td>
                      <td className="align-top text-sm">
                        <DateDisplay
                          value={user.deleted_at}
                          format="mediumDate"
                        />
                      </td>
                      <td className="align-top whitespace-normal">
                        {user.note || "—"}
                      </td>
                      <td className="align-top">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            disabled={fetcher.state !== "idle"}
                            onClick={() => openRestoreModal(user)}
                          >
                            Restore
                          </button>
                          {canDeletePermanently && (
                            <button
                              type="button"
                              className="btn btn-error btn-outline btn-sm"
                              disabled={fetcher.state !== "idle"}
                              onClick={() => openPurgeModal(user)}
                            >
                              Delete permanently
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredDeletedUsers.length === 0 && (
                <div className="text-base-content/60 py-6 text-center text-sm">
                  {deletedUsers.length === 0
                    ? "No deleted users."
                    : "No deleted users match your search."}
                </div>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="table min-w-max">
                <thead>
                  {table.getHeaderGroups().map((headerGroup) => (
                    <tr key={headerGroup.id}>
                      {headerGroup.headers.map((header) => (
                        <th key={header.id} className="whitespace-nowrap">
                          {header.isPlaceholder ? null : (
                            <div
                              className={
                                header.column.getCanSort()
                                  ? "flex cursor-pointer items-center gap-1 select-none"
                                  : "flex items-center"
                              }
                              onClick={header.column.getToggleSortingHandler()}
                            >
                              {flexRender(
                                header.column.columnDef.header,
                                header.getContext(),
                              )}
                              {header.column.getCanSort() && (
                                <span className="text-xs opacity-50">
                                  {{
                                    asc: "↑",
                                    desc: "↓",
                                  }[header.column.getIsSorted() as string] ??
                                    "↕"}
                                </span>
                              )}
                            </div>
                          )}
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className="align-top">
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext(),
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>

              {rows.length === 0 && (
                <div className="text-base-content/60 py-6 text-center text-sm">
                  No users match your search.
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <dialog id="delete_modal" className="modal">
        <div className="modal-box">
          <h3 className="text-lg font-bold">Confirm Deletion</h3>
          <p className="py-4">
            Are you sure you want to delete <strong>{deleteUserName}</strong>?
            This will disable their account and prevent them from signing in.
            You can restore them later from the Deleted tab.
          </p>
          <div className="modal-action">
            <button onClick={closeDeleteModal} className="btn btn-ghost">
              Cancel
            </button>
            <fetcher.Form method="post">
              <input type="hidden" name="intent" value="delete" />
              <input type="hidden" name="userId" value={deleteUserId || ""} />
              <button
                type="submit"
                className="btn btn-error"
                disabled={fetcher.state !== "idle"}
              >
                Delete User
              </button>
            </fetcher.Form>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button onClick={closeDeleteModal}>close</button>
        </form>
      </dialog>

      <dialog id="restore_modal" className="modal">
        <div className="modal-box">
          <h3 className="text-lg font-bold">Restore User</h3>
          <p className="py-4">
            Restore{" "}
            <strong>
              {restoreTarget?.first_name} {restoreTarget?.last_name}
            </strong>
            ? Their certifications and history come back, and a temporary
            password is emailed to {restoreTarget?.email}.
          </p>
          <div className="modal-action">
            <button onClick={closeRestoreModal} className="btn btn-ghost">
              Cancel
            </button>
            <fetcher.Form method="post">
              <input type="hidden" name="intent" value="restore" />
              <input
                type="hidden"
                name="userId"
                value={restoreTarget?.user_id ?? ""}
              />
              <button
                type="submit"
                className="btn btn-primary"
                disabled={fetcher.state !== "idle"}
              >
                Restore User
              </button>
            </fetcher.Form>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button onClick={closeRestoreModal}>close</button>
        </form>
      </dialog>

      {canDeletePermanently && (
        <dialog id="purge_modal" className="modal">
          <div className="modal-box">
            <h3 className="text-error text-lg font-bold">Delete Permanently</h3>
            <p className="py-4">
              This removes{" "}
              <strong>
                {purgeTarget?.first_name} {purgeTarget?.last_name}
              </strong>{" "}
              for good. They can't be restored afterwards. Their certifications,
              truck checks and email history stay in the database.
            </p>
            <fetcher.Form method="post">
              <input type="hidden" name="intent" value="delete-permanently" />
              <input
                type="hidden"
                name="userId"
                value={purgeTarget?.user_id ?? ""}
              />
              <label className="form-control w-full">
                <span className="label-text mb-1 text-sm">
                  Type <strong>{purgeTarget?.email}</strong> to confirm
                </span>
                <input
                  type="text"
                  name="confirmEmail"
                  className="input input-bordered w-full"
                  autoComplete="off"
                  value={purgeConfirmation}
                  onChange={(event) => setPurgeConfirmation(event.target.value)}
                />
              </label>
              <div className="modal-action">
                <button
                  type="button"
                  onClick={closePurgeModal}
                  className="btn btn-ghost"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-error"
                  disabled={
                    fetcher.state !== "idle" ||
                    purgeConfirmation.trim().toLowerCase() !==
                      (purgeTarget?.email ?? "").toLowerCase()
                  }
                >
                  Delete Permanently
                </button>
              </div>
            </fetcher.Form>
          </div>
          <form method="dialog" className="modal-backdrop">
            <button onClick={closePurgeModal}>close</button>
          </form>
        </dialog>
      )}

      <dialog id="temp_password_modal" className="modal">
        <div className="modal-box">
          <h3 className="text-lg font-bold">Confirm New Temporary Password</h3>
          <p className="py-4">
            Send a new temporary password to{" "}
            <strong>{tempPasswordUserName}</strong>?
          </p>
          <p className="pb-4 text-sm opacity-70">
            This invalidates any current password, starts a new 60-day window,
            and emails the new password and exact deadline to{" "}
            {tempPasswordUserEmail}. The user must change it on next sign-in.
          </p>
          <div className="modal-action">
            <button onClick={closeTempPasswordModal} className="btn btn-ghost">
              Cancel
            </button>
            <fetcher.Form method="post">
              <input
                type="hidden"
                name="intent"
                value="set-temporary-password"
              />
              <input
                type="hidden"
                name="userId"
                value={tempPasswordUserId || ""}
              />
              <button
                type="submit"
                className="btn btn-outline text-warning"
                disabled={fetcher.state !== "idle"}
              >
                Send New Temporary Password
              </button>
            </fetcher.Form>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button onClick={closeTempPasswordModal}>close</button>
        </form>
      </dialog>
    </>
  );
}
