import { Link, redirect } from "react-router";
import type { Route } from "./+types/admin";
import { appContext } from "~/context";
import { UserStore } from "~/lib/user-store";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Admin - Amelia Rescue" },
    { name: "description", content: "Administrative tools and navigation" },
  ];
}

export const handle = {
  breadcrumb: "Admin",
};

export async function loader({ context }: Route.LoaderArgs) {
  const ctx = context.get(appContext);

  if (!ctx?.user || ctx.user.website_role !== "admin") {
    throw redirect("/");
  }

  const userStore = UserStore.make();
  const allUsers = await userStore.listUsers();
  const admins = allUsers
    .filter((u) => u.website_role === "admin")
    .sort((a, b) => a.last_name.localeCompare(b.last_name));

  return { user: ctx.user, admins };
}

export default function Admin({ loaderData }: Route.ComponentProps) {
  const adminPages = [
    {
      title: "Users",
      description:
        "Create users, edit profiles, set temporary passwords, and deactivate accounts.",
      to: "/admin/users",
      cta: "Open user administration",
    },
    {
      title: "Certification Types",
      description: "Manage certification definitions used across the site.",
      to: "/admin/certification-type",
      cta: "Manage certification types",
    },
    {
      title: "Roles",
      description:
        "Configure membership roles and their allowed training tracks.",
      to: "/admin/roles",
      cta: "Manage roles",
    },
    {
      title: "Tracks",
      description: "Maintain training tracks available for role assignments.",
      to: "/admin/tracks",
      cta: "Manage tracks",
    },
    {
      title: "Email Events",
      description:
        "Inspect sent-email delivery history and SES event outcomes.",
      to: "/admin/email-events",
      cta: "View email events",
    },
    {
      title: "Truck Checks",
      description: "Manage truck definitions and checklist schemas.",
      to: "/admin/truck-checks",
      cta: "Manage truck checks",
    },
  ] as const;

  return (
    <div>
      <div className="breadcrumbs mb-4 text-sm">
        <ul>
          <li>
            <Link to="/">Home</Link>
          </li>
          <li>Admin</li>
        </ul>
      </div>

      <div className="mb-8">
        <h1 className="text-3xl font-bold">Admin</h1>
        <p className="text-base-content/70 mt-2 max-w-2xl">
          Choose the administrative area you want to manage.
        </p>
      </div>

      <div className="rounded-box border-base-300 bg-base-200/40 mb-4 border px-4 py-3 text-sm">
        Signed in as <strong>{loaderData.user.first_name}</strong>.
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {adminPages.map((page) => (
          <Link
            key={page.to}
            to={page.to}
            className="card bg-base-100 shadow-xl transition-transform hover:-translate-y-0.5 hover:shadow-2xl"
          >
            <div className="card-body">
              <h2 className="card-title">{page.title}</h2>
              <p className="text-base-content/70 text-sm">{page.description}</p>
              <div className="card-actions justify-end pt-3">
                <span className="btn btn-ghost btn-sm">{page.cta}</span>
              </div>
            </div>
          </Link>
        ))}
      </div>

      <div className="card bg-base-100 mt-8 shadow-xl">
        <div className="card-body">
          <h2 className="card-title">Current Administrators</h2>
          {loaderData.admins.length === 0 ? (
            <p className="text-base-content/70 text-sm">
              No administrators found.
            </p>
          ) : (
            <ul className="divide-base-200 divide-y">
              {loaderData.admins.map((admin) => (
                <li key={admin.user_id} className="py-3">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <span className="font-medium">
                        {admin.first_name} {admin.last_name}
                      </span>
                      <span className="text-base-content/60 ml-2 text-sm">
                        {admin.email}
                      </span>
                    </div>
                    {admin.last_login_at && (
                      <span className="text-base-content/50 shrink-0 text-xs">
                        Last login: {admin.last_login_at.slice(0, 10)}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
