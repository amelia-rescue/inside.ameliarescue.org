import { useCallback, useEffect, useRef, useState } from "react";
import { SyncOutbox, type PendingMutation } from "./sync-outbox";
import {
  isCheckSnapshot,
  type CheckSnapshot,
  type SyncResponse,
} from "./sync-protocol";

type LiveStatus = "connecting" | "connected" | "disconnected";
interface SyncState {
  snapshot: CheckSnapshot;
  pending: PendingMutation[];
  ready: boolean;
  reachable: boolean;
  live: LiveStatus;
  error: string | null;
  storageError: string | null;
  authRequired: boolean;
  missing: boolean;
  preparing: boolean;
}
interface Runtime {
  id: string;
  userId: string;
  edit: (fieldId: string, value: unknown) => void;
  retry: () => void;
  accept: (snapshot: CheckSnapshot) => void;
  prepareLock: () => Promise<boolean>;
  dismiss: (record: PendingMutation) => void;
  getValue: (fieldId: string) => unknown;
  addPhoto: (fieldId: string, url: string, maxPhotos?: number) => void;
}
const initialState = (snapshot: CheckSnapshot): SyncState => ({
  snapshot,
  pending: [],
  ready: false,
  reachable: false,
  live: "connecting",
  error: null,
  storageError: null,
  authRequired: false,
  missing: false,
  preparing: false,
});
class SyncFailure extends Error {
  constructor(
    readonly status: number,
    readonly payload: SyncResponse,
  ) {
    super(payload.error || "Unable to sync. Retrying automatically.");
  }
}

