import { useEffect, useState, useRef, useCallback } from "react";
import { appContext } from "~/context";
import type { Route } from "./+types/truck-check-dynamic";
import { useLoaderData } from "react-router";
import {
  truckCheckSchema,
  TruckCheckStore,
} from "~/lib/truck-check/truck-check-store";
import { TruckCheckSchemaStore } from "~/lib/truck-check/truck-check-schema-store";
import {
  HiOutlineUsers,
  HiOutlineExclamationTriangle,
  HiOutlineUser,
  HiOutlineLockClosed,
  HiOutlineSignal,
  HiOutlineSignalSlash,
  HiOutlineChevronLeft,
} from "react-icons/hi2";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Truck Check - Inside Amelia Rescue" }];
}

export async function loader({ context, params }: Route.LoaderArgs) {
  const ctx = context.get(appContext);
  if (!ctx) {
    throw new Error("Context not found");
  }

  const truckCheckStore = TruckCheckStore.make();
  const truckCheckSchemaStore = TruckCheckSchemaStore.make();

  const truckCheck = await truckCheckStore.getTruckCheck(params.id);
  const truck = await truckCheckSchemaStore.getTruck(truckCheck.truck);
  const schema =
    truckCheck.schema_id && truckCheck.schema_created_at
      ? await truckCheckSchemaStore.getSchemaVersion(
          truckCheck.schema_id,
          truckCheck.schema_created_at,
        )
      : await truckCheckSchemaStore.getSchema(truck.schemaId);

  return {
    user: ctx.user,
    accessToken: ctx.user.accessToken,
    truckCheck,
    truck,
    schema,
  };
}

type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";

interface ConnectedUser {
  userId: string;
  userName: string;
}

function getFieldId(sectionId: string, fieldLabel: string): string {
  return `${sectionId}-${fieldLabel.replace(/\s+/g, "-").toLowerCase()}`;
}

