import { describe, it, expect } from "vitest";
import { action as updateUserAction } from "./update-user";
import { action as certificationTypeAction } from "./certification-settings/certification-type";
import { action as rolesAction } from "./certification-settings/roles";
import { action as tracksAction } from "./certification-settings/tracks";

// Each admin action must reject non-admins before touching any data, so these
// run without a database: a missing check would fail on the store call instead
// of throwing the expected 403.
function contextFor(websiteRole: "user" | "admin") {
  return {
    get: () => ({
      user: { user_id: "member-1", website_role: websiteRole },
      timeZone: "UTC",
    }),
  } as any;
}

function postRequest(fields: Record<string, string>) {
  return new Request("http://localhost/admin", {
    method: "POST",
    body: new URLSearchParams(fields),
  });
}

const actions = [
  {
    name: "update-user",
    run: (context: any) =>
      updateUserAction({
        context,
        params: { user_id: "member-1" },
        request: postRequest({
          first_name: "Mallory",
          last_name: "Member",
          website_role: "admin",
          role_name: "EMT",
          track_name: "Field",
        }),
      } as any),
  },
  {
    name: "certification-type",
    run: (context: any) =>
      certificationTypeAction({
        context,
        params: {},
        request: postRequest({
          intent: "create",
          name: "Fake",
          description: "x",
        }),
      } as any),
  },
  {
    name: "roles",
    run: (context: any) =>
      rolesAction({
        context,
        params: {},
        request: postRequest({
          intent: "create",
          name: "Fake",
          description: "x",
        }),
      } as any),
  },
  {
    name: "tracks",
    run: (context: any) =>
      tracksAction({
        context,
        params: {},
        request: postRequest({
          intent: "create",
          name: "Fake",
          description: "x",
        }),
      } as any),
  },
];

describe("admin actions", () => {
  for (const { name, run } of actions) {
    it(`${name} rejects non-admins with a 403`, async () => {
      const result = run(contextFor("user"));
      await expect(result).rejects.toBeInstanceOf(Response);
      await result.catch((response: Response) => {
        expect(response.status).toBe(403);
      });
    });
  }
});
