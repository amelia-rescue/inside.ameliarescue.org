import { useLoaderData, useSearchParams, Link } from "react-router";
import type { Route } from "./+types/truck-check-analytics";
import { appContext } from "~/context";
import {
  TruckCheckStore,
  type DocumentTruckCheck,
} from "~/lib/truck-check/truck-check-store";
import { TruckCheckSchemaStore } from "~/lib/truck-check/truck-check-schema-store";
import { calculateCompletion } from "~/lib/truck-check/completion";
import { UserStore } from "~/lib/user-store";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  type ChartOptions,
  type ChartData,
} from "chart.js";
import { Bar, Pie } from "react-chartjs-2";

dayjs.extend(utc);
dayjs.extend(timezone);

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
);

const WEEKDAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const TRUCK_PIE_COLORS = Array.from({ length: 10 }, (_, i) => {
  const hue = (i * 137) % 360;
  return {
    background: `hsla(${hue}, 70%, 60%, 0.7)`,
    border: `hsla(${hue}, 70%, 60%, 1)`,
  };
});

const RANGE_OPTIONS = [
  { value: "7", label: "Past 7 days" },
  { value: "30", label: "Past 30 days" },
  { value: "6m", label: "Past 6 months" },
];

export async function loader({ context, request }: Route.LoaderArgs) {
  const ctx = context.get(appContext);
  if (!ctx) {
    throw new Error("context not found");
  }

  const { timeZone } = ctx;
  const url = new URL(request.url);
  const range = url.searchParams.get("range");

  const now = dayjs().tz(timeZone);
  const endDate = now.toISOString();

  let startDate: string;
  let rangeValue: string;
  let rangeLabel: string;

  if (range === "7") {
    startDate = now.subtract(7, "day").startOf("day").toISOString();
    rangeValue = "7";
    rangeLabel = "Past 7 days";
  } else if (range === "6m") {
    startDate = now.subtract(6, "month").startOf("day").toISOString();
    rangeValue = "6m";
    rangeLabel = "Past 6 months";
  } else {
    startDate = now.subtract(30, "day").startOf("day").toISOString();
    rangeValue = "30";
    rangeLabel = "Past 30 days";
  }

  const truckCheckStore = TruckCheckStore.make();
  const schemaStore = TruckCheckSchemaStore.make();
  const userStore = UserStore.make();

  const [trucks, users] = await Promise.all([
    schemaStore.listTrucks(),
    userStore.listUsers(),
  ]);

  const allChecks: Awaited<
    ReturnType<TruckCheckStore["listTruckChecksInRange"]>
  >["truckChecks"] = [];
  let lastEvaluatedKey: Record<string, unknown> | undefined;

  do {
    const result = await truckCheckStore.listTruckChecksInRange({
      startDate,
      endDate,
      lastEvaluatedKey,
    });
    allChecks.push(...result.truckChecks);
    lastEvaluatedKey = result.lastEvaluatedKey;
  } while (lastEvaluatedKey);

  const schemaCacheMap = new Map<
    string,
    Awaited<ReturnType<TruckCheckSchemaStore["getSchema"]>>
  >();

  const completedChecks: DocumentTruckCheck[] = [];
  for (const check of allChecks) {
    const completion = await calculateCompletion(
      check,
      trucks,
      schemaStore,
      schemaCacheMap,
    );
    if (completion.isComplete) {
      completedChecks.push(check);
    }
  }

  const dayCounts = [0, 0, 0, 0, 0, 0, 0];
  for (const check of completedChecks) {
    const day = dayjs(check.created_at).tz(timeZone).day();
    dayCounts[day]++;
  }

  const truckDisplayNameMap = new Map(
    trucks.map((truck) => [truck.truckId, truck.displayName]),
  );
  const truckCountsMap = new Map<string, number>();
  for (const check of completedChecks) {
    const displayName = truckDisplayNameMap.get(check.truck) ?? check.truck;
    truckCountsMap.set(displayName, (truckCountsMap.get(displayName) ?? 0) + 1);
  }
  const truckCounts = Array.from(truckCountsMap.entries())
    .map(([truck, count]) => ({ truck, count }))
    .sort((a, b) => b.count - a.count || a.truck.localeCompare(b.truck));

  const userCounts = users
    .map((user) => ({
      user_id: user.user_id,
      first_name: user.first_name,
      last_name: user.last_name,
      count: completedChecks.filter(
        (check) => check.contributors?.[user.user_id] != null,
      ).length,
    }))
    .sort(
      (a, b) =>
        b.count - a.count ||
        a.last_name.localeCompare(b.last_name) ||
        a.first_name.localeCompare(b.first_name),
    );

  return {
    user: ctx.user,
    dayCounts,
    userCounts,
    rangeValue,
    rangeLabel,
    truckCounts,
  };
}

