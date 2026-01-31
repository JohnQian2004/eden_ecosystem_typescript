import * as fs from "fs";
import * as path from "path";

export type ChatRole = "USER" | "ASSISTANT" | "SYSTEM";

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: ChatRole;
  content: string;
  timestamp: number;
  userEmail?: string;
  mode?: string;
  scope?: string;
  gardenId?: string;
  serviceType?: string;
  linkedTransactionId?: string;
  status?: "active" | "forgiven";
}

const PERSIST_PATH = path.resolve(__dirname, "..", "eden-chat-history.json");

type Persisted = {
  conversations: Record<string, ChatMessage[]>;
};

const state: Persisted = { conversations: {} };

function safeLoad() {
  try {
    if (!fs.existsSync(PERSIST_PATH)) return;
    const raw = fs.readFileSync(PERSIST_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && parsed.conversations && typeof parsed.conversations === "object") {
      state.conversations = parsed.conversations;
    }
  } catch {
    // non-fatal: start empty
  }
}

// Persisting the entire chat history JSON on every append can block the event loop (seconds on Windows).
// Use a debounced async write so UI interactions (conversation switching/appends) stay snappy.
const SAVE_DEBOUNCE_MS = 250;
let saveTimer: NodeJS.Timeout | null = null;
let savePending = false;

function scheduleSave() {
  savePending = true;
  if (saveTimer) return;
  saveTimer = setTimeout(async () => {
    saveTimer = null;
    if (!savePending) return;
    savePending = false;
    try {
      await fs.promises.writeFile(PERSIST_PATH, JSON.stringify(state, null, 2), "utf8");
    } catch {
      // non-fatal
    }
  }, SAVE_DEBOUNCE_MS);
}

safeLoad();

export function appendChatMessage(msg: Omit<ChatMessage, "id" | "timestamp"> & { id?: string; timestamp?: number }): ChatMessage {
  const conversationId = String(msg.conversationId || "").trim();
  if (!conversationId.startsWith("conv:")) {
    throw new Error("conversationId must start with 'conv:'");
  }
  const role = msg.role;
  const content = String(msg.content || "").trim();
  if (!content) throw new Error("content is required");

  const full: ChatMessage = {
    id: msg.id || `m_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    conversationId,
    role,
    content,
    timestamp: msg.timestamp || Date.now(),
    userEmail: msg.userEmail,
    mode: msg.mode,
    scope: msg.scope,
    gardenId: msg.gardenId,
    serviceType: msg.serviceType,
    linkedTransactionId: msg.linkedTransactionId,
    status: msg.status || "active"
  };

  if (!state.conversations[conversationId]) state.conversations[conversationId] = [];
  state.conversations[conversationId].push(full);

  // keep bounded
  if (state.conversations[conversationId].length > 2000) {
    state.conversations[conversationId] = state.conversations[conversationId].slice(-2000);
  }

  scheduleSave();
  return full;
}

export function getConversationMessages(conversationId: string, limit: number = 50, beforeTs?: number): ChatMessage[] {
  const cid = String(conversationId || "").trim();
  const all = state.conversations[cid] || [];
  
  // Optimize: If no beforeTs, just take the last N messages directly (faster than filtering)
  if (typeof beforeTs !== "number") {
    const maxLimit = Math.max(1, Math.min(500, limit));
    return all.slice(-maxLimit);
  }
  
  // Only filter if beforeTs is provided
  const filtered = all.filter(m => m.timestamp < beforeTs);
  return filtered.slice(-Math.max(1, Math.min(500, limit)));
}

export function listConversations(prefix?: string): string[] {
  const pfx = prefix ? String(prefix) : "";
  const ids = Object.keys(state.conversations);
  return pfx ? ids.filter(id => id.startsWith(pfx)) : ids;
}

export function deleteConversation(conversationId: string): boolean {
  const cid = String(conversationId || "").trim();
  if (!cid.startsWith("conv:")) {
    throw new Error("conversationId must start with 'conv:'");
  }
  if (state.conversations[cid]) {
    delete state.conversations[cid];
    scheduleSave();
    return true;
  }
  return false;
}

export function buildConversationId(scope: 'garden' | 'service', id: string, mode: string = 'user'): string {
  const safeId = String(id || '').trim().replace(/\s+/g, '-');
  return `conv:${scope}:${safeId}:${mode}`;
}


