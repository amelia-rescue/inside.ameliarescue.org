import { useLoaderData } from "react-router";
import { appContext } from "~/context";
import type { Route } from "./+types/test";

export async function loader({ context }: Route.LoaderArgs) {
  // const thing = context.get(appContext);
  // return { thing };
  return {
    x: "lol",
  };
}

export default function Test() {
  const { thing } = useLoaderData<typeof loader>();
  console.log("hi");
  return (
    <div>
      <h1>Test Page</h1>
      <p>Context value: {thing?.x || "No context value found"}</p>
    </div>
  );
}
