import { describe, it, expect } from "vitest";
import {
  CertificationStore,
  CertificationNotFound,
  CertificationAlreadyExists,
} from "./certification-store";

describe("certification store test", () => {
  it("should be able to create and get a certification", async () => {
    const store = CertificationStore.make();
    const certId = `cert-${crypto.randomUUID()}`;
    const userId = `user-${crypto.randomUUID()}`;

    const certification = await store.createCertification({
      certification_id: certId,
      user_id: userId,
      certification_type_name: "EMT-Basic",
      file_url: "https://example.com/cert.pdf",
      uploaded_at: "2024-01-01T00:00:00Z",
    });

    expect(certification).toMatchObject({
      certification_id: certId,
      user_id: userId,
      certification_type_name: "EMT-Basic",
      file_url: "https://example.com/cert.pdf",
      uploaded_at: "2024-01-01T00:00:00Z",
      created_at: expect.any(String),
      updated_at: expect.any(String),
    });

    const retrieved = await store.getCertification(certId);
    expect(retrieved).toMatchObject({
      certification_id: certId,
      user_id: userId,
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
    const certId = `cert-${crypto.randomUUID()}`;

    await store.createCertification({
      certification_id: certId,
      user_id: "user-456",
      certification_type_name: "EMT-Basic",
      file_url: "https://example.com/cert.pdf",
      uploaded_at: "2024-01-01T00:00:00Z",
    });

    await expect(
      store.createCertification({
        certification_id: certId,
        user_id: "user-789",
        certification_type_name: "CPR",
        file_url: "https://example.com/cert2.pdf",
        uploaded_at: "2024-01-02T00:00:00Z",
      }),
    ).rejects.toBeInstanceOf(CertificationAlreadyExists);
  });

  it("should be able to list certifications by user", async () => {
    const store = CertificationStore.make();
    const userId = `user-${crypto.randomUUID()}`;
    const otherUserId = `user-${crypto.randomUUID()}`;

    const certificationsToCreate = [
      {
        certification_id: `cert-${crypto.randomUUID()}`,
        user_id: userId,
        certification_type_name: "EMT-Basic",
        file_url: "https://example.com/cert1.pdf",
        uploaded_at: "2024-01-01T00:00:00Z",
      },
      {
        certification_id: `cert-${crypto.randomUUID()}`,
        user_id: userId,
        certification_type_name: "CPR",
        file_url: "https://example.com/cert2.pdf",
        uploaded_at: "2024-01-02T00:00:00Z",
      },
      {
        certification_id: `cert-${crypto.randomUUID()}`,
        user_id: otherUserId,
        certification_type_name: "EVOC",
        file_url: "https://example.com/cert3.pdf",
        uploaded_at: "2024-01-03T00:00:00Z",
      },
    ];

    await Promise.all(
      certificationsToCreate.map((cert) => store.createCertification(cert)),
    );

    const userCerts = await store.listCertificationsByUser(userId);
    expect(userCerts.length).toBe(2);
    expect(userCerts[0].uploaded_at).toBe("2024-01-02T00:00:00Z");
    expect(userCerts[1].uploaded_at).toBe("2024-01-01T00:00:00Z");

    const otherUserCerts = await store.listCertificationsByUser(otherUserId);
    expect(otherUserCerts.length).toBe(1);
    expect(otherUserCerts[0].certification_type_name).toBe("EVOC");
  });

  it("should return an empty array when listing certifications for a user with none", async () => {
    const store = CertificationStore.make();

    const certs = await store.listCertificationsByUser("user-999");
    expect(certs).toEqual([]);
  });

  it("should be able to list all certifications", async () => {
    const store = CertificationStore.make();
    const testId = crypto.randomUUID();

    const certificationsToCreate = [
      {
        certification_id: `cert-${testId}-1`,
        user_id: "user-123",
        certification_type_name: "EMT-Basic",
        file_url: "https://example.com/cert1.pdf",
        uploaded_at: "2024-01-01T00:00:00Z",
      },
      {
        certification_id: `cert-${testId}-2`,
        user_id: "user-456",
        certification_type_name: "CPR",
        file_url: "https://example.com/cert2.pdf",
        uploaded_at: "2024-01-02T00:00:00Z",
      },
      {
        certification_id: `cert-${testId}-3`,
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
    expect(allCerts.length).toBeGreaterThanOrEqual(3);
  });

  it("should be able to update a certification", async () => {
    const store = CertificationStore.make();
    const certId = `cert-${crypto.randomUUID()}`;

    await store.createCertification({
      certification_id: certId,
      user_id: "user-456",
      certification_type_name: "EMT-Basic",
      file_url: "https://example.com/cert.pdf",
      uploaded_at: "2024-01-01T00:00:00Z",
    });

    const updated = await store.updateCertification({
      certification_id: certId,
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
    const certId = `cert-${crypto.randomUUID()}`;

    await store.createCertification({
      certification_id: certId,
      user_id: "user-456",
      certification_type_name: "EMT-Basic",
      file_url: "https://example.com/cert.pdf",
      uploaded_at: "2024-01-01T00:00:00Z",
    });

    await store.deleteCertification(certId);

    await expect(store.getCertification(certId)).rejects.toBeInstanceOf(
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
      certification_id: `cert-${crypto.randomUUID()}`,
      user_id: "user-456",
      certification_type_name: "EMT-Basic",
      file_url: "https://example.com/cert.pdf",
      uploaded_at: "2024-01-01T00:00:00Z",
      expires_on: "2025-01-01",
    });

    expect(withExpiration.expires_on).toBe("2025-01-01");

    const withoutExpiration = await store.createCertification({
      certification_id: `cert-${crypto.randomUUID()}`,
      user_id: "user-456",
      certification_type_name: "CPR",
      file_url: "https://example.com/cert2.pdf",
      uploaded_at: "2024-01-01T00:00:00Z",
    });

    expect(withoutExpiration.expires_on).toBeUndefined();
  });

  it("should soft-delete previous certifications when uploading a replacement", async () => {
    const store = CertificationStore.make();
    const userId = `user-${crypto.randomUUID()}`;

    await store.createCertification({
      certification_id: `cert-${crypto.randomUUID()}`,
      user_id: userId,
      certification_type_name: "EMT-Basic",
      file_url: "https://example.com/old-cert1.pdf",
      uploaded_at: "2024-01-01T00:00:00Z",
      expires_on: "2025-01-01",
    });

    const cert2Id = `cert-${crypto.randomUUID()}`;
    await store.createCertification({
      certification_id: cert2Id,
      user_id: userId,
      certification_type_name: "EMT-Basic",
      file_url: "https://example.com/old-cert2.pdf",
      uploaded_at: "2024-02-01T00:00:00Z",
      expires_on: "2025-02-01",
    });

    const cprCertId = `cert-${crypto.randomUUID()}`;
    await store.createCertification({
      certification_id: cprCertId,
      user_id: userId,
      certification_type_name: "CPR",
      file_url: "https://example.com/cpr.pdf",
      uploaded_at: "2024-01-15T00:00:00Z",
    });

    const certsBeforeDelete = await store.listCertificationsByUser(userId);
    expect(certsBeforeDelete.length).toBe(3);

    await store.softDeletePreviousCertifications(userId, "EMT-Basic");

    const certsAfterDelete = await store.listCertificationsByUser(userId);
    expect(certsAfterDelete.length).toBe(1);
    expect(certsAfterDelete[0].certification_type_name).toBe("CPR");

    const cert2 = await store.getCertification(cert2Id);
    expect(cert2.deleted_at).toBeDefined();
    expect(cert2.deleted_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);

    const cprCert = await store.getCertification(cprCertId);
    expect(cprCert.deleted_at).toBeUndefined();
  });

  it("should not affect other users when soft-deleting certifications", async () => {
    const store = CertificationStore.make();
    const user1Id = `user-${crypto.randomUUID()}`;
    const user2Id = `user-${crypto.randomUUID()}`;

    const cert1Id = `cert-${crypto.randomUUID()}`;
    await store.createCertification({
      certification_id: cert1Id,
      user_id: user1Id,
      certification_type_name: "EMT-Basic",
      file_url: "https://example.com/user1-cert.pdf",
      uploaded_at: "2024-01-01T00:00:00Z",
    });

    const cert2Id = `cert-${crypto.randomUUID()}`;
    await store.createCertification({
      certification_id: cert2Id,
      user_id: user2Id,
      certification_type_name: "EMT-Basic",
      file_url: "https://example.com/user2-cert.pdf",
      uploaded_at: "2024-01-01T00:00:00Z",
    });

    await store.softDeletePreviousCertifications(user1Id, "EMT-Basic");

    const user1Certs = await store.listCertificationsByUser(user1Id);
    expect(user1Certs.length).toBe(0);

    const user2Certs = await store.listCertificationsByUser(user2Id);
    expect(user2Certs.length).toBe(1);
    expect(user2Certs[0].certification_id).toBe(cert2Id);
  });
});
