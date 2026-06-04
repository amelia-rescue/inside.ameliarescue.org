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
import { UserStore } from "~/lib/user-store";
import { showToast } from "~/components/toaster";
import { useEffect, useMemo, useRef, useState } from "react";

type AdminUser = Awaited<ReturnType<typeof loader>>["users"][number];

const columnHelper = createColumnHelper<AdminUser>();

const fuzzyGlobalFilter: FilterFn<AdminUser> = (row, _columnId, value) => {
  const user = row.original;
  const haystack = [
    user.first_name,
    user.last_name,
    user.email,
    user.user_id,
    user.website_role,
    user.note ?? "",
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

  if (!ctx?.user || ctx.user.website_role !== "admin") {
    throw redirect("/");
  }

  const userStore = UserStore.make();
  const users = (await userStore.listUsers()).sort((a, b) => {
    const firstNameComparison = a.first_name.localeCompare(b.first_name);
    if (firstNameComparison !== 0) {
      return firstNameComparison;
    }

    const lastNameComparison = a.last_name.localeCompare(b.last_name);
    if (lastNameComparison !== 0) {
      return lastNameComparison;
    }

    return a.email.localeCompare(b.email);
  });

  return { users };
}

export async function action({ request, context }: Route.ActionArgs) {
  const ctx = context.get(appContext);

  if (!ctx?.user || ctx.user.website_role !== "admin") {
    throw redirect("/");
  }

  const formData = await request.formData();
  const intent = formData.get("intent");
  const userId = formData.get("userId");

  if (intent === "delete" && typeof userId === "string") {
    const userStore = UserStore.make();
    try {
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

  if (intent === "set-temporary-password" && typeof userId === "string") {
    const userStore = UserStore.make();
    const emailService = EmailService.make();

    try {
      const { user, temporaryPassword } =
        await userStore.setTemporaryPassword(userId);
      await emailService.sendTemporaryPasswordEmail({
        user,
        temporaryPassword,
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
  const { users } = loaderData;
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
  const [globalFilter, setGlobalFilter] = useState("");

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
            <div className="flex flex-col items-end gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="btn btn-sm btn-ghost text-warning whitespace-nowrap"
                disabled={fetcher.state !== "idle"}
                onClick={() =>
                  openTempPasswordModal(
                    user.user_id,
                    `${user.first_name} ${user.last_name}`,
                    user.email,
                  )
                }
              >
                Set Temporary Password
              </button>
              <Link
                to={`/admin/update-user/${user.user_id}`}
                className="btn btn-sm btn-ghost whitespace-nowrap"
              >
                Edit
              </Link>
              <button
                onClick={() =>
                  openDeleteModal(
                    user.user_id,
                    `${user.first_name} ${user.last_name}`,
                  )
                }
                className="btn btn-sm btn-error btn-ghost whitespace-nowrap"
              >
                Delete
              </button>
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

      <div className="card bg-base-100 shadow-xl">
        <div className="card-body">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="card-title">
              Users ({rows.length} of {users.length})
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
                                }[header.column.getIsSorted() as string] ?? "↕"}
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
        </div>
      </div>

      <dialog id="delete_modal" className="modal">
        <div className="modal-box">
          <h3 className="text-lg font-bold">Confirm Deletion</h3>
          <p className="py-4">
            Are you sure you want to delete <strong>{deleteUserName}</strong>?
            This will disable their account and prevent them from signing in.
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

      <dialog id="temp_password_modal" className="modal">
        <div className="modal-box">
          <h3 className="text-lg font-bold">
            Confirm Temporary Password Reset
          </h3>
          <p className="py-4">
            Are you sure you want to set a temporary password for{" "}
            <strong>{tempPasswordUserName}</strong>?
          </p>
          <p className="pb-4 text-sm opacity-70">
            A new temporary password will be emailed to {tempPasswordUserEmail},
            and the user will be required to change it on next sign-in.
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
                Set Temporary Password
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
