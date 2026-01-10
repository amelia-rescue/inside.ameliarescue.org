import { Link } from "react-router";
import type { Route } from "./+types/admin";
import { appContext } from "~/context";

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
  const c = context.get(appContext);
  if (!c) {
    throw new Error("App context not found");
  }
  return c;
}

export default function Admin({ loaderData }: Route.ComponentProps) {
  const { user } = loaderData;
  const placeholderUsers = [
    { id: "1", email: "admin@ameliarescue.org", role: "admin" },
    { id: "2", email: "user1@ameliarescue.org", role: "user" },
    { id: "3", email: "user2@ameliarescue.org", role: "user" },
  ];

  return (
    <>
      <h1 className="mb-6 text-3xl font-bold">User Administration</h1>

      <div className="mb-6">
        <Link to="/admin/create-user" className="btn btn-primary">
          Create New User
        </Link>
      </div>

      <div className="bg-base-200 rounded-lg p-6 shadow">
        <h2 className="mb-4 text-xl font-semibold">Users</h2>
        <ul className="divide-base-300 divide-y">
          {placeholderUsers.map((user) => (
            <li
              key={user.id}
              className="flex items-center justify-between py-3"
            >
              <div>
                <span className="font-medium">{user.email}</span>
              </div>
              <div>
                <span className="badge badge-neutral">{user.role}</span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
