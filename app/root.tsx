import {
  isRouteErrorResponse,
  Link,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteError,
  useRouteLoaderData,
} from "react-router";

import type { Route } from "./+types/root";
import "./app.css";
import { authMiddleware } from "./middleware/auth";
import { requestLogger } from "./middleware/logger";
import { appContext } from "./context";

export const middleware: Route.MiddlewareFunction[] = [
  requestLogger,
  authMiddleware,
];

export const links: Route.LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap",
  },
];

export async function loader({ context }: Route.LoaderArgs) {
  const appCtx = context.get(appContext);
  return {
    user: appCtx?.user,
  };
}

export function Layout({ children }: { children: React.ReactNode }) {
  const data = useRouteLoaderData<typeof loader>("root");
  const error = useRouteError();
  return (
    <html lang="en" data-theme="forest">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        <div className="bg-base-200 flex min-h-screen flex-col">
          <div className="navbar bg-base-100 shadow">
            <div className="mx-auto w-full max-w-5xl px-4">
              <div className="flex w-full items-center justify-between">
                <Link to="/" className="text-xl font-semibold">
                  Inside Amelia Rescue
                </Link>
                <div className="flex items-center gap-2">
                  {data?.user && (
                    <Link to="/profile">
                      <div className="avatar placeholder">
                        <div className="bg-neutral text-neutral-content flex w-10 items-center justify-center rounded-full">
                          <span className="text-xl">
                            {data.user.first_name.charAt(0)}
                          </span>
                        </div>
                      </div>
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </div>

          <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
            {children}
          </main>

          <footer className="footer footer-center bg-base-300 text-base-content p-4">
            <aside>
              <p>
                {new Date().getFullYear()} Amelia Emergency Squad. All rights
                reserved.
              </p>
            </aside>
          </footer>
        </div>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="container mx-auto p-4 pt-16">
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre className="w-full overflow-x-auto p-4">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
