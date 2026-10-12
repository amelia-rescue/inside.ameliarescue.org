import {
  isRouteErrorResponse,
  Link,
  Links,
  NavLink,
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
  useRevalidator,
} from "react-router";
import { useEffect, useRef, useState } from "react";
import {
  FiAward,
  FiFile,
  FiHome,
  FiMoon,
  FiSettings,
  FiShare2,
  FiSun,
  FiTruck,
  FiUser,
} from "react-icons/fi";

import type { Route } from "./+types/root";
import "./app.css";
import { authMiddleware } from "./middleware/auth";
import { requestLogger } from "./middleware/logger";
import { appContext } from "./context";
import { Toaster, showToast } from "./components/toaster";
import { log } from "./lib/logger";
import type { RumRuntimeConfig } from "./lib/rum.client";

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
    href: "https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=IBM+Plex+Mono:wght@500&family=Public+Sans:wght@400;500;600;700&display=swap",
  },
  { rel: "manifest", href: "/manifest.webmanifest" },
  { rel: "icon", href: "/favicon.ico", sizes: "any" },
  {
    rel: "apple-touch-icon",
    href: "/logo-192.png",
    type: "image/png",
  },
];

function getRumConfig(
  request: Request,
  userId?: string,
): RumRuntimeConfig | undefined {
  if (!userId || new URL(request.url).pathname.startsWith("/auth/")) {
    return undefined;
  }

  const applicationId = process.env.RUM_APP_MONITOR_ID;
  const region = process.env.RUM_REGION;
  const alias = process.env.RUM_ALIAS;
  const releaseId = process.env.RUM_RELEASE_ID;

  if (!applicationId || !region || !alias || !releaseId) {
    return undefined;
  }

  return { applicationId, region, alias, releaseId, userId };
}