export function useTruckCheckSync({
  initial,
  wsUrl,
  onEvent,
}: {
  initial: CheckSnapshot;
  wsUrl: string;
  onEvent?: (event: any) => void;
}) {
  const [state, setState] = useState(() => initialState(initial));
  const runtime = useRef<Runtime | null>(null);
  const eventRef = useRef(onEvent);
  eventRef.current = onEvent;

  useEffect(() => {
    let storage: Storage | null = null;
    try {
      storage = window.localStorage;
    } catch {}
    const outbox = new SyncOutbox(initial.userId, initial.id, storage);
    let current = initialState(initial);
    let stopped = false;
    let socket: WebSocket | null = null;
    let generation = 0;
    let connecting = false;
    let lastPong = Date.now();
    let retryAttempt = 0;
    let readAttempt = 0;
    let socketAttempt = 0;
    let writePromise: Promise<void> | null = null;
    let writeAgain = false;
    let readPromise: Promise<boolean> | null = null;
    let readAgain = false;
    let saveTimer: ReturnType<typeof setTimeout> | undefined;
    let socketTimer: ReturnType<typeof setTimeout> | undefined;
    let readTimer: ReturnType<typeof setTimeout> | undefined;
    let pollTimer: ReturnType<typeof setTimeout> | undefined;
    let heartbeatTimer: ReturnType<typeof setTimeout> | undefined;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const requests = new Set<AbortController>();
    const endpoint = `/api/truck-checks/${encodeURIComponent(initial.id)}/sync`;
    const visible = () => document.visibilityState !== "hidden";
    const later = (fn: () => void, ms: number) => {
      const timer = setTimeout(() => {
        timers.delete(timer);
        if (!stopped) fn();
      }, ms);
      timers.add(timer);
      return timer;
    };
    const cancel = (timer: ReturnType<typeof setTimeout> | undefined) => {
      if (timer) {
        clearTimeout(timer);
        timers.delete(timer);
      }
    };
    const backoff = (attempt: number) =>
      Math.min(30_000, 1000 * 2 ** Math.min(attempt, 5)) *
      (0.75 + Math.random() * 0.5);
    const emit = () => {
      if (stopped) return;
      current = {
        ...current,
        pending: outbox.list(),
        storageError: outbox.error,
      };
      setState(current);
    };
    const values = () =>
      current.snapshot.locked || current.missing
        ? current.snapshot.data
        : {
            ...current.snapshot.data,
            ...Object.fromEntries(
              outbox
                .list()
                .filter((m) => !m.rejected)
                .map((m) => [m.fieldId, m.value]),
            ),
          };
    const closeSocket = () => {
      generation++;
      connecting = false;
      cancel(socketTimer);
      cancel(heartbeatTimer);
      if (socket) {
        socket.onopen = null;
        socket.onmessage = null;
        socket.onclose = null;
        socket.onerror = null;
        socket.close();
        socket = null;
      }
      current = { ...current, live: "disconnected" };
    };
    const accept = (snapshot: CheckSnapshot) => {
      if (
        !isCheckSnapshot(snapshot) ||
        snapshot.id !== initial.id ||
        snapshot.userId !== initial.userId
      )
        throw new SyncFailure(401, {
          code: "unauthorized",
          error:
            "Your signed-in account changed. Sign in as the original user to save these edits.",
        });
      if (snapshot.revision < current.snapshot.revision) return;
      current = {
        ...current,
        snapshot,
        preparing: snapshot.locked ? false : current.preparing,
      };
      if (snapshot.locked) closeSocket();
    };
    const request = async (body?: PendingMutation, bootstrap = false) => {
      const controller = new AbortController();
      requests.add(controller);
      const timer = later(() => controller.abort(), 12_000);
      try {
        const response = await fetch(
          endpoint + (bootstrap ? "?connect=1" : ""),
          {
            method: body ? "POST" : "GET",
            credentials: "same-origin",
            cache: "no-store",
            redirect: "error",
            headers: {
              Accept: "application/json",
              "X-Truck-Check-User": initial.userId,
              ...(body ? { "Content-Type": "application/json" } : {}),
            },
            ...(body
              ? {
                  body: JSON.stringify({
                    clientId: body.clientId,
                    sequence: body.sequence,
                    fieldId: body.fieldId,
                    value: body.value,
                  }),
                }
              : {}),
            signal: controller.signal,
          },
        );
        if (stopped) throw new Error("Disposed");
        const payload = (await response.json()) as SyncResponse;
        if (stopped) throw new Error("Disposed");
        if (payload.snapshot) accept(payload.snapshot);
        if (!response.ok) throw new SyncFailure(response.status, payload);
        if (!payload.snapshot)
          throw new Error("Missing synchronization snapshot");
        current = { ...current, reachable: true, error: null };
        return payload;
      } finally {
        cancel(timer);
        requests.delete(controller);
      }
    };
    const failed = (error: unknown) => {
      if (stopped) return;
      if (error instanceof SyncFailure && error.status === 401) {
        current = { ...current, authRequired: true, error: error.message };
        closeSocket();
      } else if (
        error instanceof SyncFailure &&
        error.payload.code === "missing"
      ) {
        current = {
          ...current,
          missing: true,
          error: error.message,
          preparing: false,
        };
        closeSocket();
      } else {
        current = {
          ...current,
          reachable: false,
          error:
            error instanceof Error
              ? error.message
              : "Unable to sync. Retrying automatically.",
        };
      }
      emit();
    };
    const flush = (): Promise<void> => {
      if (writePromise) {
        writeAgain = true;
        return writePromise;
      }
      writeAgain = false;
      cancel(saveTimer);
      saveTimer = undefined;
      writePromise = (async () => {
        while (!stopped && !current.authRequired && !current.missing) {
          const record = outbox.list().find((m) => !m.rejected);
          if (!record) break;
          try {
            const payload = await request(record);
            if (
              payload.acknowledged?.clientId !== record.clientId ||
              payload.acknowledged.sequence !== record.sequence
            )
              throw new Error(
                "Save was not acknowledged. Retrying automatically.",
              );
            outbox.acknowledge(record);
            retryAttempt = 0;
            emit();
            if (
              outbox
                .list()
                .some(
                  (m) =>
                    m.clientId === record.clientId &&
                    m.sequence === record.sequence,
                )
            )
              break;
          } catch (error) {
            if (stopped) break;
            if (
              error instanceof SyncFailure &&
              (error.payload.code === "invalid" ||
                error.payload.code === "locked")
            ) {
              outbox.reject(record, error.message);
              current = { ...current, error: error.message };
              emit();
              continue;
            }
            failed(error);
            if (!current.authRequired && !current.missing)
              saveTimer = later(() => {
                void flush();
              }, backoff(retryAttempt++));
            break;
          }
        }
      })().finally(() => {
        writePromise = null;
        if (writeAgain && !saveTimer && !stopped) void flush();
      });
      return writePromise;
    };
    const reconcile = (): Promise<boolean> => {
      if (readPromise) {
        readAgain = true;
        return readPromise;
      }
      if (stopped || current.authRequired || current.missing)
        return Promise.resolve(false);
      readPromise = (async () => {
        do {
          readAgain = false;
          try {
            await request();
            readAttempt = 0;
            emit();
          } catch (error) {
            readAttempt++;
            failed(error);
            return false;
          }
        } while (
          readAgain &&
          !stopped &&
          !current.authRequired &&
          !current.missing
        );
        return true;
      })().finally(() => {
        readPromise = null;
        if (readAgain && !stopped && !readAttempt) {
          readAgain = false;
          signalRead();
        }
      });
      return readPromise;
    };
    const signalRead = () => {
      if (readPromise) {
        readAgain = true;
        return;
      }
      if (readTimer) return;
      readTimer = later(() => {
        readTimer = undefined;
        void reconcile();
      }, 100);
    };
    const scheduleReconnect = () => {
      closeSocket();
      emit();
      if (
        !current.snapshot.locked &&
        !current.missing &&
        !current.authRequired &&
        visible()
      ) {
        socketTimer = later(() => {
          void connect();
        }, backoff(socketAttempt++));
      }
    };
    const heartbeat = (activeGeneration: number) => {
      if (stopped || activeGeneration !== generation || !socket) return;
      if (Date.now() - lastPong > 45_000) {
        scheduleReconnect();
        return;
      }
      try {
        socket.send(JSON.stringify({ action: "ping" }));
      } catch {
        scheduleReconnect();
        return;
      }
      heartbeatTimer = later(() => heartbeat(activeGeneration), 15_000);
    };
    const connect = async () => {
      if (
        stopped ||
        connecting ||
        socket ||
        current.snapshot.locked ||
        current.authRequired ||
        current.missing ||
        !visible()
      )
        return;
      connecting = true;
      const activeGeneration = ++generation;
      current = { ...current, live: "connecting" };
      emit();
      try {
        const payload = await request(undefined, true);
        if (
          stopped ||
          activeGeneration !== generation ||
          current.snapshot.locked
        )
          return;
        if (!payload.accessToken)
          throw new Error("Unable to authenticate live updates");
        const url = new URL(wsUrl);
        url.searchParams.set("access_token", payload.accessToken);
        const ws = new WebSocket(url);
        socket = ws;
        const active = () => !stopped && activeGeneration === generation;
        socketTimer = later(() => {
          if (active()) scheduleReconnect();
        }, 12_000);
        ws.onopen = () => {
          if (!active()) return;
          ws.send(
            JSON.stringify({
              action: "join-truck-check",
              truckCheckId: initial.id,
            }),
          );
        };
        ws.onmessage = (event) => {
          if (!active()) return;
          try {
            const message = JSON.parse(event.data);
            if (message.truckCheckId && message.truckCheckId !== initial.id)
              return;
            if (message.type === "pong") {
              lastPong = Date.now();
              return;
            }
            if (message.type === "sync-error") {
              scheduleReconnect();
              return;
            }
            if (message.type === "truck-check-joined") {
              cancel(socketTimer);
              connecting = false;
              socketAttempt = 0;
              lastPong = Date.now();
              current = { ...current, live: "connected" };
              heartbeatTimer = later(() => heartbeat(activeGeneration), 15_000);
              void flush();
            }
            if (
              [
                "truck-check-joined",
                "field-update",
                "contributors-updated",
                "truck-check-locked",
              ].includes(message.type)
            )
              signalRead();
            eventRef.current?.(message);
            emit();
          } catch {
            signalRead();
          }
        };
        ws.onerror = ws.onclose = () => {
          if (active()) scheduleReconnect();
        };
      } catch (error) {
        if (stopped || activeGeneration !== generation) return;
        if (
          error instanceof SyncFailure &&
          (error.status === 401 || error.payload.code === "missing")
        )
          failed(error);
        scheduleReconnect();
      }
    };
    const poll = async () => {
      if (
        visible() &&
        !current.authRequired &&
        !current.missing &&
        !current.snapshot.locked
      )
        await reconcile();
      if (stopped) return;
      pollTimer = later(
        () => {
          void poll();
        },
        readAttempt
          ? backoff(readAttempt)
          : current.live === "connected"
            ? 15_000
            : 5000,
      );
    };
    const resume = () => {
      if (!visible()) {
        closeSocket();
        emit();
        return;
      }
      if (current.authRequired || current.missing) return;
      closeSocket();
      void connect();
      void reconcile();
      void flush();
    };
    const retry = () => {
      current = { ...current, authRequired: false, error: null };
      resume();
    };
    const storageChanged = (event: StorageEvent) => {
      if (event.key === null || event.key.startsWith(outbox.prefix)) {
        emit();
        signalRead();
        void flush();
      }
    };
    const offline = () => {
      closeSocket();
      current = { ...current, reachable: false };
      emit();
    };
    runtime.current = {
      id: initial.id,
      userId: initial.userId,
      edit(fieldId, value) {
        if (
          stopped ||
          current.snapshot.locked ||
          current.missing ||
          current.preparing
        )
          return;
        outbox.enqueue(fieldId, value);
        emit();
        void flush();
      },
      retry,
      accept(snapshot) {
        accept(snapshot);
        emit();
      },
      getValue: (fieldId) => values()[fieldId],
      addPhoto(fieldId, url, maxPhotos) {
        if (stopped) return;
        const value = values()[fieldId];
        const urls = Array.isArray(value)
          ? value.filter((v): v is string => typeof v === "string")
          : typeof value === "string"
            ? [value]
            : [];
        const updated = [...new Set([...urls, url])];
        const record = outbox.enqueue(fieldId, updated);
        if (
          current.snapshot.locked ||
          current.missing ||
          updated.length > (maxPhotos ?? 30)
        )
          outbox.reject(
            record,
            "Photo uploaded, but its reference could not be saved because the check is closed or the photo limit was reached.",
          );
        emit();
        void flush();
      },
      dismiss(record) {
        outbox.acknowledge(record);
        emit();
      },
      async prepareLock() {
        current = { ...current, preparing: true };
        emit();
        await flush();
        const fresh = await reconcile();
        const ready =
          !stopped &&
          fresh &&
          !current.snapshot.locked &&
          !current.missing &&
          !current.authRequired &&
          outbox.list().length === 0 &&
          !outbox.error;
        if (!ready) {
          current = {
            ...current,
            preparing: false,
            error:
              "Resolve pending changes and reconnect before locking this check.",
          };
          emit();
        }
        return ready;
      },
    };
    current = { ...current, ready: true };
    emit();
    void connect();
    void flush();
    void poll();
    window.addEventListener("online", resume);
    window.addEventListener("offline", offline);
    window.addEventListener("focus", resume);
    window.addEventListener("pageshow", resume);
    window.addEventListener("storage", storageChanged);
    document.addEventListener("visibilitychange", resume);
    return () => {
      stopped = true;
      closeSocket();
      for (const timer of timers) clearTimeout(timer);
      for (const controller of requests) controller.abort();
      window.removeEventListener("online", resume);
      window.removeEventListener("offline", offline);
      window.removeEventListener("focus", resume);
      window.removeEventListener("pageshow", resume);
      window.removeEventListener("storage", storageChanged);
      document.removeEventListener("visibilitychange", resume);
      runtime.current = null;
    };
  }, [initial.id, initial.userId, wsUrl]);

  useEffect(() => {
    runtime.current?.accept(initial);
  }, [initial.id, initial.userId, initial.revision, initial.locked]);
  const edit = useCallback(
    (fieldId: string, value: unknown) => {
      if (
        runtime.current?.id === initial.id &&
        runtime.current.userId === initial.userId
      )
        runtime.current.edit(fieldId, value);
    },
    [initial.id, initial.userId],
  );
  const addPhoto = useCallback(
    (fieldId: string, url: string, maxPhotos?: number) => {
      if (
        runtime.current?.id === initial.id &&
        runtime.current.userId === initial.userId
      )
        runtime.current.addPhoto(fieldId, url, maxPhotos);
    },
    [initial.id, initial.userId],
  );
  const retry = useCallback(() => runtime.current?.retry(), []);
  const getValue = useCallback(
    (fieldId: string) => runtime.current?.getValue(fieldId),
    [],
  );
  const prepareLock = useCallback(
    () => runtime.current?.prepareLock() ?? Promise.resolve(false),
    [],
  );
  const dismiss = useCallback(
    (record: PendingMutation) => runtime.current?.dismiss(record),
    [],
  );
  const scoped =
    state.snapshot.id === initial.id && state.snapshot.userId === initial.userId
      ? state
      : initialState(initial);
  const values =
    scoped.snapshot.locked || scoped.missing
      ? scoped.snapshot.data
      : {
          ...scoped.snapshot.data,
          ...Object.fromEntries(
            scoped.pending
              .filter((m) => !m.rejected)
              .map((m) => [m.fieldId, m.value]),
          ),
        };
  return {
    ...scoped,
    values,
    edit,
    addPhoto,
    retry,
    getValue,
    prepareLock,
    dismiss,
  };
}
