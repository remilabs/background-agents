# WebSocket Protocol Reference

This document describes the WebSocket protocol used by Open-Inspect for real-time communication
between clients and the control plane. An engineer should be able to build a programmatic client
from this specification alone.

## Overview

The control plane uses Cloudflare Durable Objects with hibernation-aware WebSockets. Each session
has its own Durable Object instance that manages WebSocket connections, persists events to SQLite,
and streams sandbox activity to connected clients.

**Key characteristics:**

- JSON-only message format (no binary)
- Token-based authentication (obtained via HTTP, validated over WS)
- Server-side event replay on connect (no separate history fetch needed for initial load)
- Cursor-based pagination for older history
- 30-second client-side keepalive pings

## Authentication Flow

Authentication is a two-step process: first obtain a token via HTTP, then present it over the
WebSocket.

### Step 1: Obtain a WebSocket Token

```
POST /sessions/:sessionId/ws-token
Content-Type: application/json
```

This endpoint requires an authenticated session (cookie-based via NextAuth in the web app). For
programmatic clients, you must authenticate however your deployment expects (e.g., session cookie or
bearer token) and call the control plane endpoint:

```
POST /sessions/:sessionId/ws-token
Content-Type: application/json

{
  "userId": "user-123",
  "githubLogin": "octocat",
  "githubName": "The Octocat",
  "githubEmail": "octocat@example.com"
}
```

**Response:**

```json
{
  "token": "a]b2c3d4e5f6...hex-encoded-32-bytes",
  "participantId": "part_abc123"
}
```

**Token properties:**

- 256-bit random token (32 bytes, hex-encoded)
- Server stores only the SHA-256 hash
- Each new token invalidates any previous token for that participant
- Tokens do not have a fixed TTL, but they are single-use in the sense that generating a new one
  invalidates the old one

### Step 2: Connect WebSocket

```
WebSocket: wss://<control-plane-host>/sessions/:sessionId/ws
```

The path must match `/sessions/:id/ws` exactly. The control plane inspects the `Upgrade: websocket`
header to route the request to the Durable Object.

### Step 3: Subscribe (Authenticate)

After the WebSocket connection opens, the client **must** send a `subscribe` message within **30
seconds** or the server will close the connection with code `4008` (authentication timeout).

```json
{
  "type": "subscribe",
  "token": "<token-from-step-1>",
  "clientId": "<unique-client-id>"
}
```

- `token` - The plain token returned from the ws-token endpoint.
- `clientId` - A unique identifier for this client connection (use `crypto.randomUUID()` or
  equivalent). Used for presence tracking and deduplication.

On success, the server responds with a `subscribed` message containing session state and recent
event history.

## Connection Lifecycle

```
Client                                Server
  |                                     |
  |--- WebSocket connect -------------->|
  |<-- Connection accepted (101) -------|
  |                                     |
  |--- subscribe {token, clientId} ---->|
  |<-- subscribed {state, replay} ------|
  |<-- presence_sync {participants} ----|
  |                                     |
  |--- ping --------------------------->|  (every 30s)
  |<-- pong ----------------------------|
  |                                     |
  |--- prompt {content} --------------->|  (user sends message)
  |<-- sandbox_event {event} -----------|  (streaming events)
  |<-- sandbox_event {event} -----------|
  |<-- ...                              |
  |                                     |
  |--- disconnect --------------------->|
  |<-- presence_leave ---- (to others) -|
```

### States

1. **Connecting** - TCP/TLS handshake in progress
2. **Connected** - WebSocket open, awaiting `subscribe`
3. **Authenticated** - `subscribe` accepted, receiving events
4. **Disconnected** - Connection closed (clean or unclean)

## Client Messages (Client -> Server)

### `ping`

Keepalive heartbeat. The client should send this every 30 seconds.

```json
{ "type": "ping" }
```

### `subscribe`

Authenticate and join the session. Must be sent within 30 seconds of connect.

