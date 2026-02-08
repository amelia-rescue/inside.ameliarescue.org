import { useEffect, useState, useRef, useCallback } from "react";
import { appContext } from "~/context";
import type { Route } from "./+types/truck-check-dynamic";
import { useLoaderData } from "react-router";
import { TruckCheckStore } from "~/lib/truck-check/truck-check-store";
import { TruckCheckSchemaStore } from "~/lib/truck-check/truck-check-schema-store";
import {
  HiOutlineUsers,
  HiOutlineExclamationTriangle,
  HiOutlineUser,
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
  const schema = await truckCheckSchemaStore.getSchema(truck.schemaId);

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

  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("connecting");
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

  const getStatusColor = () => {
    switch (connectionStatus) {
      case "connected":
        return "bg-green-500";
      case "connecting":
        return "bg-yellow-500";
      case "disconnected":
        return "bg-orange-500";
      case "error":
        return "bg-red-500";
      default:
        return "bg-gray-500";
    }
  };

  const getStatusText = () => {
    switch (connectionStatus) {
      case "connected":
        return "Connected";
      case "connecting":
        return "Connecting...";
      case "disconnected":
        return "Reconnecting...";
      case "error":
        return "Connection Error";
      default:
        return "Unknown";
    }
  };

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
            className={`form-control rounded-lg transition-colors duration-500 ${isRemoteUpdate ? "bg-info/10" : ""}`}
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
              <span className="label-text-alt text-info ml-9 text-xs">
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
            className={`form-control rounded-lg transition-colors duration-500 ${isRemoteUpdate ? "bg-info/10" : ""}`}
          >
            <label className="label">
              <span className="label-text">
                {field.label}
                {field.required && <span className="text-error ml-1">*</span>}
              </span>
              {isRemoteUpdate && (
                <span className="label-text-alt text-info text-xs">
                  Updated by {lastUpdate.userName}
                </span>
              )}
            </label>
            <input
              type="text"
              placeholder={field.placeholder}
              maxLength={field.maxLength}
              className="input input-bordered"
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
            className={`form-control rounded-lg transition-colors duration-500 ${isRemoteUpdate ? "bg-info/10" : ""}`}
          >
            <label className="label">
              <span className="label-text">
                {field.label}
                {field.required && <span className="text-error ml-1">*</span>}
              </span>
              {isRemoteUpdate && (
                <span className="label-text-alt text-info text-xs">
                  Updated by {lastUpdate.userName}
                </span>
              )}
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={field.min}
                max={field.max}
                className="input input-bordered flex-1"
                value={value ?? ""}
                disabled={isLocked}
                onChange={(e) =>
                  handleFieldChange(
                    fieldId,
                    e.target.value === "" ? null : Number(e.target.value),
                  )
                }
              />
              {field.unit && <span className="opacity-60">{field.unit}</span>}
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
            className={`form-control rounded-lg transition-colors duration-500 ${isRemoteUpdate ? "bg-info/10" : ""}`}
          >
            <label className="label">
              <span className="label-text">
                {field.label}
                {field.required && <span className="text-error ml-1">*</span>}
              </span>
              {isRemoteUpdate && (
                <span className="label-text-alt text-info text-xs">
                  Updated by {lastUpdate.userName}
                </span>
              )}
            </label>
            <select
              className="select select-bordered"
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
          <div key={fieldId} className="form-control">
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
              className="file-input file-input-bordered"
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
    <div className="container mx-auto max-w-4xl px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold">{schema.title}</h1>
            <p className="mt-2 opacity-70">
              {truck.displayName} -{" "}
              {new Date(truckCheck.created_at).toLocaleDateString()}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div
              className={`h-3 w-3 rounded-full ${getStatusColor()}`}
              title={getStatusText()}
            />
            <span className="text-sm font-medium">{getStatusText()}</span>
          </div>
        </div>
        <div className="mt-2 flex items-center gap-2 text-sm">
          <span
            className={`badge ${truckCheck.locked ? "badge-error" : "badge-success"}`}
          >
            {truckCheck.locked ? "Locked" : "Active"}
          </span>
        </div>
      </div>

      {/* Connected Users Banner */}
      {otherConnectedUsers.length > 0 && (
        <div className="alert alert-info mb-6">
          <HiOutlineUsers className="h-6 w-6 shrink-0" />
          <div>
            <span className="font-semibold">
              {otherConnectedUsers.length} other
              {otherConnectedUsers.length !== 1 ? "s" : ""} editing:
            </span>{" "}
            {otherConnectedUsers.map((u) => u.userName).join(", ")}
          </div>
        </div>
      )}

      {connectionStatus !== "connected" && (
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
          <div key={section.id} className="collapse-arrow bg-base-200 collapse">
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
              <div className="space-y-4 pt-4">
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
        <div className="mt-8">
          <h3 className="mb-3 text-lg font-semibold">Contributors</h3>
          <div className="flex flex-wrap gap-2">
            {contributors.map((c) => (
              <div key={c.userId} className="badge badge-outline gap-1 py-3">
                <HiOutlineUser className="h-4 w-4" />
                {c.userName}
                {c.userId === user.user_id && (
                  <span className="opacity-60">(you)</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-8 flex justify-end gap-4">
        <button className="btn btn-ghost">Cancel</button>
        <button
          className="btn btn-primary"
          disabled={connectionStatus !== "connected" || truckCheck.locked}
        >
          Save Progress
        </button>
      </div>
    </div>
  );
}
