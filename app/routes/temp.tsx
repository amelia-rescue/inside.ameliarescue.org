import { appContext } from "~/context";
import type { Route } from "./+types/temp";

export async function loader({ context }: Route.LoaderArgs) {
  const ctx = context.get(appContext);
  if (!ctx) {
    throw new Error("No user found");
  }
  return { user: ctx.user };
}

export default function Temp({ loaderData }: Route.ComponentProps) {
  return (
    <>
      <h1>hello {loaderData.user.first_name}</h1>
    </>
  );
}
