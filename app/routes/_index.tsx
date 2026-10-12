import { appContext } from "~/context";
import type { Route } from "./+types/_index";
import { Form, Link } from "react-router";
import {
  FiAlertTriangle,
  FiAward,
  FiChevronRight,
  FiFileText,
  FiShoppingBag,
  FiUsers,
  FiX,
} from "react-icons/fi";
import { useEffect, useState, type ReactNode } from "react";
import type { HomeCertification } from "~/lib/home.server";

type MobilePlatform = "ios" | "android" | "unknown";
type HomeData = Route.ComponentProps["loaderData"]["home"];

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
  const { loadHomeData } = await import("~/lib/home.server");
  const home = await loadHomeData({
    userId: c.user.user_id,
    timeZone: c.timeZone,
  });
  return { user: c.user, home };
}

function summaryLine(home: HomeData): string {
  const { todayCheck, myCertifications } = home;
  const check = !todayCheck
    ? "Nobody has started a truck check today."
    : todayCheck.locked
      ? `${todayCheck.truckName} was checked today.`
      : `${todayCheck.truckName} is being checked right now.`;
  const cert = myCertifications.find((c) => c.status !== "active");
  if (!cert) return check;
  const certText =
    cert.status === "expiring_soon"
      ? `your ${cert.type} expires in ${cert.daysLeft} days`
      : cert.status === "expired"
        ? `your ${cert.type} has expired`
        : `you have no ${cert.type} card on file`;
  return `${check} Also, ${certText}.`;
}

export default function Index({ loaderData }: Route.ComponentProps) {
  const { user, home } = loaderData;

  return (
    <div className="flex flex-col gap-10">
      <HomeScreenInstructions />

      <section className="flex flex-col gap-1">
        <p className="eyebrow text-base-content/70">{home.dateLabel}</p>
        <h1 className="text-5xl leading-none font-bold sm:text-6xl">
          {home.greeting}, {user.first_name}.
        </h1>
        <p className="text-base-content/70 mt-1">{summaryLine(home)}</p>
      </section>

      <div className="flex flex-wrap items-stretch gap-6">
        <TodayCheckCard home={home} />
        <RecentIssues home={home} />
      </div>

      <div className="flex flex-wrap items-start gap-6">
        <MyCertifications certifications={home.myCertifications} />
        <SquadReadiness squad={home.squad} />
      </div>

      <section aria-labelledby="more" className="flex flex-col gap-4">
        <h2 id="more" className="section-title">
          Everything else
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Tile
            to="/documents"
            icon={<FiFileText className="h-6 w-6" />}
            title="Documents"
            description="SOPs, guides, protocols"
          />
          <Tile
            to="/roster"
            icon={<FiUsers className="h-6 w-6" />}
            title="Roster"
            description="Who even volunteers here?"
          />
          <Tile
            href="https://app.targetsolutions.com/auth/index.cfm?action=login.showlogin&customerid=34621&customerpath=vacee"
            icon={<FiAward className="h-6 w-6" />}
            title="Free CEUs ↗"
            description="You won't wait until the last minute, right?"
          />
          <Tile
            href="https://weewoo.study/shop"
            icon={<FiShoppingBag className="h-6 w-6" />}
            title="Swag store ↗"
            description="Stay fresh"
          />
        </div>
      </section>
    </div>
  );
}

