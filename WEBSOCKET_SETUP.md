# WebSocket Real-time Counter Setup

This document describes the WebSocket implementation for real-time features in the application.

## Architecture

The WebSocket implementation consists of:

1. **DynamoDB Tables**:
   - `aes_websocket_connections` - Tracks active WebSocket connections with TTL
   - `aes_counter_state` - Stores the global counter value

2. **Lambda Function**:
   - `websocket` - Single consolidated handler that uses `event.requestContext.eventType` to handle CONNECT, DISCONNECT, and MESSAGE events

3. **API Gateway**:
   - WebSocket API Gateway with routes for `$connect`, `$disconnect`, and `$default`

4. **React Component**:
   - `/realtime-counter` - Demo page with real-time counter

## Deployment

### 1. Install Dependencies

```bash
npm install
```

### 2. Deploy Infrastructure

```bash
npm run deploy:app
```

After deployment, note the `WebSocketApiEndpoint` from the CDK output.

### 3. Configure Environment

Create a `.env` file (or update existing) with:

```bash
VITE_WEBSOCKET_URL=wss://YOUR_WEBSOCKET_API_ID.execute-api.YOUR_REGION.amazonaws.com/prod
```

Replace `YOUR_WEBSOCKET_API_ID` and `YOUR_REGION` with values from the CDK output.

### 4. Run Development Server

```bash
npm run dev
```

Navigate to `/realtime-counter` to see the demo.

## How It Works

1. **Connection**: When a user opens the page, the React component establishes a WebSocket connection
2. **Initial State**: The client sends a `get-current` action to retrieve the current counter value
3. **Increment**: When a user clicks the increment button:
   - Client sends an `increment` action via WebSocket
   - Lambda updates the counter in DynamoDB
   - Lambda broadcasts the new value to all connected clients
4. **Real-time Updates**: All connected clients receive the update simultaneously
5. **Reconnection**: If the connection drops, the client automatically attempts to reconnect

## Message Protocol

### Client → Server

```json
{
  "action": "increment"
}
```

```json
{
  "action": "get-current"
}
```

### Server → Client

```json
{
  "type": "counter-update",
  "value": 42
}
```

## Testing

1. Open the `/realtime-counter` page in multiple browser windows/tabs
2. Click the increment button in one window
3. Observe the counter update in all windows simultaneously

## Technical Details

- **Simplified Architecture**: Single Lambda function handles all WebSocket events (CONNECT, DISCONNECT, MESSAGE) using `event.requestContext.eventType`
- **Connection Tracking**: Connections are stored in DynamoDB with a 2-hour TTL
- **Stale Connection Cleanup**: When broadcasting fails with a 410 error, the connection is removed
- **Automatic Reconnection**: Client reconnects every 3 seconds if disconnected
- **Atomic Updates**: Counter increments use DynamoDB's atomic update operations

## Extending the Implementation

To add more real-time features:

1. Add new actions to the `handleMessage` function in `websocket.ts`
2. Update the message protocol
3. Create new React components that connect to the WebSocket
4. Consider adding authentication/authorization to WebSocket connections

## Cost Considerations

- WebSocket connections: $1.00 per million connection minutes
- Messages: $1.00 per million messages
- DynamoDB: Pay-per-request pricing
- Lambda: Standard Lambda pricing applies

For low-traffic applications, costs should be minimal (< $1/month).
