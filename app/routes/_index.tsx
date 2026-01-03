import type { Route } from "./+types/_index";
import { Link } from "react-router";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Inside Amelia Rescue" },
    {
      name: "description",
      content: "Inside Amelia Rescue — internal tools and documentation hub",
    },
  ];
}

export default function Index() {
  return (
    <div className="bg-base-200 min-h-screen">
      <div className="navbar bg-base-100 shadow">
        <div className="mx-auto w-full max-w-5xl px-4">
          <div className="flex w-full items-center justify-between">
            <div className="text-xl font-semibold">Inside Amelia Rescue</div>
            <div className="flex items-center gap-2">
              <Link to="/auth/login" className="btn btn-sm btn-primary">
                Sign in
              </Link>
              <Link to="/welcome" className="btn btn-sm btn-ghost">
                Demo
              </Link>
            </div>
          </div>
        </div>
      </div>

      <main className="mx-auto w-full max-w-5xl px-4 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Tools & Documents</h1>
          <p className="mt-2 opacity-70">
            Quick access to the most-used resources.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Link
            to="/roster"
            className="card bg-base-100 shadow hover:shadow-md"
          >
            <div className="card-body">
              <h2 className="card-title">Membership roster</h2>
              <p className="text-sm opacity-70">
                View members and contact info.
              </p>
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
              <p className="text-sm opacity-70">
                Track member training & certs.
              </p>
              <div className="card-actions justify-end">
                <span className="btn btn-sm btn-ghost">Open</span>
              </div>
            </div>
          </Link>

          <Link
            to="/protocols"
            className="card bg-base-100 shadow hover:shadow-md"
          >
            <div className="card-body">
              <h2 className="card-title">Protocols</h2>
              <p className="text-sm opacity-70">
                Operational and medical protocols.
              </p>
              <div className="card-actions justify-end">
                <span className="btn btn-sm btn-ghost">Open</span>
              </div>
            </div>
          </Link>

          <Link
            to="/constitution"
            className="card bg-base-100 shadow hover:shadow-md"
          >
            <div className="card-body">
              <h2 className="card-title">Constitution</h2>
              <p className="text-sm opacity-70">
                Organization bylaws and governance.
              </p>
              <div className="card-actions justify-end">
                <span className="btn btn-sm btn-ghost">Open</span>
              </div>
            </div>
          </Link>

          <Link to="/sops" className="card bg-base-100 shadow hover:shadow-md">
            <div className="card-body">
              <h2 className="card-title">SOPs</h2>
              <p className="text-sm opacity-70">
                Standard operating procedures.
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
        </div>
      </main>
    </div>
  );
}
