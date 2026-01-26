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
  useFetcher,
  data,
} from "react-router";
import { useEffect } from "react";

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
    theme: appCtx?.theme || "forest",
  };
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const theme = formData.get("theme") as string;

  const { setPreferences } = await import("./lib/preferences.server");
  const headers = await setPreferences({ theme });

  return data({ success: true }, { headers });
}

export function Layout({ children }: { children: React.ReactNode }) {
  const loaderData = useRouteLoaderData<typeof loader>("root");
  const error = useRouteError();
  const fetcher = useFetcher();
  const theme = loaderData?.theme || "forest";

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const handleThemeChange = (newTheme: string) => {
    const formData = new FormData();
    formData.append("theme", newTheme);
    fetcher.submit(formData, { method: "post" });
  };

  return (
    <html lang="en" data-theme={theme}>
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
                <div className="flex items-center gap-4">
                  {loaderData?.user && (
                    <Link
                      to="/account/security"
                      className="btn btn-ghost btn-sm"
                    >
                      Account
                    </Link>
                  )}
                  <div className="dropdown dropdown-end">
                    <div
                      tabIndex={0}
                      role="button"
                      className="btn btn-ghost btn-sm"
                    >
                      Theme
                    </div>
                    <ul
                      tabIndex={0}
                      className="menu dropdown-content bg-base-100 rounded-box z-10 w-52 p-2 shadow"
                    >
                      <li>
                        <button onClick={() => handleThemeChange("light")}>
                          Light
                        </button>
                      </li>
                      <li>
                        <button onClick={() => handleThemeChange("dark")}>
                          Dark
                        </button>
                      </li>
                      <li>
                        <button onClick={() => handleThemeChange("retro")}>
                          Retro
                        </button>
                      </li>
                      <li>
                        <button onClick={() => handleThemeChange("forest")}>
                          Forest
                        </button>
                      </li>
                    </ul>
                  </div>
                  {loaderData?.user && (
                    <Link to="/profile">
                      <div className="avatar">
                        <div className="ring-primary ring-offset-base-100 w-10 rounded-full ring ring-offset-2">
                          {loaderData.user.profile_picture_url ? (
                            <img
                              src={loaderData.user.profile_picture_url}
                              alt={`${loaderData.user.first_name} ${loaderData.user.last_name}`}
                            />
                          ) : (
                            <div className="bg-neutral text-neutral-content flex h-full w-full items-center justify-center">
                              <span className="text-xl">
                                {loaderData.user.first_name.charAt(0)}
                              </span>
                            </div>
                          )}
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
