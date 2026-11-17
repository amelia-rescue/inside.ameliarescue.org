# Time tracking (shelved prototype)

A clock in / clock out feature meant to replace the paper **Duty Hours Log**
binder at the station. It was built and deployed as an admin-only prototype in
November 2026, tried briefly, and rolled back. This doc describes what it did
and what we learned so it can be rebuilt later.

## Restoring the code

The full implementation lives in git history:

| Commit    | What                                                              |
| --------- | ----------------------------------------------------------------- |
| `8ee8a92` | Add time tracking prototype to the admin section                  |
| `75b9d45` | Split client-safe time entry helpers out of the store (build fix) |
| `8789f20` | Roll back the time tracking prototype                             |

The rollback is a single commit, `8789f20`. Reverting it (`git revert
8789f20`) brings everything back, tests included. Expect to rebase it on
whatever has changed since.

> **Before redeploying:** the `aes_time_entries` table was created with
> `RemovalPolicy.RETAIN`, so the rollback left it in the AWS account (holding
> three test entries from 2026-11-17). CloudFormation will fail to create a
> table with the same name. Either delete the orphaned table first, or import it
> into the stack (`cdk import`).

## What the paper log captures

Columns on the current sheet: Name, Ambulance, Date, Time In, Time Out, Total
Hours, # Calls Run, Remarks. Remarks in practice: Duty, Ride Along, Junior.

A note taped to the binder says members must log hours for 2nd/3rd calls run
from home to get points, and must **not** log meetings or training in the duty
log. The prototype included meetings and training anyway, at the requester's
direction; revisit that rule before rolling out.

## Feature behaviour

**Automatic:** clock-in and clock-out times (server clock), total hours, and
the browser's approximate location at each press.

**Self-reported:**

- Entry type, from a dropdown: Duty, 2nd call (from home), Training, Meeting.
  Chosen at clock-in, changeable at clock-out (duty that turned into a 2nd call).
- Ambulance (optional): from the truck list in the truck check schema store.
  Note that the store's `retired` flags were stale at the time (Ambulance 69 was
  marked retired but still in use), so the prototype listed every truck.
- Number of calls run, required at clock-out (whole number, 0 or more).
- Optional notes (max 500 chars).

**Rules:**

- One open entry per member; clocking in while clocked in is refused.
- "Cancel clock-in" deletes an open entry made by mistake. Closed entries
  cannot be deleted by members.
- Location failure never blocks a clock-in. The entry records why there are no
  coordinates: `denied`, `timeout`, or `unavailable`.

**Admin view (per month, with prev/next navigation):**

- Per-member summary: hours by type, total hours, calls run, an "on now"
  badge for open entries. Duty hours turn green at the SOP minimum of
  **12.5 duty/standby hours a month** (SOPs, Membership → Active Members).
- Full entry list laid out like the paper log, plus Google Maps links for the
  clock-in and clock-out locations with the accuracy radius.

## Data model

Table `aes_time_entries`, on-demand billing, point-in-time recovery, retained
on stack deletion.

- Partition key `user_id`, sort key `entry_id` = `<clock_in_at ISO>#<8 random
chars>`, so a member's entries sort by clock-in time. The newest entry is the
  only one that can be open.
- GSI `ClockInIndex`: `list_pk` (constant `TIME_ENTRIES`) + `clock_in_at`, for
  everyone's entries in a date range (monthly view). Volume is a few entries a
  day, so a single partition is fine.

```ts
interface TimeEntry {
  user_id: string;
  entry_id: string;
  list_pk: "TIME_ENTRIES";
  status: "open" | "closed";
  entry_type: "duty" | "second_call" | "training" | "meeting";
  unit?: string; // truck id
  clock_in_at: string;
  clock_in_location: TimeEntryLocation;
  clock_out_at?: string;
  clock_out_location?: TimeEntryLocation;
  total_hours?: number; // 2 decimals
  calls_run?: number;
  notes?: string;
  created_at: string;
  updated_at: string;
}

interface TimeEntryLocation {
  status: "ok" | "denied" | "unavailable" | "timeout";
  latitude?: number; // rounded to 6 decimals
  longitude?: number;
  accuracy_m?: number;
}
```

Month boundaries were computed in the viewer's time zone (`ctx.timeZone`,
falling back to `America/New_York`).

## Code layout (as built)

- `app/lib/time-entry.ts`: client-safe types, labels, `hoursBetween`,
  `normalizeLocation`, error classes.
- `app/lib/time-entry-store.ts`: DynamoDB store (`clockIn`, `clockOut`,
  `cancelOpenEntry`, `getOpenEntry`, `listForUser`, `listBetween`). Re-exports
  `time-entry.ts`.
- `app/lib/time-entry-summary.ts`: `summarizeByMember` and the 12.5-hour
  target.
- `app/routes/admin/time-tracking.tsx`: page, loader, and action
  (`clock_in` / `clock_out` / `cancel` intents, `requireAdmin`).
- CDK table and grant in `cdk/cdk-stack.ts`, test schema in
  `app/lib/dynamo-local.ts`, and a card on the admin hub.
- Tests: `app/lib/time-entry-store.test.ts` (dynalite) and
  `app/routes/admin/time-tracking.test.ts` (action auth and validation).

## Lessons and open questions

- **Server-only imports.** Anything the page component imports must not pull
  in `*.server` modules. The first build failed because the component imported
  constants from the store; the fix was the separate `time-entry.ts`.
- **iPhone location is often "denied" without a prompt.** iOS returns
  `PERMISSION_DENIED` immediately when Location Services is off, when _Safari
  Websites_ is set to Never, when the site is set to Deny, after an earlier
  "Don't Allow", or when the link was opened inside another app's browser
  (GroupMe, Messenger, Gmail). Two of the three test entries were denied. A
  rebuild should check `navigator.permissions` up front and show how to turn
  location on.
- **IP-based fallback.** CloudFront can forward `CloudFront-Viewer-City` /
  `-Latitude` / `-Longitude` headers (our distribution uses the
  `AllViewerExceptHostHeader` origin policy; confirm the headers arrive). It is
  city-level at best and often wrong on cellular networks, so it can't prove
  someone was at the station. Store it separately from GPS and label it
  approximate if added.
- **Proving presence at the station.** A more reliable signal than GPS or IP
  geolocation: check whether the request comes from the station's public IP
  (station Wi-Fi). It needs a stable IP at the station.
- **Not built:** fixing a forgotten clock-out, admin edits of entries, CSV
  export, incentive points (see SOPs → points table), a Standby type (the SOP
  minimum counts duty _and_ standby hours), and opening it to all members.
