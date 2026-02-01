import { describe, expect, it } from "vitest";

import { calculateComplianceStats } from "./training-status";

describe("calculateComplianceStats", () => {
  it("counts expiring_soon certifications as valid for compliance", () => {
    const stats = calculateComplianceStats([
      {
        user_id: "u1",
        name: "Test User",
        roles: [],
        certifications: {
          CPR: "active",
          EVOC: "expiring_soon",
          ICS: "expired",
          Hazmat: "missing",
        },
      },
    ]);

    expect(stats.totalRequiredCerts).toBe(4);
    expect(stats.totalValidCerts).toBe(2);
    expect(stats.compliancePercentage).toBe(50);
  });
});
