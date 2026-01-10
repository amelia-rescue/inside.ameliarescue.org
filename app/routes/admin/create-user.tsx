import { Link } from "react-router";
import type { Route } from "./+types/create-user";
import { appContext } from "~/context";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Create User - Admin - Amelia Rescue" },
    { name: "description", content: "Create a new user" },
  ];
}

export const handle = {
  breadcrumb: "Create User",
};

export async function loader({ context }: Route.LoaderArgs) {
  const c = context.get(appContext);
  if (!c) {
    throw new Error("App context not found");
  }
  return c;
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const data = {
    email: formData.get("email"),
    givenName: formData.get("givenName"),
    familyName: formData.get("familyName"),
    role: formData.get("role"),
    membershipStatus: formData.get("membershipStatus"),
    certificationLevel: formData.get("certificationLevel"),
  };

  console.log("Form submitted:", data);
  console.log("HELLO!?");

  return { success: true };
}

export default function CreateUser({ loaderData }: Route.ComponentProps) {
  const { user } = loaderData;
  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="card bg-base-100 shadow-lg">
        <div className="card-body">
          <h2 className="card-title mb-4">New User Information</h2>

          <form method="post" className="space-y-6">
            <div className="form-control w-full">
              <label className="label">
                <span className="label-text">Email</span>
              </label>
              <input
                type="email"
                name="email"
                placeholder="user@ameliarescue.org"
                className="input input-bordered w-full"
                autoComplete="off"
                required
              />
            </div>

            <div className="form-control w-full">
              <label className="label">
                <span className="label-text">First Name</span>
              </label>
              <input
                type="text"
                name="givenName"
                placeholder="John"
                className="input input-bordered w-full"
                autoComplete="off"
                required
              />
            </div>

            <div className="form-control w-full">
              <label className="label">
                <span className="label-text">Last Name</span>
              </label>
              <input
                type="text"
                name="familyName"
                placeholder="Doe"
                className="input input-bordered w-full"
                autoComplete="off"
                required
              />
            </div>

            <div className="form-control w-full">
              <label className="label">
                <span className="label-text">Role</span>
              </label>
              <select
                name="role"
                className="select select-bordered w-full"
                required
              >
                <option value="">Select a role</option>
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
            </div>

            <div className="form-control w-full">
              <label className="label">
                <span className="label-text">Membership Status</span>
              </label>
              <select
                name="membershipStatus"
                className="select select-bordered w-full"
                required
              >
                <option value="">Select membership status</option>
                <option value="provider">Provider</option>
                <option value="driver_only">Driver Only</option>
                <option value="junior">Junior</option>
              </select>
            </div>

            <div className="form-control w-full">
              <label className="label">
                <span className="label-text">Certification Level</span>
              </label>
              <select
                name="certificationLevel"
                className="select select-bordered w-full"
                required
              >
                <option value="">Select certification level</option>
                <option value="cpr">CPR</option>
                <option value="basic">Basic</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
                <option value="paramedic">Paramedic</option>
              </select>
            </div>

            <div className="card-actions justify-end pt-4">
              <Link to="/admin" className="btn btn-ghost">
                Cancel
              </Link>
              <button type="submit" className="btn btn-success">
                Create User
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
