import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { useTruckCheckSync } from "./use-truck-check-sync";
import type { CheckSnapshot } from "./sync-protocol";
const initial: CheckSnapshot = {
  id: "check",
  userId: "a",
  revision: 0,
  data: {},
  contributors: {},
  locked: false,
};
class BrokenSocket {
  static OPEN = 1;
  readyState = 0;
  close() {}
  send() {}
}
beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("WebSocket", BrokenSocket);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it("saves through HTTP when the socket never connects", async () => {
  const fetcher = vi.fn(async (_url, options) => {
    if (options?.method === "POST") {
      const m = JSON.parse(options.body);
      return Response.json({
        snapshot: { ...initial, revision: 1, data: { [m.fieldId]: m.value } },
        acknowledged: { clientId: m.clientId, sequence: m.sequence },
      });
    }
    return Response.json({ snapshot: initial, accessToken: "token" });
  });
  vi.stubGlobal("fetch", fetcher);
  const { result } = renderHook(() =>
    useTruckCheckSync({ initial, wsUrl: "wss://example.test" }),
  );
  await waitFor(() => expect(result.current.ready).toBe(true));
  act(() => result.current.edit("oxygen", true));
  await waitFor(() => expect(result.current.pending).toHaveLength(0));
  expect(result.current.values.oxygen).toBe(true);
  expect(result.current.snapshot.revision).toBe(1);
});
it("restores offline edits on remount and retains newer intent during an earlier acknowledgment", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
  const first = renderHook(() =>
    useTruckCheckSync({ initial, wsUrl: "wss://example.test" }),
  );
  await waitFor(() => expect(first.result.current.ready).toBe(true));
  act(() => first.result.current.edit("oxygen", true));
  await waitFor(() => expect(first.result.current.pending).toHaveLength(1));
  first.unmount();
  let resolveSave: (r: Response) => void;
  let sent: any;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, options) => {
      if (options?.method === "POST") {
        sent = JSON.parse(options.body);
        return new Promise<Response>((resolve) => {
          resolveSave = resolve;
        });
      }
      return Response.json({ snapshot: initial, accessToken: "token" });
    }),
  );
  const second = renderHook(() =>
    useTruckCheckSync({ initial, wsUrl: "wss://example.test" }),
  );
  await waitFor(() => expect(sent).toBeDefined());
  act(() => second.result.current.edit("oxygen", "not-present"));
  await act(async () =>
    resolveSave!(
      Response.json({
        snapshot: { ...initial, revision: 1, data: { oxygen: true } },
        acknowledged: sent,
      }),
    ),
  );
  expect(second.result.current.values.oxygen).toBe("not-present");
  expect(second.result.current.pending).toHaveLength(1);
  second.unmount();
});
it("retains pending work on remote lock rather than reporting it saved", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, options) =>
      options?.method === "POST"
        ? Response.json(
            {
              code: "locked",
              error: "Locked",
              snapshot: { ...initial, revision: 1, locked: true },
            },
            { status: 409 },
          )
        : Response.json({ snapshot: initial, accessToken: "token" }),
    ),
  );
  const { result } = renderHook(() =>
    useTruckCheckSync({ initial, wsUrl: "wss://example.test" }),
  );
  await waitFor(() => expect(result.current.ready).toBe(true));
  act(() => result.current.edit("oxygen", true));
  await waitFor(() => expect(result.current.snapshot.locked).toBe(true));
  expect(result.current.pending).toHaveLength(1);
  expect(result.current.values.oxygen).toBeUndefined();
});

