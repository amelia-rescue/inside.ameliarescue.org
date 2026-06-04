import { useMemo, useState } from "react";
import { useLoaderData, Link } from "react-router";
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
import type { Route } from "./+types/roster";
import { UserStore } from "~/lib/user-store";
import { appContext } from "~/context";

type RosterUser = Awaited<ReturnType<typeof loader>>["users"][number];

const columnHelper = createColumnHelper<RosterUser>();

function rolesToText(user: RosterUser) {
  return user.membership_roles
    .map((role) => `${role.role_name} ${role.track_name}`)
    .join(" ");
}

const fuzzyGlobalFilter: FilterFn<RosterUser> = (row, _columnId, value) => {
  const user = row.original;
  const haystack = [
    user.first_name,
    user.last_name,
    user.email,
    user.phone ?? "",
    rolesToText(user),
    user.note ?? "",
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(String(value).trim().toLowerCase());
};

function MemberRoles({ user }: { user: RosterUser }) {
  if (user.membership_roles.length === 0) {
    return <span className="text-base-content/50">—</span>;
  }
  return (
    <>
      {user.membership_roles.map((role, index) => (
        <span
          key={index}
          className={`badge badge-sm whitespace-nowrap ${
            role.precepting ? "badge-warning" : "badge-primary"
          }`}
        >
          {role.role_name} - {role.track_name}
          {role.precepting && " (Precepting)"}
        </span>
      ))}
    </>
  );
}

function MemberAvatar({ user }: { user: RosterUser }) {
  return (
    <div className="avatar">
      <div className="ring-primary ring-offset-base-100 w-10 rounded-full ring ring-offset-2">
        {user.profile_picture_url ? (
          <img
            src={user.profile_picture_url}
            alt={`${user.first_name} ${user.last_name}`}
          />
        ) : (
          <div className="bg-neutral text-neutral-content flex h-full w-full items-center justify-center">
            <span className="text-sm">
              {user.first_name[0]}
              {user.last_name[0]}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export async function loader({ context }: Route.LoaderArgs) {
  const ctx = context.get(appContext);
  if (!ctx) {
    throw new Error("No user found");
  }

  const userStore = UserStore.make();
  const users = await userStore.listUsers();

  // Sort users alphabetically by last name, then first name
  const sortedUsers = users.sort((a, b) => {
    const firstNameCompare = a.first_name.localeCompare(b.first_name);
    if (firstNameCompare !== 0) return firstNameCompare;
    return a.first_name.localeCompare(b.first_name);
  });

  return { users: sortedUsers, currentUserId: ctx.user.user_id };
}

export default function Roster() {
  const { users, currentUserId } = useLoaderData<typeof loader>();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");

  const columns = useMemo(
    () => [
      columnHelper.accessor((row) => `${row.first_name} ${row.last_name}`, {
        id: "name",
        header: "Name",
        cell: (info) => {
          const user = info.row.original;
          return (
            <div className="flex items-center gap-3">
              <MemberAvatar user={user} />
              <Link
                to={
                  user.user_id === currentUserId
                    ? "/profile"
                    : `/user/${user.user_id}`
                }
                className="font-bold hover:underline"
              >
                {user.first_name} {user.last_name}
              </Link>
            </div>
          );
        },
      }),
      columnHelper.accessor((row) => row.phone ?? "", {
        id: "phone",
        header: "Phone",
        cell: (info) => (
          <span className="whitespace-nowrap">{info.getValue() || "—"}</span>
        ),
      }),
      columnHelper.accessor("email", {
        id: "email",
        header: "Email",
        cell: (info) => info.getValue(),
      }),
      columnHelper.accessor((row) => rolesToText(row), {
        id: "roles",
        header: "Roles",
        enableSorting: false,
        cell: (info) => (
          <div className="flex flex-wrap items-start gap-1 whitespace-normal">
            <MemberRoles user={info.row.original} />
          </div>
        ),
      }),
      columnHelper.accessor((row) => row.note ?? "", {
        id: "note",
        header: "Note",
        cell: (info) => (
          <span className="whitespace-normal">{info.getValue() || "—"}</span>
        ),
      }),
    ],
    [currentUserId],
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
          <li>Roster</li>
        </ul>
      </div>

      <div className="card bg-base-100 shadow">
        <div className="card-body">
          <h1 className="card-title text-2xl">Membership Roster</h1>
          <p className="text-sm opacity-70">
            {rows.length} of {users.length} members
          </p>

          <label className="input input-bordered mt-2 flex items-center gap-2">
            <FaMagnifyingGlass className="h-4 w-4 opacity-70" />
            <input
              type="search"
              className="grow"
              placeholder="Search by name, email, phone, or role"
              value={globalFilter}
              onChange={(event) => setGlobalFilter(event.target.value)}
            />
          </label>

          <div className="divider" />

          {rows.length === 0 && (
            <div className="text-base-content/60 py-6 text-center text-sm">
              No members match your search.
            </div>
          )}

          <div className="grid gap-3 sm:hidden">
            {rows.map((row) => {
              const user = row.original;
              return (
                <div key={user.user_id} className="card bg-base-200">
                  <div className="card-body gap-3">
                    <div className="flex items-center gap-3">
                      <MemberAvatar user={user} />

                      <div className="min-w-0">
                        <Link
                          to={
                            user.user_id === currentUserId
                              ? "/profile"
                              : `/user/${user.user_id}`
                          }
                          className="block truncate font-bold hover:underline"
                        >
                          {user.first_name} {user.last_name}
                        </Link>
                        <div className="text-sm opacity-70">{user.email}</div>
                        <div className="text-sm opacity-70">
                          {user.phone || "—"}
                        </div>
                      </div>
                    </div>

                    <div>
                      <div className="text-xs font-semibold opacity-60">
                        Roles
                      </div>
                      <div className="mt-1 flex flex-wrap items-start gap-1 whitespace-normal">
                        <MemberRoles user={user} />
                      </div>
                    </div>

                    {user.note && (
                      <div>
                        <div className="text-xs font-semibold opacity-60">
                          Note
                        </div>
                        <div className="mt-1 text-sm whitespace-normal">
                          {user.note}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="hidden overflow-x-auto sm:block">
            <table className="table">
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
                      <td key={cell.id}>
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
          </div>
        </div>
      </div>
    </>
  );
}
