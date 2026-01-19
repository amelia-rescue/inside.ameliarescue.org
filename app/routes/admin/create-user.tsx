import { data, Link, useActionData, useFetcher } from "react-router";
import type { Route } from "./+types/create-user";
import { appContext } from "~/context";
import { userSchema, UserStore } from "~/lib/user-store";
import { type } from "arktype";
import { IoInformationCircle } from "react-icons/io5";

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
  const formValues = {
    email: formData.get("email"),
    first_name: formData.get("first_name"),
    last_name: formData.get("last_name"),
    website_role: formData.get("website_role"),
    membership_status: formData.getAll("membership_status"),
    certification_level: formData.get("certification_level"),
  };

  const user = userSchema({
    user_id: crypto.randomUUID(),
    ...formValues,
  });
  if (user instanceof type.errors) {
    return data({ error: user.summary, formValues }, { status: 400 });
  }

  try {
    const store = UserStore.make();
    await store.createUser(user);
  } catch (error) {
    if (error instanceof Error) {
      return data({ error: error.message, formValues }, { status: 500 });
    }
    throw error;
  }

  return { success: true };
}

export default function CreateUser({ loaderData }: Route.ComponentProps) {
  const { user } = loaderData;
  const fetcher = useFetcher<typeof action>();
  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="card bg-base-100 shadow-lg">
        <div className="card-body">
          <h2 className="card-title mb-4">New User Information</h2>

          <div className="alert alert-info mb-4">
            <IoInformationCircle className="h-6 w-6 shrink-0" />
            <span>
              New users will automatically receive an email with a temporary
              password.
            </span>
          </div>

          {fetcher.data && "error" in fetcher.data && (
            <div className="alert alert-error mb-4">
              <span>{fetcher.data.error}</span>
            </div>
          )}

          {fetcher.data &&
            "success" in fetcher.data &&
            fetcher.data.success && (
              <div className="alert alert-success mb-4">
                <span>User created successfully!</span>
              </div>
            )}

          <fetcher.Form method="post" className="space-y-6">
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
                name="first_name"
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
                name="last_name"
                placeholder="Doe"
                className="input input-bordered w-full"
                autoComplete="off"
                required
              />
            </div>

            <div className="form-control w-full">
              <label className="label">
                <span className="label-text">Website Role</span>
              </label>
              <select
                name="website_role"
                className="select select-bordered w-full"
                required
              >
                <option value="">Select a website role</option>
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
            </div>

            <div className="form-control w-full">
              <label className="label">
                <span className="label-text">Membership Status</span>
              </label>
              <div className="flex flex-col gap-2">
                <label className="flex cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    name="membership_status"
                    value="provider"
                    className="checkbox"
                  />
                  <span>Provider</span>
                </label>
                <label className="flex cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    name="membership_status"
                    value="driver"
                    className="checkbox"
                  />
                  <span>Driver</span>
                </label>
                <label className="flex cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    name="membership_status"
                    value="junior"
                    className="checkbox"
                  />
                  <span>Junior</span>
                </label>
              </div>
            </div>

            <div className="form-control w-full">
              <label className="label">
                <span className="label-text">Certification Level</span>
              </label>
              <select
                name="certification_level"
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
          </fetcher.Form>
        </div>
      </div>
    </div>
  );
}