it("converges three clients after a lost save response without reapplying the first edit", async () => {
  let saved = { ...initial, data: {} as Record<string, unknown> };
  const accepted = new Set<string>();
  let offlineA = false;
  let loseFirstResponse = true;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, options) => {
      const userId = options.headers["X-Truck-Check-User"];
      if (userId === "a" && offlineA) throw new TypeError("offline");
      if (options.method === "POST") {
        const mutation = JSON.parse(options.body);
        const key = `${userId}:${mutation.clientId}:${mutation.sequence}`;
        if (!accepted.has(key)) {
          accepted.add(key);
          saved = {
            ...saved,
            revision: saved.revision + 1,
            data: { ...saved.data, [mutation.fieldId]: mutation.value },
          };
        }
        if (userId === "a" && loseFirstResponse) {
          offlineA = true;
          loseFirstResponse = false;
          throw new TypeError("Response lost after commit");
        }
        return Response.json({
          snapshot: { ...saved, userId },
          acknowledged: mutation,
        });
      }
      return Response.json({
        snapshot: { ...saved, userId },
        accessToken: "token",
      });
    }),
  );
  const a = renderHook(() =>
    useTruckCheckSync({ initial, wsUrl: "wss://example.test" }),
  );
  const b = renderHook(() =>
    useTruckCheckSync({
      initial: { ...initial, userId: "b" },
      wsUrl: "wss://example.test",
    }),
  );
  const c = renderHook(() =>
    useTruckCheckSync({
      initial: { ...initial, userId: "c" },
      wsUrl: "wss://example.test",
    }),
  );
  act(() => a.result.current.edit("oxygen", true));
  await waitFor(() => expect(offlineA).toBe(true));
  act(() => b.result.current.edit("oxygen", "not-present"));
  await waitFor(() => expect(b.result.current.pending).toHaveLength(0));
  act(() => c.result.current.edit("tires", true));
  await waitFor(() => expect(c.result.current.pending).toHaveLength(0));
  offlineA = false;
  act(() => window.dispatchEvent(new Event("online")));
  await waitFor(() => {
    for (const client of [a, b, c]) {
      expect(client.result.current.pending).toHaveLength(0);
      expect(client.result.current.snapshot.revision).toBe(3);
      expect(client.result.current.values).toEqual({
        oxygen: "not-present",
        tires: true,
      });
    }
  });
  expect(accepted.size).toBe(3);
});

class ControlledSocket {
  static instances: ControlledSocket[] = [];
  readyState = 1;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  send = vi.fn();
  close = vi.fn();
  constructor(public url: URL) {
    ControlledSocket.instances.push(this);
  }
  message(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
}

it("performs another catch-up read if a notification arrives during an in-flight read", async () => {
  ControlledSocket.instances = [];
  vi.stubGlobal("WebSocket", ControlledSocket);
  let reads = 0;
  let finishRead: (response: Response) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url) => {
      if (url.includes("connect=1"))
        return Response.json({ snapshot: initial, accessToken: "token" });
      if (++reads === 1)
        return new Promise<Response>((resolve) => {
          finishRead = resolve;
        });
      return Response.json({
        snapshot: { ...initial, revision: 2, data: { oxygen: "not-present" } },
      });
    }),
  );
  const { result } = renderHook(() =>
    useTruckCheckSync({ initial, wsUrl: "wss://example.test" }),
  );
  await waitFor(() => expect(ControlledSocket.instances).toHaveLength(1));
  const socket = ControlledSocket.instances[0];
  act(() => {
    socket.onopen?.();
    socket.message({ type: "truck-check-joined", truckCheckId: "check" });
    socket.message({
      type: "field-update",
      truckCheckId: "check",
      revision: 2,
    });
  });
  await act(async () =>
    finishRead!(
      Response.json({
        snapshot: { ...initial, revision: 1, data: { oxygen: true } },
      }),
    ),
  );
  await waitFor(() => expect(result.current.snapshot.revision).toBe(2));
  expect(result.current.values.oxygen).toBe("not-present");
  expect(reads).toBe(2);
});

