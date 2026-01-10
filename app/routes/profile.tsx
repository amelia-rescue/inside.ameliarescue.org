/**
 * I want
 * a profile picture
 * contact info phone number, membership status "provider" | "driver only" | "something else"
 * certification list and a way to add new certifications or replace existing ones
 * event log of the stuff that you've done lately?
 */

import { Link } from "react-router";

export default function Profile() {
  return (
    <>
      <div className="card bg-base-100 shadow">
        <div className="card-body">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="avatar avatar-placeholder">
                <div className="bg-neutral text-neutral-content w-20 rounded-full">
                  <span className="text-3xl">AR</span>
                </div>
              </div>
              <div>
                <h1 className="text-2xl font-bold">Alex Rescuer</h1>
                <p className="opacity-70">Member ID: 000123</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <span className="badge badge-primary">Provider</span>
              <span className="badge">Driver Only</span>
              <span className="badge badge-outline">Something else</span>
            </div>
          </div>

          <div className="divider" />

          <div className="grid gap-4 md:grid-cols-2">
            <div className="card bg-base-200">
              <div className="card-body">
                <h2 className="card-title text-base">Contact</h2>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <dt className="opacity-70">Phone</dt>
                  <dd className="font-medium">(555) 123-4567</dd>
                  <dt className="opacity-70">Email</dt>
                  <dd className="font-medium">alex@example.com</dd>
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
