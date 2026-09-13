import { isFieldMutation, type FieldMutation } from "./sync-protocol";

export interface PendingMutation extends FieldMutation {
  version: 1;
  createdAt: number;
  rejected?: string;
}

export class SyncOutbox {
  readonly prefix: string;
  readonly clientId = crypto.randomUUID();
  error: string | null = null;
  private sequence = 0;
  private memory = new Map<string, PendingMutation>();
  private lastCreatedAt = Date.now();

  constructor(
    userId: string,
    checkId: string,
    private storage: Storage | null,
  ) {
    this.prefix = `truck-check-outbox:v1:${encodeURIComponent(userId)}:${encodeURIComponent(checkId)}:`;
  }

  private key(mutation: FieldMutation) {
    return `${this.prefix}${mutation.clientId}:${mutation.sequence}`;
  }

  list(): PendingMutation[] {
    const records = new Map<string, PendingMutation>();
    try {
      if (!this.storage) throw new Error("Storage unavailable");
      for (let i = 0; i < this.storage.length; i++) {
        const key = this.storage.key(i);
        if (!key?.startsWith(this.prefix)) continue;
        try {
          const record = JSON.parse(
            this.storage.getItem(key) || "null",
          ) as PendingMutation;
          if (
            !isFieldMutation(record) ||
            record.version !== 1 ||
            !Number.isFinite(record.createdAt) ||
            key !== this.key(record)
          )
            throw new Error("Invalid record");
          records.set(key, record);
        } catch {
          this.error =
            "Some saved-on-device changes could not be read. Do not clear browser storage.";
        }
      }
    } catch {
      this.error =
        "Device storage is unavailable. Keep this page open until changes are saved to the server.";
    }
    for (const [key, value] of this.memory) records.set(key, value);
    return [...records.values()].sort((a, b) =>
      a.clientId === b.clientId
        ? a.sequence - b.sequence
        : a.createdAt - b.createdAt || a.clientId.localeCompare(b.clientId),
    );
  }

  enqueue(fieldId: string, value: unknown): PendingMutation {
    this.lastCreatedAt = Math.max(
      Date.now(),
      this.lastCreatedAt + 1,
      ...this.list().map((m) => m.createdAt + 1),
    );
    const record: PendingMutation = {
      version: 1,
      clientId: this.clientId,
      sequence: ++this.sequence,
      createdAt: this.lastCreatedAt,
      fieldId,
      value,
    };
    this.persist(record);
    return record;
  }

  private persist(record: PendingMutation) {
    const key = this.key(record);
    try {
      if (!this.storage) throw new Error("Storage unavailable");
      this.storage.setItem(key, JSON.stringify(record));
      this.memory.delete(key);
    } catch {
      this.memory.set(key, record);
      this.error =
        "Changes could not be saved on this device. Keep this page open until the server confirms saving.";
    }
  }

  acknowledge(record: FieldMutation) {
    const key = this.key(record);
    try {
      this.storage?.removeItem(key);
    } catch {
      this.error =
        "Device storage is unavailable. A saved change may need to be checked again.";
    }
    this.memory.delete(key);
  }

  reject(record: PendingMutation, reason: string) {
    this.persist({ ...record, rejected: reason });
  }
}
