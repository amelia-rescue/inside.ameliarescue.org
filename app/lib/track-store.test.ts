import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { DynaliteServer } from "dynalite";
import { setupDynamo, teardownDynamo } from "./dynamo-local";
import {
  TrackStore,
  TrackNotFound,
  TrackAlreadyExists,
  type Track,
} from "./track-store";

describe("track store test", () => {
  let dynamo: DynaliteServer;

  beforeEach(async () => {
    dynamo = await setupDynamo({
      tableName: "aes_tracks",
      partitionKey: "name",
    });
  });

  afterEach(async () => {
    await teardownDynamo(dynamo);
  });

  it("should be able to create and get a track", async () => {
    const store = TrackStore.make();

    const track = await store.createTrack({
      name: "EMT",
      description: "Emergency Medical Technician track",
      required_certifications: ["EMT-B", "CPR"],
    });

    expect(track).toMatchObject({
      name: "EMT",
      description: "Emergency Medical Technician track",
      required_certifications: ["EMT-B", "CPR"],
      created_at: expect.any(String),
      updated_at: expect.any(String),
    });

    const retrieved = await store.getTrack("EMT");
    expect(retrieved).toMatchObject({
      name: "EMT",
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

    await store.createTrack({
      name: "EMT",
      description: "Emergency Medical Technician track",
      required_certifications: ["EMT-B", "CPR"],
    });

    await expect(
      store.createTrack({
        name: "EMT",
        description: "Duplicate description",
        required_certifications: [],
      }),
    ).rejects.toBeInstanceOf(TrackAlreadyExists);
  });

  it("should be able to update a track", async () => {
    const store = TrackStore.make();

    await store.createTrack({
      name: "EMT",
      description: "Emergency Medical Technician track",
      required_certifications: ["EMT-B", "CPR"],
    });

    const updated = await store.updateTrack({
      name: "EMT",
      description: "Updated description",
      required_certifications: ["EMT-B", "CPR", "ACLS"],
    });

    expect(updated).toMatchObject({
      name: "EMT",
      description: "Updated description",
      required_certifications: ["EMT-B", "CPR", "ACLS"],
    });

    const retrieved = await store.getTrack("EMT");
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

    await store.createTrack({
      name: "EMT",
      description: "Emergency Medical Technician track",
      required_certifications: ["EMT-B", "CPR"],
    });

    await store.deleteTrack("EMT");

    await expect(store.getTrack("EMT")).rejects.toBeInstanceOf(TrackNotFound);
  });

  it("should throw TrackNotFound when deleting a non-existent track", async () => {
    const store = TrackStore.make();

    await expect(store.deleteTrack("nonexistent")).rejects.toBeInstanceOf(
      TrackNotFound,
    );
  });

  it("should be able to list all tracks", async () => {
    const store = TrackStore.make();

    const tracksToCreate: Track[] = [
      {
        name: "EMT",
        description: "Emergency Medical Technician track",
        required_certifications: ["EMT-B", "CPR"],
      },
      {
        name: "Paramedic",
        description: "Paramedic track",
        required_certifications: ["Paramedic", "CPR"],
      },
      {
        name: "Driver Basic",
        description: "Basic driver certification track",
        required_certifications: ["Drivers License", "EVOC", "CPR"],
      },
    ];

    await Promise.all(tracksToCreate.map((track) => store.createTrack(track)));

    const tracks = await store.listTracks();
    expect(tracks.length).toBe(3);
    expect(tracks.map((t) => t.name).sort()).toEqual([
      "Driver Basic",
      "EMT",
      "Paramedic",
    ]);
  });

  it("should return an empty array when listing with no tracks", async () => {
    const store = TrackStore.make();

    const tracks = await store.listTracks();
    expect(tracks).toEqual([]);
  });

  it("should preserve created_at when updating a track", async () => {
    const store = TrackStore.make();

    const created = await store.createTrack({
      name: "EMT",
      description: "Emergency Medical Technician track",
      required_certifications: ["EMT-B", "CPR"],
    });

    const updated = await store.updateTrack({
      name: "EMT",
      description: "Updated description",
      required_certifications: ["EMT-B", "CPR", "ACLS"],
    });

    expect(updated.created_at).toBe(created.created_at);
    expect(updated.updated_at).not.toBe(created.updated_at);
  });

  it("should handle tracks with empty required_certifications", async () => {
    const store = TrackStore.make();

    const track = await store.createTrack({
      name: "Basic",
      description: "Basic track with no requirements",
      required_certifications: [],
    });

    expect(track.required_certifications).toEqual([]);

    const retrieved = await store.getTrack("Basic");
    expect(retrieved.required_certifications).toEqual([]);
  });

  it("should handle tracks with many required certifications", async () => {
    const store = TrackStore.make();

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
      name: "Advanced",
      description: "Advanced track with many requirements",
      required_certifications: certifications,
    });

    expect(track.required_certifications).toEqual(certifications);

    const retrieved = await store.getTrack("Advanced");
    expect(retrieved.required_certifications).toEqual(certifications);
  });
});