export async function loader({ context, request }: Route.LoaderArgs) {
  const appCtx = context.get(appContext);
  const { getPreferences } = await import("./lib/preferences.server");
  const preferences = appCtx ? null : await getPreferences(request);

  return {
    user: appCtx?.user,
    theme: appCtx?.theme || preferences?.theme || "system",
    locale: appCtx?.locale || preferences?.locale || "en-US",
    timeZone: appCtx?.timeZone || preferences?.timeZone || "UTC",
    rum: getRumConfig(request, appCtx?.user.user_id),
  };
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const theme = formData.get("theme");
  const locale = formData.get("locale");
  const timeZone = formData.get("timeZone");

  log.info("preferences_update", {
    theme,
    locale,
    timeZone,
    has_cookie:
      request.headers.get("cookie")?.includes("preferences=") ?? false,
    user_agent: request.headers.get("user-agent"),
    ip_address: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
    user: appContext.defaultValue?.user?.user_id,
  });

  const { getPreferences, normalizeTheme, setPreferences } =
    await import("./lib/preferences.server");
  const preferences = await getPreferences(request);
  const headers = await setPreferences({
    ...preferences,
    ...(typeof theme === "string" && theme
      ? { theme: normalizeTheme(theme) }
      : {}),
    ...(typeof locale === "string" && locale ? { locale } : {}),
    ...(typeof timeZone === "string" && timeZone ? { timeZone } : {}),
  });

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

const THEME_COLORS = { light: "#0f1b2d", dark: "#050a13" } as const;

const NAV_LINKS = [
  { to: "/", label: "Home", shortLabel: "Home", icon: FiHome },
  {
    to: "/truck-check",
    label: "Truck checks",
    shortLabel: "Checks",
    icon: FiTruck,
  },
  {
    to: "/certification-status",
    label: "Certifications",
    shortLabel: "Certs",
    icon: FiAward,
  },
  { to: "/documents", label: "Documents", shortLabel: "Docs", icon: FiFile },
  { to: "/roster", label: "Roster", shortLabel: "Roster", icon: FiUser },
  {
    to: "/admin",
    label: "Admin",
    shortLabel: "Admin",
    icon: FiSettings,
    adminOnly: true,
  },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const loaderData = useRouteLoaderData<typeof loader>("root");
  const error = useRouteError();
  const fetcher = useFetcher();
  const preferenceFetcher = useFetcher();
  const revalidator = useRevalidator();
  const submittedPreferencesRef = useRef<string | null>(null);
  const revalidatedPreferencesRef = useRef<string | null>(null);
  const location = useLocation();
  const rumConfig = loaderData?.rum;
  const theme = loaderData?.theme || "system";
  const locale = loaderData?.locale || "en-US";
  const timeZone = loaderData?.timeZone || "UTC";
  const isWideContentRoute = location.pathname === "/certification-status";
  const contentWidthClass = isWideContentRoute ? "max-w-[1800px]" : "max-w-7xl";
  const user = loaderData?.user;
  const navLinks = NAV_LINKS.filter(
    (link) => !link.adminOnly || user?.website_role === "admin",
  );

  useEffect(() => {
    if (theme === "system") {
      document.documentElement.removeAttribute("data-theme");
    } else {
      document.documentElement.setAttribute("data-theme", theme);
    }
  }, [theme]);

  useEffect(() => {
    if (!rumConfig) {
      return;
    }

    let active = true;
    void import("./lib/rum.client").then((client) => {
      if (!active) {
        return;
      }
      client.initializeRum(rumConfig);
      client.recordRumPageView(location.pathname);
    });

    return () => {
      active = false;
    };
  }, [
    location.pathname,
    rumConfig?.alias,
    rumConfig?.applicationId,
    rumConfig?.region,
    rumConfig?.releaseId,
    rumConfig?.userId,
  ]);

  useEffect(() => {
    const browserTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const browserLocale = navigator.language;
    const preferenceKey = `${browserLocale}:${browserTimeZone}`;

    if (
      !browserTimeZone ||
      preferenceFetcher.state !== "idle" ||
      submittedPreferencesRef.current === preferenceKey ||
      (browserTimeZone === timeZone && browserLocale === locale)
    ) {
      return;
    }

    submittedPreferencesRef.current = preferenceKey;
    const formData = new FormData();
    formData.append("timeZone", browserTimeZone);
    formData.append("locale", browserLocale);
    preferenceFetcher.submit(formData, { method: "post" });
  }, [locale, preferenceFetcher, preferenceFetcher.state, timeZone]);

  useEffect(() => {
    const submittedPreferences = submittedPreferencesRef.current;

    if (
      preferenceFetcher.state === "idle" &&
      preferenceFetcher.data &&
      submittedPreferences &&
      revalidatedPreferencesRef.current !== submittedPreferences
    ) {
      revalidatedPreferencesRef.current = submittedPreferences;
      revalidator.revalidate();
    }
  }, [preferenceFetcher.data, preferenceFetcher.state, revalidator]);

  useEffect(() => {
    if (import.meta.env.DEV || !("serviceWorker" in navigator)) {
      return;
    }

    void navigator.serviceWorker.register("/sw.js");
  }, []);

  const handleThemeToggle = () => {
    const current =
      document.documentElement.getAttribute("data-theme") ??
      (window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light");
    const newTheme = current === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", newTheme);
    const formData = new FormData();
    formData.append("theme", newTheme);
    fetcher.submit(formData, { method: "post" });
  };

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      showToast({
        message: "Copied to clipboard",
        type: "alert-success",
        duration: 5000,
      });
    } catch {
      showToast({
        message: "Unable to copy",
        type: "alert-error",
        duration: 5000,
      });
    }
  };

  return (
    <html lang={locale} data-theme={theme === "system" ? undefined : theme}>
      <head>
        <meta charSet="utf-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
        {theme === "light" || theme === "dark" ? (
          <meta name="theme-color" content={THEME_COLORS[theme]} />
        ) : (
          <>
            <meta
              name="theme-color"
              content={THEME_COLORS.light}
              media="(prefers-color-scheme: light)"
            />
            <meta
              name="theme-color"
              content={THEME_COLORS.dark}
              media="(prefers-color-scheme: dark)"
            />
          </>
        )}
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
        <div
          className={`bg-base-200 flex min-h-screen flex-col ${
            user ? "pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-0" : ""
          }`}
        >
          <header className="bg-bar text-white">
            <div
              className={`mx-auto flex w-full items-center gap-x-8 px-4 py-2 sm:px-6 lg:px-8 ${contentWidthClass}`}
            >
              <Link
                to="/"
                className="flex items-center gap-3 py-1"
                aria-label="Inside Amelia Rescue home"
              >
                <img
                  src="/logo-192.png"
                  alt=""
                  className="h-10 w-10 rounded-full"
                />
                <span className="font-display text-xl leading-none font-bold tracking-wide uppercase">
                  <span className="sm:hidden">Inside AES</span>
                  <span className="hidden sm:inline">Inside Amelia Rescue</span>
                </span>
              </Link>
              {user && (
                <nav
                  aria-label="Main"
                  className="hidden flex-1 gap-6 text-[15px] font-semibold lg:flex"
                >
                  {navLinks.map((link) => (
                    <NavLink
                      key={link.to}
                      to={link.to}
                      end={link.to === "/"}
                      className={({ isActive }) =>
                        `shrink-0 border-b-[3px] py-2.5 whitespace-nowrap ${
                          isActive
                            ? "border-primary text-white"
                            : "text-bar-muted border-transparent hover:text-white"
                        }`
                      }
                    >
                      {link.label}
                    </NavLink>
                  ))}
                </nav>
              )}
              <div className="ml-auto flex items-center gap-3">
                {user && (
                  <Link
                    to="/account/security"
                    className="text-bar-muted hidden text-sm font-semibold hover:text-white lg:inline"
                  >
                    Security
                  </Link>
                )}
                <button
                  type="button"
                  onClick={handleThemeToggle}
                  className="bg-bar-chip flex h-11 w-11 cursor-pointer items-center justify-center rounded-full text-white"
                  aria-label="Toggle dark mode"
                >
                  <FiMoon className="theme-icon-moon h-5 w-5" />
                  <FiSun className="theme-icon-sun h-5 w-5" />
                </button>
                {user && (
                  <Link to="/profile" aria-label="Your profile">
                    <div className="avatar">
                      <div className="ring-primary ring-offset-bar w-10 rounded-full ring-2 ring-offset-2">
                        {user.profile_picture_url ? (
                          <img
                            src={user.profile_picture_url}
                            alt={`${user.first_name} ${user.last_name}`}
                          />
                        ) : (
                          <div className="text-bar flex h-full w-full items-center justify-center bg-white font-bold">
                            {user.first_name.charAt(0)}
                            {user.last_name.charAt(0)}
                          </div>
                        )}
                      </div>
                    </div>
                  </Link>
                )}
              </div>
            </div>
          </header>

          <main
            className={`mx-auto w-full flex-1 px-4 py-10 sm:px-6 lg:px-8 ${contentWidthClass}`}
          >
            {children}
          </main>

          <footer className="bg-bar text-bar-muted text-sm">
            <div
              className={`mx-auto flex w-full flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6 lg:px-8 ${contentWidthClass}`}
            >
              <span className="font-mono tracking-widest uppercase">
                AES · Since 1958
              </span>
              <button
                onClick={handleShare}
                className="border-bar-chip flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 text-white"
                aria-label="Share page link"
                type="button"
              >
                <FiShare2 />
                <span>Copy page link</span>
              </button>
            </div>
          </footer>
        </div>
        {user && (
          <nav
            aria-label="Main"
            className="dock border-base-300 z-40 border-t lg:hidden"
          >
            {navLinks.map(({ to, shortLabel, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                className={({ isActive }) =>
                  `min-w-0 ${isActive ? "dock-active text-primary" : ""}`
                }
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
                <span className="dock-label truncate font-semibold">
                  {shortLabel}
                </span>
              </NavLink>
            ))}
          </nav>
        )}
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
  const loaderData = useRouteLoaderData<typeof loader>("root");
  const rumConfig = loaderData?.rum;
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  useEffect(() => {
    if (!(error instanceof Error) || !rumConfig) {
      return;
    }

    void import("./lib/rum.client").then((client) => {
      client.initializeRum(rumConfig);
      client.recordRumError(error);
    });
  }, [
    error,
    rumConfig?.alias,
    rumConfig?.applicationId,
    rumConfig?.region,
    rumConfig?.releaseId,
    rumConfig?.userId,
  ]);

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