it("reconnects a half-open socket with fresh authentication and cancels all work on unmount", async () => {
  vi.useFakeTimers();
  ControlledSocket.instances = [];
  vi.stubGlobal("WebSocket", ControlledSocket);
  let token = 0;
  const fetcher = vi.fn(async () =>
    Response.json({ snapshot: initial, accessToken: `token-${++token}` }),
  );
  vi.stubGlobal("fetch", fetcher);
  const hook = renderHook(() =>
    useTruckCheckSync({ initial, wsUrl: "wss://example.test" }),
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  const first = ControlledSocket.instances[0];
  act(() => {
    first.onopen?.();
    first.message({ type: "truck-check-joined", truckCheckId: "check" });
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(65_000);
  });
  expect(first.close).toHaveBeenCalled();
  expect(ControlledSocket.instances.length).toBeGreaterThan(1);
  expect(
    ControlledSocket.instances[1].url.searchParams.get("access_token"),
  ).not.toBe(first.url.searchParams.get("access_token"));
  hook.unmount();
  const calls = fetcher.mock.calls.length;
  await vi.advanceTimersByTimeAsync(120_000);
  expect(fetcher).toHaveBeenCalledTimes(calls);
  vi.useRealTimers();
});

it("pauses on authentication failure and isolates pending work when the route's user changes", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, options) =>
      options.headers["X-Truck-Check-User"] === "a"
        ? Response.json(
            { code: "unauthorized", error: "Sign in" },
            { status: 401 },
          )
        : Response.json({
            snapshot: { ...initial, userId: "b" },
            accessToken: "token",
          }),
    ),
  );
  const { result, rerender } = renderHook(
    ({ userId }) =>
      useTruckCheckSync({
        initial: { ...initial, userId },
        wsUrl: "wss://example.test",
      }),
    { initialProps: { userId: "a" } },
  );
  act(() => result.current.edit("oxygen", true));
  await waitFor(() => expect(result.current.authRequired).toBe(true));
  const oldEdit = result.current.edit;
  expect(result.current.pending).toHaveLength(1);
  rerender({ userId: "b" });
  act(() => oldEdit("oxygen", "not-present"));
  await waitFor(() => expect(result.current.snapshot.userId).toBe("b"));
  expect(result.current.pending).toHaveLength(0);
  expect(localStorage.length).toBe(1);
});

it("keeps late photo references for review when the check locks during upload", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({ snapshot: { ...initial, revision: 1, locked: true } }),
    ),
  );
  const { result } = renderHook(() =>
    useTruckCheckSync({ initial, wsUrl: "wss://example.test" }),
  );
  await waitFor(() => expect(result.current.snapshot.locked).toBe(true));
  act(() =>
    result.current.addPhoto(
      "photos",
      "https://example.test/files/truck-check-images/photo.jpg",
      3,
    ),
  );
  expect(result.current.pending[0].rejected).toBeTruthy();
  expect(result.current.values.photos).toBeUndefined();
});

it("waits for acknowledgment and a fresh snapshot before allowing a lock", async () => {
  let completeSave: (response: Response) => void;
  let sent: any;
  let saved = initial;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, options) => {
      if (options.method === "POST") {
        sent = JSON.parse(options.body);
        return new Promise<Response>((resolve) => {
          completeSave = resolve;
        });
      }
      return Response.json({ snapshot: saved, accessToken: "token" });
    }),
  );
  const { result } = renderHook(() =>
    useTruckCheckSync({ initial, wsUrl: "wss://example.test" }),
  );
  act(() => result.current.edit("oxygen", true));
  await waitFor(() => expect(sent).toBeDefined());
  let preparation: Promise<boolean>;
  act(() => {
    preparation = result.current.prepareLock();
  });
  expect(result.current.preparing).toBe(true);
  act(() => result.current.edit("tires", true));
  expect(result.current.pending).toHaveLength(1);
  saved = { ...initial, revision: 1, data: { oxygen: true } };
  await act(async () => {
    completeSave!(Response.json({ snapshot: saved, acknowledged: sent }));
    expect(await preparation!).toBe(true);
  });
  expect(result.current.pending).toHaveLength(0);
});

it("does not let a rejected old value overlay a later saved correction", async () => {
  let saved = initial;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, options) => {
      if (options.method === "POST") {
        const m = JSON.parse(options.body);
        if (m.value === "bad")
          return Response.json(
            { code: "invalid", error: "Invalid value" },
            { status: 422 },
          );
        saved = { ...initial, revision: 1, data: { notes: m.value } };
        return Response.json({ snapshot: saved, acknowledged: m });
      }
      return Response.json({ snapshot: saved, accessToken: "token" });
    }),
  );
  const { result } = renderHook(() =>
    useTruckCheckSync({ initial, wsUrl: "wss://example.test" }),
  );
  act(() => result.current.edit("notes", "bad"));
  await waitFor(() => expect(result.current.pending[0].rejected).toBeTruthy());
  act(() => result.current.edit("notes", "corrected"));
  await waitFor(() => expect(result.current.snapshot.revision).toBe(1));
  expect(result.current.values.notes).toBe("corrected");
  expect(result.current.pending).toHaveLength(1);
});
