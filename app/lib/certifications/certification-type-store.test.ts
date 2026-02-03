import { describe, it, expect } from "vitest";
import {
  CertificationTypeStore,
  CertificationTypeNotFound,
  CertificationTypeAlreadyExists,
  type CertificationType,
} from "./certification-type-store";

describe("certification type store test", () => {
  it("should be able to create and get a certification type", async () => {
    const store = CertificationTypeStore.make();
    const uniqueName = `EMT-Basic-${crypto.randomUUID()}`;

    const certificationType = await store.createCertificationType({
      name: uniqueName,
      description: "Emergency Medical Technician - Basic Level",
      expires: true,
    });

    expect(certificationType).toMatchObject({
      name: uniqueName,
      description: "Emergency Medical Technician - Basic Level",
      expires: true,
      created_at: expect.any(String),
      updated_at: expect.any(String),
    });

    const retrieved = await store.getCertificationType(uniqueName);
    expect(retrieved).toMatchObject({
      name: uniqueName,
      description: "Emergency Medical Technician - Basic Level",
      expires: true,
      created_at: expect.any(String),
      updated_at: expect.any(String),
    });
  });

  it("should throw CertificationTypeNotFound when getting a non-existent certification type", async () => {
    const store = CertificationTypeStore.make();

    await expect(
      store.getCertificationType("NonExistent"),
    ).rejects.toBeInstanceOf(CertificationTypeNotFound);
  });

  it("should throw CertificationTypeAlreadyExists when creating a duplicate", async () => {
    const store = CertificationTypeStore.make();
    const uniqueName = `EMT-Basic-${crypto.randomUUID()}`;

    await store.createCertificationType({
      name: uniqueName,
      description: "Emergency Medical Technician - Basic Level",
      expires: true,
    });

    await expect(
      store.createCertificationType({
        name: uniqueName,
        description: "Duplicate description",
        expires: true,
      }),
    ).rejects.toBeInstanceOf(CertificationTypeAlreadyExists);
  });

  it("should be able to list all certification types", async () => {
    const store = CertificationTypeStore.make();
    const testId = crypto.randomUUID();

    const typesToCreate: CertificationType[] = [
      {
        name: `EMT-Basic-${testId}`,
        description: "Basic EMT certification",
        expires: true,
      },
      {
        name: `EMT-Intermediate-${testId}`,
        description: "Intermediate EMT certification",
        expires: true,
      },
      {
        name: `EMT-Paramedic-${testId}`,
        description: "Paramedic certification",
        expires: true,
      },
      {
        name: `CPR-${testId}`,
        description: "CPR certification",
        expires: true,
      },
      {
        name: `EVOC-${testId}`,
        description: "Emergency Vehicle Operations Course",
        expires: true,
      },
    ];

    await Promise.all(
      typesToCreate.map((type) => store.createCertificationType(type)),
    );

    const types = await store.listCertificationTypes();
    expect(types.length).toBeGreaterThanOrEqual(5);
    const testTypes = types.filter((t) => t.name.includes(testId));
    expect(testTypes.map((t) => t.name).sort()).toEqual([
      `CPR-${testId}`,
      `EMT-Basic-${testId}`,
      `EMT-Intermediate-${testId}`,
      `EMT-Paramedic-${testId}`,
      `EVOC-${testId}`,
    ]);
  });

  it("should handle certification types with special characters in names", async () => {
    const store = CertificationTypeStore.make();
    const uniqueName = `EMT-Super/Paramedic (Advanced)-${crypto.randomUUID()}`;

    const certificationType = await store.createCertificationType({
      name: uniqueName,
      description: "Advanced certification with special characters",
      expires: true,
    });

    expect(certificationType.name).toBe(uniqueName);

    const retrieved = await store.getCertificationType(uniqueName);
    expect(retrieved.name).toBe(uniqueName);
  });
});
