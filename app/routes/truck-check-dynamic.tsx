import { useEffect, useState, useRef, useCallback } from "react";
import { appContext } from "~/context";
import type { Route } from "./+types/truck-check-dynamic";
import { Form, redirect, useLoaderData } from "react-router";
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
import { UserStore, type User } from "~/lib/user-store";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Truck Check - Inside Amelia Rescue" }];
}

export async function action({ context, params, request }: Route.ActionArgs) {
  const ctx = context.get(appContext);
  if (!ctx) {
    throw new Error("Context not found");
  }

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent !== "delete") {
    throw new Error("Invalid intent");
  }

  const truckCheckStore = TruckCheckStore.make();
  const truckCheck = await truckCheckStore.getTruckCheck(params.id);

  if (truckCheck.locked) {
    throw new Error("Locked truck checks cannot be deleted");
  }

  if (truckCheck.created_by !== ctx.user.user_id) {
    throw new Error("Only the creator can delete this truck check");
  }

  await truckCheckStore.deleteTruckCheck(truckCheck.id);

  return redirect("/truck-check");
}

export async function loader({ context, params }: Route.LoaderArgs) {
  const ctx = context.get(appContext);
  if (!ctx) {
    throw new Error("Context not found");
  }

  const truckCheckStore = TruckCheckStore.make();
  const truckCheckSchemaStore = TruckCheckSchemaStore.make();
  const userStore = UserStore.make();

  const truckCheck = await truckCheckStore.getTruckCheck(params.id);
  const truck = await truckCheckSchemaStore.getTruck(truckCheck.truck);
  const schema =
    truckCheck.schema_id && truckCheck.schema_created_at
      ? await truckCheckSchemaStore.getSchemaVersion(
          truckCheck.schema_id,
          truckCheck.schema_created_at,
        )
      : await truckCheckSchemaStore.getSchema(truck.schemaId);

  let previousContributors: User[] = [];
  if (truckCheck.locked) {
    const contributors = await Promise.all(
      truckCheck.contributors.map((contributor) =>
        userStore.getUser(contributor, { includeDeleted: true }),
      ),
    );
    previousContributors = contributors.map((user) => user);
  }

  return {
    user: ctx.user,
    accessToken: ctx.user.accessToken,
    truckCheck,
    truck,
    schema,
    previousContributors,
  };
}

type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";

interface ConnectedUser {
  userId: string;
  userName: string;
}

type TriStateCheckboxValue = true | "not-present" | null;

function getFieldId(sectionId: string, fieldLabel: string): string {
  return `${sectionId}-${fieldLabel.replace(/\s+/g, "-").toLowerCase()}`;
}

function normalizeTriStateCheckboxValue(value: any): TriStateCheckboxValue {
  if (value === true) {
    return true;
  }

  if (value === "not-present") {
    return "not-present";
  }

  return null;
}

function getNextTriStateCheckboxValue(value: any): TriStateCheckboxValue {
  const normalizedValue = normalizeTriStateCheckboxValue(value);

  if (normalizedValue === null) {
    return true;
  }

  if (normalizedValue === true) {
    return "not-present";
  }

  return null;
}