export default function TruckCheckDynamic() {
  const { user, accessToken, truckCheck, truck, schema } =
    useLoaderData<typeof loader>();

  const isLocked = truckCheck.locked;

  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(
    isLocked ? "disconnected" : "connecting",
  );
  const [connectedUsers, setConnectedUsers] = useState<ConnectedUser[]>([]);
  const [contributors, setContributors] = useState<ConnectedUser[]>([]);
  const [fieldValues, setFieldValues] = useState<Record<string, any>>(
    truckCheck.data || {},
  );
  const [lastUpdate, setLastUpdate] = useState<{
    fieldId: string;
    userName: string;
  } | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const wsUrl =
    import.meta.env?.VITE_WEBSOCKET_URL ||
    "wss://svzzsce7u8.execute-api.us-east-2.amazonaws.com/prod";

  if (typeof wsUrl !== "string") {
    throw new Error("websocket url not defined correctly");
  }

  const sendMessage = useCallback((message: Record<string, any>) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  const handleFieldChange = useCallback(
    (fieldId: string, value: any) => {
      setFieldValues((prev) => ({ ...prev, [fieldId]: value }));
      sendMessage({
        action: "update-field",
        truckCheckId: truckCheck.id,
        fieldId,
        value,
      });
    },
    [sendMessage, truckCheck.id],
  );

  const connectWebSocket = useCallback(() => {
    const url = new URL(wsUrl);
    url.searchParams.set("access_token", accessToken);

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("WebSocket connected");
        setConnectionStatus("connected");
        ws.send(
          JSON.stringify({
            action: "join-truck-check",
            truckCheckId: truckCheck.id,
          }),
        );
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          switch (data.type) {
            case "truck-check-joined":
              setFieldValues((prev) => ({ ...prev, ...data.truckCheckData }));
              setConnectedUsers(data.connectedUsers || []);
              setContributors(data.contributors || []);
              break;

            case "user-joined":
              setConnectedUsers(data.connectedUsers || []);
              setContributors(data.contributors || []);
              break;

            case "user-left":
              setConnectedUsers(data.connectedUsers || []);
              break;

            case "field-update":
              setFieldValues((prev) => ({
                ...prev,
                [data.fieldId]: data.value,
              }));
              setLastUpdate({
                fieldId: data.fieldId,
                userName: data.updatedByName,
              });
              if (lastUpdateTimeoutRef.current) {
                clearTimeout(lastUpdateTimeoutRef.current);
              }
              lastUpdateTimeoutRef.current = setTimeout(() => {
                setLastUpdate(null);
              }, 3000);
              break;
          }
        } catch (error) {
          console.error("Error parsing WebSocket message:", error);
        }
      };

      ws.onerror = (error) => {
        console.error("WebSocket error:", error);
        setConnectionStatus("error");
      };

      ws.onclose = () => {
        console.log("WebSocket disconnected");
        setConnectionStatus("disconnected");
        reconnectTimeoutRef.current = setTimeout(() => {
          console.log("Attempting to reconnect...");
          connectWebSocket();
        }, 3000);
      };
    } catch (error) {
      console.error("Error creating WebSocket:", error);
      setConnectionStatus("error");
    }
  }, [wsUrl, accessToken, truckCheck.id]);

  useEffect(() => {
    if (isLocked) return;

    connectWebSocket();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (lastUpdateTimeoutRef.current) {
        clearTimeout(lastUpdateTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const statusConfig = {
    connected: {
      color: "bg-green-500",
      text: "Connected",
      pulse: false,
    },
    connecting: {
      color: "bg-yellow-500",
      text: "Connecting...",
      pulse: true,
    },
    disconnected: {
      color: "bg-orange-500",
      text: "Reconnecting...",
      pulse: true,
    },
    error: {
      color: "bg-red-500",
      text: "Connection Error",
      pulse: false,
    },
  };

  const status = statusConfig[connectionStatus];

  const getInitials = (name: string) =>
    name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

  const renderField = (field: any, sectionId: string) => {
    const fieldId = getFieldId(sectionId, field.label);
    const value = fieldValues[fieldId];
    const isRemoteUpdate = lastUpdate?.fieldId === fieldId;
    const isLocked = truckCheck.locked;

    switch (field.type) {
      case "checkbox":
        return (
          <div
            key={fieldId}
            className={`form-control rounded-lg p-2 transition-all duration-500 ${isRemoteUpdate ? "bg-info/10 ring-info/30 ring-1" : ""}`}
          >
            <label className="label cursor-pointer justify-start gap-3">
              <input
                type="checkbox"
                className="checkbox"
                checked={!!value}
                disabled={isLocked}
                onChange={(e) => handleFieldChange(fieldId, e.target.checked)}
              />
              <span className="label-text">{field.label}</span>
              {field.required && <span className="text-error">*</span>}
            </label>
            {isRemoteUpdate && (
              <span className="label-text-alt text-info ml-9 text-xs italic">
                Updated by {lastUpdate.userName}
              </span>
            )}
            {field.helpText && (
              <span className="label-text-alt ml-9 opacity-60">
                {field.helpText}
              </span>
            )}
          </div>
        );

      case "text":
        return (
          <div
            key={fieldId}
            className={`form-control rounded-lg p-2 transition-all duration-500 ${isRemoteUpdate ? "bg-info/10 ring-info/30 ring-1" : ""}`}
          >
            <label className="label">
              <span className="label-text">
                {field.label}
                {field.required && <span className="text-error ml-1">*</span>}
              </span>
              {isRemoteUpdate && (
                <span className="label-text-alt text-info text-xs italic">
                  Updated by {lastUpdate.userName}
                </span>
              )}
            </label>
            <input
              type="text"
              placeholder={field.placeholder}
              maxLength={field.maxLength}
              className="input input-bordered w-full"
              value={value || ""}
              disabled={isLocked}
              onChange={(e) => handleFieldChange(fieldId, e.target.value)}
            />
            {field.helpText && (
              <label className="label">
                <span className="label-text-alt opacity-60">
                  {field.helpText}
                </span>
              </label>
            )}
          </div>
        );

      case "number":
        return (
          <div
            key={fieldId}
            className={`form-control rounded-lg p-2 transition-all duration-500 ${isRemoteUpdate ? "bg-info/10 ring-info/30 ring-1" : ""}`}
          >
            <label className="label">
              <span className="label-text">
                {field.label}
                {field.required && <span className="text-error ml-1">*</span>}
              </span>
              {isRemoteUpdate && (
                <span className="label-text-alt text-info text-xs italic">
                  Updated by {lastUpdate.userName}
                </span>
              )}
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={field.min}
                max={field.max}
                className="input input-bordered w-full flex-1"
                value={value ?? ""}
                disabled={isLocked}
                onChange={(e) =>
                  handleFieldChange(
                    fieldId,
                    e.target.value === "" ? null : Number(e.target.value),
                  )
                }
              />
              {field.unit && (
                <span className="text-sm font-medium opacity-60">
                  {field.unit}
                </span>
              )}
            </div>
            {field.helpText && (
              <label className="label">
                <span className="label-text-alt opacity-60">
                  {field.helpText}
                </span>
              </label>
            )}
          </div>
        );

      case "select":
        return (
          <div
            key={fieldId}
            className={`form-control rounded-lg p-2 transition-all duration-500 ${isRemoteUpdate ? "bg-info/10 ring-info/30 ring-1" : ""}`}
          >
            <label className="label">
              <span className="label-text">
                {field.label}
                {field.required && <span className="text-error ml-1">*</span>}
              </span>
              {isRemoteUpdate && (
                <span className="label-text-alt text-info text-xs italic">
                  Updated by {lastUpdate.userName}
                </span>
              )}
            </label>
            <select
              className="select select-bordered w-full"
              value={value || ""}
              disabled={isLocked}
              onChange={(e) => handleFieldChange(fieldId, e.target.value)}
            >
              <option value="">Select...</option>
              {field.options?.map((opt: any) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {field.helpText && (
              <label className="label">
                <span className="label-text-alt opacity-60">
                  {field.helpText}
                </span>
              </label>
            )}
          </div>
        );

      case "photo":
        return (
          <div key={fieldId} className="form-control rounded-lg p-2">
            <label className="label">
              <span className="label-text">
                {field.label}
                {field.required && <span className="text-error ml-1">*</span>}
              </span>
            </label>
            <input
              type="file"
              accept="image/*"
              multiple
              className="file-input file-input-bordered w-full"
              disabled={isLocked}
            />
            {field.maxPhotos && (
              <label className="label">
                <span className="label-text-alt opacity-60">
                  Max {field.maxPhotos} photos
                </span>
              </label>
            )}
            {field.helpText && (
              <label className="label">
                <span className="label-text-alt opacity-60">
                  {field.helpText}
                </span>
              </label>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  const otherConnectedUsers = connectedUsers.filter(
    (u) => u.userId !== user.user_id,
  );

  return (
    <div className="container mx-auto max-w-4xl px-4 pt-8 pb-24">
      {/* Breadcrumb */}
      <div className="mb-4">
        <a
          href="/truck-check"
          className="link link-hover inline-flex items-center gap-1 text-sm opacity-70"
        >
          <HiOutlineChevronLeft className="h-4 w-4" />
          Back to Truck Checks
        </a>
      </div>

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold">{truck.displayName}</h1>
            <p className="mt-1 text-sm opacity-70">
              schema {truckCheck.schema_id}
              {truckCheck.schema_created_at}
            </p>
            <p className="mt-1 text-sm opacity-70">
              {" "}
              {new Date(truckCheck.created_at).toLocaleDateString(undefined, {
                weekday: "short",
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </p>
          </div>
          {!isLocked && (
            <div
              className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium ${
                connectionStatus === "connected"
                  ? "bg-success/10 text-success"
                  : connectionStatus === "error"
                    ? "bg-error/10 text-error"
                    : "bg-warning/10 text-warning"
              }`}
            >
              <span className="relative flex h-3 w-3">
                {status.pulse && (
                  <span
                    className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${status.color}`}
                  />
                )}
                <span
                  className={`relative inline-flex h-3 w-3 rounded-full ${status.color}`}
                />
              </span>
              {connectionStatus === "connected" ? (
                <HiOutlineSignal className="h-4 w-4" />
              ) : (
                <HiOutlineSignalSlash className="h-4 w-4" />
              )}
              {status.text}
            </div>
          )}
        </div>
        <div className="mt-3 flex items-center gap-2 text-sm">
          <span
            className={`badge gap-1 ${truckCheck.locked ? "badge-error" : "badge-success"}`}
          >
            {truckCheck.locked && (
              <HiOutlineLockClosed className="h-3.5 w-3.5" />
            )}
            {truckCheck.locked ? "Locked" : "Active"}
          </span>
        </div>
      </div>

      {/* Locked Banner */}
      {isLocked && (
        <div className="alert mb-6">
          <HiOutlineLockClosed className="h-6 w-6 shrink-0" />
          <span>
            This truck check is locked and is view-only. Truck checks are
            automatically locked 24 hours after creation.
          </span>
        </div>
      )}

      {/* Connected Users Banner */}
      {!isLocked && otherConnectedUsers.length > 0 && (
        <div className="alert alert-info mb-6">
          <div className="flex items-center gap-3">
            <div className="flex -space-x-2">
              {otherConnectedUsers.slice(0, 5).map((u) => (
                <div
                  key={u.userId}
                  className="bg-info text-info-content flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ring-2 ring-white"
                  title={u.userName}
                >
                  {getInitials(u.userName)}
                </div>
              ))}
              {otherConnectedUsers.length > 5 && (
                <div className="bg-base-300 flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ring-2 ring-white">
                  +{otherConnectedUsers.length - 5}
                </div>
              )}
            </div>
            <div>
              <span className="font-semibold">
                {otherConnectedUsers.length} other
                {otherConnectedUsers.length !== 1 ? "s" : ""} editing
              </span>
              <p className="text-xs opacity-80">
                {otherConnectedUsers.map((u) => u.userName).join(", ")}
              </p>
            </div>
          </div>
        </div>
      )}

      {connectionStatus !== "connected" && !truckCheck.locked && (
        <div className="alert alert-warning mb-6">
          <HiOutlineExclamationTriangle className="h-6 w-6 shrink-0" />
          <span>
            Real-time sync is not available. Changes may not be saved.
          </span>
        </div>
      )}

      {/* Form Sections */}
      <div className="space-y-4">
        {schema.sections.map((section: any) => (
          <div
            key={section.id}
            className="collapse-arrow bg-base-200 collapse rounded-xl"
          >
            <input type="checkbox" defaultChecked />
            <div className="collapse-title text-xl font-medium">
              {section.title}
              {section.description && (
                <p className="mt-1 text-sm font-normal opacity-70">
                  {section.description}
                </p>
              )}
            </div>
            <div className="collapse-content">
              <div className="space-y-3 pt-4">
                {section.fields.map((field: any) =>
                  renderField(field, section.id),
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Contributors */}
      {contributors.length > 0 && (
        <div className="mt-10">
          <div className="divider" />
          <h3 className="mb-3 flex items-center gap-2 text-lg font-semibold">
            <HiOutlineUsers className="h-5 w-5 opacity-60" />
            Contributors
          </h3>
          <div className="flex flex-wrap gap-2">
            {contributors.map((c) => (
              <div
                key={c.userId}
                className={`badge gap-1.5 py-3 ${
                  c.userId === user.user_id ? "badge-primary" : "badge-outline"
                }`}
              >
                <HiOutlineUser className="h-3.5 w-3.5" />
                {c.userName}
                {c.userId === user.user_id && (
                  <span className="opacity-60">(you)</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sticky Action Bar */}
      <div className="bg-base-100/80 fixed right-0 bottom-0 left-0 z-10 border-t backdrop-blur-sm">
        <div className="container mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          {isLocked ? (
            <>
              <span className="text-sm opacity-60">View-only</span>
              <a href="/truck-check" className="btn btn-ghost btn-sm">
                Back to Truck Checks
              </a>
            </>
          ) : (
            <>
              <span className="text-sm opacity-60">
                {Object.keys(fieldValues).length} field
                {Object.keys(fieldValues).length !== 1 ? "s" : ""} filled
              </span>
              <div className="flex gap-3">
                <a href="/truck-check" className="btn btn-ghost btn-sm">
                  Cancel
                </a>
                <button
                  className="btn btn-primary btn-sm"
                  disabled={connectionStatus !== "connected"}
                >
                  Save Progress
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
