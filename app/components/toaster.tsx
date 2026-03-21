interface ToastOptions {
  message: string;
  type: "alert-info" | "alert-success" | "alert-error" | "alert-warning";
}

import { useEffect, useState } from "react";

interface Toast extends ToastOptions {
  id: number;
}

type ToastInput = ToastOptions & {
  duration?: number;
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

export function showToast({ duration = 3000, ...toast }: ToastInput) {
  if (typeof window === "undefined") {
    return;
  }

  const nextToast: Toast = {
    id: nextToastId++,
    ...toast,
  };

  activeToasts = [...activeToasts, nextToast];
  emitToasts();

  window.setTimeout(() => {
    removeToast(nextToast.id);
  }, duration);
}

export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>(activeToasts);

  useEffect(() => {
    listeners.add(setToasts);

    return () => {
      listeners.delete(setToasts);
    };
  }, []);

  return (
    <div className="toast toast-top toast-center z-1000">
      {toasts.map(({ id, message, type }) => (
        <div key={id} className={`alert ${type} relative`}>
          <span>{message}</span>{" "}
          <button
            className="btn btn-sm btn-circle btn-ghost absolute right-1"
            onClick={() => removeToast(id)}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
