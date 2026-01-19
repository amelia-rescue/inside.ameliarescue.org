import { type LoaderFunctionArgs } from "react-router";
import { Link, useLoaderData } from "react-router";
import { requireUser } from "~/lib/session.server";
import { UserStore, type User } from "~/lib/user-store";

export async function loader({ request }: LoaderFunctionArgs) {
  const sessionUser = await requireUser(request);
  const userStore = UserStore.make();
  const user = await userStore.getUser(sessionUser.user_id);
  return { user };
}

export default function AccountSecurity() {
  const { user } = useLoaderData<{ user: User }>();

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <div className="rounded-lg bg-white p-6 shadow">
          <h1 className="mb-6 text-3xl font-bold text-gray-900">Security</h1>

          <div className="border-t border-gray-200 pt-6">
            <div className="space-y-4">
              <div>
                <div className="text-sm font-medium text-gray-500">
                  Signed in as
                </div>
                <div className="mt-1 text-sm text-gray-900">{user.email}</div>
              </div>

              <div className="border-t border-gray-200 pt-4">
                <h2 className="text-lg font-semibold text-gray-900">
                  Passkeys
                </h2>
                <p className="mt-1 text-sm text-gray-600">
                  Add a passkey to sign in faster and more securely.
                </p>

                <div className="mt-4 flex gap-3">
                  <Link
                    to="/auth/passkeys/add"
                    className="inline-flex items-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none"
                  >
                    Set up a passkey
                  </Link>

                  <Link
                    to="/protected"
                    className="inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none"
                  >
                    Back
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
