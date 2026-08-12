import { useEffect, useState } from "react";

interface ToastOptions {
  message: string;
  type: "alert-info" | "alert-success" | "alert-error" | "alert-warning";
  isLoading?: boolean;
}

interface Toast extends ToastOptions {
  id: number;
}

type ToastInput = ToastOptions & {
  duration?: number | null;
};

let nextToastId = 1;
let listeners = new Set<(toasts: Toast[]) => void>();
let activeToasts: Toast[] = [];

function emitToasts() {
  for (const listener of listeners) {
    listener(activeToasts);
  }
}

function removeToast(id: number) {
  activeToasts = activeToasts.filter((toast) => toast.id !== id);
  emitToasts();
}

export function dismissToast(id: number) {
  removeToast(id);
}

export function showToast({ duration = 10000, ...toast }: ToastInput) {
  if (typeof window === "undefined") {
    return;
  }

  const nextToast: Toast = {
    id: nextToastId++,
    ...toast,
  };

  activeToasts = [...activeToasts, nextToast];
  emitToasts();

  if (duration !== null) {
    window.setTimeout(() => {
      removeToast(nextToast.id);
    }, duration);
  }

  return nextToast.id;
}

export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>(activeToasts);

  useEffect(() => {
    listeners.add(setToasts);
    setToasts(activeToasts);

    return () => {
      listeners.delete(setToasts);
    };
  }, []);

  return (
    <div className="toast toast-top toast-center z-1000">
      {toasts.map(({ id, message, type, isLoading }) => (
        <div
          key={id}
          className={`alert ${type} relative flex items-center gap-2`}
        >
          {isLoading && <span className="loading loading-spinner loading-xs" />}
          <span>{message}</span>{" "}
          {!isLoading && (
            <button
              className="btn btn-sm btn-circle btn-ghost absolute right-1"
              onClick={() => removeToast(id)}
            >
              ✕
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