```json
{
  "type": "subscribe",
  "token": "abc123def456...",
  "clientId": "550e8400-e29b-41d4-a716-446655440000"
}
```

### `prompt`

Send a message to the agent. The server queues it and forwards to the sandbox.

```json
{
  "type": "prompt",
  "content": "Fix the failing test in auth.test.ts",
  "model": "anthropic/claude-sonnet-4-5",
  "reasoningEffort": "high",
  "requestId": "req-001",
  "attachments": [
    {
      "type": "file",
      "name": "error.log",
      "content": "TypeError: Cannot read property..."
    },
    {
      "type": "image",
      "name": "screenshot.png",
      "url": "https://example.com/screenshot.png"
    }
  ]
}
```

| Field             | Type     | Required | Description                                         |
| ----------------- | -------- | -------- | --------------------------------------------------- |
| `content`         | `string` | Yes      | The prompt text                                     |
| `model`           | `string` | No       | LLM model override for this message                 |
| `reasoningEffort` | `string` | No       | Reasoning effort level (e.g., `"high"`, `"max"`)    |
| `requestId`       | `string` | No       | Client-generated ID for correlating `prompt_queued` |
| `attachments`     | `array`  | No       | Files, images, or URLs to attach                    |

**Attachment object:**

| Field      | Type     | Required | Description                         |
| ---------- | -------- | -------- | ----------------------------------- |
| `type`     | `string` | Yes      | `"file"`, `"image"`, or `"url"`     |
| `name`     | `string` | Yes      | Display name                        |
| `url`      | `string` | No       | URL for image/url attachments       |
| `content`  | `string` | No       | Inline content for file attachments |
| `mimeType` | `string` | No       | MIME type hint                      |

### `stop`

Interrupt the currently running agent execution.

```json
{ "type": "stop" }
```

### `typing`

Notify other participants that this user is typing.

```json
{ "type": "typing" }
```

### `presence`

Update this client's presence status.

```json
{
  "type": "presence",
  "status": "active",
  "cursor": { "line": 42, "file": "src/main.ts" }
}
```

| Field    | Type     | Required | Description                          |
| -------- | -------- | -------- | ------------------------------------ |
| `status` | `string` | Yes      | `"active"` or `"idle"`               |
| `cursor` | `object` | No       | Current cursor position in an editor |

### `fetch_history`

Request older events for paginated history loading.

```json
{
  "type": "fetch_history",
  "cursor": { "timestamp": 1708000000000, "id": "evt_abc123" },
  "limit": 200
}
```

| Field    | Type     | Required | Description                                                                         |
| -------- | -------- | -------- | ----------------------------------------------------------------------------------- |
| `cursor` | `object` | Yes      | Pagination cursor from `subscribed.replay.cursor` or previous `history_page.cursor` |
| `limit`  | `number` | No       | Max events to return (1-500, default 200)                                           |

**Rate limit:** Requests within 200ms of the previous one are rejected with error code
`RATE_LIMITED`.

## Server Messages (Server -> Client)

### `pong`

Response to a `ping` keepalive.

```json
{
  "type": "pong",
  "timestamp": 1708000000000
}
```

### `subscribed`

Sent after successful authentication. Contains the full session state and recent event history.

```json
{
  "type": "subscribed",
  "sessionId": "sess_abc123",
  "state": {
    "id": "sess_abc123",
    "title": "Fix auth tests",
    "repoOwner": "acme",
    "repoName": "api",
    "branchName": "fix/auth-tests",
    "status": "active",
    "sandboxStatus": "ready",
    "messageCount": 5,
    "createdAt": 1708000000000,
    "model": "anthropic/claude-sonnet-4-5",
    "reasoningEffort": "high",
    "isProcessing": false
  },
  "participantId": "part_abc123",
  "participant": {
    "participantId": "part_abc123",
    "name": "The Octocat",
    "avatar": "https://avatars.githubusercontent.com/u/583231?v=4"
  },
  "replay": {
    "events": [
      /* array of SandboxEvent objects */
    ],
    "hasMore": true,
    "cursor": { "timestamp": 1708000000000, "id": "evt_oldest" }
  },
  "spawnError": null
}
```

