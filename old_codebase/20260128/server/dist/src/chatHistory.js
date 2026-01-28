"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var chatHistory_exports = {};
__export(chatHistory_exports, {
  appendChatMessage: () => appendChatMessage,
  buildConversationId: () => buildConversationId,
  deleteConversation: () => deleteConversation,
  getConversationMessages: () => getConversationMessages,
  listConversations: () => listConversations
});
module.exports = __toCommonJS(chatHistory_exports);
var fs = __toESM(require("fs"));
var path = __toESM(require("path"));
const PERSIST_PATH = path.resolve(__dirname, "..", "eden-chat-history.json");
const state = { conversations: {} };
function safeLoad() {
  try {
    if (!fs.existsSync(PERSIST_PATH))
      return;
    const raw = fs.readFileSync(PERSIST_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && parsed.conversations && typeof parsed.conversations === "object") {
      state.conversations = parsed.conversations;
    }
  } catch {
  }
}
const SAVE_DEBOUNCE_MS = 250;
let saveTimer = null;
let savePending = false;
function scheduleSave() {
  savePending = true;
  if (saveTimer)
    return;
  saveTimer = setTimeout(async () => {
    saveTimer = null;
    if (!savePending)
      return;
    savePending = false;
    try {
      await fs.promises.writeFile(PERSIST_PATH, JSON.stringify(state, null, 2), "utf8");
    } catch {
    }
  }, SAVE_DEBOUNCE_MS);
}
safeLoad();
function appendChatMessage(msg) {
  const conversationId = String(msg.conversationId || "").trim();
  if (!conversationId.startsWith("conv:")) {
    throw new Error("conversationId must start with 'conv:'");
  }
  const role = msg.role;
  const content = String(msg.content || "").trim();
  if (!content)
    throw new Error("content is required");
  const full = {
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
  if (!state.conversations[conversationId])
    state.conversations[conversationId] = [];
  state.conversations[conversationId].push(full);
  if (state.conversations[conversationId].length > 2e3) {
    state.conversations[conversationId] = state.conversations[conversationId].slice(-2e3);
  }
  scheduleSave();
  return full;
}
function getConversationMessages(conversationId, limit = 50, beforeTs) {
  const cid = String(conversationId || "").trim();
  const all = state.conversations[cid] || [];
  if (typeof beforeTs !== "number") {
    const maxLimit = Math.max(1, Math.min(500, limit));
    return all.slice(-maxLimit);
  }
  const filtered = all.filter((m) => m.timestamp < beforeTs);
  return filtered.slice(-Math.max(1, Math.min(500, limit)));
}
function listConversations(prefix) {
  const pfx = prefix ? String(prefix) : "";
  const ids = Object.keys(state.conversations);
  return pfx ? ids.filter((id) => id.startsWith(pfx)) : ids;
}
function deleteConversation(conversationId) {
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
function buildConversationId(scope, id, mode = "user") {
  const safeId = String(id || "").trim().replace(/\s+/g, "-");
  return `conv:${scope}:${safeId}:${mode}`;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  appendChatMessage,
  buildConversationId,
  deleteConversation,
  getConversationMessages,
  listConversations
});
//# sourceMappingURL=chatHistory.js.map
