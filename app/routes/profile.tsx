/**
 * I want
 * a profile picture
 * contact info phone number, membership status "provider" | "driver only" | "something else"
 * certification list and a way to add new certifications or replace existing ones
 * event log of the stuff that you've done lately?
 */

import { useFetcher, useLoaderData } from "react-router";
import type { Route } from "./+types/profile";
import { appContext } from "~/context";
import { useEffect, useState, useRef } from "react";
import { ArkErrors, type } from "arktype";
import { UserStore } from "~/lib/user-store";

export async function loader({ context }: Route.LoaderArgs) {
  const ctx = context.get(appContext);
  if (!ctx) {
    throw new Error("No user found");
  }
  return { user: ctx.user };
}

export async function action({ request, context }: Route.ActionArgs) {
  const ctx = context.get(appContext);
  if (!ctx) {
    throw new Error("No user found");
  }
  const formData = await request.formData();
  const contactUpdateSchema = type({
    phone: /^[\d\s\-\(\)\+]{1,20}$/,
  });
  const contact = contactUpdateSchema(Object.fromEntries(formData));
  if (contact instanceof ArkErrors) {
    return {
      errors: contact.summary,
    };
  }

  const store = UserStore.make();
  await store.updateUser({
    user_id: ctx.user.user_id,
    phone: contact.phone,
  });

  return { success: true };
}

export default function Profile() {
  const { user } = useLoaderData<typeof loader>();
  const ref = useRef<HTMLDialogElement>(null);
  const contactFetcher = useFetcher<typeof action>();
  const { success, errors } = contactFetcher.data || {};
  const [phoneValue, setPhoneValue] = useState(user.phone);

  const formatPhoneNumber = (value: string) => {
    const numbers = value.replace(/\D/g, "");
    if (numbers.length <= 3) {
      return numbers;
    }
    if (numbers.length <= 6) {
      return `${numbers.slice(0, 3)}-${numbers.slice(3)}`;
    }
    return `${numbers.slice(0, 3)}-${numbers.slice(3, 6)}-${numbers.slice(6, 10)}`;
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhoneNumber(e.target.value);
    setPhoneValue(formatted);
  };

  useEffect(() => {
    if (success === true) {
      ref.current?.close();
    }
  }, [success, errors]);

  return (
    <>
      <div className="card bg-base-100 shadow">
        <div className="card-body">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="avatar avatar-placeholder">
                <div className="bg-neutral text-neutral-content w-20 rounded-full">
                  <span className="text-3xl">
                    {user.first_name[0]}
                    {user.last_name[0]}
                  </span>
                </div>
              </div>
              <div>
                <h1 className="text-2xl font-bold">
                  {user.first_name} {user.last_name}
                </h1>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <span className="badge badge-primary">
                {user.membership_status}
              </span>
            </div>
          </div>

          <div className="divider" />

          <div className="grid gap-4 md:grid-cols-2">
            <div className="card bg-base-200">
              <div className="card-body">
                <div className="flex items-center justify-between gap-4">
                  <h2 className="card-title text-base">Contact</h2>
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    onClick={() => ref.current?.showModal()}
                  >
                    Update Contact
                  </button>
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <dt className="opacity-70">Phone</dt>
                  <dd className="font-medium">{user.phone}</dd>
                  <dt className="opacity-70">Email</dt>
                  <dd className="font-medium">{user.email}</dd>
                  <dt className="opacity-70">Preferred</dt>
                  <dd className="font-medium">Text</dd>
                </dl>
              </div>
            </div>

            <div className="card bg-base-200">
              <div className="card-body">
                <h2 className="card-title text-base">Membership</h2>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <dt className="opacity-70">Status</dt>
                  <dd className="font-medium">Active</dd>
                  <dt className="opacity-70">Role</dt>
                  <dd className="font-medium">Provider</dd>
                  <dt className="opacity-70">Joined</dt>
                  <dd className="font-medium">Jan 2024</dd>
                </dl>
              </div>
            </div>
          </div>

          <dialog
            ref={ref}
            id="update_contact_modal"
            className="modal modal-bottom sm:modal-middle"
          >
            <div className="modal-box">
              <h3 className="text-lg font-bold">Update Contact Information</h3>

              {errors && (
                <div className="alert alert-error mt-4">
                  <span>{errors}</span>
                </div>
              )}

              <contactFetcher.Form method="post" className="space-y-4 py-4">
                <div className="form-control w-full">
                  <label className="label">
                    <span className="label-text">Phone Number</span>
                  </label>
                  <input
                    type="tel"
                    name="phone"
                    value={phoneValue}
                    onChange={handlePhoneChange}
                    className="input input-bordered w-full"
                    placeholder="555-123-4567"
                    required
                  />
                </div>

                <div className="modal-action">
                  <button
                    type="button"
                    className="btn"
                    onClick={() => ref.current?.close()}
                  >
                    Cancel
                  </button>
                  <button
                    disabled={contactFetcher.state === "submitting"}
                    type="submit"
                    className="btn btn-primary"
                  >
                    Save Changes
                  </button>
                </div>
              </contactFetcher.Form>
            </div>
          </dialog>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="card bg-base-100 shadow">
          <div className="card-body">
            <div className="flex items-center justify-between gap-4">
              <h2 className="card-title">Certifications</h2>
              <div className="flex gap-2">
                <button type="button" className="btn btn-sm btn-primary">
                  Add certification
                </button>
                <button type="button" className="btn btn-sm">
                  Replace
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Issued</th>
                    <th>Expires</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>CPR / BLS</td>
                    <td>Mar 2025</td>
                    <td>Mar 2027</td>
                    <td>
                      <span className="badge badge-success">Valid</span>
                    </td>
                  </tr>
                  <tr>
                    <td>EVOC</td>
                    <td>Jul 2024</td>
                    <td>Jul 2026</td>
                    <td>
                      <span className="badge badge-success">Valid</span>
                    </td>
                  </tr>
                  <tr>
                    <td>ICS-100</td>
                    <td>Jan 2023</td>
                    <td>—</td>
                    <td>
                      <span className="badge">On file</span>
                    </td>
                  </tr>
                  <tr>
                    <td>PHTLS</td>
                    <td>Aug 2022</td>
                    <td>Aug 2024</td>
                    <td>
                      <span className="badge badge-warning">Expired</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="card bg-base-100 shadow">
          <div className="card-body">
            <div className="flex items-center justify-between gap-4">
              <h2 className="card-title">Recent activity</h2>
              <button type="button" className="btn btn-sm btn-ghost">
                View all
              </button>
            </div>

            <div className="space-y-3">
              <div className="alert">
                <div className="flex w-full items-start justify-between gap-4">
                  <div>
                    <div className="font-semibold">
                      Completed training module
                    </div>
                    <div className="text-sm opacity-70">HazMat awareness</div>
                  </div>
                  <div className="text-sm opacity-70">2 days ago</div>
                </div>
              </div>

              <div className="alert">
                <div className="flex w-full items-start justify-between gap-4">
                  <div>
                    <div className="font-semibold">Responded to call</div>
                    <div className="text-sm opacity-70">Standby coverage</div>
                  </div>
                  <div className="text-sm opacity-70">1 week ago</div>
                </div>
              </div>

              <div className="alert">
                <div className="flex w-full items-start justify-between gap-4">
                  <div>
                    <div className="font-semibold">Certification updated</div>
                    <div className="text-sm opacity-70">EVOC uploaded</div>
                  </div>
                  <div className="text-sm opacity-70">3 weeks ago</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