export default function TruckCheckAnalytics() {
  const { dayCounts, userCounts, rangeValue, rangeLabel, user, truckCounts } =
    useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();

  const data = {
    labels: WEEKDAY_LABELS,
    datasets: [
      {
        label: "Completed truck checks",
        data: dayCounts,
        backgroundColor: "rgba(54, 162, 235, 0.7)",
        borderColor: "rgba(54, 162, 235, 1)",
        borderWidth: 1,
      },
    ],
  };

  const options: ChartOptions<"bar"> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      title: {
        display: true,
        text: `Completed truck checks by day of week - ${rangeLabel}`,
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          precision: 0,
        },
      },
    },
  };

  const truckPieData: ChartData<"pie", number[], string> = {
    labels: truckCounts.map((t) => t.truck),
    datasets: [
      {
        data: truckCounts.map((t) => t.count),
        backgroundColor: TRUCK_PIE_COLORS.map((c) => c.background),
        borderColor: TRUCK_PIE_COLORS.map((c) => c.border),
        borderWidth: 1,
      },
    ],
  };

  const truckPieOptions: ChartOptions<"pie"> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "right",
      },
      title: {
        display: true,
        text: `Completed checks by truck - ${rangeLabel}`,
      },
    },
  };

  function handleRangeChange(value: string) {
    setSearchParams({ range: value }, { replace: true });
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="breadcrumbs mb-4 text-sm">
        <ul>
          <li>
            <Link to="/">Home</Link>
          </li>
          <li>
            <Link to="/truck-check">Truck Checks</Link>
          </li>
          <li>Analytics</li>
        </ul>
      </div>

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Truck Check Analytics</h1>
          <p className="mt-2 opacity-70">
            Completed truck checks by day of week and user
          </p>
        </div>
        <select
          className="select select-bordered w-full sm:w-auto"
          value={rangeValue}
          onChange={(e) => handleRangeChange(e.target.value)}
          aria-label="Time frame"
        >
          {RANGE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="card bg-base-100 mb-8 shadow-xl">
        <div className="card-body">
          <div className="h-80">
            <Bar data={data} options={options} />
          </div>
        </div>
      </div>

      <div className="card bg-base-100 mb-8 shadow-xl">
        <div className="card-body">
          <h2 className="card-title text-xl">Completed checks by truck</h2>
          <div className="h-80">
            <Pie data={truckPieData} options={truckPieOptions} />
          </div>
        </div>
      </div>

      <div className="card bg-base-100 shadow-xl">
        <div className="card-body">
          <h2 className="card-title text-xl">Completed checks by user</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="table-zebra table w-full">
              <thead>
                <tr>
                  <th>User</th>
                  <th className="text-right">Completed checks</th>
                </tr>
              </thead>
              <tbody>
                {userCounts.map((userCount) => (
                  <tr key={userCount.user_id}>
                    <td>
                      <span
                        className={
                          userCount.user_id === user.user_id ? "font-bold" : ""
                        }
                      >
                        {userCount.first_name} {userCount.last_name}
                      </span>
                    </td>
                    <td className="text-right">{userCount.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
