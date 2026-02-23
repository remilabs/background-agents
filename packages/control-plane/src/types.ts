/**
 * Type definitions for Open-Inspect Control Plane.
 *
 * Canonical types (SandboxStatus, MessageSource, SandboxEvent, ClientMessage,
 * ServerMessage, SessionState, ParticipantPresence, etc.) are defined in
 * @open-inspect/shared and re-exported here. Control-plane-specific types
 * (Env, ClientInfo, GitHub OAuth) are defined locally.
 */

// Re-export canonical types from shared
export type {
  SessionStatus,
  SandboxStatus,
  GitSyncStatus,
  MessageStatus,
  MessageSource,
  EventType,
  ArtifactType,
  Attachment,
  SandboxEvent,
  ClientMessage,
  ServerMessage,
  SessionState,
  ParticipantPresence,
  CreateSessionRequest,
  CreateSessionResponse,
} from "@open-inspect/shared";

// Participant role (used by control plane's session/types.ts)
export type ParticipantRole = "owner" | "member";

// Environment bindings
export interface Env {
  // Durable Objects
  SESSION: DurableObjectNamespace;

  // KV Namespaces
  REPOS_CACHE: KVNamespace; // Short-lived cache for /repos listing

  // Service bindings
  SLACK_BOT?: Fetcher; // Optional - only if slack-bot is deployed
  LINEAR_BOT?: Fetcher; // Optional - only if linear-bot is deployed

  // D1 database
  DB: D1Database;

  // Secrets
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  TOKEN_ENCRYPTION_KEY: string;
  REPO_SECRETS_ENCRYPTION_KEY?: string;
  MODAL_TOKEN_ID?: string;
  MODAL_TOKEN_SECRET?: string;
  MODAL_API_SECRET?: string; // Shared secret for authenticating with Modal endpoints
  INTERNAL_CALLBACK_SECRET?: string; // For signing callbacks to slack-bot

  // GitHub App secrets (for git operations)
  GITHUB_APP_ID?: string;
  GITHUB_APP_PRIVATE_KEY?: string;
  GITHUB_APP_INSTALLATION_ID?: string;

  // Variables
  DEPLOYMENT_NAME: string;
  SCM_PROVIDER?: string; // Source control provider for this deployment (default: github)
  WORKER_URL?: string; // Base URL for the worker (for callbacks)
  WEB_APP_URL?: string; // Base URL for the web app (for PR links)
  CF_ACCOUNT_ID?: string; // Cloudflare account ID
  MODAL_WORKSPACE?: string; // Modal workspace name (used in Modal endpoint URLs)

  // Sandbox lifecycle configuration
  SANDBOX_INACTIVITY_TIMEOUT_MS?: string; // Inactivity timeout in ms (default: 600000 = 10 min)

  // Logging
  LOG_LEVEL?: string; // "debug" | "info" | "warn" | "error" (default: "info")
}

// Client info (stored in DO memory)
export interface ClientInfo {
  participantId: string;
  userId: string;
  name: string;
  avatar?: string;
  status: "active" | "idle" | "away";
  lastSeen: number;
  clientId: string;
  ws: WebSocket;
  lastFetchHistoryAt?: number;
}

// GitHub OAuth types
export interface GitHubUser {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
  avatar_url: string;
}

export interface GitHubTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
  refresh_token?: string;
  expires_in?: number;
}
