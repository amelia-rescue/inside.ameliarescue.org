export interface FieldMutation {
  clientId: string;
  sequence: number;
  fieldId: string;
  value: unknown;
}

export interface CheckSnapshot {
  id: string;
  userId: string;
  revision: number;
  data: Record<string, unknown>;
  contributors: Record<string, { first_name: string; last_name: string }>;
  locked: boolean;
}

export interface SyncResponse {
  snapshot?: CheckSnapshot;
  acknowledged?: { clientId: string; sequence: number };
  duplicate?: boolean;
  accessToken?: string;
  error?: string;
  code?: "unauthorized" | "invalid" | "locked" | "missing" | "retry";
}

export function isFieldMutation(value: unknown): value is FieldMutation {
  if (!value || typeof value !== "object") return false;
  const m = value as FieldMutation;
  return (
    typeof m.clientId === "string" &&
    /^[a-zA-Z0-9-]{1,80}$/.test(m.clientId) &&
    Number.isSafeInteger(m.sequence) &&
    m.sequence > 0 &&
    typeof m.fieldId === "string" &&
    m.fieldId.length > 0 &&
    m.fieldId.length <= 512 &&
    Object.prototype.hasOwnProperty.call(m, "value") &&
    m.value !== undefined
  );
}

export function isCheckSnapshot(value: unknown): value is CheckSnapshot {
  if (!value || typeof value !== "object") return false;
  const s = value as CheckSnapshot;
  return (
    typeof s.id === "string" &&
    typeof s.userId === "string" &&
    Number.isSafeInteger(s.revision) &&
    s.revision >= 0 &&
    typeof s.locked === "boolean" &&
    !!s.data &&
    typeof s.data === "object" &&
    !Array.isArray(s.data) &&
    !!s.contributors &&
    typeof s.contributors === "object" &&
    !Array.isArray(s.contributors)
  );
}
