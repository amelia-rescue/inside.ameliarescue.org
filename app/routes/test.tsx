import { useLoaderData } from "react-router";
import { appContext } from "~/context";
import type { Route } from "./+types/test";

export async function loader({ context }: Route.LoaderArgs) {
  // const thing = context.get(appContext);
  // return { thing };
  return {
    thing: {
      x: "lol",
    },
  };
}

export async function action({ request }: Route.ActionArgs) {
  // Handle POST requests
  if (request.method === "POST") {
    return Response.json({
      message: "Hello from POST endpoint",
      timestamp: new Date().toISOString(),
      method: request.method,
      status: "success",
    });
  }

  // Handle other methods if needed
  // return Response.json({ error: "Method not allowed" }, { status: 405 });
}

export default function Test() {
  const { thing } = useLoaderData<typeof loader>();
  return (
    <div>
      <h1>Test Page</h1>
      <p>Context value: {thing?.x || "No context value found"}</p>
    </div>
  );
}
