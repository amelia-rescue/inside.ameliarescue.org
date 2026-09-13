import { beforeEach, describe, expect, it } from "vitest";
import { SyncOutbox } from "./sync-outbox";

describe("durable truck-check outbox", () => {
  beforeEach(() => localStorage.clear());
  it("survives reload, isolates users and checks, and only removes the acknowledged edit", () => {
    const first = new SyncOutbox("a", "check", localStorage);
    const one = first.enqueue("oxygen", true);
    const two = first.enqueue("oxygen", "not-present");
    const restored = new SyncOutbox("a", "check", localStorage);
    expect(restored.list()).toHaveLength(2);
    restored.acknowledge(one);
    expect(restored.list()).toEqual([two]);
    expect(new SyncOutbox("b", "check", localStorage).list()).toEqual([]);
    expect(new SyncOutbox("a", "other", localStorage).list()).toEqual([]);
  });
  it("does not overwrite another tab's pending records", () => {
    const a = new SyncOutbox("a", "check", localStorage);
    const b = new SyncOutbox("a", "check", localStorage);
    const one = a.enqueue("oxygen", true);
    b.enqueue("fuel", "full");
    expect(a.list()).toHaveLength(2);
    a.acknowledge(one);
    a.acknowledge(one);
    expect(b.list().map((m) => m.fieldId)).toEqual(["fuel"]);
  });
  it("preserves memory intent and reports storage failures", () => {
    const storage = {
      get length() {
        throw new Error("denied");
      },
      setItem() {
        throw new Error("quota");
      },
    } as unknown as Storage;
    const outbox = new SyncOutbox("a", "check", storage);
    outbox.enqueue("oxygen", true);
    expect(outbox.list()).toHaveLength(1);
    expect(outbox.error).toBeTruthy();
  });
  it("retains corrupt records instead of silently treating them as saved", () => {
    const outbox = new SyncOutbox("a", "check", localStorage);
    localStorage.setItem(outbox.prefix + "broken", "invalid");
    expect(outbox.list()).toEqual([]);
    expect(outbox.error).toBeTruthy();
    expect(localStorage.getItem(outbox.prefix + "broken")).toBe("invalid");
  });
});
