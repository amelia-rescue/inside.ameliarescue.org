import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { DynaliteServer } from "dynalite";
import { setupDynamo, teardownDynamo } from "./dynamo-local";
import {
  CertificationStore,
  CertificationNotFound,
  CertificationAlreadyExists,
} from "./certification-store";

describe("certification store test", () => {
  let dynamo: DynaliteServer;

  beforeEach(async () => {
    dynamo = await setupDynamo(
      {
        tableName: "aes_users",
        partitionKey: "user_id",
      },
      {
        tableName: "aes_certification_types",
        partitionKey: "name",
      },
      {
        tableName: "aes_user_certifications",
        partitionKey: "certification_id",
        gsi: [
          {
            indexName: "UserIdIndex",
            partitionKey: "user_id",
            sortKey: "uploaded_at",
          },
        ],
      },
    );
  });

  afterEach(async () => {
    await teardownDynamo(dynamo);
  });

  it("should be able to create and get a certification", async () => {
    const store = CertificationStore.make();

    const certification = await store.createCertification({
      certification_id: "cert-123",
      user_id: "user-456",
      certification_type_name: "EMT-Basic",
      file_url: "https://example.com/cert.pdf",
      uploaded_at: "2024-01-01T00:00:00Z",
    });

    expect(certification).toMatchObject({
      certification_id: "cert-123",
      user_id: "user-456",
      certification_type_name: "EMT-Basic",
      file_url: "https://example.com/cert.pdf",
      uploaded_at: "2024-01-01T00:00:00Z",
      created_at: expect.any(String),
      updated_at: expect.any(String),
    });

    const retrieved = await store.getCertification("cert-123");
    expect(retrieved).toMatchObject({
      certification_id: "cert-123",
      user_id: "user-456",
      certification_type_name: "EMT-Basic",
      file_url: "https://example.com/cert.pdf",
    });
  });

  it("should throw CertificationNotFound when getting a non-existent certification", async () => {
    const store = CertificationStore.make();

    await expect(store.getCertification("non-existent")).rejects.toBeInstanceOf(
      CertificationNotFound,
    );
  });

  it("should throw CertificationAlreadyExists when creating a duplicate", async () => {
    const store = CertificationStore.make();

    await store.createCertification({
      certification_id: "cert-123",
      user_id: "user-456",
      certification_type_name: "EMT-Basic",
      file_url: "https://example.com/cert.pdf",
      uploaded_at: "2024-01-01T00:00:00Z",
    });

    await expect(
      store.createCertification({
        certification_id: "cert-123",
        user_id: "user-789",
        certification_type_name: "CPR",
        file_url: "https://example.com/cert2.pdf",
        uploaded_at: "2024-01-02T00:00:00Z",
      }),
    ).rejects.toBeInstanceOf(CertificationAlreadyExists);
  });

  it("should be able to list certifications by user", async () => {
    const store = CertificationStore.make();

    const certificationsToCreate = [
      {
        certification_id: "cert-1",
        user_id: "user-123",
        certification_type_name: "EMT-Basic",
        file_url: "https://example.com/cert1.pdf",
        uploaded_at: "2024-01-01T00:00:00Z",
      },
      {
        certification_id: "cert-2",
        user_id: "user-123",
        certification_type_name: "CPR",
        file_url: "https://example.com/cert2.pdf",
        uploaded_at: "2024-01-02T00:00:00Z",
      },
      {
        certification_id: "cert-3",
        user_id: "user-456",
        certification_type_name: "EVOC",
        file_url: "https://example.com/cert3.pdf",
        uploaded_at: "2024-01-03T00:00:00Z",
      },
    ];

    await Promise.all(
      certificationsToCreate.map((cert) => store.createCertification(cert)),
    );

    const user123Certs = await store.listCertificationsByUser("user-123");
    expect(user123Certs.length).toBe(2);
    expect(user123Certs[0].uploaded_at).toBe("2024-01-02T00:00:00Z");
    expect(user123Certs[1].uploaded_at).toBe("2024-01-01T00:00:00Z");

    const user456Certs = await store.listCertificationsByUser("user-456");
    expect(user456Certs.length).toBe(1);
    expect(user456Certs[0].certification_type_name).toBe("EVOC");
  });

  it("should return an empty array when listing certifications for a user with none", async () => {
    const store = CertificationStore.make();

    const certs = await store.listCertificationsByUser("user-999");
    expect(certs).toEqual([]);
  });

  it("should be able to list all certifications", async () => {
    const store = CertificationStore.make();

    const certificationsToCreate = [
      {
        certification_id: "cert-1",
        user_id: "user-123",
        certification_type_name: "EMT-Basic",
        file_url: "https://example.com/cert1.pdf",
        uploaded_at: "2024-01-01T00:00:00Z",
      },
      {
        certification_id: "cert-2",
        user_id: "user-456",
        certification_type_name: "CPR",
        file_url: "https://example.com/cert2.pdf",
        uploaded_at: "2024-01-02T00:00:00Z",
      },
      {
        certification_id: "cert-3",
        user_id: "user-789",
        certification_type_name: "EVOC",
        file_url: "https://example.com/cert3.pdf",
        uploaded_at: "2024-01-03T00:00:00Z",
      },
    ];

    await Promise.all(
      certificationsToCreate.map((cert) => store.createCertification(cert)),
    );

    const allCerts = await store.listAllCertifications();
    expect(allCerts.length).toBe(3);
  });

  it("should be able to update a certification", async () => {
    const store = CertificationStore.make();

    await store.createCertification({
      certification_id: "cert-123",
      user_id: "user-456",
      certification_type_name: "EMT-Basic",
      file_url: "https://example.com/cert.pdf",
      uploaded_at: "2024-01-01T00:00:00Z",
    });

    const updated = await store.updateCertification({
      certification_id: "cert-123",
      user_id: "user-456",
      certification_type_name: "EMT-Basic",
      file_url: "https://example.com/cert-updated.pdf",
      uploaded_at: "2024-01-01T00:00:00Z",
      expires_on: "2025-01-01",
    });

    expect(updated.file_url).toBe("https://example.com/cert-updated.pdf");
    expect(updated.expires_on).toBe("2025-01-01");
  });

  it("should throw CertificationNotFound when updating a non-existent certification", async () => {
    const store = CertificationStore.make();

    await expect(
      store.updateCertification({
        certification_id: "non-existent",
        user_id: "user-456",
        certification_type_name: "EMT-Basic",
        file_url: "https://example.com/cert.pdf",
        uploaded_at: "2024-01-01T00:00:00Z",
      }),
    ).rejects.toBeInstanceOf(CertificationNotFound);
  });

  it("should be able to delete a certification", async () => {
    const store = CertificationStore.make();

    await store.createCertification({
      certification_id: "cert-123",
      user_id: "user-456",
      certification_type_name: "EMT-Basic",
      file_url: "https://example.com/cert.pdf",
      uploaded_at: "2024-01-01T00:00:00Z",
    });

    await store.deleteCertification("cert-123");

    await expect(store.getCertification("cert-123")).rejects.toBeInstanceOf(
      CertificationNotFound,
    );
  });

  it("should throw CertificationNotFound when deleting a non-existent certification", async () => {
    const store = CertificationStore.make();

    await expect(
      store.deleteCertification("non-existent"),
    ).rejects.toBeInstanceOf(CertificationNotFound);
  });

  it("should handle certifications with optional expiration fields", async () => {
    const store = CertificationStore.make();

    const withExpiration = await store.createCertification({
      certification_id: "cert-with-exp",
      user_id: "user-456",
      certification_type_name: "EMT-Basic",
      file_url: "https://example.com/cert.pdf",
      uploaded_at: "2024-01-01T00:00:00Z",
      expires_on: "2025-01-01",
    });

    expect(withExpiration.expires_on).toBe("2025-01-01");

    const withoutExpiration = await store.createCertification({
      certification_id: "cert-no-exp",
      user_id: "user-456",
      certification_type_name: "CPR",
      file_url: "https://example.com/cert2.pdf",
      uploaded_at: "2024-01-01T00:00:00Z",
    });

    expect(withoutExpiration.expires_on).toBeUndefined();
  });

  it("should soft-delete previous certifications when uploading a replacement", async () => {
    const store = CertificationStore.make();

    // Create initial EMT certification
    await store.createCertification({
      certification_id: "cert-old-1",
      user_id: "user-123",
      certification_type_name: "EMT-Basic",
      file_url: "https://example.com/old-cert1.pdf",
      uploaded_at: "2024-01-01T00:00:00Z",
      expires_on: "2025-01-01",
    });

    // Create another EMT certification (replacement scenario)
    await store.createCertification({
      certification_id: "cert-old-2",
      user_id: "user-123",
      certification_type_name: "EMT-Basic",
      file_url: "https://example.com/old-cert2.pdf",
      uploaded_at: "2024-02-01T00:00:00Z",
      expires_on: "2025-02-01",
    });

    // Create a different certification type for the same user
    await store.createCertification({
      certification_id: "cert-cpr",
      user_id: "user-123",
      certification_type_name: "CPR",
      file_url: "https://example.com/cpr.pdf",
      uploaded_at: "2024-01-15T00:00:00Z",
    });

    // Verify we have 3 certifications before soft-delete
    const certsBeforeDelete = await store.listCertificationsByUser("user-123");
    expect(certsBeforeDelete.length).toBe(3);

    // Soft-delete all EMT-Basic certifications
    await store.softDeletePreviousCertifications("user-123", "EMT-Basic");

    // Verify only CPR certification remains visible
    const certsAfterDelete = await store.listCertificationsByUser("user-123");
    expect(certsAfterDelete.length).toBe(1);
    expect(certsAfterDelete[0].certification_type_name).toBe("CPR");

    // Verify the old certifications still exist in the database but have deleted_at set
    const oldCert1 = await store.getCertification("cert-old-1");
    expect(oldCert1.deleted_at).toBeDefined();
    expect(oldCert1.deleted_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);

    const oldCert2 = await store.getCertification("cert-old-2");
    expect(oldCert2.deleted_at).toBeDefined();
    expect(oldCert2.deleted_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);

    // Verify CPR cert is not soft-deleted
    const cprCert = await store.getCertification("cert-cpr");
    expect(cprCert.deleted_at).toBeUndefined();
  });

  it("should not affect other users when soft-deleting certifications", async () => {
    const store = CertificationStore.make();

    // Create EMT certifications for two different users
    await store.createCertification({
      certification_id: "cert-user1",
      user_id: "user-123",
      certification_type_name: "EMT-Basic",
      file_url: "https://example.com/user1-cert.pdf",
      uploaded_at: "2024-01-01T00:00:00Z",
    });

    await store.createCertification({
      certification_id: "cert-user2",
      user_id: "user-456",
      certification_type_name: "EMT-Basic",
      file_url: "https://example.com/user2-cert.pdf",
      uploaded_at: "2024-01-01T00:00:00Z",
    });

    // Soft-delete user-123's EMT certifications
    await store.softDeletePreviousCertifications("user-123", "EMT-Basic");

    // Verify user-123 has no certifications
    const user123Certs = await store.listCertificationsByUser("user-123");
    expect(user123Certs.length).toBe(0);

    // Verify user-456 still has their certification
    const user456Certs = await store.listCertificationsByUser("user-456");
    expect(user456Certs.length).toBe(1);
    expect(user456Certs[0].certification_id).toBe("cert-user2");
  });
});
