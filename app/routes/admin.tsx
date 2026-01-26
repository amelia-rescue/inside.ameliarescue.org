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
      <h1 className="mb-6 text-3xl font-bold">User Administration</h1>

      <div className="mb-6 flex gap-4">
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
      </div>

      <div className="bg-base-200 rounded-lg p-6 shadow">
        <h2 className="mb-4 text-xl font-semibold">Users</h2>
        <ul className="divide-base-300 divide-y">
          {users.map((user) => (
            <li
              key={user.user_id}
              className="flex items-center justify-between py-3"
            >
              <div>
                <span className="font-medium">{`${user.first_name} ${user.last_name}`}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="badge badge-neutral">{user.website_role}</span>
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
            </li>
          ))}
        </ul>
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
