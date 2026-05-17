import { Link } from "react-router";
import type { Route } from "./+types/index";
import { appContext } from "~/context";
import { redirect } from "react-router";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Certification Settings - Admin" },
    { name: "description", content: "Manage certification types, roles, and tracks" },
  ];
}

export const handle = {
  breadcrumb: "Certification Settings",
};

export async function loader({ context }: Route.LoaderArgs) {
  const ctx = context.get(appContext);

  if (!ctx?.user || ctx.user.website_role !== "admin") {
    throw redirect("/");
  }

  return { user: ctx.user };
}

export default function CertificationSettings({ loaderData }: Route.ComponentProps) {
  const settingsPages = [
    {
      title: "Certification Types",
      description: "Manage certification definitions used across the site.",
      to: "/admin/certification-settings/certification-type",
      cta: "Manage certification types",
    },
    {
      title: "Roles",
      description:
        "Configure membership roles and their allowed training tracks.",
      to: "/admin/certification-settings/roles",
      cta: "Manage roles",
    },
    {
      title: "Tracks",
      description: "Maintain training tracks available for role assignments.",
      to: "/admin/certification-settings/tracks",
      cta: "Manage tracks",
    },
  ] as const;

  return (
    <div>
      <div className="breadcrumbs mb-4 text-sm">
        <ul>
          <li>
            <Link to="/">Home</Link>
          </li>
          <li>
            <Link to="/admin">Admin</Link>
          </li>
          <li>Certification Settings</li>
        </ul>
      </div>

      <div className="mb-8">
        <h1 className="text-3xl font-bold">Certification Settings</h1>
        <p className="text-base-content/70 mt-2 max-w-2xl">
          Manage certification types, membership roles, and training tracks.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {settingsPages.map((page) => (
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
    </div>
  );
}