**SessionState fields:**

| Field             | Type      | Description                                                  |
| ----------------- | --------- | ------------------------------------------------------------ |
| `id`              | `string`  | Session ID                                                   |
| `title`           | `string?` | Human-readable session title                                 |
| `repoOwner`       | `string`  | Repository owner (org or user)                               |
| `repoName`        | `string`  | Repository name                                              |
| `branchName`      | `string?` | Working branch name                                          |
| `status`          | `string`  | Session status: `created`, `active`, `completed`, `archived` |
| `sandboxStatus`   | `string`  | Sandbox status (see below)                                   |
| `messageCount`    | `number`  | Total messages in session                                    |
| `createdAt`       | `number`  | Unix timestamp in milliseconds                               |
| `model`           | `string?` | Current LLM model                                            |
| `reasoningEffort` | `string?` | Current reasoning effort level                               |
| `isProcessing`    | `boolean` | Whether the agent is currently processing                    |

**Sandbox status values:** `pending` | `spawning` | `connecting` | `warming` | `syncing` | `ready` |
`running` | `stale` | `snapshotting` | `stopped` | `failed`

**Replay:** The `replay` field contains the most recent events (up to 500). If `hasMore` is `true`,
use `fetch_history` with the provided `cursor` to load older events.

### `prompt_queued`

Confirmation that a prompt was accepted and queued.

```json
{
  "type": "prompt_queued",
  "messageId": "msg_abc123",
  "position": 0,
  "requestId": "req-001"
}
```

| Field       | Type      | Description                                      |
| ----------- | --------- | ------------------------------------------------ |
| `messageId` | `string`  | Server-assigned message ID                       |
| `position`  | `number`  | Queue position (0 = processing immediately)      |
| `requestId` | `string?` | Echo of the client's `requestId` for correlation |

### `sandbox_event`

A real-time event from the sandbox. This is the primary mechanism for streaming agent activity.

```json
{
  "type": "sandbox_event",
  "event": {
    /* SandboxEvent object */
  }
}
```

