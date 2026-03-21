import { describe, expect, it } from "vitest";

import {
  buildTrainingStatusData,
  serializeTrainingStatusExportRowsToCsv,
} from "./training-status-export";

describe("buildTrainingStatusData", () => {
  it("includes required missing and extra non-required certifications in export rows", () => {
    const now = new Date("2026-03-21T18:00:00.000Z");
    const result = buildTrainingStatusData({
      now,
      users: [
        {
          user_id: "u1",
          first_name: "Jane",
          last_name: "Doe",
          email: "jane@ameliarescue.org",
          website_role: "user",
          membership_roles: [
            {
              role_name: "EMT",
              track_name: "Operations",
              precepting: false,
            },
          ],
        },
      ],
      tracks: [
        {
          name: "Operations",
          description: "Operations track",
          required_certifications: ["CPR", "EVOC"],
        },
      ],
      certificationsByUserId: {
        u1: [
          {
            certification_id: "c1",
            user_id: "u1",
            certification_type_name: "CPR",
            file_url: "https://inside.ameliarescue.org/files/cpr.pdf",
            issued_on: "2025-01-01",
            expires_on: "2027-01-01",
            uploaded_at: "2025-01-02T00:00:00.000Z",
          },
          {
            certification_id: "c2",
            user_id: "u1",
            certification_type_name: "Hazmat",
            file_url: "https://inside.ameliarescue.org/files/hazmat.pdf",
            issued_on: "2023-01-01",
            expires_on: "2024-01-01",
            uploaded_at: "2023-01-02T00:00:00.000Z",
          },
        ],
      },
    });

    expect(result.trainingData).toHaveLength(1);
    expect(result.trainingData[0].certifications).toEqual({
      CPR: "active",
      EVOC: "missing",
    });

    expect(result.exportRows).toEqual([
      {
        user_id: "u1",
        first_name: "Jane",
        last_name: "Doe",
        email: "jane@ameliarescue.org",
        website_role: "user",
        membership_roles: "EMT - Operations",
        certification_type: "CPR",
        required: true,
        status: "active",
        issued_on: "2025-01-01",
        expires_on: "2027-01-01",
        uploaded_at: "2025-01-02T00:00:00.000Z",
        file_url: "https://inside.ameliarescue.org/files/cpr.pdf",
        generated_at: now.toISOString(),
      },
      {
        user_id: "u1",
        first_name: "Jane",
        last_name: "Doe",
        email: "jane@ameliarescue.org",
        website_role: "user",
        membership_roles: "EMT - Operations",
        certification_type: "EVOC",
        required: true,
        status: "missing",
        issued_on: "",
        expires_on: "",
        uploaded_at: "",
        file_url: "",
        generated_at: now.toISOString(),
      },
      {
        user_id: "u1",
        first_name: "Jane",
        last_name: "Doe",
        email: "jane@ameliarescue.org",
        website_role: "user",
        membership_roles: "EMT - Operations",
        certification_type: "Hazmat",
        required: false,
        status: "expired",
        issued_on: "2023-01-01",
        expires_on: "2024-01-01",
        uploaded_at: "2023-01-02T00:00:00.000Z",
        file_url: "https://inside.ameliarescue.org/files/hazmat.pdf",
        generated_at: now.toISOString(),
      },
    ]);
  });
});

describe("serializeTrainingStatusExportRowsToCsv", () => {
  it("escapes commas and quotes and normalizes booleans", () => {
    const csv = serializeTrainingStatusExportRowsToCsv([
      {
        user_id: "u1",
        first_name: "Jane",
        last_name: 'Doe "Medic"',
        email: "jane@ameliarescue.org",
        website_role: "user",
        membership_roles: "EMT - Operations, Driver - Transport",
        certification_type: "CPR",
        required: true,
        status: "active",
        issued_on: "2025-01-01",
        expires_on: "2027-01-01",
        uploaded_at: "2025-01-02T00:00:00.000Z",
        file_url: "https://inside.ameliarescue.org/files/cpr.pdf",
        generated_at: "2026-03-21T18:00:00.000Z",
      },
    ]);

    expect(csv).toContain("required");
    expect(csv).toContain('"Doe ""Medic"""');
    expect(csv).toContain('"EMT - Operations, Driver - Transport"');
    expect(csv).toContain(",yes,active,2025-01-01,2027-01-01,2025-01-02T00:00:00.000Z,");
  });
});
