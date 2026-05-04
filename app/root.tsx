import {
  isRouteErrorResponse,
  Link,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useNavigation,
  useRouteError,
  useRouteLoaderData,
  useFetcher,
  useLocation,
  data,
} from "react-router";
import { useEffect, useState } from "react";

import type { Route } from "./+types/root";
import "./app.css";
import { authMiddleware } from "./middleware/auth";
import { requestLogger } from "./middleware/logger";
import { appContext } from "./context";
import { Toaster } from "./components/toaster";

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
  { rel: "manifest", href: "/manifest.webmanifest" },
  { rel: "icon", href: "/favicon.ico", sizes: "any" },
  {
    rel: "apple-touch-icon",
    href: "/logo-192.png",
    type: "image/png",
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

function NavigationLoadingIndicator() {
  const navigation = useNavigation();
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (navigation.state === "idle") {
      setIsVisible(false);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setIsVisible(true);
    }, 150);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [navigation.state]);

  if (!isVisible) {
    return null;
  }

  return (
    <div
      aria-live="polite"
      aria-busy="true"
      className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4"
      role="status"
    >
      <div className="bg-base-100/90 text-base-content border-primary flex items-center gap-3 rounded-full border px-4 py-2 shadow-lg backdrop-blur-sm">
        <span
          className="loading loading-spinner loading-sm"
          aria-hidden="true"
        />
        <span className="text-sm font-medium">Loading page…</span>
      </div>
    </div>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const loaderData = useRouteLoaderData<typeof loader>("root");
  const error = useRouteError();
  const fetcher = useFetcher();
  const location = useLocation();
  const theme = loaderData?.theme || "forest";
  const isWideContentRoute = location.pathname === "/training-status";
  const themeColor =
    theme === "light"
      ? "#f5f5f5"
      : theme === "retro"
        ? "#ece3ca"
        : theme === "dark"
          ? "#1d232a"
          : "#1f2937";

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    if (import.meta.env.DEV || !("serviceWorker" in navigator)) {
      return;
    }

    void navigator.serviceWorker.register("/sw.js");
  }, []);

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
        <meta name="theme-color" content={themeColor} />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta
          name="apple-mobile-web-app-title"
          content="Inside Amelia Rescue"
        />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <Meta />
        <Links />
      </head>
      <body>
        <NavigationLoadingIndicator />
        <div className="bg-base-200 flex min-h-screen flex-col">
          <div className="navbar bg-base-100 shadow">
            <div className="mx-auto w-full max-w-5xl px-4">
              <div className="flex w-full items-center justify-between">
                <Link to="/" aria-label="Inside Amelia Rescue">
                  <img
                    src="/logo-192.png"
                    alt="Inside Amelia Rescue"
                    className="h-10 w-10 rounded"
                  />
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

          <main
            className={`mx-auto w-full flex-1 px-4 py-10 ${
              isWideContentRoute ? "max-w-[1800px]" : "max-w-5xl"
            }`}
          >
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
        <Toaster />
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
  } else if (
    process.env.NODE_ENV === "development" &&
    error &&
    error instanceof Error
  ) {
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
