import { useEffect, useState, useRef } from "react";
import type { Route } from "./+types/realtime-counter";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Real-time Counter - Inside Amelia Rescue" },
    { name: "description", content: "WebSocket real-time counter demo" },
  ];
}

export default function RealtimeCounter() {
  const [counter, setCounter] = useState<number>(0);
  const [connectionStatus, setConnectionStatus] = useState<
    "connecting" | "connected" | "disconnected" | "error"
  >("connecting");
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const connectWebSocket = () => {
    const wsUrl =
      import.meta.env.VITE_WEBSOCKET_URL ||
      "wss://svzzsce7u8.execute-api.us-east-2.amazonaws.com/prod";

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("WebSocket connected");
        setConnectionStatus("connected");
        ws.send(JSON.stringify({ action: "get-current" }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "counter-update") {
            setCounter(data.value);
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
  };

  useEffect(() => {
    connectWebSocket();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const handleIncrement = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: "increment" }));
    }
  };

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
        return "Disconnected";
      case "error":
        return "Error";
      default:
        return "Unknown";
    }
  };

  return (
    <div className="container mx-auto max-w-4xl p-6">
      <div className="mb-8">
        <h1 className="mb-2 text-3xl font-bold">Real-time Counter Demo</h1>
        <p className="text-gray-600">
          This counter updates in real-time across all connected clients using
          WebSockets and AWS Lambda.
        </p>
      </div>

      <div className="mb-6 flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className={`h-3 w-3 rounded-full ${getStatusColor()}`} />
          <span className="text-sm font-medium">{getStatusText()}</span>
        </div>
      </div>

      <div className="card bg-base-100 shadow-xl">
        <div className="card-body items-center text-center">
          <h2 className="card-title mb-4 text-xl">Global Counter</h2>

          <div className="mb-8 flex items-center justify-center">
            <div className="bg-primary text-primary-content rounded-lg p-8 text-6xl font-bold">
              {counter}
            </div>
          </div>

          <div className="card-actions">
            <button
              className="btn btn-primary btn-lg"
              onClick={handleIncrement}
              disabled={connectionStatus !== "connected"}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
              Increment Counter
            </button>
          </div>

          {connectionStatus !== "connected" && (
            <div className="alert alert-warning mt-4">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-6 w-6 shrink-0 stroke-current"
                fill="none"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <span>
                WebSocket is not connected. Attempting to reconnect...
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="alert alert-info mt-8">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          className="h-6 w-6 shrink-0 stroke-current"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <div>
          <h3 className="font-bold">How it works</h3>
          <div className="text-sm">
            When you click the increment button, a message is sent via WebSocket
            to AWS Lambda, which updates the counter in DynamoDB and broadcasts
            the new value to all connected clients in real-time.
          </div>
        </div>
      </div>

      <div className="mt-6">
        <h3 className="mb-3 text-lg font-semibold">Technical Details</h3>
        <ul className="list-inside list-disc space-y-2 text-sm text-gray-600">
          <li>WebSocket API Gateway with Lambda integration</li>
          <li>DynamoDB for connection tracking and counter state</li>
          <li>Real-time broadcasting to all connected clients</li>
          <li>Automatic reconnection on connection loss</li>
          <li>TTL-based cleanup of stale connections</li>
        </ul>
      </div>
    </div>
  );
}
