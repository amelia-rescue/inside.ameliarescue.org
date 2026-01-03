import { Link } from "react-router";

export default function Protocols() {
  return (
    <div className="bg-base-200 min-h-screen">
      <div className="navbar bg-base-100 shadow">
        <div className="mx-auto w-full max-w-5xl px-4">
          <div className="flex w-full items-center justify-between">
            <div className="text-xl font-semibold">Protocols</div>
            <Link to="/" className="btn btn-sm btn-ghost">
              Back
            </Link>
          </div>
        </div>
      </div>

      <main className="mx-auto w-full max-w-5xl px-4 py-10">
        <div className="alert">
          <span>This page is a placeholder.</span>
        </div>
      </main>
    </div>
  );
}
