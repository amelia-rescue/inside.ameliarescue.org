import type { Route } from "./+types/home";
import { Welcome } from "../welcome/welcome";
import { appContext } from "~/context";

const requestLogger: Route.MiddlewareFunction = async function (
  { request, context },
  next,
) {
  context.set(appContext, {
    x: "asdf",
  });
  console.log(request.method, request.url);
  return await next();
};

export const middleware: Route.MiddlewareFunction[] = [requestLogger];

export function meta({}: Route.MetaArgs) {
  return [
    { title: "New React Router App" },
    { name: "description", content: "Welcome to React Router!" },
  ];
}

export default function Home() {
  return <Welcome />;
}
