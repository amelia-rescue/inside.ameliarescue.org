import { appContext } from "~/context";
import type { Route } from "./+types/security";
import {
  IoFingerPrint,
  IoKey,
  IoLogOut,
  IoShieldCheckmark,
  IoTrash,
} from "react-icons/io5";
import { Form, Link, redirect } from "react-router";
import {
  listWebAuthnCredentials,
  deleteWebAuthnCredential,
} from "~/lib/auth.server";
import { requireUser } from "~/lib/session.server";
import { DateDisplay } from "~/components/date-display";

export async function loader({ context, request }: Route.LoaderArgs) {
  const ctx = context.get(appContext);
  if (!ctx) {
    throw new Error("No user found");
  }

  const { user: sessionUser } = await requireUser(request);

  let passkeys: Array<{
    CredentialId: string;
    FriendlyCredentialName?: string;
    CreatedAt: number;
    AuthenticatorAttachment?: string;
  }> = [];

  try {
    const result = await listWebAuthnCredentials(sessionUser.accessToken);
    passkeys = result.Credentials;
  } catch (error) {
    console.error("Failed to fetch passkeys:", error);
  }

  return { user: ctx.user, passkeys };
}

export async function action({ request }: Route.ActionArgs) {
  const { user: sessionUser } = await requireUser(request);
  const formData = await request.formData();
  const intent = formData.get("intent");
  const credentialId = formData.get("credentialId");

  if (intent === "delete" && typeof credentialId === "string") {
    try {
      await deleteWebAuthnCredential(sessionUser.accessToken, credentialId);
    } catch (error) {
      console.error("Failed to delete passkey:", error);
      throw new Error("Failed to delete passkey");
    }
  }

  return redirect("/account/security");
}

export default function Security({ loaderData }: Route.ComponentProps) {
  const { user } = loaderData;
  return (
    <>
      <div className="breadcrumbs mb-4 text-sm">
        <ul>
          <li>
            <Link to="/">Home</Link>
          </li>
          <li>
            <Link to="/profile">Profile</Link>
          </li>
          <li>Account Security</li>
        </ul>
      </div>

      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold">Account Security</h1>
        <Link to="/profile" className="btn btn-ghost btn-sm">
          Back to Profile
        </Link>
      </div>

      <div className="grid gap-6">
        {/* Account Information */}
        <div className="card bg-base-100 shadow">
          <div className="card-body">
            <h2 className="card-title flex items-center gap-2">
              <IoShieldCheckmark className="text-primary" />
              Account Information
            </h2>
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-sm opacity-70">Email Address</dt>
                <dd className="font-medium">{user.email}</dd>
                <p className="mt-1 text-xs opacity-60">
                  Email cannot be changed as it's your primary identifier
                </p>
              </div>
              <div>
                <dt className="text-sm opacity-70">Account Type</dt>
                <dd className="font-medium capitalize">{user.website_role}</dd>
              </div>
            </dl>
          </div>
        </div>

        {/* Passkeys */}
        <div className="card bg-base-100 shadow">
          <div className="card-body">
            <h2 className="card-title flex items-center gap-2">
              <IoKey className="text-primary" />
              Passkeys
            </h2>
            <p className="text-sm opacity-70">
              Passkeys let you sign in using your device's biometrics (Face ID,
              Touch ID, or fingerprint) or a security key. They're more secure
              than passwords and get you logged in instantly with just a glance
              or a touch — no typing required.
            </p>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="bg-base-200/50 flex items-center gap-3 rounded-lg p-3">
                <IoFingerPrint className="text-primary text-xl" />
                <span className="text-sm">
                  Log in with Face ID, Touch ID, or fingerprint
                </span>
              </div>
              <div className="bg-base-200/50 flex items-center gap-3 rounded-lg p-3">
                <IoShieldCheckmark className="text-primary text-xl" />
                <span className="text-sm">
                  No passwords to remember or type
                </span>
              </div>
            </div>

            <div className="divider"></div>

            {loaderData.passkeys.length > 0 ? (
              <>
                <div className="space-y-3">
                  {loaderData.passkeys.map((passkey) => (
                    <div
                      key={passkey.CredentialId}
                      className="border-base-300 flex items-center justify-between rounded-lg border p-4"
                    >
                      <div className="flex items-center gap-3">
                        <IoKey className="text-primary text-2xl" />
                        <div>
                          <p className="font-medium">
                            {passkey.FriendlyCredentialName ||
                              "Unnamed Passkey"}
                          </p>
                          <p className="text-xs opacity-60">
                            {passkey.AuthenticatorAttachment === "platform"
                              ? "Platform authenticator"
                              : "Cross-platform authenticator"}
                            {" · "}
                            Added{" "}
                            <DateDisplay
                              value={passkey.CreatedAt * 1000}
                              format="shortDate"
                            />
                          </p>
                        </div>
                      </div>
                      <Form method="post">
                        <input type="hidden" name="intent" value="delete" />
                        <input
                          type="hidden"
                          name="credentialId"
                          value={passkey.CredentialId}
                        />
                        <button
                          type="submit"
                          className="btn btn-ghost btn-sm text-error"
                          title="Delete passkey"
                        >
                          <IoTrash />
                        </button>
                      </Form>
                    </div>
                  ))}
                </div>
                <div className="divider"></div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="bg-primary/10 mb-4 rounded-full p-4">
                  <IoFingerPrint className="text-primary text-4xl" />
                </div>
                <p className="text-lg font-medium">No passkeys yet</p>
                <p className="mt-1 max-w-sm text-sm opacity-60">
                  Add a passkey to sign in with Face ID, Touch ID, or your
                  fingerprint — it's faster and you never have to type your
                  password again.
                </p>
              </div>
            )}

            <div className="card-actions mt-4 justify-start">
              <Link
                to="/auth/passkeys/add?initiate=true"
                className="btn btn-primary"
              >
                <IoKey />
                Add a Passkey
              </Link>
            </div>
          </div>
        </div>

        {/* Logout */}
        <div className="card bg-base-100 shadow">
          <div className="card-body">
            <h2 className="card-title flex items-center gap-2">
              <IoLogOut className="text-primary" />
              Sign Out
            </h2>
            <p className="text-sm opacity-70">
              Sign out of your account on this device.
            </p>

            <div className="card-actions mt-4 justify-start">
              <Form method="post" action="/auth/logout">
                <button type="submit" className="btn btn-error">
                  <IoLogOut />
                  Sign Out
                </button>
              </Form>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
