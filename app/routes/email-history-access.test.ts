import { beforeEach, describe, expect, it, vi } from "vitest";

const MEMBER_ID = "member-1";
const OTHER_ID = "member-2";
const OTHER_EMAIL = "other@example.com";

const page = { emails: [], cursor: undefined };
const loadEmailHistory = vi.fn(async () => page);
const loadMoreEmailHistory = vi.fn(async () => page);

vi.mock("~/lib/email-history.server", () => ({
  loadEmailHistory,
  loadMoreEmailHistory,
}));

const otherUser = {
  user_id: OTHER_ID,
  email: OTHER_EMAIL,
  first_name: "Other",
  last_name: "Member",
  membership_roles: [],
};

vi.mock("~/lib/user-store", () => ({
  UserStore: {
    make: () => ({
      getUser: async () => otherUser,
      getUserWithAccountStatus: async () => otherUser,
    }),
  },
}));

vi.mock("~/lib/certifications/certification-type-store", () => ({
  CertificationTypeStore: {
    make: () => ({ listCertificationTypes: async () => [] }),
  },
}));
vi.mock("~/lib/certifications/certification-store", () => ({
  CertificationStore: {
    make: () => ({ listCertificationsByUser: async () => [] }),
  },
}));
vi.mock("~/lib/certifications/certification-reminder-store", () => ({
  CertificationReminderStore: {
    make: () => ({ getRemindersByUser: async () => [] }),
  },
}));
vi.mock("~/lib/track-store", () => ({
  TrackStore: { make: () => ({ listTracks: async () => [] }) },
}));
vi.mock("~/lib/role-store", () => ({
  RoleStore: { make: () => ({ listRoles: async () => [] }) },
}));

const { loader: userLoader, action: userAction } =
  await import("./user.$user_id");
const { loader: updateUserLoader, action: updateUserAction } =
  await import("./admin/update-user");

function contextFor(websiteRole: "user" | "admin") {
  return {
    get: () => ({
      user: { user_id: MEMBER_ID, website_role: websiteRole },
      timeZone: "UTC",
    }),
  } as any;
}

function loadMoreRequest() {
  return new Request("http://localhost/", {
    method: "POST",
    body: new URLSearchParams({ intent: "load-more-emails", cursor: "abc" }),
  });
}

async function expectForbidden(promise: Promise<unknown>) {
  const response = await promise.then(
    () => {
      throw new Error("expected the request to be rejected");
    },
    (error: unknown) => error,
  );
  expect(response).toBeInstanceOf(Response);
  expect((response as Response).status).toBe(403);
}

beforeEach(() => {
  loadEmailHistory.mockClear();
  loadMoreEmailHistory.mockClear();
});

describe("another member's profile page", () => {
  it("doesn't load email history for non-admins", async () => {
    const data = await userLoader({
      context: contextFor("user"),
      params: { user_id: OTHER_ID },
      request: new Request("http://localhost/"),
    } as any);

    expect(data.emailHistory).toBeNull();
    expect(loadEmailHistory).not.toHaveBeenCalled();
  });

  it("loads the member's email history for admins", async () => {
    const data = await userLoader({
      context: contextFor("admin"),
      params: { user_id: OTHER_ID },
      request: new Request("http://localhost/"),
    } as any);

    expect(data.emailHistory).toEqual(page);
    expect(loadEmailHistory).toHaveBeenCalledWith(OTHER_EMAIL);
  });

  it("rejects load-more requests from non-admins", async () => {
    await expectForbidden(
      userAction({
        context: contextFor("user"),
        params: { user_id: OTHER_ID },
        request: loadMoreRequest(),
      } as any),
    );
    expect(loadMoreEmailHistory).not.toHaveBeenCalled();
  });

  it("loads more of the member's emails for admins", async () => {
    const result = await userAction({
      context: contextFor("admin"),
      params: { user_id: OTHER_ID },
      request: loadMoreRequest(),
    } as any);

    expect(result).toEqual({ emailHistory: page });
    expect(loadMoreEmailHistory).toHaveBeenCalledWith(
      OTHER_EMAIL,
      expect.any(FormData),
    );
  });
});

describe("admin update-user page", () => {
  it("loads the member's email history", async () => {
    const data = await updateUserLoader({
      context: contextFor("admin"),
      params: { user_id: OTHER_ID },
      request: new Request("http://localhost/"),
    } as any);

    expect(data.emailHistory).toEqual(page);
    expect(loadEmailHistory).toHaveBeenCalledWith(OTHER_EMAIL);
  });

  it("rejects load-more requests from non-admins", async () => {
    await expectForbidden(
      updateUserAction({
        context: contextFor("user"),
        params: { user_id: OTHER_ID },
        request: loadMoreRequest(),
      } as any),
    );
    expect(loadMoreEmailHistory).not.toHaveBeenCalled();
  });

  it("loads more of the member's emails for admins", async () => {
    const result = await updateUserAction({
      context: contextFor("admin"),
      params: { user_id: OTHER_ID },
      request: loadMoreRequest(),
    } as any);

    expect(result).toEqual({ emailHistory: page });
    expect(loadMoreEmailHistory).toHaveBeenCalledWith(
      OTHER_EMAIL,
      expect.any(FormData),
    );
  });
});
