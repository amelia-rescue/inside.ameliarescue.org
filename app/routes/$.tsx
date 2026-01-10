import type { Route } from "./+types/$";

/**
 * AI made this so react router isn't throwing 404 errors
 * this catch all allows the request to be logged by the logger
 * middleware
 */
export async function loader({ request }: Route.LoaderArgs) {
  return new Response("Not Found", { status: 404 });
}

export default function CatchAll() {
  return null;
}
