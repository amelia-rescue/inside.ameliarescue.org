import { beforeEach, describe, expect, it, vi } from "vitest";

import { appContext, type Context } from "~/context";
import type { User } from "~/lib/user-store";

const getPresignedUploadUrl = vi.fn(async () => "https://s3.test/signed");
const getFileUrl = vi.fn((key: string) => `https://cdn.test/${key}`);
const deleteObject = vi.fn(async () => undefined);

vi.mock("~/lib/s3-helper", () => ({
  S3Helper: {
    make: () => ({ getPresignedUploadUrl, getFileUrl, deleteObject }),
  },
}));

const updateUser = vi.fn(async () => undefined);

vi.mock("~/lib/user-store", () => ({
  UserStore: { make: () => ({ updateUser }) },
}));

const softDeletePreviousCertifications = vi.fn(async () => undefined);
const createCertification = vi.fn(async (certification: unknown) => ({
  ...(certification as object),
}));

vi.mock("~/lib/certifications/certification-store", () => ({
  CertificationStore: {
    make: () => ({ softDeletePreviousCertifications, createCertification }),
  },
}));

vi.mock("~/lib/certifications/certification-type-store", () => ({
  CertificationTypeStore: {
    make: () => ({
      getCertificationType: async (name: string) => ({
        name,
        expires: false,
      }),
    }),
  },
}));

vi.mock("~/lib/logger", () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const { action: certUploadUrlAction } =
  await import("./certifications.get-upload-url");
const { action: certSaveAction } = await import("./certifications.save");
const { action: profilePicUploadUrlAction } =
  await import("./profile-picture.get-upload-url");
const { action: profilePicSaveAction } = await import("./profile-picture.save");
const { action: documentsUploadUrlAction } =
  await import("./documents.get-upload-url");
const { action: documentsDeleteAction } = await import("./documents.delete");

const MEMBER_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_ID = "22222222-2222-2222-2222-222222222222";
const ADMIN_ID = "33333333-3333-3333-3333-333333333333";

function makeUser(user_id: string, website_role: User["website_role"]): User {
  return {
    user_id,
    email: `${user_id}@example.com`,
    first_name: "Test",
    last_name: "User",
    website_role,
    membership_roles: [],
  };
}

// Stands in for the RouterContextProvider that authMiddleware populates.
function contextFor(user: User | null) {
  return {
    get: (key: typeof appContext) => {
      expect(key).toBe(appContext);
      return user
        ? ({
            user,
            theme: "forest",
            locale: "en-US",
            timeZone: "UTC",
          } as Context)
        : null;
    },
  } as any;
}

const memberContext = () => contextFor(makeUser(MEMBER_ID, "user"));
const adminContext = () => contextFor(makeUser(ADMIN_ID, "admin"));

function post(fields: Record<string, string>) {
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    body.append(key, value);
  }
  return new Request("http://localhost/api/test", { method: "POST", body });
}

function args(request: Request, context: unknown) {
  return { request, context, params: {} } as any;
}

// Actions either return `data(...)` (a DataWithResponseInit) or throw a
// Response, so normalise both into { status, body }.
async function unwrap(
  run: () => Promise<unknown>,
): Promise<{ status: number; body: any }> {
  try {
    const result: any = await run();
    if (result instanceof Response) {
      return { status: result.status, body: await result.json() };
    }
    return { status: result?.init?.status ?? 200, body: result?.data };
  } catch (thrown) {
    if (thrown instanceof Response) {
      return { status: thrown.status, body: await thrown.json() };
    }
    throw thrown;
  }
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/certifications/get-upload-url", () => {
  const fields = {
    certification_type_name: "CPR",
    file_name: "cpr.pdf",
    content_type: "application/pdf",
  };

  it("refuses to sign an upload into another member's prefix", async () => {
    const { status, body } = await unwrap(() =>
      certUploadUrlAction(
        args(post({ ...fields, user_id: OTHER_ID }), memberContext()),
      ),
    );

    expect(status).toBe(403);
    expect(body.error).toBe("Forbidden");
    expect(getPresignedUploadUrl).not.toHaveBeenCalled();
  });

  it("signs an upload for the member's own prefix", async () => {
    const { status, body } = await unwrap(() =>
      certUploadUrlAction(
        args(post({ ...fields, user_id: MEMBER_ID }), memberContext()),
      ),
    );

    expect(status).toBe(200);
    expect(body.uploadUrl).toBe("https://s3.test/signed");
    expect(getPresignedUploadUrl).toHaveBeenCalledWith(
      expect.stringContaining(`files/certifications/${MEMBER_ID}/`),
      "application/pdf",
    );
  });

  it("lets an admin sign an upload for another member", async () => {
    const { status } = await unwrap(() =>
      certUploadUrlAction(
        args(post({ ...fields, user_id: OTHER_ID }), adminContext()),
      ),
    );

    expect(status).toBe(200);
    expect(getPresignedUploadUrl).toHaveBeenCalledWith(
      expect.stringContaining(`files/certifications/${OTHER_ID}/`),
      "application/pdf",
    );
  });

  it("rejects content types outside the allow list", async () => {
    const { status } = await unwrap(() =>
      certUploadUrlAction(
        args(
          post({
            ...fields,
            user_id: MEMBER_ID,
            file_name: "x.html",
            content_type: "text/html",
          }),
          memberContext(),
        ),
      ),
    );

    expect(status).toBe(400);
    expect(getPresignedUploadUrl).not.toHaveBeenCalled();
  });

  it("derives the key extension from the content type, not the file name", async () => {
    await unwrap(() =>
      certUploadUrlAction(
        args(
          post({
            ...fields,
            user_id: MEMBER_ID,
            file_name: "payload.html",
            content_type: "image/png",
          }),
          memberContext(),
        ),
      ),
    );

    const [key] = getPresignedUploadUrl.mock.calls[0] as unknown as [string];
    expect(key.endsWith(".png")).toBe(true);
    expect(key).not.toContain("html");
  });
});

