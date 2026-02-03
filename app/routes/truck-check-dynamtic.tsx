import { appContext } from "~/context";
import type { Route } from "./+types/truck-check-dynamtic";
import { useLoaderData } from "react-router";
import { useEffect, useRef, useState } from "react";

export async function loader({ context }: Route.LoaderArgs) {
  const ctx = context.get(appContext);
  if (!ctx) {
    throw new Error("Context not found");
  }
  return {
    user: ctx.user,
  };
}

export default function TruckCheckDynamic() {
  const { user } = useLoaderData<typeof loader>();
  const [connectionStatus, setConnectionStatus] = useState<
    "connecting" | "connected" | "disconnected" | "error"
  >("connecting");

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const url =
    import.meta.env?.VITE_WEBSOCKET_URL ||
    "wss://svzzsce7u8.execute-api.us-east-2.amazonaws.com/prod";

  if (typeof url !== "string") {
    throw new Error("webocket url not defined correctly");
  }

  const connectWebSocket = () => {
    let wsUrl = new URL(url);

    wsUrl.searchParams.set("access_token", user.accessToken);

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnectionStatus("connected");
        ws.send(JSON.stringify({ action: "get-current" }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "counter-update") {
            // TODO: Handle counter update
            console.log("Counter update:", data.value);
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
        setConnectionStatus("disconnected");
        reconnectTimeoutRef.current = setTimeout(() => {
          connectWebSocket();
        }, 3000);
      };
    } catch (error) {
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

  return <div>Truck Check Dynamic</div>;
}
