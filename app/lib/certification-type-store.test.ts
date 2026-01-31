import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { DynaliteServer } from "dynalite";
import { setupDynamo, teardownDynamo } from "./dynamo-local";
import {
  CertificationTypeStore,
  CertificationTypeNotFound,
  CertificationTypeAlreadyExists,
  type CertificationType,
} from "./certification-type-store";

describe("certification type store test", () => {
  let dynamo: DynaliteServer;

  beforeEach(async () => {
    dynamo = await setupDynamo();
  });

  afterEach(async () => {
    await teardownDynamo(dynamo);
  });

  it("should be able to create and get a certification type", async () => {
    const store = CertificationTypeStore.make();

    const certificationType = await store.createCertificationType({
      name: "EMT-Basic",
      description: "Emergency Medical Technician - Basic Level",
      expires: true,
    });

    expect(certificationType).toMatchObject({
      name: "EMT-Basic",
      description: "Emergency Medical Technician - Basic Level",
      expires: true,
      created_at: expect.any(String),
      updated_at: expect.any(String),
    });

    const retrieved = await store.getCertificationType("EMT-Basic");
    expect(retrieved).toMatchObject({
      name: "EMT-Basic",
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

    await store.createCertificationType({
      name: "EMT-Basic",
      description: "Emergency Medical Technician - Basic Level",
      expires: true,
    });

    await expect(
      store.createCertificationType({
        name: "EMT-Basic",
        description: "Duplicate description",
        expires: true,
      }),
    ).rejects.toBeInstanceOf(CertificationTypeAlreadyExists);
  });

  it("should be able to list all certification types", async () => {
    const store = CertificationTypeStore.make();

    const typesToCreate: CertificationType[] = [
      {
        name: "EMT-Basic",
        description: "Basic EMT certification",
        expires: true,
      },
      {
        name: "EMT-Intermediate",
        description: "Intermediate EMT certification",
        expires: true,
      },
      {
        name: "EMT-Paramedic",
        description: "Paramedic certification",
        expires: true,
      },
      {
        name: "CPR",
        description: "CPR certification",
        expires: true,
      },
      {
        name: "EVOC",
        description: "Emergency Vehicle Operations Course",
        expires: true,
      },
    ];

    await Promise.all(
      typesToCreate.map((type) => store.createCertificationType(type)),
    );

    const types = await store.listCertificationTypes();
    expect(types.length).toBe(5);
    expect(types.map((t) => t.name).sort()).toEqual([
      "CPR",
      "EMT-Basic",
      "EMT-Intermediate",
      "EMT-Paramedic",
      "EVOC",
    ]);
  });

  it("should return an empty array when listing with no certification types", async () => {
    const store = CertificationTypeStore.make();

    const types = await store.listCertificationTypes();
    expect(types).toEqual([]);
  });

  it("should handle certification types with special characters in names", async () => {
    const store = CertificationTypeStore.make();

    const certificationType = await store.createCertificationType({
      name: "EMT-Super/Paramedic (Advanced)",
      description: "Advanced certification with special characters",
      expires: true,
    });

    expect(certificationType.name).toBe("EMT-Super/Paramedic (Advanced)");

    const retrieved = await store.getCertificationType(
      "EMT-Super/Paramedic (Advanced)",
    );
    expect(retrieved.name).toBe("EMT-Super/Paramedic (Advanced)");
  });
});
