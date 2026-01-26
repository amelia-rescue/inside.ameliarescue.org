import { redirect } from "react-router";
import type { Route } from "./+types/logout-complete";

export async function loader({ request }: Route.LoaderArgs) {
  // This page is hit after Cognito completes the logout
  // Redirect to login page
  return redirect("/auth/login");
}

export default function LogoutComplete() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold">Logging out...</h1>
        <p className="mt-2 text-gray-600">
          Please wait while we complete your logout.
        </p>
      </div>
    </div>
  );
}
