import { Form, Link, redirect } from "react-router";
import type { Route } from "./+types/admin";
import { appContext } from "~/context";
import { UserStore } from "~/lib/user-store";
import { useState } from "react";

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
  const users = await userStore.listUsers();
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
    await userStore.softDelete(userId);
  }

  return redirect("/admin");
}

export default function Admin({ loaderData }: Route.ComponentProps) {
  const { users } = loaderData;
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null);
  const [deleteUserName, setDeleteUserName] = useState<string>("");

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

  return (
    <>
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
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.user_id}>
                    <td>
                      <div className="font-medium">
                        {user.first_name} {user.last_name}
                      </div>
                      <div className="text-sm opacity-60">{user.email}</div>
                    </td>
                    <td>
                      <span className="badge badge-neutral">
                        {user.website_role}
                      </span>
                    </td>
                    <td className="text-right">
                      <div className="flex justify-end gap-2">
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
            <Form
              method="post"
              onSubmit={() => {
                closeDeleteModal();
              }}
            >
              <input type="hidden" name="intent" value="delete" />
              <input type="hidden" name="userId" value={deleteUserId || ""} />
              <button type="submit" className="btn btn-error">
                Delete User
              </button>
            </Form>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button onClick={closeDeleteModal}>close</button>
        </form>
      </dialog>
    </>
  );
}
