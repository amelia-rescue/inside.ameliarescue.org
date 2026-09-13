import { useEffect, useState, useRef, useCallback } from "react";
import { appContext } from "~/context";
import type { Route } from "./+types/truck-check-dynamic";
import {
  Form,
  redirect,
  useLoaderData,
  useNavigation,
  useRevalidator,
  useSubmit,
} from "react-router";
import { TruckCheckStore } from "~/lib/truck-check/truck-check-store";
import { TruckCheckSchemaStore } from "~/lib/truck-check/truck-check-schema-store";
import { notifyTruckCheckIssues } from "~/lib/truck-check/issue-notifications";
import { log } from "~/lib/logger";
import { compressImage } from "~/lib/truck-check/image-compression";
import { showToast } from "~/components/toaster";
import { useTruckCheckSync } from "~/lib/truck-check/use-truck-check-sync";
import {
  HiOutlineUsers,
  HiOutlineExclamationTriangle,
  HiOutlineUser,
  HiOutlineLockClosed,
  HiOutlineSignal,
  HiOutlineSignalSlash,
  HiOutlineChevronLeft,
  HiOutlineCamera,
  HiOutlinePhoto,
} from "react-icons/hi2";
import { DateDisplay } from "~/components/date-display";
import { getFieldId, getPhotoUrls } from "~/lib/truck-check/issues";
import confetti from "canvas-confetti";

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

  if (intent !== "delete" && intent !== "lock") {
    throw new Error("Invalid intent");
  }

  const truckCheckStore = TruckCheckStore.make();
  const truckCheck = await truckCheckStore.getTruckCheck(params.id);

  if (truckCheck.locked) {
    throw new Error("Locked truck checks cannot be modified");
  }

  if (truckCheck.created_by !== ctx.user.user_id) {
    throw new Error(`Only the creator can ${intent} this truck check`);
  }

  if (intent === "lock") {
    const lockedCheck = await truckCheckStore.lockTruckCheck({
      id: truckCheck.id,
      userId: ctx.user.user_id,
    });

    try {
      await notifyTruckCheckIssues({ checks: [lockedCheck] });
    } catch (error) {
      // Notification failures must never fail the lock
      log.error("Failed to send truck check issue notifications", {
        checkId: lockedCheck.id,
        error: String(error),
      });
    }

    return redirect(`/truck-checks/${truckCheck.id}`);
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
  const truckCheck = await truckCheckStore.getTruckCheck(params.id);
  const truck = await truckCheckSchemaStore.getTruck(truckCheck.truck);
  const schema =
    truckCheck.schema_id && truckCheck.schema_created_at
      ? await truckCheckSchemaStore.getSchemaVersion(
          truckCheck.schema_id,
          truckCheck.schema_created_at,
        )
      : await truckCheckSchemaStore.getSchema(truck.schemaId);

  const previousContributors = truckCheck.locked
    ? Object.entries(truckCheck.contributors || {}).map(
        ([userId, contributor]) => ({
          userId,
          userName: `${contributor.first_name} ${contributor.last_name}`.trim(),
        }),
      )
    : [];

  const { mutation_streams, ...publicTruckCheck } = truckCheck;
  return {
    user: ctx.user,
    truckCheck: publicTruckCheck,
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
  const loaded = useLoaderData<typeof loader>();
  return (
    <TruckCheckDynamicView
      key={`${loaded.user.user_id}:${loaded.truckCheck.id}`}
      {...loaded}
    />
  );
}

function TruckCheckDynamicView({
  user,
  truckCheck,
  truck,
  schema,
  previousContributors,
}: Awaited<ReturnType<typeof loader>>) {
  const navigation = useNavigation();
  const revalidator = useRevalidator();
  const submit = useSubmit();
  const wsUrl =
    import.meta.env?.VITE_WEBSOCKET_URL ||
    "wss://svzzsce7u8.execute-api.us-east-2.amazonaws.com/prod";
  const sync = useTruckCheckSync({
    initial: {
      id: truckCheck.id,
      userId: user.user_id,
      revision: truckCheck.revision ?? 0,
      data: truckCheck.data || {},
      contributors: truckCheck.contributors || {},
      locked: truckCheck.locked,
    },
    wsUrl,
    onEvent: handleRealtimeEvent,
  });

  // Set when the server tells us the check was locked while we had it open,
  // so the page goes read-only before the revalidated loader data arrives.
  const remotelyLocked = sync.snapshot.locked;
  const isLocked = truckCheck.locked || remotelyLocked || sync.missing;
  const isCreator = truckCheck.created_by === user.user_id;
  const canDeleteTruckCheck = !isLocked && isCreator;
  const canLockTruckCheck = !isLocked && isCreator;
  const isLocking =
    navigation.formData?.get("intent") === "lock" || sync.preparing;
  const connectionStatus: ConnectionStatus = sync.live;
  const [connectedUsers, setConnectedUsers] = useState<ConnectedUser[]>([]);
  const contributors = Object.entries(sync.snapshot.contributors).map(
    ([userId, name]) => ({
      userId,
      userName: `${name.first_name} ${name.last_name}`.trim(),
    }),
  );
  const fieldValues = sync.values as Record<string, any>;
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(
    () =>
      Object.fromEntries(
        schema.sections.map((section: any) => [section.id, false]),
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
  const [photoUploadStatus, setPhotoUploadStatus] = useState<
    Record<string, { isUploading: boolean; error?: string }>
  >({});
  const pendingUpdateCount = sync.pending.length;
  const lastUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lockNoticeShownRef = useRef(false);
  const lockModalRef = useRef<HTMLDialogElement>(null);
  const handledCompletionEventsRef = useRef(new Set<string>());
  const completionSoundRef = useRef<HTMLAudioElement | null>(null);

  // Field updates are queued while the socket is down and replayed on rejoin.
  // Taking a photo backgrounds the browser, which drops the connection, so
  // without this the upload finishes and its field update is thrown away.
  const handleFieldChange = sync.edit;

  // Keyed by field so a field edited repeatedly while offline only replays
  // its latest value, matching the server's last-write-wins per field.
  const pendingFields = new Set(sync.pending.map((change) => change.fieldId));

  // The server rejects edits as soon as a check is locked. Queued edits are
  // dropped because they can never be accepted anymore.
  const rejectedChanges = sync.pending.filter(
    (change) => isLocked || change.rejected,
  );
  const uploadingPhotos = Object.values(photoUploadStatus).some(
    (status) => status.isUploading,
  );
  useEffect(() => {
    if (!uploadingPhotos && !(sync.storageError && pendingUpdateCount > 0))
      return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [uploadingPhotos, sync.storageError, pendingUpdateCount]);
  const needsAttention =
    !!sync.storageError ||
    sync.authRequired ||
    sync.missing ||
    rejectedChanges.length > 0;
  const saveStatus = needsAttention
    ? "Needs attention"
    : !sync.ready
      ? "Restoring changes..."
      : uploadingPhotos
        ? "Uploading photos..."
        : pendingUpdateCount > 0
          ? sync.reachable
            ? `Saving ${pendingUpdateCount} changes...`
            : `Offline — ${pendingUpdateCount} ${pendingUpdateCount === 1 ? "change" : "changes"} saved on this device`
          : sync.reachable
            ? "Saved"
            : "Offline — checking for updates";

  const handlePhotoUpload = useCallback(
    async (fieldId: string, files: FileList | null, maxPhotos?: number) => {
      if (!files || files.length === 0 || isLocked || isLocking) {
        return;
      }

      const currentUrls = getPhotoUrls(fieldValues[fieldId]);
      const selectedFiles = Array.from(files);
      const maxAllowed = typeof maxPhotos === "number" ? maxPhotos : Infinity;

      const nonImageFile = selectedFiles.find(
        (file) => file.type !== "" && !file.type.startsWith("image/"),
      );
      if (nonImageFile) {
        setPhotoUploadStatus((prev) => ({
          ...prev,
          [fieldId]: {
            isUploading: false,
            error: `"${nonImageFile.name}" is not an image. Choose a photo instead.`,
          },
        }));
        return;
      }

      if (currentUrls.length >= maxAllowed) {
        setPhotoUploadStatus((prev) => ({
          ...prev,
          [fieldId]: {
            isUploading: false,
            error: `Maximum of ${maxAllowed} photos reached`,
          },
        }));
        return;
      }

      const availableSlots = Math.max(maxAllowed - currentUrls.length, 0);
      const filesToUpload = selectedFiles.slice(0, availableSlots);

      if (filesToUpload.length === 0) {
        setPhotoUploadStatus((prev) => ({
          ...prev,
          [fieldId]: {
            isUploading: false,
            error: "No additional photos can be uploaded",
          },
        }));
        return;
      }

      setPhotoUploadStatus((prev) => ({
        ...prev,
        [fieldId]: { isUploading: true },
      }));

      try {
        for (const selectedFile of filesToUpload) {
          const file = await compressImage(selectedFile);

          const uploadUrlFormData = new FormData();
          uploadUrlFormData.append("truck_check_id", truckCheck.id);
          uploadUrlFormData.append("field_id", fieldId);
          uploadUrlFormData.append("file_name", file.name);
          uploadUrlFormData.append("content_type", file.type);

          const uploadUrlResponse = await fetch(
            "/api/truck-check-images/get-upload-url",
            {
              method: "POST",
              body: uploadUrlFormData,
            },
          );

          if (!uploadUrlResponse.ok) {
            const payload = (await uploadUrlResponse
              .json()
              .catch(() => null)) as { error?: string } | null;
            throw new Error(payload?.error || "Failed to get upload URL");
          }

          const { uploadUrl, fileUrl } = (await uploadUrlResponse.json()) as {
            uploadUrl: string;
            fileUrl: string;
          };

          const uploadResponse = await fetch(uploadUrl, {
            method: "PUT",
            body: file,
            headers: {
              "Content-Type": file.type,
            },
          });

          if (!uploadResponse.ok) {
            throw new Error(`Failed to upload ${file.name}`);
          }

          sync.addPhoto(fieldId, fileUrl, maxPhotos);
        }

        setPhotoUploadStatus((prev) => ({
          ...prev,
          [fieldId]: {
            isUploading: false,
            error:
              filesToUpload.length !== selectedFiles.length
                ? `Uploaded ${filesToUpload.length} of ${selectedFiles.length} selected photos due to max limit`
                : undefined,
          },
        }));
      } catch (error) {
        setPhotoUploadStatus((prev) => ({
          ...prev,
          [fieldId]: {
            isUploading: false,
            error:
              error instanceof Error ? error.message : "Failed to upload photo",
          },
        }));
      }
    },
    [isLocked, isLocking, fieldValues, sync.addPhoto, truckCheck.id],
  );

  function handleRealtimeEvent(data: any) {
    // Queued edits win over the server snapshot, which predates
    // them, unless the check was locked while we were away.
    switch (data.type) {
      case "truck-check-joined":
      case "user-joined":
      case "user-left":
        setConnectedUsers(data.connectedUsers || []);
        break;
      case "truck-check-completed": {
        const eventId = typeof data.eventId === "string" ? data.eventId : null;
        if (eventId && handledCompletionEventsRef.current.has(eventId)) {
          break;
        }
        if (eventId) {
          handledCompletionEventsRef.current.add(eventId);
          if (handledCompletionEventsRef.current.size > 20) {
            const oldestEventId = handledCompletionEventsRef.current
              .values()
              .next().value;
            if (oldestEventId) {
              handledCompletionEventsRef.current.delete(oldestEventId);
            }
          }
        }

        const prefersReducedMotion = window.matchMedia(
          "(prefers-reduced-motion: reduce)",
        ).matches;
        if (!prefersReducedMotion) {
          const colors = ["#2563eb", "#16a34a", "#f59e0b", "#dc2626"];
          const duration = 15 * 1000;
          const animationEnd = Date.now() + duration;
          const defaults = {
            startVelocity: 30,
            spread: 360,
            ticks: 60,
            zIndex: 0,
            colors,
          };
          const randomInRange = (min: number, max: number) =>
            Math.random() * (max - min) + min;
          const interval = setInterval(() => {
            const timeLeft = animationEnd - Date.now();
            if (timeLeft <= 0) {
              clearInterval(interval);
              return;
            }
            const particleCount = 50 * (timeLeft / duration);
            confetti({
              ...defaults,
              particleCount,
              origin: {
                x: randomInRange(0.1, 0.3),
                y: Math.random() - 0.2,
              },
            });
            confetti({
              ...defaults,
              particleCount,
              origin: {
                x: randomInRange(0.7, 0.9),
                y: Math.random() - 0.2,
              },
            });
          }, 250);
        }
        if (completionSoundRef.current) {
          completionSoundRef.current.currentTime = 0;
          void completionSoundRef.current.play().catch(() => {});
        }
        showToast({
          message: `${data.completedByName || "Someone"} completed the truck check!`,
          type: "alert-success",
          duration: 6000,
        });
        break;
      }

      case "field-update":
        if (
          data.updatedBy === user.user_id ||
          (typeof data.revision === "number" &&
            data.revision < sync.snapshot.revision)
        )
          break;
        setLastUpdate({ fieldId: data.fieldId, userName: data.updatedByName });
        if (lastUpdateTimeoutRef.current)
          clearTimeout(lastUpdateTimeoutRef.current);
        lastUpdateTimeoutRef.current = setTimeout(
          () => setLastUpdate(null),
          3000,
        );
        break;
    }
  }

  // Once locked there is nothing left to sync, so drop the socket for good
  useEffect(() => {
    if (
      sync.snapshot.locked &&
      !truckCheck.locked &&
      !lockNoticeShownRef.current
    ) {
      lockNoticeShownRef.current = true;
      showToast({
        message: "This truck check was locked and is now view-only.",
        type: "alert-warning",
        duration: 8000,
      });
      void revalidator.revalidate();
    }
  }, [sync.snapshot.locked, truckCheck.locked, revalidator]);

  useEffect(() => {
    completionSoundRef.current = new Audio(
      "/sounds/Zelda-Get-Item-Sound-Effect.mp3",
    );
    completionSoundRef.current.preload = "auto";

    return () => {
      if (completionSoundRef.current) {
        completionSoundRef.current.pause();
        completionSoundRef.current = null;
      }
    };
  }, []);

  useEffect(
    () => () => {
      if (lastUpdateTimeoutRef.current)
        clearTimeout(lastUpdateTimeoutRef.current);
    },
    [],
  );

  useEffect(() => {
    if (connectionStatus !== "connected") setConnectedUsers([]);
  }, [connectionStatus]);

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
      text: "Live updates connected",
      pulse: false,
    },
    connecting: {
      color: "bg-yellow-500",
      text: "Connecting...",
      pulse: true,
    },
    disconnected: {
      color: "bg-orange-500",
      text: "Live updates reconnecting",
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
    if (Array.isArray(value)) return value.length > 0;
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
      // Open the section first
      setOpenSections((prev) => ({ ...prev, [sectionId]: true }));

      // Set the jump target on the next tick after the section has time to open
      setTimeout(() => {
        setPendingJumpTarget({ fieldId, sectionId });
      }, 0);
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
    const fieldDisabled = isLocked || !sync.ready || isLocking;
    const fieldContainerClass = `form-control relative rounded-lg border border-base-300 p-2 pr-6 transition-all duration-500 ${isRemoteUpdate ? "bg-info/10 ring-info/30 ring-1" : ""}`;
    const isPending = pendingFields.has(fieldId) && !isLocked;
    const pendingIndicator = (
      <span
        role="img"
        aria-label={`${field.label}: Pending save`}
        aria-hidden={!isPending}
        title={isPending ? "Pending save" : undefined}
        className={`bg-warning absolute top-3 right-2 h-1.5 w-1.5 rounded-full transition-opacity duration-200 motion-reduce:transition-none ${isPending ? "opacity-70" : "opacity-0"}`}
      />
    );

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
        } ${fieldDisabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`;

        return (
          <div key={fieldId} className={fieldContainerClass}>
            {pendingIndicator}
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
                disabled={fieldDisabled}
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
            {pendingIndicator}
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
              disabled={fieldDisabled}
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
            {pendingIndicator}
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
                disabled={fieldDisabled}
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
            {pendingIndicator}
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
              disabled={fieldDisabled}
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
        const photoUrls = getPhotoUrls(value);
        const photoMax =
          typeof field.maxPhotos === "number" ? field.maxPhotos : null;
        const photoFieldStatus = photoUploadStatus[fieldId];
        const isUploadingPhotos = photoFieldStatus?.isUploading === true;
        const canUploadMorePhotos = !photoMax || photoUrls.length < photoMax;
        const photoInputDisabled =
          fieldDisabled || isUploadingPhotos || !canUploadMorePhotos;

        return (
          <div key={fieldId} className={fieldContainerClass}>
            {pendingIndicator}
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
            {photoUrls.length > 0 && (
              <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {photoUrls.map((photoUrl, index) => (
                  <div key={`${photoUrl}-${index}`} className="relative">
                    <img
                      src={photoUrl}
                      alt={`${field.label} ${index + 1}`}
                      className="border-base-300 h-24 w-full rounded border object-cover"
                    />
                    {!fieldDisabled && (
                      <button
                        type="button"
                        className="btn btn-xs btn-circle btn-error absolute top-1 right-1"
                        disabled={isUploadingPhotos}
                        onClick={() =>
                          handleFieldChange(
                            fieldId,
                            photoUrls.filter(
                              (_, photoIndex) => photoIndex !== index,
                            ),
                          )
                        }
                        aria-label="Remove photo"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            {/*
              Chrome on Android 14+ routes a bare `image/*` filter to the Android
              photo picker, which has no camera option, so the two sources are
              split into separate inputs instead.
              https://issues.chromium.org/issues/40937303
            */}
            <div id={fieldId} className="flex gap-2">
              <label
                className={`btn btn-outline flex-1 ${photoInputDisabled ? "btn-disabled" : ""}`}
              >
                <HiOutlineCamera className="h-5 w-5" />
                Take Photo
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  disabled={photoInputDisabled}
                  onChange={(e) => {
                    void handlePhotoUpload(
                      fieldId,
                      e.target.files,
                      field.maxPhotos,
                    );
                    e.currentTarget.value = "";
                  }}
                />
              </label>
              <label
                className={`btn btn-outline flex-1 ${photoInputDisabled ? "btn-disabled" : ""}`}
              >
                <HiOutlinePhoto className="h-5 w-5" />
                Choose Photo
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  disabled={photoInputDisabled}
                  onChange={(e) => {
                    void handlePhotoUpload(
                      fieldId,
                      e.target.files,
                      field.maxPhotos,
                    );
                    e.currentTarget.value = "";
                  }}
                />
              </label>
            </div>
            {isUploadingPhotos && (
              <label className="label">
                <span className="label-text-alt text-info">
                  Uploading photos...
                </span>
              </label>
            )}
            {photoFieldStatus?.error && (
              <label className="label">
                <span className="label-text-alt text-error">
                  {photoFieldStatus.error}
                </span>
              </label>
            )}
            {field.maxPhotos && (
              <label className="label">
                <span className="label-text-alt opacity-60">
                  {photoUrls.length}/{field.maxPhotos} photos
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
                <DateDisplay
                  value={truckCheck.created_at}
                  format="weekdayDate"
                />
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

            {(canLockTruckCheck || canDeleteTruckCheck) && (
              <div className="flex flex-col gap-2 sm:flex-row sm:self-start">
                {canLockTruckCheck && (
                  <button
                    type="button"
                    className="btn btn-primary btn-outline btn-sm w-full sm:w-auto"
                    onClick={() => lockModalRef.current?.showModal()}
                  >
                    <HiOutlineLockClosed className="h-4 w-4" />
                    Lock Truck Check
                  </button>
                )}
                {canDeleteTruckCheck && (
                  <Form method="post">
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
            )}
          </div>
        </div>
      </div>

      {/* Locked Banner */}
      {isLocked && (
        <div className="alert mb-6">
          <HiOutlineLockClosed className="h-6 w-6 shrink-0" />
          <span>
            This truck check is locked and is view-only. Checks are locked by
            their creator when finished, or automatically 24 hours after
            creation.
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

      {(needsAttention || (!sync.reachable && !isLocked)) && (
        <div className="alert alert-warning mb-6">
          <HiOutlineExclamationTriangle className="h-6 w-6 shrink-0" />
          <div>
            <p>
              {sync.storageError ||
                sync.error ||
                "You can keep working. Changes will save automatically when connectivity returns."}
            </p>
            {sync.authRequired && (
              <a
                className="link"
                href={`/auth/login?redirectTo=${encodeURIComponent(`/truck-checks/${truckCheck.id}`)}`}
              >
                Sign in to resume saving
              </a>
            )}
            {!sync.missing && (
              <button
                type="button"
                className="btn btn-sm ml-2"
                onClick={sync.retry}
              >
                Retry sync
              </button>
            )}
          </div>
        </div>
      )}
      {rejectedChanges.length > 0 && (
        <div className="border-warning mb-6 rounded border p-4">
          <h2 className="font-semibold">Unsaved changes on this device</h2>
          <p className="text-sm">
            These changes are not in the saved check. Review or copy them before
            dismissing.
          </p>
          <ul className="space-y-2">
            {rejectedChanges.map((change) => (
              <li
                key={`${change.clientId}:${change.sequence}`}
                className="text-sm break-words"
              >
                <strong>{change.fieldId}</strong>:{" "}
                <span className="select-text">
                  {JSON.stringify(change.value)}
                </span>
                {change.rejected && <p>{change.rejected}</p>}
                <button
                  type="button"
                  className="btn btn-xs ml-2"
                  onClick={() => {
                    if (
                      window.confirm(
                        "Dismiss this unsaved change from this device?",
                      )
                    )
                      sync.dismiss(change);
                  }}
                >
                  Dismiss
                </button>
              </li>
            ))}
          </ul>
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
        {schema.sections.map((section: any) => {
          const isOpen = !!openSections[section.id];

          return (
            <div
              key={section.id}
              className={`collapse-arrow bg-base-200 collapse rounded-xl ${
                isOpen ? "collapse-open" : "collapse-close"
              }`}
            >
              <button
                type="button"
                className="collapse-title w-full cursor-pointer text-left text-xl font-medium"
                aria-expanded={isOpen}
                aria-controls={`truck-check-section-${section.id}`}
                onClick={() =>
                  setOpenSections((prev) => ({
                    ...prev,
                    [section.id]: !prev[section.id],
                  }))
                }
              >
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
                        {progress.completedRequiredCount}/
                        {progress.requiredCount} required
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
              </button>
              <div
                id={`truck-check-section-${section.id}`}
                className="collapse-content"
              >
                <div className="space-y-3 pt-4">
                  {section.fields.map((field: any) =>
                    renderField(field, section.id),
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Lock Confirmation Modal - unmounts once locked so it cannot linger */}
      {canLockTruckCheck && (
        <dialog ref={lockModalRef} className="modal">
          <div className="modal-box">
            <h3 className="flex items-center gap-2 text-lg font-bold">
              <HiOutlineLockClosed className="h-5 w-5" />
              Lock this truck check?
            </h3>
            <p className="py-3">
              Locking makes this check view-only for everyone, including you. It
              cannot be unlocked or deleted afterwards, and any reported issues
              are emailed to subscribers right away.
            </p>
            <p className="mb-3 text-sm">
              This device must finish saving before locking. Another
              disconnected phone may still have unsent changes; confirm everyone
              is finished first.
            </p>
            {uploadingPhotos && (
              <p className="text-warning">
                Waiting for photo uploads to finish.
              </p>
            )}
            {sync.error && <p className="text-warning">{sync.error}</p>}
            {requiredTotal - filledRequiredCount > 0 && (
              <div className="alert alert-warning">
                <HiOutlineExclamationTriangle className="h-5 w-5 shrink-0" />
                <span>
                  {requiredTotal - filledRequiredCount} of {requiredTotal}{" "}
                  required{" "}
                  {requiredTotal - filledRequiredCount === 1
                    ? "field is"
                    : "fields are"}{" "}
                  still incomplete.
                </span>
              </div>
            )}
            <div className="modal-action">
              <button
                type="button"
                className="btn btn-ghost"
                disabled={isLocking}
                onClick={() => lockModalRef.current?.close()}
              >
                Cancel
              </button>
              <Form
                method="post"
                onSubmit={async (event) => {
                  event.preventDefault();
                  const form = event.currentTarget;
                  if (!uploadingPhotos && (await sync.prepareLock()))
                    void submit(form, { method: "post" });
                }}
              >
                <input type="hidden" name="intent" value="lock" />
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isLocking || uploadingPhotos || !sync.ready}
                >
                  {isLocking && (
                    <span className="loading loading-spinner loading-sm" />
                  )}
                  {isLocking ? "Locking..." : "Lock check"}
                </button>
              </Form>
            </div>
          </div>
          <form method="dialog" className="modal-backdrop">
            <button>close</button>
          </form>
        </dialog>
      )}

      {/* Sticky Action Bar */}
      <div className="bg-base-100/80 fixed right-0 bottom-0 left-0 z-10 border-t backdrop-blur-sm">
        {(!isLocked || pendingUpdateCount > 0) && (
          <div
            role="status"
            aria-live="polite"
            className={`px-4 pt-2 text-center text-xs ${needsAttention || pendingUpdateCount > 0 ? "text-warning" : "text-success"}`}
          >
            {saveStatus}
          </div>
        )}
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
