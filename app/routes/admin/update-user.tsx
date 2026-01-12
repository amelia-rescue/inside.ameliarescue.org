import { data, Link, useFetcher, redirect } from "react-router";
import type { Route } from "./+types/update-user";
import { appContext } from "~/context";
import { userSchema, UserStore } from "~/lib/user-store";
import { type } from "arktype";
import { useEffect, useState } from "react";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Update User - Admin - Amelia Rescue" },
    { name: "description", content: "Update user information" },
  ];
}

export const handle = {
  breadcrumb: "Update User",
};

export async function loader({ context, params }: Route.LoaderArgs) {
  const c = context.get(appContext);
  if (!c) {
    throw new Error("App context not found");
  }

  const store = UserStore.make();
  const user = await store.getUser(params.user_id);

  return { ...c, user };
}

export async function action({ request, params }: Route.ActionArgs) {
  const formData = await request.formData();
  const formValues = {
    email: formData.get("email"),
    first_name: formData.get("first_name"),
    last_name: formData.get("last_name"),
    role: formData.get("role"),
    membership_status: formData.getAll("membership_status"),
    certification_level: formData.get("certification_level"),
  };

  if (
    formValues.membership_status.includes("junior") &&
    formValues.membership_status.length > 1
  ) {
    return data(
      {
        success: false,
        error: "Junior members cannot be providers or drivers",
      },
      { status: 400 },
    );
  }

  const user = userSchema({
    user_id: params.user_id,
    ...formValues,
  });

  if (user instanceof type.errors) {
    return data(
      { success: false, error: user.summary, formValues },
      { status: 400 },
    );
  }

  try {
    const store = UserStore.make();
    await store.updateUser(user);
  } catch (error) {
    if (error instanceof Error) {
      return data(
        { success: false, error: error.message, formValues },
        { status: 500 },
      );
    }
    throw error;
  }

  return { success: true };
}

export default function UpdateUser({ loaderData }: Route.ComponentProps) {
  const { user } = loaderData;
  const fetcher = useFetcher<typeof action>();
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);

  useEffect(() => {
    if (fetcher.data?.success === true && fetcher.state === "idle") {
      setShowSuccessMessage(true);
      const timer = setTimeout(() => {
        setShowSuccessMessage(false);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [fetcher.data?.success, fetcher.state]);

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="card bg-base-100 shadow-lg">
        <div className="card-body">
          <h2 className="card-title mb-4">Update User Information</h2>

          {fetcher.data && "error" in fetcher.data && (
            <div className="alert alert-error mb-4">
              <span>{fetcher.data.error}</span>
            </div>
          )}

          {showSuccessMessage && (
            <div className="alert alert-success mb-4">
              <span>User updated successfully!</span>
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
                defaultValue={user.email}
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
                defaultValue={user.first_name}
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
                defaultValue={user.last_name}
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
                defaultValue={user.role}
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
              <div className="flex flex-col gap-2">
                <label className="flex cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    name="membership_status"
                    value="provider"
                    defaultChecked={
                      Array.isArray(user.membership_status)
                        ? user.membership_status.includes("provider")
                        : user.membership_status === "provider"
                    }
                    className="checkbox"
                  />
                  <span>Provider</span>
                </label>
                <label className="flex cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    name="membership_status"
                    value="driver"
                    defaultChecked={
                      Array.isArray(user.membership_status)
                        ? user.membership_status.includes("driver")
                        : user.membership_status === "driver"
                    }
                    className="checkbox"
                  />
                  <span>Driver Only</span>
                </label>
                <label className="flex cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    name="membership_status"
                    value="junior"
                    defaultChecked={
                      Array.isArray(user.membership_status)
                        ? user.membership_status.includes("junior")
                        : user.membership_status === "junior"
                    }
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
                defaultValue={user.certification_level}
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
                {fetcher.state === "idle" ? (
                  "Update User"
                ) : (
                  <span className="loading loading-spinner loading-xs"></span>
                )}
              </button>
            </div>
          </fetcher.Form>
        </div>
      </div>
    </div>
  );
}
