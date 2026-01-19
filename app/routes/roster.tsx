import { useLoaderData } from "react-router";
import type { Route } from "./+types/roster";
import { UserStore } from "~/lib/user-store";

export async function loader({ context }: Route.LoaderArgs) {
  const userStore = UserStore.make();
  const users = await userStore.listUsers();

  // Sort users alphabetically by last name, then first name
  const sortedUsers = users.sort((a, b) => {
    const lastNameCompare = a.last_name.localeCompare(b.last_name);
    if (lastNameCompare !== 0) return lastNameCompare;
    return a.first_name.localeCompare(b.first_name);
  });

  return { users: sortedUsers };
}

export default function Roster() {
  const { users } = useLoaderData<typeof loader>();

  return (
    <div className="card bg-base-100 shadow">
      <div className="card-body">
        <h1 className="card-title text-2xl">Membership Roster</h1>
        <p className="text-sm opacity-70">{users.length} members</p>

        <div className="divider" />

        <div className="overflow-x-auto">
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
                        <div className="font-bold">
                          {user.first_name} {user.last_name}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>{user.phone || "—"}</td>
                  <td>{user.email}</td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {user.membership_roles.length > 0 ? (
                        user.membership_roles.map((role, index) => (
                          <span
                            key={index}
                            className="badge badge-primary badge-sm"
                          >
                            {role.role_name} {role.track_name}
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
