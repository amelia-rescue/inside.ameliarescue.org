import { appContext } from "~/context";
import type { Route } from "./+types/_index";
import { Link } from "react-router";
import { FiExternalLink } from "react-icons/fi";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Inside Amelia Rescue" },
    {
      name: "description",
      content: "Inside Amelia Rescue — internal tools and documentation hub",
    },
  ];
}

export async function loader({ context }: Route.LoaderArgs) {
  const c = context.get(appContext);
  if (!c) {
    throw new Error("App context not found");
  }
  return c;
}

export default function Index({ loaderData }: Route.ComponentProps) {
  const { user } = loaderData;
  return (
    <>
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Tools & Documents</h1>
        <p className="mt-2 opacity-70">
          Quick access to the most-used resources.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link to="/roster" className="card bg-base-100 shadow hover:shadow-md">
          <div className="card-body">
            <h2 className="card-title">Membership roster</h2>
            <p className="text-sm opacity-70">View members and contact info.</p>
            <div className="card-actions justify-end">
              <span className="btn btn-sm btn-ghost">Open</span>
            </div>
          </div>
        </Link>

        <Link
          to="/training-status"
          className="card bg-base-100 shadow hover:shadow-md"
        >
          <div className="card-body">
            <h2 className="card-title">Training status</h2>
            <p className="text-sm opacity-70">Track member training & certs.</p>
            <div className="card-actions justify-end">
              <span className="btn btn-sm btn-ghost">Open</span>
            </div>
          </div>
        </Link>

        <Link
          to="/documents"
          className="card bg-base-100 shadow hover:shadow-md"
        >
          <div className="card-body">
            <h2 className="card-title">Documents</h2>
            <p className="text-sm opacity-70">
              Documents that are actually useful.
            </p>
            <div className="card-actions justify-end">
              <span className="btn btn-sm btn-ghost">Open</span>
            </div>
          </div>
        </Link>

        <Link
          to="/truck-check"
          className="card bg-base-100 shadow hover:shadow-md"
        >
          <div className="card-body">
            <h2 className="card-title">Truck check</h2>
            <p className="text-sm opacity-70">Checklist and documentation.</p>
            <div className="card-actions justify-end">
              <span className="btn btn-sm btn-ghost">Open</span>
            </div>
          </div>
        </Link>

        <a
          href="https://weewoo.study/shop"
          target="_blank"
          rel="noopener noreferrer"
          className="card bg-base-100 shadow hover:shadow-md"
        >
          <div className="card-body">
            <h2 className="card-title flex items-center gap-2">
              Swag
              <FiExternalLink className="h-4 w-4" />
            </h2>
            <p className="text-sm opacity-70">Stay fresh.</p>
            <div className="card-actions justify-end">
              <span className="btn btn-sm btn-ghost">Open</span>
            </div>
          </div>
        </a>

        {user.website_role === "admin" && (
          <Link
            to="/admin"
            className="card bg-error-content shadow hover:shadow-md"
          >
            <div className="card-body text-primary">
              <h2 className="card-title">Admin</h2>
              <p className="text-sm opacity-70">Manage users and certs.</p>
              <div className="card-actions justify-end">
                <span className="btn btn-sm btn-ghost">Open</span>
              </div>
            </div>
          </Link>
        )}
      </div>
    </>
  );
}
