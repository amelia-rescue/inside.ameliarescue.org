import { appContext } from "~/context";
import type { Route } from "./+types/_index";
import { Link } from "react-router";
import {
  FiUsers,
  FiBookOpen,
  FiFileText,
  FiTruck,
  FiShoppingBag,
  FiSettings,
  FiExternalLink,
  FiChevronRight,
} from "react-icons/fi";

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
      {/* Quick Actions Grid */}
      <div className="mb-12">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-2xl font-semibold">Quick Actions</h2>
          <div className="badge badge-primary badge-outline">
            {new Date().toLocaleDateString("en-US", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <Link
            to="/roster"
            className="card bg-base-100 group shadow-xl transition-all duration-300 hover:shadow-2xl"
          >
            <div className="card-body">
              <div className="mb-2 flex items-center gap-4">
                <div className="bg-primary/10 text-primary rounded-full p-3 transition-transform group-hover:scale-110">
                  <FiUsers className="h-6 w-6" />
                </div>
                <h2 className="card-title">Roster</h2>
              </div>
              <p className="mb-4 text-sm opacity-70">
                Who even volunteers here?
              </p>
              <div className="card-actions justify-end">
                <span className="btn btn-sm btn-primary group-hover:btn-primary-content">
                  Open <FiChevronRight className="ml-1 h-3 w-3" />
                </span>
              </div>
            </div>
          </Link>

          <Link
            to="/training-status"
            className="card bg-base-100 group shadow-xl transition-all duration-300 hover:shadow-2xl"
          >
            <div className="card-body">
              <div className="mb-2 flex items-center gap-4">
                <div className="bg-secondary/10 text-secondary rounded-full p-3 transition-transform group-hover:scale-110">
                  <FiBookOpen className="h-6 w-6" />
                </div>
                <h2 className="card-title">Training Status</h2>
              </div>
              <p className="mb-4 text-sm opacity-70">
                Track certifications and training status across the team.
              </p>
              <div className="card-actions justify-end">
                <span className="btn btn-sm btn-secondary group-hover:btn-secondary-content">
                  Open <FiChevronRight className="ml-1 h-3 w-3" />
                </span>
              </div>
            </div>
          </Link>

          <Link
            to="/documents"
            className="card bg-base-100 group shadow-xl transition-all duration-300 hover:shadow-2xl"
          >
            <div className="card-body">
              <div className="mb-2 flex items-center gap-4">
                <div className="bg-accent/10 text-accent rounded-full p-3 transition-transform group-hover:scale-110">
                  <FiFileText className="h-6 w-6" />
                </div>
                <h2 className="card-title">Documents</h2>
              </div>
              <p className="mb-4 text-sm opacity-70">
                SOPs, guides, and protocols.
              </p>
              <div className="card-actions justify-end">
                <span className="btn btn-sm btn-accent group-hover:btn-accent-content">
                  Open <FiChevronRight className="ml-1 h-3 w-3" />
                </span>
              </div>
            </div>
          </Link>

          <Link
            to="/truck-check"
            className="card bg-base-100 group shadow-xl transition-all duration-300 hover:shadow-2xl"
          >
            <div className="card-body">
              <div className="mb-2 flex items-center gap-4">
                <div className="bg-info/10 text-info rounded-full p-3 transition-transform group-hover:scale-110">
                  <FiTruck className="h-6 w-6" />
                </div>
                <h2 className="card-title">Truck Checks</h2>
              </div>
              <p className="mb-4 text-sm opacity-70">
                Collaborative vehicle inspections and equipment checks.
              </p>
              <div className="card-actions justify-end">
                <span className="btn btn-sm btn-info group-hover:btn-info-content">
                  Open <FiChevronRight className="ml-1 h-3 w-3" />
                </span>
              </div>
            </div>
          </Link>

          <a
            href="https://weewoo.study/shop"
            target="_blank"
            rel="noopener noreferrer"
            className="card bg-base-100 group shadow-xl transition-all duration-300 hover:shadow-2xl"
          >
            <div className="card-body">
              <div className="mb-2 flex items-center gap-4">
                <div className="bg-warning/10 text-warning rounded-full p-3 transition-transform group-hover:scale-110">
                  <FiShoppingBag className="h-6 w-6" />
                </div>
                <h2 className="card-title flex items-center gap-2">
                  Swag Store
                  <FiExternalLink className="h-4 w-4 opacity-60" />
                </h2>
              </div>
              <p className="mb-4 text-sm opacity-70">Stay fresh.</p>
              <div className="card-actions justify-end">
                <span className="btn btn-sm btn-warning group-hover:btn-warning-content">
                  Shop <FiChevronRight className="ml-1 h-3 w-3" />
                </span>
              </div>
            </div>
          </a>

          {user.website_role === "admin" && (
            <Link
              to="/admin"
              className="card bg-error group shadow-xl transition-all duration-300 hover:shadow-2xl"
            >
              <div className="card-body">
                <div className="mb-2 flex items-center gap-4">
                  <div className="bg-error-content/10 text-error-content rounded-full p-3 transition-transform group-hover:scale-110">
                    <FiSettings className="h-6 w-6" />
                  </div>
                  <h2 className="card-title text-error-content">Admin</h2>
                </div>
                <p className="text-error-content mb-4 text-sm opacity-90">
                  System management and user administration.
                </p>
                <div className="card-actions justify-end">
                  <span className="btn btn-sm btn-error-content group-hover:bg-error-content group-hover:text-error">
                    Manage <FiChevronRight className="ml-1 h-3 w-3" />
                  </span>
                </div>
              </div>
            </Link>
          )}
        </div>
      </div>
    </>
  );
}
