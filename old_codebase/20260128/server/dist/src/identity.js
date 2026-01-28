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
var identity_exports = {};
__export(identity_exports, {
  createEdenUser: () => createEdenUser,
  getEdenUser: () => getEdenUser,
  getEdenUserByEmail: () => getEdenUserByEmail,
  getEdenUserByGoogleId: () => getEdenUserByGoogleId,
  getEdenUserByUsername: () => getEdenUserByUsername,
  getGardenUser: () => getGardenUser,
  initializeIdentity: () => initializeIdentity,
  isUsernameAvailable: () => isUsernameAvailable,
  joinGarden: () => joinGarden,
  resolveDisplayName: () => resolveDisplayName,
  updateGardenNickname: () => updateGardenNickname,
  validateUsername: () => validateUsername
});
module.exports = __toCommonJS(identity_exports);
var crypto = __toESM(require("crypto"));
var fs = __toESM(require("fs"));
var path = __toESM(require("path"));
const EDEN_USERS = /* @__PURE__ */ new Map();
const EDEN_USERS_BY_GOOGLE_ID = /* @__PURE__ */ new Map();
const EDEN_USERS_BY_USERNAME = /* @__PURE__ */ new Map();
const GARDEN_USERS = /* @__PURE__ */ new Map();
const GARDEN_USERNAMES = /* @__PURE__ */ new Map();
function initializeIdentity() {
  console.log("\u{1F3AD} [Identity] Initializing identity system...");
  loadIdentityPersistence();
  console.log(`\u2705 [Identity] Identity system initialized. Users: ${EDEN_USERS.size}, Garden users: ${GARDEN_USERS.size}`);
}
function createEdenUser(googleUserId, email, globalUsername, globalNickname) {
  const validation = validateUsername(globalUsername);
  if (!validation.valid) {
    throw new Error(validation.error || "Invalid username");
  }
  if (EDEN_USERS_BY_USERNAME.has(globalUsername.toLowerCase())) {
    throw new Error("Username is already taken");
  }
  if (EDEN_USERS_BY_GOOGLE_ID.has(googleUserId)) {
    throw new Error("User already exists for this Google account");
  }
  const userId = crypto.randomUUID();
  const user = {
    userId,
    googleUserId,
    primaryEmail: email,
    createdAt: Date.now(),
    globalUsername,
    globalNickname,
    status: "ACTIVE"
  };
  EDEN_USERS.set(userId, user);
  EDEN_USERS_BY_GOOGLE_ID.set(googleUserId, userId);
  EDEN_USERS_BY_USERNAME.set(globalUsername.toLowerCase(), userId);
  saveIdentityPersistence();
  console.log(`\u2705 [Identity] Created Eden user: ${globalUsername} (${userId})`);
  return user;
}
function getEdenUser(userId) {
  return EDEN_USERS.get(userId) || null;
}
function getEdenUserByGoogleId(googleUserId) {
  const userId = EDEN_USERS_BY_GOOGLE_ID.get(googleUserId);
  if (!userId)
    return null;
  return EDEN_USERS.get(userId) || null;
}
function getEdenUserByUsername(username) {
  const userId = EDEN_USERS_BY_USERNAME.get(username.toLowerCase());
  if (!userId)
    return null;
  return EDEN_USERS.get(userId) || null;
}
function getEdenUserByEmail(email) {
  for (const user of EDEN_USERS.values()) {
    if (user.primaryEmail.toLowerCase() === email.toLowerCase()) {
      return user;
    }
  }
  return null;
}
function isUsernameAvailable(username) {
  const validation = validateUsername(username);
  if (!validation.valid) {
    return false;
  }
  return !EDEN_USERS_BY_USERNAME.has(username.toLowerCase());
}
function validateUsername(username) {
  if (!username || username.length < 3) {
    return { valid: false, error: "Username must be at least 3 characters" };
  }
  if (username.length > 30) {
    return { valid: false, error: "Username must be 30 characters or less" };
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
    return { valid: false, error: "Username can only contain letters, numbers, underscores, and hyphens" };
  }
  if (/^[0-9]/.test(username)) {
    return { valid: false, error: "Username cannot start with a number" };
  }
  return { valid: true };
}
function joinGarden(userId, gardenId, gardenUsername, gardenNickname) {
  const user = getEdenUser(userId);
  if (!user) {
    throw new Error("User not found");
  }
  const finalGardenUsername = gardenUsername || user.globalUsername;
  const gardenUsernames = GARDEN_USERNAMES.get(gardenId) || /* @__PURE__ */ new Set();
  if (gardenUsernames.has(finalGardenUsername.toLowerCase())) {
    let counter = 2;
    let candidate = `${finalGardenUsername}_${counter}`;
    while (gardenUsernames.has(candidate.toLowerCase())) {
      counter++;
      candidate = `${finalGardenUsername}_${counter}`;
    }
    throw new Error(`Username "${finalGardenUsername}" is taken in this garden. Suggested: "${candidate}"`);
  }
  const cacheKey = `${gardenId}:${userId}`;
  const existingGardenUser = GARDEN_USERS.get(cacheKey);
  if (existingGardenUser) {
    existingGardenUser.gardenUsername = finalGardenUsername;
    if (gardenNickname !== void 0) {
      existingGardenUser.gardenNickname = gardenNickname;
    }
    saveIdentityPersistence();
    return existingGardenUser;
  }
  const gardenUser = {
    gardenId,
    userId,
    gardenUsername: finalGardenUsername,
    gardenNickname,
    role: "USER",
    // Default role
    joinedAt: Date.now()
  };
  GARDEN_USERS.set(cacheKey, gardenUser);
  gardenUsernames.add(finalGardenUsername.toLowerCase());
  GARDEN_USERNAMES.set(gardenId, gardenUsernames);
  saveIdentityPersistence();
  console.log(`\u2705 [Identity] User ${user.globalUsername} joined garden ${gardenId} as ${finalGardenUsername}`);
  return gardenUser;
}
function getGardenUser(userId, gardenId) {
  const cacheKey = `${gardenId}:${userId}`;
  return GARDEN_USERS.get(cacheKey) || null;
}
function updateGardenNickname(userId, gardenId, nickname) {
  const cacheKey = `${gardenId}:${userId}`;
  const gardenUser = GARDEN_USERS.get(cacheKey);
  if (!gardenUser) {
    throw new Error("Garden user not found");
  }
  if (nickname.length > 50) {
    throw new Error("Nickname must be 50 characters or less");
  }
  gardenUser.gardenNickname = nickname;
  saveIdentityPersistence();
  return gardenUser;
}
function resolveDisplayName(userId, gardenId) {
  const user = getEdenUser(userId);
  if (!user) {
    return {
      displayName: `user_${userId.substring(0, 8)}`,
      username: `user_${userId.substring(0, 8)}`,
      source: "fallback"
    };
  }
  if (gardenId) {
    const gardenUser = getGardenUser(userId, gardenId);
    if (gardenUser) {
      if (gardenUser.gardenNickname) {
        return {
          displayName: gardenUser.gardenNickname,
          username: gardenUser.gardenUsername,
          nickname: gardenUser.gardenNickname,
          source: "gardenNickname"
        };
      }
      return {
        displayName: gardenUser.gardenUsername,
        username: gardenUser.gardenUsername,
        source: "gardenUsername"
      };
    }
  }
  if (user.globalNickname) {
    return {
      displayName: user.globalNickname,
      username: user.globalUsername,
      nickname: user.globalNickname,
      source: "globalNickname"
    };
  }
  return {
    displayName: user.globalUsername,
    username: user.globalUsername,
    source: "globalUsername"
  };
}
function loadIdentityPersistence() {
  try {
    const persistencePath = path.join(__dirname, "../eden-identity-persistence.json");
    if (fs.existsSync(persistencePath)) {
      const data = JSON.parse(fs.readFileSync(persistencePath, "utf-8"));
      if (data.edenUsers) {
        for (const user of data.edenUsers) {
          EDEN_USERS.set(user.userId, user);
          EDEN_USERS_BY_GOOGLE_ID.set(user.googleUserId, user.userId);
          EDEN_USERS_BY_USERNAME.set(user.globalUsername.toLowerCase(), user.userId);
        }
      }
      if (data.gardenUsers) {
        for (const gardenUser of data.gardenUsers) {
          const cacheKey = `${gardenUser.gardenId}:${gardenUser.userId}`;
          GARDEN_USERS.set(cacheKey, gardenUser);
          const gardenUsernames = GARDEN_USERNAMES.get(gardenUser.gardenId) || /* @__PURE__ */ new Set();
          gardenUsernames.add(gardenUser.gardenUsername.toLowerCase());
          GARDEN_USERNAMES.set(gardenUser.gardenId, gardenUsernames);
        }
      }
      console.log(`\u{1F4E6} [Identity] Loaded ${EDEN_USERS.size} Eden users and ${GARDEN_USERS.size} Garden users from persistence`);
    }
  } catch (error) {
    console.error("\u274C [Identity] Failed to load identity persistence:", error);
  }
}
function saveIdentityPersistence() {
  try {
    const persistencePath = path.join(__dirname, "../eden-identity-persistence.json");
    const data = {
      edenUsers: Array.from(EDEN_USERS.values()),
      gardenUsers: Array.from(GARDEN_USERS.values()),
      savedAt: Date.now()
    };
    fs.writeFileSync(persistencePath, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("\u274C [Identity] Failed to save identity persistence:", error);
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createEdenUser,
  getEdenUser,
  getEdenUserByEmail,
  getEdenUserByGoogleId,
  getEdenUserByUsername,
  getGardenUser,
  initializeIdentity,
  isUsernameAvailable,
  joinGarden,
  resolveDisplayName,
  updateGardenNickname,
  validateUsername
});
//# sourceMappingURL=identity.js.map
