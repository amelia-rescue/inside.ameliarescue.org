import { describe, it, expect, vi, beforeEach } from "vitest";
import { applyCheckMutation, validFieldValue } from "./mutations.server";
import { TruckCheckStore } from "./truck-check-store";
vi.mock("./truck-check-store", () => ({ TruckCheckStore: { make: vi.fn() } }));
vi.mock("./truck-check-schema-store", () => ({
  TruckCheckSchemaStore: {
    make: () => ({
      getSchemaVersion: async () => ({
        schemaId: "schema",
        sections: [
          {
            id: "s",
            fields: [{ label: "Oxygen", type: "checkbox", required: true }],
          },
        ],
      }),
    }),
  },
}));
vi.mock("./realtime.server", () => ({ publishCheckEvent: vi.fn() }));
vi.mock("./completion", () => ({
  calculateCompletion: async ({ check }: any) => ({
    isComplete: check.data["s-oxygen"] === true,
  }),
}));
const base = {
  id: "check",
  schema_id: "schema",
  schema_created_at: "date",
  data: {},
  contributors: {},
  locked: false,
  revision: 0,
};
const apply = vi.fn();
beforeEach(() => {
  vi.mocked(TruckCheckStore.make).mockReturnValue({
    getTruckCheck: async () => base,
    applyFieldMutation: apply,
  } as any);
  apply.mockResolvedValue({
    check: {
      ...base,
      revision: 1,
      data: { "s-oxygen": true },
      contributors: { a: { first_name: "A", last_name: "Test" } },
    },
    previous: base,
    duplicate: false,
  });
});
const params = {
  id: "check",
  userId: "a",
  contributor: { first_name: "A", last_name: "Test" },
  mutation: {
    clientId: "client",
    sequence: 1,
    fieldId: "s-oxygen",
    value: true,
  },
};
it("acknowledges committed writes even if broadcasting fails", async () => {
  const result = await applyCheckMutation({
    ...params,
    publish: vi.fn().mockRejectedValue(new Error("network")),
  });
  expect(result.acknowledged).toEqual({ clientId: "client", sequence: 1 });
  expect(result.snapshot.revision).toBe(1);
});
it("does not repeat side effects for a duplicate", async () => {
  apply.mockResolvedValue({ check: base, previous: base, duplicate: true });
  const publish = vi.fn();
  expect((await applyCheckMutation({ ...params, publish })).duplicate).toBe(
    true,
  );
  expect(publish).not.toHaveBeenCalled();
});
it("uses the accepted revision for completion identity", async () => {
  const publish = vi.fn();
  await applyCheckMutation({ ...params, publish });
  expect(publish).toHaveBeenCalledWith(
    "check",
    expect.objectContaining({
      type: "truck-check-completed",
      eventId: "check:1",
    }),
  );
});
it("rejects unknown fields before mutation", async () => {
  apply.mockClear();
  await expect(
    applyCheckMutation({
      ...params,
      mutation: { ...params.mutation, fieldId: "unknown" },
    }),
  ).rejects.toThrow();
  expect(apply).not.toHaveBeenCalled();
});
describe("field validation", () => {
  it("accepts blank values and all checkbox states", () => {
    for (const value of [true, false, null, "not-present"])
      expect(validFieldValue({ type: "checkbox", label: "x" }, value)).toBe(
        true,
      );
    expect(validFieldValue({ type: "number", label: "x" }, null)).toBe(true);
    expect(validFieldValue({ type: "number", label: "x" }, Infinity)).toBe(
      false,
    );
    expect(
      validFieldValue({ type: "text", label: "x", maxLength: 2 }, "long"),
    ).toBe(false);
  });
});