export default function TruckCheckDynamic() {
  const { user, accessToken, truckCheck, truck, schema, previousContributors } =
    useLoaderData<typeof loader>();

  const isLocked = truckCheck.locked;
  const canDeleteTruckCheck =
    !isLocked && truckCheck.created_by === user.user_id;

  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(
    isLocked ? "disconnected" : "connecting",
  );
  const [connectedUsers, setConnectedUsers] = useState<ConnectedUser[]>([]);
  const [contributors, setContributors] = useState<ConnectedUser[]>([]);
  const [fieldValues, setFieldValues] = useState<Record<string, any>>(
    truckCheck.data || {},
  );
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(
    () =>
      Object.fromEntries(
        schema.sections.map((section: any) => [section.id, true]),
      ),
  );
  const [pendingJumpTarget, setPendingJumpTarget] = useState<{
    fieldId: string;
    sectionId: string;
  } | null>(null);
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
              setFieldValues((prev) => {
                const mergedValues = {
                  ...prev,
                  ...(typeof data.truckCheckData === "object" &&
                  data.truckCheckData !== null
                    ? data.truckCheckData
                    : {}),
                };

                if (data.fieldId) {
                  mergedValues[data.fieldId] = data.value;
                }

                return mergedValues;
              });
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

  useEffect(() => {
    if (!pendingJumpTarget) return;
    if (!openSections[pendingJumpTarget.sectionId]) return;

    const attemptJump = () => {
      const element = document.getElementById(pendingJumpTarget.fieldId);
      if (!element) {
        window.requestAnimationFrame(attemptJump);
        return;
      }

      element.scrollIntoView({ behavior: "smooth", block: "center" });
      if (
        element instanceof HTMLInputElement ||
        element instanceof HTMLSelectElement ||
        element instanceof HTMLTextAreaElement
      ) {
        element.focus();
      }
      setPendingJumpTarget(null);
    };

    window.requestAnimationFrame(attemptJump);
  }, [openSections, pendingJumpTarget]);

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

  const isFieldFilled = (value: any): boolean => {
    if (value === null || value === undefined) return false;
    if (typeof value === "boolean") return value;
    if (typeof value === "string") return value.trim().length > 0;
    return true;
  };

  const requiredFields: string[] = [];
  const requiredFieldDetails: Array<{
    fieldId: string;
    sectionId: string;
    sectionTitle: string;
    fieldLabel: string;
  }> = [];
  const sectionProgress = schema.sections.map((section: any) => {
    const requiredSectionFields = section.fields
      .filter((field: any) => field.required)
      .map((field: any): string => {
        const fieldId = getFieldId(section.id, field.label);
        requiredFields.push(fieldId);
        requiredFieldDetails.push({
          fieldId,
          sectionId: section.id,
          sectionTitle: section.title,
          fieldLabel: field.label,
        });
        return fieldId;
      });

    const completedRequiredCount = requiredSectionFields.filter(
      (fieldId: string) => isFieldFilled(fieldValues[fieldId]),
    ).length;

    return {
      sectionId: section.id,
      requiredCount: requiredSectionFields.length,
      completedRequiredCount,
      remainingRequiredCount:
        requiredSectionFields.length - completedRequiredCount,
    };
  });
  const filledRequiredCount = requiredFields.filter((id) =>
    isFieldFilled(fieldValues[id]),
  ).length;
  const requiredTotal = requiredFields.length;
  const progressPercent =
    requiredTotal > 0
      ? Math.round((filledRequiredCount / requiredTotal) * 100)
      : 100;

  const getInitials = (name: string) =>
    name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

  const firstIncompleteField = requiredFieldDetails.find(
    ({ fieldId }) => !isFieldFilled(fieldValues[fieldId]),
  );

  const jumpToField = useCallback(
    (fieldId: string, sectionId: string) => {
      setPendingJumpTarget({ fieldId, sectionId });
      setOpenSections((prev) => ({ ...prev, [sectionId]: true }));
    },
    [setOpenSections],
  );

  const handleJumpToNextIncomplete = useCallback(() => {
    if (requiredFieldDetails.length === 0) return;

    const activeFieldId =
      document.activeElement instanceof HTMLElement
        ? document.activeElement.id
        : null;
    const activeIndex = requiredFieldDetails.findIndex(
      ({ fieldId }) => fieldId === activeFieldId,
    );

    const orderedCandidates =
      activeIndex >= 0
        ? [
            ...requiredFieldDetails.slice(activeIndex + 1),
            ...requiredFieldDetails.slice(0, activeIndex + 1),
          ]
        : requiredFieldDetails;

    const nextIncompleteField = orderedCandidates.find(
      ({ fieldId }) => !isFieldFilled(fieldValues[fieldId]),
    );

    if (!nextIncompleteField) return;

    jumpToField(nextIncompleteField.fieldId, nextIncompleteField.sectionId);
  }, [fieldValues, isFieldFilled, jumpToField, requiredFieldDetails]);

  const renderField = (field: any, sectionId: string) => {
    const fieldId = getFieldId(sectionId, field.label);
    const value = fieldValues[fieldId];
    const isRemoteUpdate = lastUpdate?.fieldId === fieldId;
    const isLocked = truckCheck.locked;
    const fieldContainerClass = `form-control rounded-lg border border-base-300 p-2 transition-all duration-500 ${isRemoteUpdate ? "bg-info/10 ring-info/30 ring-1" : ""}`;

    switch (field.type) {
      case "checkbox": {
        const checkboxValue = normalizeTriStateCheckboxValue(value);
        const checkboxStateLabel =
          checkboxValue === true
            ? "Present"
            : checkboxValue === "not-present"
              ? "Not present"
              : "Unchecked";
        const checkboxStateIcon =
          checkboxValue === true
            ? "✓"
            : checkboxValue === "not-present"
              ? "✕"
              : "";
        const checkboxButtonClass = `flex h-6 w-6 items-center justify-center rounded border-2 text-sm font-bold transition-colors ${
          checkboxValue === true
            ? "border-success bg-success text-success-content"
            : checkboxValue === "not-present"
              ? "border-error bg-error text-error-content"
              : "border-base-content/30 bg-base-100 text-base-content/50"
        } ${isLocked ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`;

        return (
          <div key={fieldId} className={fieldContainerClass}>
            <div className="label justify-start gap-3">
              <button
                id={fieldId}
                type="button"
                role="checkbox"
                aria-checked={
                  checkboxValue === "not-present"
                    ? "mixed"
                    : checkboxValue === true
                }
                aria-label={`${field.label}: ${checkboxStateLabel}`}
                className={checkboxButtonClass}
                disabled={isLocked}
                onClick={() =>
                  handleFieldChange(
                    fieldId,
                    getNextTriStateCheckboxValue(checkboxValue),
                  )
                }
              >
                {checkboxStateIcon}
              </button>
              <span className="label-text">{field.label}</span>
              {field.required && <span className="text-error">*</span>}
            </div>
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
      }

      case "text":
        return (
          <div key={fieldId} className={fieldContainerClass}>
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
              id={fieldId}
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
          <div key={fieldId} className={fieldContainerClass}>
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
                id={fieldId}
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
          <div key={fieldId} className={fieldContainerClass}>
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
              id={fieldId}
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
          <div key={fieldId} className={fieldContainerClass}>
            <label className="label">
              <span className="label-text">
                {field.label}
                {field.required && <span className="text-error ml-1">*</span>}
              </span>
            </label>
            <input
              id={fieldId}
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
        <div className="space-y-4">
          <div className="space-y-2">
            <h1 className="text-3xl leading-tight font-bold">
              {truck.displayName}
            </h1>
            <div className="space-y-1 text-sm opacity-70">
              <p className="break-words">
                schema {truckCheck.schema_id}
                {truckCheck.schema_created_at}
              </p>
              <p>
                {new Date(truckCheck.created_at).toLocaleDateString(undefined, {
                  weekday: "short",
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span
                className={`badge gap-1 ${truckCheck.locked ? "badge-error" : "badge-success"}`}
              >
                {truckCheck.locked && (
                  <HiOutlineLockClosed className="h-3.5 w-3.5" />
                )}
                {truckCheck.locked ? "Locked" : "Active"}
              </span>
              {!isLocked && (
                <div
                  className={`flex w-fit items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium whitespace-nowrap ${
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

            {canDeleteTruckCheck && (
              <Form method="post" className="sm:self-start">
                <input type="hidden" name="intent" value="delete" />
                <button
                  type="submit"
                  className="btn btn-error btn-outline btn-sm w-full sm:w-auto"
                  onClick={(event) => {
                    if (
                      !window.confirm(
                        "Delete this truck check? This action cannot be undone.",
                      )
                    ) {
                      event.preventDefault();
                    }
                  }}
                >
                  Delete Truck Check
                </button>
              </Form>
            )}
          </div>
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

      {isLocked && previousContributors.length > 0 && (
        <div className="mb-10">
          <h3 className="mb-3 flex items-center gap-2 text-lg font-semibold">
            <HiOutlineUsers className="h-5 w-5 opacity-60" />
            Contributors
          </h3>
          <div className="flex flex-wrap gap-2">
            {previousContributors.map((c) => (
              <div
                key={c.user_id}
                className={`badge gap-1.5 py-3 ${
                  c.user_id === user.user_id ? "badge-primary" : "badge-outline"
                }`}
              >
                <HiOutlineUser className="h-3.5 w-3.5" />
                {c.first_name} {c.last_name}
                {c.user_id === user.user_id && (
                  <span className="opacity-60">(you)</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {!isLocked && contributors.length > 0 && (
        <div className="mb-10">
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

      {/* Form Sections */}
      <div className="space-y-4">
        {schema.sections.map((section: any) => (
          <div
            key={section.id}
            className="collapse-arrow bg-base-200 collapse rounded-xl"
          >
            <input
              type="checkbox"
              checked={!!openSections[section.id]}
              onChange={() =>
                setOpenSections((prev) => ({
                  ...prev,
                  [section.id]: !prev[section.id],
                }))
              }
            />
            <div className="collapse-title text-xl font-medium">
              <div className="flex items-center justify-between gap-3 pr-8">
                <span>{section.title}</span>
                {(() => {
                  const progress = sectionProgress.find(
                    ({ sectionId }) => sectionId === section.id,
                  );

                  if (!progress || progress.requiredCount === 0) {
                    return (
                      <span className="badge badge-outline badge-sm shrink-0 whitespace-nowrap">
                        Optional
                      </span>
                    );
                  }

                  return progress.remainingRequiredCount === 0 ? (
                    <span className="badge badge-success badge-sm shrink-0 whitespace-nowrap">
                      {progress.completedRequiredCount}/{progress.requiredCount}{" "}
                      required
                    </span>
                  ) : (
                    <span className="badge badge-warning badge-sm shrink-0 whitespace-nowrap">
                      {progress.remainingRequiredCount} remaining
                    </span>
                  );
                })()}
              </div>
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
              <div className="flex flex-1 items-center gap-3">
                <progress
                  className="progress progress-primary w-32"
                  value={filledRequiredCount}
                  max={requiredTotal}
                />
                <span className="text-sm opacity-60">
                  {filledRequiredCount}/{requiredTotal} required
                </span>
                {firstIncompleteField && (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={handleJumpToNextIncomplete}
                  >
                    Next incomplete
                  </button>
                )}
              </div>
              <a href="/truck-check" className="btn btn-ghost btn-sm">
                Exit
              </a>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
