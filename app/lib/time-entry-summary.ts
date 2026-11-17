import {
  TIME_ENTRY_TYPES,
  type TimeEntry,
  type TimeEntryType,
} from "./time-entry-store";

/** SOP: active members keep at least 12.5 duty/standby hours a month. */
export const MONTHLY_DUTY_HOURS_TARGET = 12.5;

export interface MemberMonthSummary {
  user_id: string;
  hours_by_type: Record<TimeEntryType, number>;
  total_hours: number;
  calls_run: number;
  entry_count: number;
  open_entries: number;
  meets_duty_target: boolean;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/**
 * Totals closed entries per member. Open entries are counted but add no
 * hours, since they have no end time yet.
 */
export function summarizeByMember(entries: TimeEntry[]): MemberMonthSummary[] {
  const byUser = new Map<string, MemberMonthSummary>();
  for (const entry of entries) {
    let summary = byUser.get(entry.user_id);
    if (!summary) {
      summary = {
        user_id: entry.user_id,
        hours_by_type: Object.fromEntries(
          TIME_ENTRY_TYPES.map((t) => [t, 0]),
        ) as Record<TimeEntryType, number>,
        total_hours: 0,
        calls_run: 0,
        entry_count: 0,
        open_entries: 0,
        meets_duty_target: false,
      };
      byUser.set(entry.user_id, summary);
    }
    summary.entry_count += 1;
    if (entry.status === "open") {
      summary.open_entries += 1;
      continue;
    }
    const hours = entry.total_hours ?? 0;
    summary.hours_by_type[entry.entry_type] = round2(
      summary.hours_by_type[entry.entry_type] + hours,
    );
    summary.total_hours = round2(summary.total_hours + hours);
    summary.calls_run += entry.calls_run ?? 0;
  }
  for (const summary of byUser.values()) {
    summary.meets_duty_target =
      summary.hours_by_type.duty >= MONTHLY_DUTY_HOURS_TARGET;
  }
  return [...byUser.values()];
}
