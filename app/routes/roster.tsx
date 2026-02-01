import { useLoaderData, Link } from "react-router";
import type { Route } from "./+types/roster";
import { UserStore } from "~/lib/user-store";
import { appContext } from "~/context";

export async function loader({ context }: Route.LoaderArgs) {
  const ctx = context.get(appContext);
  if (!ctx) {
    throw new Error("No user found");
  }

  const userStore = UserStore.make();
  const users = await userStore.listUsers();

  // Sort users alphabetically by last name, then first name
  const sortedUsers = users.sort((a, b) => {
    const lastNameCompare = a.last_name.localeCompare(b.last_name);
    if (lastNameCompare !== 0) return lastNameCompare;
    return a.first_name.localeCompare(b.first_name);
  });

  return { users: sortedUsers, currentUserId: ctx.user.user_id };
}

export default function Roster() {
  const { users, currentUserId } = useLoaderData<typeof loader>();

  return (
    <div className="card bg-base-100 shadow">
      <div className="card-body">
        <h1 className="card-title text-2xl">Membership Roster</h1>
        <p className="text-sm opacity-70">{users.length} members</p>

        <div className="divider" />

        <div className="grid gap-3 sm:hidden">
          {users.map((user) => (
            <div key={user.user_id} className="card bg-base-200">
              <div className="card-body gap-3">
                <div className="flex items-center gap-3">
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
                  <div className="text-xs font-semibold opacity-60">Roles</div>
                  <div className="mt-1 flex flex-wrap items-start gap-1 whitespace-normal">
                    {user.membership_roles.length > 0 ? (
                      user.membership_roles.map((role, index) => (
                        <span
                          key={index}
                          className={`badge badge-sm whitespace-nowrap ${
                            role.precepting ? "badge-warning" : "badge-primary"
                          }`}
                        >
                          {role.role_name} - {role.track_name}
                          {role.precepting && " (Precepting)"}
                        </span>
                      ))
                    ) : (
                      <span className="text-base-content/50">—</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="hidden overflow-x-auto sm:block">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Email</th>
                <th>Roles</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.user_id}>
                  <td>
                    <div className="flex items-center gap-3">
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
                      <div>
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
                    </div>
                  </td>
                  <td>{user.phone || "—"}</td>
                  <td>{user.email}</td>
                  <td className="whitespace-normal">
                    <div className="flex flex-wrap items-start gap-1">
                      {user.membership_roles.length > 0 ? (
                        user.membership_roles.map((role, index) => (
                          <span
                            key={index}
                            className={`badge badge-sm whitespace-nowrap ${
                              role.precepting
                                ? "badge-warning"
                                : "badge-primary"
                            }`}
                          >
                            {role.role_name} - {role.track_name}
                            {role.precepting && " (Precepting)"}
                          </span>
                        ))
                      ) : (
                        <span className="text-base-content/50">—</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