See [Sandbox Event Types](#sandbox-event-types) below for all event variants.

### `presence_sync`

Full list of currently connected participants. Sent after `subscribed`.

```json
{
  "type": "presence_sync",
  "participants": [
    {
      "participantId": "part_abc123",
      "userId": "user-123",
      "name": "The Octocat",
      "avatar": "https://avatars.githubusercontent.com/u/583231?v=4",
      "status": "active",
      "lastSeen": 1708000000000
    }
  ]
}
```

### `presence_update`

Updated participant list (e.g., when someone's status changes).

```json
{
  "type": "presence_update",
  "participants": [
    /* same shape as presence_sync */
  ]
}
```

### `presence_leave`

A participant disconnected.

```json
{
  "type": "presence_leave",
  "userId": "user-123"
}
```

### `sandbox_warming`

The sandbox is being warmed up (container starting).

```json
{ "type": "sandbox_warming" }
```

### `sandbox_spawning`

The sandbox is being spawned (new container being created).

```json
{ "type": "sandbox_spawning" }
```

### `sandbox_status`

Generic sandbox status update.

```json
{
  "type": "sandbox_status",
  "status": "syncing"
}
```

### `sandbox_ready`

The sandbox is ready to accept prompts.

```json
{ "type": "sandbox_ready" }
```

### `sandbox_error`

A fatal sandbox error occurred.

```json
{
  "type": "sandbox_error",
  "error": "Sandbox failed to start: out of memory"
}
```

### `session_status`

The session status changed.

```json
{
  "type": "session_status",
  "status": "completed"
}
```

### `processing_status`

Whether the agent is currently processing a prompt.

```json
{
  "type": "processing_status",
  "isProcessing": true
}
```

### `artifact_created`

A new artifact (PR, branch, screenshot, etc.) was created.

```json
{
  "type": "artifact_created",
  "artifact": {
    "id": "art_abc123",
    "type": "pr",
    "url": "https://github.com/acme/api/pull/42",
    "prNumber": 42
  }
}
```

### `snapshot_saved`

A filesystem snapshot was saved.

```json
{
  "type": "snapshot_saved",
  "imageId": "img_abc123",
  "reason": "inactivity_timeout"
}
```

### `sandbox_restored`

The sandbox was restored from a snapshot.

```json
{
  "type": "sandbox_restored",
  "message": "Sandbox restored from snapshot"
}
```

### `sandbox_warning`

A non-fatal sandbox warning.

```json
{
  "type": "sandbox_warning",
  "message": "Sandbox approaching memory limit"
}
```

### `history_page`

Response to a `fetch_history` request. Contains older events.

```json
{
  "type": "history_page",
  "items": [
    /* array of SandboxEvent objects */
  ],
  "hasMore": true,
  "cursor": { "timestamp": 1707999000000, "id": "evt_older" }
}
```

| Field     | Type      | Description                                  |
| --------- | --------- | -------------------------------------------- |
| `items`   | `array`   | Array of SandboxEvent objects (oldest first) |
| `hasMore` | `boolean` | Whether more history is available            |
| `cursor`  | `object?` | Cursor for the next `fetch_history` request  |

### `error`

A protocol-level error.

```json
{
  "type": "error",
  "code": "NOT_SUBSCRIBED",
  "message": "Must subscribe first"
}
```

**Known error codes:**

| Code              | Description                                         |
| ----------------- | --------------------------------------------------- |
| `NOT_SUBSCRIBED`  | Action requires subscription first                  |
| `INVALID_MESSAGE` | Failed to parse or process a client message         |
| `INVALID_CURSOR`  | Invalid cursor in `fetch_history`                   |
| `RATE_LIMITED`    | `fetch_history` called too frequently (< 200ms gap) |

## Sandbox Event Types

Sandbox events are streamed via `sandbox_event` messages. They are also included in the `replay`
field of the `subscribed` message and in `history_page` responses.

All sandbox events share a `type` field and a `timestamp` (Unix ms).

### `user_message`

A user's prompt, broadcast to all clients (including the sender).

```json
{
  "type": "user_message",
  "content": "Fix the failing test",
  "messageId": "msg_abc123",
  "timestamp": 1708000000000,
  "author": {
    "participantId": "part_abc123",
    "name": "The Octocat",
    "avatar": "https://avatars.githubusercontent.com/u/583231?v=4"
  }
}
```

### `token`

Streamed text content from the agent. Token events contain the **full accumulated text** for the
current message, not incremental deltas. Each subsequent token event replaces the previous one.

```json
{
  "type": "token",
  "content": "I'll fix the test by updating the assertion...",
  "messageId": "msg_abc123",
  "sandboxId": "sb-xyz",
  "timestamp": 1708000001000
}
```

### `tool_call`

The agent is invoking a tool.

```json
{
  "type": "tool_call",
  "tool": "Read",
  "args": { "file_path": "/src/auth.test.ts" },
  "callId": "call_001",
  "status": "running",
  "messageId": "msg_abc123",
  "sandboxId": "sb-xyz",
  "timestamp": 1708000002000
}
```

### `tool_result`

Result of a tool invocation.

```json
{
  "type": "tool_result",
  "callId": "call_001",
  "result": "File contents here...",
  "error": null,
  "messageId": "msg_abc123",
  "sandboxId": "sb-xyz",
  "timestamp": 1708000003000
}
```

### `step_start`

The agent started a reasoning step.

```json
{
  "type": "step_start",
  "messageId": "msg_abc123",
  "sandboxId": "sb-xyz",
  "timestamp": 1708000004000,
  "isSubtask": false
}
```

### `step_finish`

The agent finished a reasoning step.

```json
{
  "type": "step_finish",
  "cost": 0.0042,
  "tokens": 1500,
  "reason": "end_turn",
  "messageId": "msg_abc123",
  "sandboxId": "sb-xyz",
  "timestamp": 1708000005000,
  "isSubtask": false
}
```

### `execution_complete`

The agent finished processing a prompt.

```json
{
  "type": "execution_complete",
  "messageId": "msg_abc123",
  "success": true,
  "sandboxId": "sb-xyz",
  "timestamp": 1708000006000
}
```

On failure:

```json
{
  "type": "execution_complete",
  "messageId": "msg_abc123",
  "success": false,
  "error": "Agent exceeded token limit",
  "sandboxId": "sb-xyz",
  "timestamp": 1708000006000
}
```

### `git_sync`

Git repository sync status update.

```json
{
  "type": "git_sync",
  "status": "completed",
  "sha": "abc123def456",
  "sandboxId": "sb-xyz",
  "timestamp": 1708000007000
}
```

`status` values: `pending` | `in_progress` | `completed` | `failed`

### `push_complete`

Code was pushed to a branch.

```json
{
  "type": "push_complete",
  "branchName": "fix/auth-tests",
  "sandboxId": "sb-xyz",
  "timestamp": 1708000008000
}
```

### `push_error`

A push to a branch failed.

```json
{
  "type": "push_error",
  "branchName": "fix/auth-tests",
  "error": "Permission denied",
  "sandboxId": "sb-xyz",
  "timestamp": 1708000008000
}
```

### `artifact`

An artifact was produced by the sandbox.

```json
{
  "type": "artifact",
  "artifactType": "pr",
  "url": "https://github.com/acme/api/pull/42",
  "metadata": { "prNumber": 42 },
  "sandboxId": "sb-xyz",
  "timestamp": 1708000009000
}
```

### `heartbeat`

Periodic sandbox health check (typically not displayed to users).

```json
{
  "type": "heartbeat",
  "sandboxId": "sb-xyz",
  "status": "running",
  "timestamp": 1708000010000
}
```

### `error`

An error event from the sandbox.

```json
{
  "type": "error",
  "error": "Process exited with code 1",
  "messageId": "msg_abc123",
  "sandboxId": "sb-xyz",
  "timestamp": 1708000011000
}
```

## WebSocket Close Codes

| Code   | Meaning                 | Client Action                                |
| ------ | ----------------------- | -------------------------------------------- |
| `1000` | Normal close            | None                                         |
| `1001` | Going away              | Reconnect                                    |
| `4001` | Authentication required | Clear token, re-authenticate, then reconnect |
| `4002` | Session expired         | Clear token, re-authenticate, then reconnect |
| `4008` | Authentication timeout  | Subscribe was not sent within 30 seconds     |

## Reconnection Strategy

The reference client implementation uses exponential backoff:

1. On unclean close (not code `1000`), attempt reconnection
2. Backoff delay: `min(1000 * 2^attempt, 30000)` milliseconds
3. Maximum 5 reconnection attempts before giving up
4. On auth-related close codes (`4001`, `4002`): clear the cached token before reconnecting so a
   fresh token is obtained
5. On successful connect: reset the attempt counter to 0

**Important:** After reconnection, the client must:

- Fetch a new ws-token (if the old one was invalidated)
- Send a new `subscribe` message
- Process the `replay` events in the `subscribed` response (these replace any stale local state)

## Example: Minimal TypeScript/JavaScript Client

```typescript
const CONTROL_PLANE_URL = "https://open-inspect-control-plane.example.workers.dev";
const SESSION_ID = "sess_abc123";

// Step 1: Get a WebSocket token
async function getWsToken(): Promise<string> {
  const response = await fetch(`${CONTROL_PLANE_URL}/sessions/${SESSION_ID}/ws-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId: "programmatic-client",
      githubLogin: "my-bot",
      githubName: "My Bot",
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to get token: ${response.status}`);
  }

  const data = await response.json();
  return data.token;
}

// Step 2: Connect and subscribe
async function connect() {
  const token = await getWsToken();
  const wsUrl = CONTROL_PLANE_URL.replace("https://", "wss://");
  const ws = new WebSocket(`${wsUrl}/sessions/${SESSION_ID}/ws`);

  ws.onopen = () => {
    // Step 3: Authenticate
    ws.send(
      JSON.stringify({
        type: "subscribe",
        token,
        clientId: crypto.randomUUID(),
      })
    );
  };

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);

    switch (msg.type) {
      case "subscribed":
        console.log("Connected to session:", msg.state.id);
        console.log("Sandbox status:", msg.state.sandboxStatus);
        console.log("Replay events:", msg.replay?.events.length ?? 0);

        // Step 4: Send a prompt once subscribed
        ws.send(
          JSON.stringify({
            type: "prompt",
            content: "List the files in the root directory",
          })
        );
        break;

      case "sandbox_event":
        handleSandboxEvent(msg.event);
        break;

      case "prompt_queued":
        console.log("Prompt queued, messageId:", msg.messageId);
        break;

      case "processing_status":
        console.log("Processing:", msg.isProcessing);
        break;

      case "error":
        console.error(`Error [${msg.code}]: ${msg.message}`);
        break;

      case "pong":
        // Keepalive response, no action needed
        break;
    }
  };

  ws.onclose = (event) => {
    console.log(`Connection closed: code=${event.code} reason=${event.reason}`);
  };

  // Step 5: Send keepalive pings every 30 seconds
  const pingInterval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "ping" }));
    } else {
      clearInterval(pingInterval);
    }
  }, 30_000);

  return ws;
}

function handleSandboxEvent(event: Record<string, unknown>) {
  switch (event.type) {
    case "user_message":
      console.log(`[${event.author?.name}] ${event.content}`);
      break;
    case "token":
      // Full accumulated text (not incremental)
      process.stdout.write(`\rAgent: ${event.content}`);
      break;
    case "tool_call":
      console.log(`Tool: ${event.tool}(${JSON.stringify(event.args)})`);
      break;
    case "tool_result":
      console.log(`Result: ${String(event.result).slice(0, 200)}`);
      break;
    case "execution_complete":
      console.log(`\nDone (success: ${event.success})`);
      break;
    case "git_sync":
      console.log(`Git sync: ${event.status}${event.sha ? ` @ ${event.sha}` : ""}`);
      break;
    case "push_complete":
      console.log(`Pushed to ${event.branchName}`);
      break;
    case "error":
      console.error(`Sandbox error: ${event.error}`);
      break;
  }
}

connect().catch(console.error);
```

## Notes for Client Implementors

1. **Token events are cumulative.** Each `token` event contains the full accumulated text for the
   current message, not an incremental delta. Display the latest `content` value, not a
   concatenation of all token events.

2. **Wait for `subscribed` before sending prompts.** Sending a `prompt` before the server has
   confirmed subscription will result in an error.

3. **Handle `replay` events on connect.** The `subscribed` message includes up to 500 recent events.
   Use these to reconstruct the session timeline. If `replay.hasMore` is `true`, use `fetch_history`
   with the provided cursor to load older events.

4. **The server may send `sandbox_event` wrapping any event type.** During live streaming, all
   sandbox events arrive wrapped in `{ "type": "sandbox_event", "event": { ... } }`. During replay
   (in the `subscribed` message and `history_page`), events are bare objects without the wrapper.

5. **Presence is informational.** You can safely ignore `presence_sync`, `presence_update`, and
   `presence_leave` messages if you don't need multiplayer awareness.

6. **Sandbox lifecycle messages are status hints.** Messages like `sandbox_warming`,
   `sandbox_spawning`, `sandbox_ready`, and `sandbox_status` help update UI but are not strictly
   required for protocol correctness.
