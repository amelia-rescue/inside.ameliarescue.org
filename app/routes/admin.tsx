import { data, Link, redirect, useFetcher } from "react-router";
import type { Route } from "./+types/admin";
import { appContext } from "~/context";
import { EmailService } from "~/lib/email-service";
import { UserStore } from "~/lib/user-store";
import { showToast } from "~/components/toaster";
import { useEffect, useRef, useState } from "react";

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
  const ctx = context.get(appContext);

  // Check if user is admin
  if (!ctx?.user || ctx.user.website_role !== "admin") {
    throw redirect("/");
  }

  const userStore = UserStore.make();
  const users = (await userStore.listUsers()).sort((a, b) => {
    const firstNameComparison = a.first_name.localeCompare(b.first_name);
    if (firstNameComparison !== 0) {
      return firstNameComparison;
    }

    const lastNameComparison = a.last_name.localeCompare(b.last_name);
    if (lastNameComparison !== 0) {
      return lastNameComparison;
    }

    return a.email.localeCompare(b.email);
  });
  return { users };
}

export async function action({ request, context }: Route.ActionArgs) {
  const ctx = context.get(appContext);

  // Check if user is admin
  if (!ctx?.user || ctx.user.website_role !== "admin") {
    throw redirect("/");
  }

  const formData = await request.formData();
  const intent = formData.get("intent");
  const userId = formData.get("userId");

  if (intent === "delete" && typeof userId === "string") {
    const userStore = UserStore.make();
    try {
      await userStore.softDelete(userId);
      return data({ success: true, intent: "delete" });
    } catch (error) {
      if (error instanceof Error) {
        return data({ success: false, error: error.message }, { status: 500 });
      }

      return data(
        { success: false, error: "Failed to delete user" },
        { status: 500 },
      );
    }
  }

  if (intent === "set-temporary-password" && typeof userId === "string") {
    const userStore = UserStore.make();
    const emailService = EmailService.make();

    try {
      const { user, temporaryPassword } =
        await userStore.setTemporaryPassword(userId);
      await emailService.sendTemporaryPasswordEmail({
        user,
        temporaryPassword,
      });

      return data({
        success: true,
        intent: "set-temporary-password",
        userEmail: user.email,
      });
    } catch (error) {
      if (error instanceof Error) {
        return data({ success: false, error: error.message }, { status: 500 });
      }

      return data(
        { success: false, error: "Failed to delete user" },
        { status: 500 },
      );
    }
  }

  return data({ success: false, error: "Invalid request" }, { status: 400 });
}