describe("POST /api/certifications/save", () => {
  const fields = {
    certification_id: "cert-1",
    certification_type_name: "CPR",
    file_url: "https://cdn.test/files/certifications/x/cert.pdf",
  };

  it("does not soft-delete another member's existing certifications", async () => {
    const { status } = await unwrap(() =>
      certSaveAction(
        args(post({ ...fields, user_id: OTHER_ID }), memberContext()),
      ),
    );

    expect(status).toBe(403);
    expect(softDeletePreviousCertifications).not.toHaveBeenCalled();
    expect(createCertification).not.toHaveBeenCalled();
  });

  it("saves the member's own certification", async () => {
    const { status, body } = await unwrap(() =>
      certSaveAction(
        args(post({ ...fields, user_id: MEMBER_ID }), memberContext()),
      ),
    );

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(createCertification).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: MEMBER_ID, created_by: MEMBER_ID }),
    );
  });

  it("lets an admin save on behalf of another member and records the actor", async () => {
    const { status } = await unwrap(() =>
      certSaveAction(
        args(post({ ...fields, user_id: OTHER_ID }), adminContext()),
      ),
    );

    expect(status).toBe(200);
    expect(createCertification).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: OTHER_ID, created_by: ADMIN_ID }),
    );
  });
});

describe("POST /api/profile-picture/*", () => {
  it("refuses to sign an upload for another member's picture", async () => {
    const { status } = await unwrap(() =>
      profilePicUploadUrlAction(
        args(
          post({
            user_id: OTHER_ID,
            file_name: "me.png",
            content_type: "image/png",
          }),
          memberContext(),
        ),
      ),
    );

    expect(status).toBe(403);
    expect(getPresignedUploadUrl).not.toHaveBeenCalled();
  });

  it("refuses to overwrite another member's profile picture", async () => {
    const { status } = await unwrap(() =>
      profilePicSaveAction(
        args(
          post({ user_id: OTHER_ID, file_url: "https://cdn.test/x.png" }),
          memberContext(),
        ),
      ),
    );

    expect(status).toBe(403);
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("saves the member's own profile picture", async () => {
    const { status } = await unwrap(() =>
      profilePicSaveAction(
        args(
          post({ user_id: MEMBER_ID, file_url: "https://cdn.test/x.png" }),
          memberContext(),
        ),
      ),
    );

    expect(status).toBe(200);
    expect(updateUser).toHaveBeenCalledWith({
      user_id: MEMBER_ID,
      profile_picture_url: "https://cdn.test/x.png",
    });
  });
});

describe("POST /api/documents/*", () => {
  it("refuses uploads from non-admins", async () => {
    const { status } = await unwrap(() =>
      documentsUploadUrlAction(
        args(
          post({
            document_name: "SOP",
            file_name: "sop.pdf",
            content_type: "application/pdf",
          }),
          memberContext(),
        ),
      ),
    );

    expect(status).toBe(403);
    expect(getPresignedUploadUrl).not.toHaveBeenCalled();
  });

  it("allows admin uploads", async () => {
    const { status } = await unwrap(() =>
      documentsUploadUrlAction(
        args(
          post({
            document_name: "SOP",
            file_name: "sop.pdf",
            content_type: "application/pdf",
          }),
          adminContext(),
        ),
      ),
    );

    expect(status).toBe(200);
    expect(getPresignedUploadUrl).toHaveBeenCalledWith(
      "files/documents/SOP.pdf",
      "application/pdf",
    );
  });

  it("refuses deletes from non-admins", async () => {
    const { status } = await unwrap(() =>
      documentsDeleteAction(
        args(post({ key: "files/documents/SOP.pdf" }), memberContext()),
      ),
    );

    expect(status).toBe(403);
    expect(deleteObject).not.toHaveBeenCalled();
  });

  it("refuses deletes outside the documents prefix", async () => {
    const { status } = await unwrap(() =>
      documentsDeleteAction(
        args(
          post({ key: `files/certifications/${OTHER_ID}/cert.pdf` }),
          adminContext(),
        ),
      ),
    );

    expect(status).toBe(400);
    expect(deleteObject).not.toHaveBeenCalled();
  });

  it("deletes an org document for an admin", async () => {
    const { status } = await unwrap(() =>
      documentsDeleteAction(
        args(post({ key: "files/documents/SOP.pdf" }), adminContext()),
      ),
    );

    expect(status).toBe(200);
    expect(deleteObject).toHaveBeenCalledWith("files/documents/SOP.pdf");
  });

  it("rejects an unauthenticated context", async () => {
    const { status } = await unwrap(() =>
      documentsDeleteAction(
        args(post({ key: "files/documents/SOP.pdf" }), contextFor(null)),
      ),
    );

    expect(status).toBe(403);
    expect(deleteObject).not.toHaveBeenCalled();
  });
});
