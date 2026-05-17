import { appContext } from "~/context";
import type { Route } from "./+types/_index";
import { Link } from "react-router";
import {
  FiUsers,
  FiBookOpen,
  FiFileText,
  FiTruck,
  FiShoppingBag,
  FiAward,
  FiSettings,
  FiExternalLink,
  FiChevronRight,
  FiX,
} from "react-icons/fi";
import { useEffect, useState } from "react";
import { DateDisplay } from "~/components/date-display";

type MobilePlatform = "ios" | "android" | "unknown";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Inside Amelia Rescue" },
    {
      name: "description",
      content: "Inside Amelia Rescue — internal tools and documentation hub",
    },
  ];
}

export async function loader({ context }: Route.LoaderArgs) {
  const c = context.get(appContext);
  if (!c) {
    throw new Error("App context not found");
  }
  return { ...c, currentDate: new Date().toISOString() };
}

export default function Index({ loaderData }: Route.ComponentProps) {
  const { user } = loaderData;
  const [isStandalone, setIsStandalone] = useState(false);
  const [isMobileDevice, setIsMobileDevice] = useState(false);
  const [mobilePlatform, setMobilePlatform] =
    useState<MobilePlatform>("unknown");
  const [isHomeScreenInstructionsHidden, setIsHomeScreenInstructionsHidden] =
    useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const standaloneMediaQuery = window.matchMedia(
      "(display-mode: standalone)",
    );
    const mobileMediaQuery = window.matchMedia(
      "(hover: none) and (pointer: coarse), (max-width: 768px)",
    );

    const updateStandaloneState = () => {
      const iosStandalone =
        typeof window.navigator !== "undefined" &&
        "standalone" in window.navigator &&
        Boolean(
          (window.navigator as Navigator & { standalone?: boolean }).standalone,
        );

      setIsStandalone(standaloneMediaQuery.matches || iosStandalone);
    };

    const updateMobileDeviceState = () => {
      setIsMobileDevice(mobileMediaQuery.matches);
    };

    const userAgent = window.navigator.userAgent;
    const isIOS =
      /iPad|iPhone|iPod/.test(userAgent) ||
      (/Macintosh/.test(userAgent) && window.navigator.maxTouchPoints > 1);
    const isAndroid = /Android/.test(userAgent);

    if (isIOS) {
      setMobilePlatform("ios");
    } else if (isAndroid) {
      setMobilePlatform("android");
    }

    updateStandaloneState();
    updateMobileDeviceState();
    standaloneMediaQuery.addEventListener("change", updateStandaloneState);
    mobileMediaQuery.addEventListener("change", updateMobileDeviceState);

    return () => {
      standaloneMediaQuery.removeEventListener("change", updateStandaloneState);
      mobileMediaQuery.removeEventListener("change", updateMobileDeviceState);
    };
  }, []);

  return (
    <>
      {isMobileDevice && !isStandalone && !isHomeScreenInstructionsHidden && (
        <div className="card bg-base-100 relative mb-12 shadow-xl">
          <button
            type="button"
            className="btn btn-ghost btn-sm btn-circle absolute top-3 right-3"
            aria-label="Hide home screen instructions"
            onClick={() => setIsHomeScreenInstructionsHidden(true)}
          >
            <FiX className="h-5 w-5" />
          </button>
          <div className="card-body gap-6">
            <div className="flex flex-col gap-2 pr-10 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="card-title text-2xl">Add to your home screen</h2>
                <p className="text-base-content/70 max-w-2xl text-sm md:text-base">
                  Get one-tap access on your phone without installing a native
                  app.
                </p>
              </div>
              <div className="badge badge-success badge-outline">
                Works best on Safari and Chrome
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              {(mobilePlatform === "ios" || mobilePlatform === "unknown") && (
                <div className="bg-base-200 rounded-box p-5">
                  <h3 className="mb-3 text-lg font-semibold">
                    iPhone and iPad
                  </h3>
                  <ol className="list-decimal space-y-2 pl-5 text-sm md:text-base">
                    <li>Open Inside Amelia Rescue in Safari.</li>
                    <li>Tap the Share button.</li>
                    <li>
                      Choose{" "}
                      <span className="font-semibold">Add to Home Screen</span>.
                    </li>
                    <li>
                      Tap <span className="font-semibold">Add</span> to finish.
                    </li>
                  </ol>
                </div>
              )}

              {(mobilePlatform === "android" ||
                mobilePlatform === "unknown") && (
                <div className="bg-base-200 rounded-box p-5">
                  <h3 className="mb-3 text-lg font-semibold">Android</h3>
                  <ol className="list-decimal space-y-2 pl-5 text-sm md:text-base">
                    <li>Open Inside Amelia Rescue in Chrome.</li>
                    <li>Tap the browser menu.</li>
                    <li>
                      Choose{" "}
                      <span className="font-semibold">Add to Home screen</span>{" "}
                      or <span className="font-semibold">Install app</span>.
                    </li>
                    <li>Confirm the install prompt.</li>
                    <li>
                      If the icon doesn't appear, try restarting your phone.
                    </li>
                  </ol>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Quick Actions Grid */}
      <div className="mb-12">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <Link
            to="/roster"
            className="card bg-base-100 group shadow-xl transition-all duration-300 hover:shadow-2xl"
          >
            <div className="card-body">
              <div className="mb-2 flex items-center gap-4">
                <div className="bg-primary/10 text-primary rounded-full p-3 transition-transform group-hover:scale-110">
                  <FiUsers className="h-6 w-6" />
                </div>
                <h2 className="card-title">Roster</h2>
              </div>
              <p className="mb-4 text-sm opacity-70">
                Who even volunteers here?
              </p>
              <div className="card-actions justify-end">
                <span className="btn btn-sm btn-primary group-hover:btn-primary-content">
                  Open <FiChevronRight className="ml-1 h-3 w-3" />
                </span>
              </div>
            </div>
          </Link>

          <Link
            to="/certification-status"
            className="card bg-base-100 group shadow-xl transition-all duration-300 hover:shadow-2xl"
          >
            <div className="card-body">
              <div className="mb-2 flex items-center gap-4">
                <div className="bg-secondary/10 text-secondary rounded-full p-3 transition-transform group-hover:scale-110">
                  <FiBookOpen className="h-6 w-6" />
                </div>
                <h2 className="card-title">Certification Status</h2>
              </div>
              <p className="mb-4 text-sm opacity-70">
                Track certification status across the organization.
              </p>
              <div className="card-actions justify-end">
                <span className="btn btn-sm btn-secondary group-hover:btn-secondary-content">
                  Open <FiChevronRight className="ml-1 h-3 w-3" />
                </span>
              </div>
            </div>
          </Link>

          <Link
            to="/documents"
            className="card bg-base-100 group shadow-xl transition-all duration-300 hover:shadow-2xl"
          >
            <div className="card-body">
              <div className="mb-2 flex items-center gap-4">
                <div className="bg-accent/10 text-accent rounded-full p-3 transition-transform group-hover:scale-110">
                  <FiFileText className="h-6 w-6" />
                </div>
                <h2 className="card-title">Documents</h2>
              </div>
              <p className="mb-4 text-sm opacity-70">
                SOPs, guides, and protocols.
              </p>
              <div className="card-actions justify-end">
                <span className="btn btn-sm btn-accent group-hover:btn-accent-content">
                  Open <FiChevronRight className="ml-1 h-3 w-3" />
                </span>
              </div>
            </div>
          </Link>

          <Link
            to="/truck-check"
            className="card bg-base-100 group shadow-xl transition-all duration-300 hover:shadow-2xl"
          >
            <div className="card-body">
              <div className="mb-2 flex items-center gap-4">
                <div className="bg-info/10 text-info rounded-full p-3 transition-transform group-hover:scale-110">
                  <FiTruck className="h-6 w-6" />
                </div>
                <h2 className="card-title">Truck Checks</h2>
              </div>
              <p className="mb-4 text-sm opacity-70">
                Collaborative vehicle inspections and equipment checks.
              </p>
              <div className="card-actions justify-end">
                <span className="btn btn-sm btn-info group-hover:btn-info-content">
                  Open <FiChevronRight className="ml-1 h-3 w-3" />
                </span>
              </div>
            </div>
          </Link>

          <a
            href="https://weewoo.study/shop"
            target="_blank"
            rel="noopener noreferrer"
            className="card bg-base-100 group shadow-xl transition-all duration-300 hover:shadow-2xl"
          >
            <div className="card-body">
              <div className="mb-2 flex items-center gap-4">
                <div className="bg-warning/10 text-warning rounded-full p-3 transition-transform group-hover:scale-110">
                  <FiShoppingBag className="h-6 w-6" />
                </div>
                <h2 className="card-title flex items-center gap-2">
                  Swag Store
                  <FiExternalLink className="h-4 w-4 opacity-60" />
                </h2>
              </div>
              <p className="mb-4 text-sm opacity-70">Stay fresh.</p>
              <div className="card-actions justify-end">
                <span className="btn btn-sm btn-warning group-hover:btn-warning-content">
                  Shop <FiChevronRight className="ml-1 h-3 w-3" />
                </span>
              </div>
            </div>
          </a>

          <a
            href="https://app.targetsolutions.com/auth/index.cfm?action=login.showlogin&customerid=34621&customerpath=vacee"
            target="_blank"
            rel="noopener noreferrer"
            className="card bg-base-100 group shadow-xl transition-all duration-300 hover:shadow-2xl"
          >
            <div className="card-body">
              <div className="mb-2 flex items-center gap-4">
                <div className="bg-success/10 text-success rounded-full p-3 transition-transform group-hover:scale-110">
                  <FiAward className="h-6 w-6" />
                </div>
                <h2 className="card-title flex items-center gap-2">
                  Free CEUs
                  <FiExternalLink className="h-4 w-4 opacity-60" />
                </h2>
              </div>
              <p className="mb-4 text-sm opacity-70">
                You won't wait until the last minute right?
              </p>
              <div className="card-actions justify-end">
                <span className="btn btn-sm btn-success group-hover:btn-success-content">
                  Train <FiChevronRight className="ml-1 h-3 w-3" />
                </span>
              </div>
            </div>
          </a>

          {user.website_role === "admin" && (
            <Link
              to="/admin"
              className="card bg-error group shadow-xl transition-all duration-300 hover:shadow-2xl"
            >
              <div className="card-body">
                <div className="mb-2 flex items-center gap-4">
                  <div className="bg-error-content/10 text-error-content rounded-full p-3 transition-transform group-hover:scale-110">
                    <FiSettings className="h-6 w-6" />
                  </div>
                  <h2 className="card-title text-error-content">Admin</h2>
                </div>
                <p className="text-error-content mb-4 text-sm opacity-90">
                  System management and user administration.
                </p>
                <div className="card-actions justify-end">
                  <span className="btn btn-sm btn-error-content group-hover:bg-error-content group-hover:text-error">
                    Manage <FiChevronRight className="ml-1 h-3 w-3" />
                  </span>
                </div>
              </div>
            </Link>
          )}
        </div>
      </div>
    </>
  );
}