export default function Admin({ loaderData }: Route.ComponentProps) {
  const { users } = loaderData;
  const fetcher = useFetcher<typeof action>();
  const hasShownToast = useRef(false);
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null);
  const [deleteUserName, setDeleteUserName] = useState<string>("");
  const [tempPasswordUserId, setTempPasswordUserId] = useState<string | null>(
    null,
  );
  const [tempPasswordUserName, setTempPasswordUserName] = useState<string>("");
  const [tempPasswordUserEmail, setTempPasswordUserEmail] =
    useState<string>("");

  const openDeleteModal = (userId: string, userName: string) => {
    setDeleteUserId(userId);
    setDeleteUserName(userName);
    (document.getElementById("delete_modal") as HTMLDialogElement)?.showModal();
  };

  const closeDeleteModal = () => {
    setDeleteUserId(null);
    setDeleteUserName("");
    (document.getElementById("delete_modal") as HTMLDialogElement)?.close();
  };

  const openTempPasswordModal = (
    userId: string,
    userName: string,
    userEmail: string,
  ) => {
    setTempPasswordUserId(userId);
    setTempPasswordUserName(userName);
    setTempPasswordUserEmail(userEmail);
    (
      document.getElementById("temp_password_modal") as HTMLDialogElement
    )?.showModal();
  };

  const closeTempPasswordModal = () => {
    setTempPasswordUserId(null);
    setTempPasswordUserName("");
    setTempPasswordUserEmail("");
    (
      document.getElementById("temp_password_modal") as HTMLDialogElement
    )?.close();
  };

  useEffect(() => {
    const isIdle = fetcher.state === "idle";

    if (!isIdle) {
      hasShownToast.current = false;
      return;
    }

    if (!fetcher.data || hasShownToast.current) {
      return;
    }

    if ("success" in fetcher.data && fetcher.data.success === true) {
      const actionIntent =
        "intent" in fetcher.data ? fetcher.data.intent : undefined;
      const userEmail =
        "userEmail" in fetcher.data ? fetcher.data.userEmail : undefined;

      hasShownToast.current = true;
      if (actionIntent === "delete") {
        closeDeleteModal();
        showToast({
          message: "User deleted successfully!",
          type: "alert-success",
        });
        return;
      }

      if (actionIntent === "set-temporary-password") {
        closeTempPasswordModal();
      }

      showToast({
        message:
          actionIntent === "set-temporary-password" &&
          typeof userEmail === "string"
            ? `Temporary password email sent to ${userEmail}.`
            : "Action completed successfully!",
        type: "alert-success",
      });
      return;
    }

    if ("error" in fetcher.data && typeof fetcher.data.error === "string") {
      hasShownToast.current = true;
      showToast({
        message: fetcher.data.error,
        type: "alert-error",
      });
    }
  }, [fetcher.state, fetcher.data]);

  return (
    <>
      <div className="breadcrumbs mb-4 text-sm">
        <ul>
          <li>
            <Link to="/">Home</Link>
          </li>
          <li>Admin</li>
        </ul>
      </div>

      <div className="mb-6">
        <div className="flex flex-wrap gap-3">
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
          <Link to="/admin/email-events" className="btn btn-secondary">
            View Email Events
          </Link>
          <Link to="/admin/truck-checks" className="btn btn-secondary">
            Manage Truck Checks
          </Link>
        </div>
      </div>

      <div className="mb-8">
        <h1 className="text-3xl font-bold">User Administration</h1>
      </div>

      <div className="card bg-base-100 shadow-xl">
        <div className="card-body">
          <h2 className="card-title">Users ({users.length})</h2>
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Website Role</th>
                  <th>Last Login</th>
                  <th className="w-56 min-w-56 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.user_id}>
                    <td>
                      <Link
                        to={`/user/${user.user_id}`}
                        className="group hover:bg-base-200 block rounded-lg px-1 py-1 transition-colors"
                      >
                        <div className="text-base-content decoration-base-content/50 font-medium underline underline-offset-2">
                          {user.first_name} {user.last_name}
                        </div>
                        <div className="text-base-content/70 decoration-base-content/30 group-hover:text-base-content text-sm underline underline-offset-2">
                          {user.email}
                        </div>
                      </Link>
                    </td>
                    <td>
                      <span className="badge badge-neutral">
                        {user.website_role}
                      </span>
                    </td>
                    <td>
                      <span className="text-sm">
                        {user.last_login_at
                          ? `${user.last_login_at.slice(0, 10)} ${user.last_login_at.slice(11, 16)} UTC`
                          : "Never"}
                      </span>
                    </td>
                    <td className="w-56 min-w-56 text-right align-top">
                      <div className="flex flex-col items-end gap-2 sm:flex-row sm:justify-end">
                        <button
                          type="button"
                          className="btn btn-sm btn-ghost"
                          disabled={fetcher.state !== "idle"}
                          onClick={() =>
                            openTempPasswordModal(
                              user.user_id,
                              `${user.first_name} ${user.last_name}`,
                              user.email,
                            )
                          }
                        >
                          Set Temporary Password
                        </button>
                        <Link
                          to={`/admin/update-user/${user.user_id}`}
                          className="btn btn-sm btn-ghost"
                        >
                          Edit
                        </Link>
                        <button
                          onClick={() =>
                            openDeleteModal(
                              user.user_id,
                              `${user.first_name} ${user.last_name}`,
                            )
                          }
                          className="btn btn-sm btn-error btn-ghost"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <dialog id="delete_modal" className="modal">
        <div className="modal-box">
          <h3 className="text-lg font-bold">Confirm Deletion</h3>
          <p className="py-4">
            Are you sure you want to delete <strong>{deleteUserName}</strong>?
            This will disable their account and prevent them from signing in.
          </p>
          <div className="modal-action">
            <button onClick={closeDeleteModal} className="btn btn-ghost">
              Cancel
            </button>
            <fetcher.Form method="post">
              <input type="hidden" name="intent" value="delete" />
              <input type="hidden" name="userId" value={deleteUserId || ""} />
              <button
                type="submit"
                className="btn btn-error"
                disabled={fetcher.state !== "idle"}
              >
                Delete User
              </button>
            </fetcher.Form>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button onClick={closeDeleteModal}>close</button>
        </form>
      </dialog>

      <dialog id="temp_password_modal" className="modal">
        <div className="modal-box">
          <h3 className="text-lg font-bold">
            Confirm Temporary Password Reset
          </h3>
          <p className="py-4">
            Are you sure you want to set a temporary password for{" "}
            <strong>{tempPasswordUserName}</strong>?
          </p>
          <p className="pb-4 text-sm opacity-70">
            A new temporary password will be emailed to {tempPasswordUserEmail},
            and the user will be required to change it on next sign-in.
          </p>
          <div className="modal-action">
            <button onClick={closeTempPasswordModal} className="btn btn-ghost">
              Cancel
            </button>
            <fetcher.Form method="post">
              <input
                type="hidden"
                name="intent"
                value="set-temporary-password"
              />
              <input
                type="hidden"
                name="userId"
                value={tempPasswordUserId || ""}
              />
              <button
                type="submit"
                className="btn btn-outline"
                disabled={fetcher.state !== "idle"}
              >
                Set Temporary Password
              </button>
            </fetcher.Form>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button onClick={closeTempPasswordModal}>close</button>
        </form>
      </dialog>
    </>
  );
}
