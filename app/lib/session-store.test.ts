import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { DynaliteServer } from "dynalite";
import { setupDynamo, teardownDynamo } from "./dynamo-local";
import { SessionStore, SessionNotFound, type Session } from "./session-store";

describe("session store test", () => {
  let dynamo: DynaliteServer;

  beforeEach(async () => {
    dynamo = await setupDynamo();
  });

  afterEach(async () => {
    await teardownDynamo(dynamo);
  });

  it("should be able to create and get a session", async () => {
    const store = SessionStore.make();

    const session = await store.createSession({
      user_id: "user-123",
      session_id: "session-abc",
      expires_at: Date.now() + 3600000,
      refresh_token: "refresh-token-xyz",
      access_token: "access-token-xyz",
      access_token_expires_at: new Date(Date.now() + 3600000).toISOString(),
    });

    expect(session).toMatchObject({
      user_id: "user-123",
      session_id: "session-abc",
      expires_at: expect.any(Number),
      refresh_token: "refresh-token-xyz",
      access_token: "access-token-xyz",
      access_token_expires_at: expect.any(String),
      created_at: expect.any(String),
      updated_at: expect.any(String),
    });

    const retrieved = await store.getSession("user-123", "session-abc");
    expect(retrieved).toMatchObject({
      user_id: "user-123",
      session_id: "session-abc",
      expires_at: expect.any(Number),
      refresh_token: "refresh-token-xyz",
      access_token: "access-token-xyz",
      access_token_expires_at: expect.any(String),
      created_at: expect.any(String),
      updated_at: expect.any(String),
    });
  });

  it("should throw SessionNotFound when getting a non-existent session", async () => {
    const store = SessionStore.make();

    await expect(
      store.getSession("user-123", "nonexistent"),
    ).rejects.toBeInstanceOf(SessionNotFound);
  });

  it("should be able to update a session", async () => {
    const store = SessionStore.make();

    const created = await store.createSession({
      user_id: "user-123",
      session_id: "session-abc",
      expires_at: Date.now() + 3600000,
      refresh_token: "refresh-token-xyz",
      access_token: "access-token-xyz",
      access_token_expires_at: new Date(Date.now() + 3600000).toISOString(),
    });

    const newExpiresAt = Date.now() + 7200000;
    const updated = await store.updateSession({
      user_id: "user-123",
      session_id: "session-abc",
      expires_at: newExpiresAt,
      refresh_token: "new-refresh-token",
      access_token: "new-access-token",
      access_token_expires_at: new Date(newExpiresAt).toISOString(),
    });

    expect(updated).toMatchObject({
      user_id: "user-123",
      session_id: "session-abc",
      expires_at: newExpiresAt,
      refresh_token: "new-refresh-token",
    });

    const retrieved = await store.getSession("user-123", "session-abc");
    expect(retrieved.refresh_token).toBe("new-refresh-token");
    expect(retrieved.access_token).toBe("new-access-token");
    expect(retrieved.expires_at).toBe(newExpiresAt);
    expect(retrieved.created_at).toBe(created.created_at);
    expect(retrieved.updated_at).not.toBe(created.updated_at);
  });

  it("should throw SessionNotFound when updating a non-existent session", async () => {
    const store = SessionStore.make();

    await expect(
      store.updateSession({
        user_id: "user-123",
        session_id: "nonexistent",
        expires_at: Date.now() + 3600000,
        refresh_token: "refresh-token-xyz",
        access_token: "access-token-xyz",
        access_token_expires_at: new Date(Date.now() + 3600000).toISOString(),
      }),
    ).rejects.toBeInstanceOf(SessionNotFound);
  });

  it("should be able to delete a session", async () => {
    const store = SessionStore.make();

    await store.createSession({
      user_id: "user-123",
      session_id: "session-abc",
      expires_at: Date.now() + 3600000,
      refresh_token: "refresh-token-xyz",
      access_token: "access-token-xyz",
      access_token_expires_at: new Date(Date.now() + 3600000).toISOString(),
    });

    await store.deleteSession("user-123", "session-abc");

    await expect(
      store.getSession("user-123", "session-abc"),
    ).rejects.toBeInstanceOf(SessionNotFound);
  });

  it("should be able to list all sessions for a user", async () => {
    const store = SessionStore.make();

    const sessionsToCreate: Session[] = [
      {
        user_id: "user-123",
        session_id: "session-1",
        expires_at: Date.now() + 3600000,
        refresh_token: "refresh-token-1",
        access_token: "access-token-1",
        access_token_expires_at: new Date(Date.now() + 3600000).toISOString(),
      },
      {
        user_id: "user-123",
        session_id: "session-2",
        expires_at: Date.now() + 3600000,
        refresh_token: "refresh-token-2",
        access_token: "access-token-2",
        access_token_expires_at: new Date(Date.now() + 3600000).toISOString(),
      },
      {
        user_id: "user-123",
        session_id: "session-3",
        expires_at: Date.now() + 3600000,
        refresh_token: "refresh-token-3",
        access_token: "access-token-3",
        access_token_expires_at: new Date(Date.now() + 3600000).toISOString(),
      },
      {
        user_id: "user-456",
        session_id: "session-4",
        expires_at: Date.now() + 3600000,
        refresh_token: "refresh-token-4",
        access_token: "access-token-4",
        access_token_expires_at: new Date(Date.now() + 3600000).toISOString(),
      },
    ];

    await Promise.all(
      sessionsToCreate.map((session) => store.createSession(session)),
    );

    const user123Sessions = await store.listUserSessions("user-123");
    expect(user123Sessions.length).toBe(3);
    expect(user123Sessions.map((s) => s.session_id).sort()).toEqual([
      "session-1",
      "session-2",
      "session-3",
    ]);

    const user456Sessions = await store.listUserSessions("user-456");
    expect(user456Sessions.length).toBe(1);
    expect(user456Sessions[0].session_id).toBe("session-4");
  });

  it("should return an empty array when listing sessions for a user with no sessions", async () => {
    const store = SessionStore.make();

    const sessions = await store.listUserSessions("user-123");
    expect(sessions).toEqual([]);
  });

  it("should be able to delete all sessions for a user", async () => {
    const store = SessionStore.make();

    const sessionsToCreate: Session[] = [
      {
        user_id: "user-123",
        session_id: "session-1",
        expires_at: Date.now() + 3600000,
        refresh_token: "refresh-token-1",
        access_token: "access-token-1",
        access_token_expires_at: new Date(Date.now() + 3600000).toISOString(),
      },
      {
        user_id: "user-123",
        session_id: "session-2",
        expires_at: Date.now() + 3600000,
        refresh_token: "refresh-token-2",
        access_token: "access-token-2",
        access_token_expires_at: new Date(Date.now() + 3600000).toISOString(),
      },
      {
        user_id: "user-456",
        session_id: "session-3",
        expires_at: Date.now() + 3600000,
        refresh_token: "refresh-token-3",
        access_token: "access-token-3",
        access_token_expires_at: new Date(Date.now() + 3600000).toISOString(),
      },
    ];

    await Promise.all(
      sessionsToCreate.map((session) => store.createSession(session)),
    );

    await store.deleteAllUserSessions("user-123");

    const user123Sessions = await store.listUserSessions("user-123");
    expect(user123Sessions).toEqual([]);

    const user456Sessions = await store.listUserSessions("user-456");
    expect(user456Sessions.length).toBe(1);
  });

  it("should preserve created_at when updating a session", async () => {
    const store = SessionStore.make();

    const created = await store.createSession({
      user_id: "user-123",
      session_id: "session-abc",
      expires_at: Date.now() + 3600000,
      refresh_token: "refresh-token-xyz",
      access_token: "access-token-xyz",
      access_token_expires_at: new Date(Date.now() + 3600000).toISOString(),
    });

    const updated = await store.updateSession({
      user_id: "user-123",
      session_id: "session-abc",
      expires_at: Date.now() + 7200000,
      refresh_token: "new-refresh-token",
      access_token: "new-access-token",
      access_token_expires_at: new Date(Date.now() + 7200000).toISOString(),
    });

    expect(updated.created_at).toBe(created.created_at);
    expect(updated.updated_at).not.toBe(created.updated_at);
  });

  it("should allow multiple sessions for the same user", async () => {
    const store = SessionStore.make();

    await store.createSession({
      user_id: "user-123",
      session_id: "session-1",
      expires_at: Date.now() + 3600000,
      refresh_token: "refresh-token-1",
      access_token: "access-token-1",
      access_token_expires_at: new Date(Date.now() + 3600000).toISOString(),
    });

    await store.createSession({
      user_id: "user-123",
      session_id: "session-2",
      expires_at: Date.now() + 3600000,
      refresh_token: "refresh-token-2",
      access_token: "access-token-2",
      access_token_expires_at: new Date(Date.now() + 3600000).toISOString(),
    });

    const session1 = await store.getSession("user-123", "session-1");
    const session2 = await store.getSession("user-123", "session-2");

    expect(session1.refresh_token).toBe("refresh-token-1");
    expect(session2.refresh_token).toBe("refresh-token-2");
  });
});