function TodayCheckCard({ home }: { home: HomeData }) {
  const { todayCheck, trucks, usualTruckId, previousCheck } = home;
  const [picking, setPicking] = useState(!todayCheck);
  const [selected, setSelected] = useState(usualTruckId ?? "");
  const selectedTruck = trucks.find((truck) => truck.truckId === selected);

  const hint = [
    selected === usualTruckId && home.usualTruckIsHistory
      ? "Your usual truck."
      : null,
    selectedTruck?.lastChecked
      ? `Last checked ${selectedTruck.lastChecked}.`
      : "Not checked in the last 60 days.",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <section
      aria-labelledby="today-check"
      className="bg-base-100 border-base-content rounded-box flex min-w-0 flex-[999_1_520px] flex-col gap-5 border-2 p-6"
    >
      {todayCheck && !picking ? (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 id="today-check" className="eyebrow text-base-content/70">
                Today's truck check
              </h2>
              <p className="font-display text-6xl leading-none font-bold">
                {todayCheck.truckName}
              </p>
            </div>
            {todayCheck.locked ? (
              <span className="bg-success text-success-content rounded-full px-3 py-1 text-sm font-bold">
                Done
              </span>
            ) : (
              <span className="bg-warning text-warning-content flex items-center gap-2 rounded-full px-3 py-1 text-sm font-bold">
                <span className="bg-warning-content h-2 w-2 rounded-full" />
                In progress
              </span>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <progress
              className="progress progress-warning h-3 w-full"
              value={todayCheck.requiredCompleted}
              max={todayCheck.requiredTotal || 1}
            />
            <div className="text-base-content/70 flex justify-between gap-3 text-sm">
              <span>
                <strong className="text-base-content">
                  {todayCheck.requiredCompleted}
                </strong>{" "}
                of {todayCheck.requiredTotal} required items
              </span>
              <span>Started {todayCheck.startedAt}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="text-base-content/70 flex items-center gap-3">
              {todayCheck.contributors.length > 0 ? (
                <>
                  <span className="flex">
                    {todayCheck.contributors.slice(0, 4).map((person) => (
                      <span
                        key={person.name}
                        className="bg-secondary text-secondary-content border-base-100 -ml-2 flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold first:ml-0"
                      >
                        {person.initials}
                      </span>
                    ))}
                  </span>
                  <span>
                    {listNames(todayCheck.contributors.map((p) => p.name))}{" "}
                    {todayCheck.contributors.length === 1 ? "is" : "are"} on it
                    {todayCheck.isContributor ? " with you" : ""}
                  </span>
                </>
              ) : (
                <span>You're the only one on it so far.</span>
              )}
            </div>
            <Link
              to={`/truck-checks/${todayCheck.id}`}
              className="btn btn-primary btn-lg"
            >
              {todayCheck.locked
                ? "View check"
                : todayCheck.isContributor
                  ? "Continue"
                  : "Join the check"}
              <FiChevronRight className="h-5 w-5" />
            </Link>
          </div>

          <div className="border-base-300 text-base-content/70 flex flex-wrap items-center justify-between gap-x-4 border-t pt-3 text-sm">
            <span>Truck in the shop or swapped out?</span>
            <button
              type="button"
              className="text-base-content min-h-11 cursor-pointer font-bold underline"
              onClick={() => setPicking(true)}
            >
              Check a different truck
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            <h2 id="today-check" className="eyebrow text-base-content/70">
              Today's truck check
            </h2>
            <p className="font-display text-5xl leading-none font-bold">
              {todayCheck ? "Check another truck" : "Nobody's started yet"}
            </p>
            <p className="text-base-content/70 mt-1">
              Go with the whiteboard, or whatever's actually in the bay.
            </p>
          </div>

          {trucks.length > 0 ? (
            <Form
              method="post"
              action="/truck-check"
              className="flex flex-wrap items-end gap-3"
            >
              <input type="hidden" name="intent" value="create" />
              <label className="flex min-w-0 flex-[1_1_220px] flex-col gap-1.5">
                <span className="text-base-content/70 text-sm font-semibold">
                  Truck
                </span>
                <select
                  name="truck"
                  value={selected}
                  onChange={(event) => setSelected(event.target.value)}
                  className="select select-lg border-base-content font-display w-full border-2 text-2xl font-bold"
                >
                  {trucks.map((truck) => (
                    <option key={truck.truckId} value={truck.truckId}>
                      {truck.displayName}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" className="btn btn-primary btn-lg">
                Start check
                <FiChevronRight className="h-5 w-5" />
              </button>
            </Form>
          ) : (
            <p>No trucks are set up yet.</p>
          )}
          {trucks.length > 0 && (
            <p className="text-base-content/70 text-sm">{hint}</p>
          )}

          <div className="border-base-300 text-base-content/70 flex flex-wrap items-center justify-between gap-x-4 border-t pt-3 text-sm">
            <span>
              {previousCheck
                ? `Last check: ${previousCheck.truckName}, ${previousCheck.dayLabel}${previousCheck.by ? ` by ${previousCheck.by}` : ""}`
                : "No recent checks."}
            </span>
            {todayCheck && (
              <button
                type="button"
                className="text-base-content min-h-11 cursor-pointer font-bold underline"
                onClick={() => setPicking(false)}
              >
                Back to today's check
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function RecentIssues({ home }: { home: HomeData }) {
  const hidden = home.recentIssueCount - home.recentIssues.length;
  return (
    <section
      aria-labelledby="recent-issues"
      className="bg-base-100 border-base-300 rounded-box flex min-w-0 flex-[1_1_340px] flex-col overflow-hidden border"
    >
      <div className="border-base-300 flex items-baseline justify-between gap-3 border-b px-5 py-4">
        <h2 id="recent-issues" className="section-title">
          Recent issues
        </h2>
        <Link to="/truck-check" className="text-sm font-semibold underline">
          Check history
        </Link>
      </div>
      {home.recentIssues.length === 0 ? (
        <p className="text-base-content/70 px-5 py-4">
          No problems reported on the latest checks.
        </p>
      ) : (
        <ul>
          {home.recentIssues.map((issue) => (
            <li key={issue.key} className="border-base-300 border-b">
              <Link
                to={`/truck-checks/${issue.checkId}`}
                className="hover:bg-base-200 flex gap-3 px-5 py-3"
              >
                <FiAlertTriangle className="text-error mt-1 h-4 w-4 shrink-0" />
                <span className="min-w-0 break-words">
                  <span className="block font-semibold">{issue.label}</span>
                  <span className="text-base-content/70 block text-sm">
                    {[issue.truckName, issue.dayLabel, issue.reporter]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {hidden > 0 && (
        <p className="text-base-content/70 px-5 py-3 text-sm">
          And {hidden} more in check history.
        </p>
      )}
    </section>
  );
}

function MyCertifications({
  certifications,
}: {
  certifications: HomeCertification[];
}) {
  return (
    <section
      aria-labelledby="my-certs"
      className="bg-base-100 border-base-300 rounded-box min-w-0 flex-[999_1_520px] overflow-hidden border"
    >
      <div className="border-base-300 flex items-center justify-between gap-4 border-b px-5 py-4">
        <h2 id="my-certs" className="section-title">
          Your certifications
        </h2>
        <Link
          to="/profile"
          className="btn btn-outline border-base-content border-2"
        >
          Upload card
        </Link>
      </div>
      {certifications.length === 0 ? (
        <p className="text-base-content/70 px-5 py-4">
          No certifications on file.
        </p>
      ) : (
        <ul>
          {certifications.map((cert) => (
            <li
              key={cert.type}
              className="border-base-300 flex items-center justify-between gap-4 border-b px-5 py-3 last:border-b-0"
            >
              <div>
                <div className="font-semibold">{cert.type}</div>
                <div className="text-base-content/70 text-sm">
                  {cert.status === "missing"
                    ? "No card on file"
                    : !cert.expiresOn
                      ? "No expiration"
                      : `${cert.status === "expired" ? "Expired" : "Expires"} ${cert.expiresOn}`}
                </div>
              </div>
              <CertPill cert={cert} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CertPill({ cert }: { cert: HomeCertification }) {
  const base = "shrink-0 rounded-full px-3 py-1 text-sm font-bold";
  switch (cert.status) {
    case "active":
      return (
        <span className={`${base} bg-success/15 text-success`}>Active</span>
      );
    case "expiring_soon":
      return (
        <span className={`${base} bg-warning text-warning-content`}>
          {cert.daysLeft === 1 ? "1 day" : `${cert.daysLeft} days`}
        </span>
      );
    case "expired":
      return (
        <span className={`${base} bg-error text-error-content`}>Expired</span>
      );
    default:
      return (
        <span className={`${base} border-error border-2 border-dashed`}>
          Missing
        </span>
      );
  }
}

function SquadReadiness({ squad }: { squad: HomeData["squad"] }) {
  const stats = [
    {
      value: `${squad.compliancePercentage}%`,
      label: "required certs current",
    },
    {
      value: squad.expiring_soon,
      label: "expiring soon",
      className: "text-[#f5b54a]",
    },
    { value: squad.expired, label: "expired", className: "text-[#ff8a80]" },
    { value: squad.missing, label: "missing a card" },
  ];
  return (
    <section
      aria-labelledby="squad"
      className="bg-bar rounded-box flex min-w-0 flex-[1_1_320px] flex-col gap-4 p-5 text-white"
    >
      <h2 id="squad" className="section-title">
        Squad readiness
      </h2>
      <div className="grid grid-cols-2 gap-3">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-bar-chip rounded-lg p-3">
            <div
              className={`font-display text-5xl leading-none font-bold ${stat.className ?? ""}`}
            >
              {stat.value}
            </div>
            <div className="text-bar-muted text-sm">{stat.label}</div>
          </div>
        ))}
      </div>
      <Link to="/certification-status" className="font-semibold underline">
        Open certification board
      </Link>
    </section>
  );
}

function Tile({
  to,
  href,
  icon,
  title,
  description,
}: {
  to?: string;
  href?: string;
  icon: ReactNode;
  title: string;
  description: string;
}) {
  const className =
    "bg-base-100 border-base-300 rounded-box hover:border-base-content flex min-h-16 items-center gap-4 border px-4 py-3";
  const body = (
    <>
      {icon}
      <span>
        <span className="block font-bold">{title}</span>
        <span className="text-base-content/70 block text-sm">
          {description}
        </span>
      </span>
    </>
  );
  return to ? (
    <Link to={to} className={className}>
      {body}
    </Link>
  ) : (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
    >
      {body}
    </a>
  );
}

function listNames(names: string[]): string {
  if (names.length <= 2) return names.join(" and ");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function HomeScreenInstructions() {
  const [isStandalone, setIsStandalone] = useState(false);
  const [isMobileDevice, setIsMobileDevice] = useState(false);
  const [mobilePlatform, setMobilePlatform] =
    useState<MobilePlatform>("unknown");
  const [isHidden, setIsHidden] = useState(false);

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

  if (!isMobileDevice || isStandalone || isHidden) {
    return null;
  }

  return (
    <div className="bg-base-100 border-base-300 rounded-box relative border p-5">
      <button
        type="button"
        className="btn btn-ghost btn-sm btn-circle absolute top-3 right-3"
        aria-label="Hide home screen instructions"
        onClick={() => setIsHidden(true)}
      >
        <FiX className="h-5 w-5" />
      </button>
      <div className="flex flex-col gap-5">
        <div className="pr-10">
          <h2 className="section-title">Add to your home screen</h2>
          <p className="text-base-content/70 text-sm">
            Get one-tap access on your phone without installing a native app.
            Works best in Safari and Chrome.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {(mobilePlatform === "ios" || mobilePlatform === "unknown") && (
            <div className="bg-base-200 rounded-box p-4">
              <h3 className="mb-2 font-semibold">iPhone and iPad</h3>
              <ol className="list-decimal space-y-1 pl-5 text-sm">
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

          {(mobilePlatform === "android" || mobilePlatform === "unknown") && (
            <div className="bg-base-200 rounded-box p-4">
              <h3 className="mb-2 font-semibold">Android</h3>
              <ol className="list-decimal space-y-1 pl-5 text-sm">
                <li>Open Inside Amelia Rescue in Chrome.</li>
                <li>Tap the browser menu.</li>
                <li>
                  Choose{" "}
                  <span className="font-semibold">Add to Home screen</span> or{" "}
                  <span className="font-semibold">Install app</span>.
                </li>
                <li>Confirm the install prompt.</li>
                <li>If the icon doesn't appear, try restarting your phone.</li>
              </ol>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
