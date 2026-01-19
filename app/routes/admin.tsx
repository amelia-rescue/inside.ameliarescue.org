import { Link } from "react-router";
import type { Route } from "./+types/admin";
import { appContext } from "~/context";
import { UserStore } from "~/lib/user-store";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Admin - Amelia Rescue" },
    { name: "description", content: "User administration" },
  ];
}

export const handle = {
  breadcrumb: "Admin",
};

export async function loader({ context }: Route.LoaderArgs) {
  const userStore = UserStore.make();
  const users = await userStore.listUsers();
  return { users };
}

export default function Admin({ loaderData }: Route.ComponentProps) {
  const { users } = loaderData;
  return (
    <>
      <h1 className="mb-6 text-3xl font-bold">User Administration</h1>

      <div className="mb-6 flex gap-4">
        <Link to="/admin/create-user" className="btn btn-primary">
          Create New User
        </Link>
        <Link to="/admin/certification-type" className="btn btn-secondary">
          Manage Certification Types
        </Link>
        <Link to="/admin/roles" className="btn btn-secondary">
          Manage Roles
        </Link>
        <Link to="/admin/tracks" className="btn btn-secondary">
          Manage Tracks
        </Link>
      </div>

      <div className="bg-base-200 rounded-lg p-6 shadow">
        <h2 className="mb-4 text-xl font-semibold">Users</h2>
        <ul className="divide-base-300 divide-y">
          {users.map((user) => (
            <li
              key={user.user_id}
              className="flex items-center justify-between py-3"
            >
              <div>
                <span className="font-medium">{`${user.first_name} ${user.last_name}`}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="badge badge-neutral">{user.website_role}</span>
                <Link
                  to={`/admin/update-user/${user.user_id}`}
                  className="btn btn-sm btn-ghost"
                >
                  Edit
                </Link>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
