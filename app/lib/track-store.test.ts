import { describe, it, expect } from "vitest";
import {
  TrackStore,
  TrackNotFound,
  TrackAlreadyExists,
  type Track,
} from "./track-store";

describe("track store test", () => {
  it("should be able to create and get a track", async () => {
    const store = TrackStore.make();
    const uniqueName = `EMT-${crypto.randomUUID()}`;

    const track = await store.createTrack({
      name: uniqueName,
      description: "Emergency Medical Technician track",
      required_certifications: ["EMT-B", "CPR"],
    });

    expect(track).toMatchObject({
      name: uniqueName,
      description: "Emergency Medical Technician track",
      required_certifications: ["EMT-B", "CPR"],
      created_at: expect.any(String),
      updated_at: expect.any(String),
    });

    const retrieved = await store.getTrack(uniqueName);
    expect(retrieved).toMatchObject({
      name: uniqueName,
      description: "Emergency Medical Technician track",
      required_certifications: ["EMT-B", "CPR"],
      created_at: expect.any(String),
      updated_at: expect.any(String),
    });
  });

  it("should throw TrackNotFound when getting a non-existent track", async () => {
    const store = TrackStore.make();

    await expect(store.getTrack("nonexistent")).rejects.toBeInstanceOf(
      TrackNotFound,
    );
  });

  it("should throw TrackAlreadyExists when creating a duplicate", async () => {
    const store = TrackStore.make();
    const uniqueName = `EMT-${crypto.randomUUID()}`;

    await store.createTrack({
      name: uniqueName,
      description: "Emergency Medical Technician track",
      required_certifications: ["EMT-B", "CPR"],
    });

    await expect(
      store.createTrack({
        name: uniqueName,
        description: "Duplicate description",
        required_certifications: [],
      }),
    ).rejects.toBeInstanceOf(TrackAlreadyExists);
  });

  it("should be able to update a track", async () => {
    const store = TrackStore.make();
    const uniqueName = `EMT-${crypto.randomUUID()}`;

    await store.createTrack({
      name: uniqueName,
      description: "Emergency Medical Technician track",
      required_certifications: ["EMT-B", "CPR"],
    });

    const updated = await store.updateTrack({
      name: uniqueName,
      description: "Updated description",
      required_certifications: ["EMT-B", "CPR", "ACLS"],
    });

    expect(updated).toMatchObject({
      name: uniqueName,
      description: "Updated description",
      required_certifications: ["EMT-B", "CPR", "ACLS"],
    });

    const retrieved = await store.getTrack(uniqueName);
    expect(retrieved.description).toBe("Updated description");
    expect(retrieved.required_certifications).toEqual(["EMT-B", "CPR", "ACLS"]);
  });

  it("should throw TrackNotFound when updating a non-existent track", async () => {
    const store = TrackStore.make();

    await expect(
      store.updateTrack({
        name: "Nonexistent",
        description: "Test",
        required_certifications: [],
      }),
    ).rejects.toBeInstanceOf(TrackNotFound);
  });

  it("should be able to delete a track", async () => {
    const store = TrackStore.make();
    const uniqueName = `EMT-${crypto.randomUUID()}`;

    await store.createTrack({
      name: uniqueName,
      description: "Emergency Medical Technician track",
      required_certifications: ["EMT-B", "CPR"],
    });

    await store.deleteTrack(uniqueName);

    await expect(store.getTrack(uniqueName)).rejects.toBeInstanceOf(TrackNotFound);
  });

  it("should throw TrackNotFound when deleting a non-existent track", async () => {
    const store = TrackStore.make();

    await expect(store.deleteTrack("nonexistent")).rejects.toBeInstanceOf(
      TrackNotFound,
    );
  });

  it("should be able to list all tracks", async () => {
    const store = TrackStore.make();
    const testId = crypto.randomUUID();

    const tracksToCreate: Track[] = [
      {
        name: `EMT-${testId}`,
        description: "Emergency Medical Technician track",
        required_certifications: ["EMT-B", "CPR"],
      },
      {
        name: `Paramedic-${testId}`,
        description: "Paramedic track",
        required_certifications: ["Paramedic", "CPR"],
      },
      {
        name: `Driver Basic-${testId}`,
        description: "Basic driver certification track",
        required_certifications: ["Drivers License", "EVOC", "CPR"],
      },
    ];

    await Promise.all(tracksToCreate.map((track) => store.createTrack(track)));

    const tracks = await store.listTracks();
    expect(tracks.length).toBeGreaterThanOrEqual(3);
    const testTracks = tracks.filter((t) => t.name.includes(testId));
    expect(testTracks.map((t) => t.name).sort()).toEqual([
      `Driver Basic-${testId}`,
      `EMT-${testId}`,
      `Paramedic-${testId}`,
    ]);
  });

  it("should preserve created_at when updating a track", async () => {
    const store = TrackStore.make();
    const uniqueName = `EMT-${crypto.randomUUID()}`;

    const created = await store.createTrack({
      name: uniqueName,
      description: "Emergency Medical Technician track",
      required_certifications: ["EMT-B", "CPR"],
    });

    const updated = await store.updateTrack({
      name: uniqueName,
      description: "Updated description",
      required_certifications: ["EMT-B", "CPR", "ACLS"],
    });

    expect(updated.created_at).toBe(created.created_at);
    expect(updated.updated_at).not.toBe(created.updated_at);
  });

  it("should handle tracks with empty required_certifications", async () => {
    const store = TrackStore.make();
    const uniqueName = `Basic-${crypto.randomUUID()}`;

    const track = await store.createTrack({
      name: uniqueName,
      description: "Basic track with no requirements",
      required_certifications: [],
    });

    expect(track.required_certifications).toEqual([]);

    const retrieved = await store.getTrack(uniqueName);
    expect(retrieved.required_certifications).toEqual([]);
  });

  it("should handle tracks with many required certifications", async () => {
    const store = TrackStore.make();
    const uniqueName = `Advanced-${crypto.randomUUID()}`;

    const certifications = [
      "EMT-B",
      "CPR",
      "ACLS",
      "PALS",
      "BLS",
      "EVOC",
      "Hazmat",
    ];

    const track = await store.createTrack({
      name: uniqueName,
      description: "Advanced track with many requirements",
      required_certifications: certifications,
    });

    expect(track.required_certifications).toEqual(certifications);

    const retrieved = await store.getTrack(uniqueName);
    expect(retrieved.required_certifications).toEqual(certifications);
  });
});
