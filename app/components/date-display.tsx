import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { useRouteLoaderData } from "react-router";
import type { loader as rootLoader } from "~/root";

dayjs.extend(utc);
dayjs.extend(timezone);

export const DATE_FORMATS = {
  shortDate: "M/D/YYYY",
  mediumDate: "MMM D, YYYY",
  longDate: "dddd, MMMM D, YYYY",
  weekdayDate: "ddd, MMM D, YYYY",
  shortTime: "h:mm:ss A",
  shortDateTime: "M/D/YYYY h:mm:ss A",
} as const;

type DateFormatName = keyof typeof DATE_FORMATS;

type DateDisplayProps = {
  value: string | number | Date | null | undefined;
  format?: DateFormatName | string;
  fallback?: string;
};

export function DateDisplay({
  value,
  format = "mediumDate",
  fallback = "—",
}: DateDisplayProps) {
  const rootData = useRouteLoaderData<typeof rootLoader>("root");
  const timeZone = rootData?.timeZone || "UTC";
  const locale = rootData?.locale || "en-US";
  const pattern =
    format in DATE_FORMATS ? DATE_FORMATS[format as DateFormatName] : format;

  if (!value) {
    return <>{fallback}</>;
  }

  const date = dayjs(value);
  if (!date.isValid()) {
    return <>{fallback}</>;
  }

  return <>{date.tz(timeZone).locale(locale).format(pattern)}</>;
}
