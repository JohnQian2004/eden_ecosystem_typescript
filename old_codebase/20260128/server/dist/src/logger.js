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
var logger_exports = {};
__export(logger_exports, {
  getLogger: () => getLogger,
  initializeLogger: () => initializeLogger
});
module.exports = __toCommonJS(logger_exports);
var fs = __toESM(require("fs"));
var path = __toESM(require("path"));
class SimpleLogger {
  constructor(logFileName = "eden-garden-lifecycle.json") {
    this.logs = /* @__PURE__ */ new Map();
    this.saveInterval = null;
    this.logFile = path.join(__dirname, "..", logFileName);
    this.loadLogs();
  }
  /**
   * Load existing logs from file
   */
  loadLogs() {
    try {
      if (fs.existsSync(this.logFile)) {
        const content = fs.readFileSync(this.logFile, "utf-8");
        const data = JSON.parse(content);
        if (data.logs && typeof data.logs === "object") {
          for (const [key, value] of Object.entries(data.logs)) {
            this.logs.set(key, value);
          }
        }
      }
    } catch (err) {
      console.warn(`\u26A0\uFE0F  [Logger] Failed to load logs: ${err.message}`);
    }
  }
  /**
   * Log an event
   */
  log(category, event, data = {}) {
    const entry = {
      timestamp: Date.now(),
      event,
      data
    };
    if (!this.logs.has(category)) {
      this.logs.set(category, []);
    }
    this.logs.get(category).push(entry);
    if (!this.saveInterval) {
      this.saveInterval = setInterval(() => this.save(), 5e3);
    }
    if (event.includes("create") || event.includes("save") || event.includes("error")) {
      this.save();
    }
  }
  /**
   * Save logs to file
   */
  save() {
    try {
      const data = {
        lastSaved: (/* @__PURE__ */ new Date()).toISOString(),
        logs: Object.fromEntries(this.logs)
      };
      fs.writeFileSync(this.logFile, JSON.stringify(data, null, 2), "utf-8");
    } catch (err) {
      console.warn(`\u26A0\uFE0F  [Logger] Failed to save logs: ${err.message}`);
    }
  }
  /**
   * Get logs for a category
   */
  getLogs(category) {
    return this.logs.get(category) || [];
  }
  /**
   * Clear logs
   */
  clear() {
    this.logs.clear();
    this.save();
  }
}
let loggerInstance = null;
function initializeLogger() {
  if (!loggerInstance) {
    loggerInstance = new SimpleLogger();
    console.log(`\u{1F4DD} [Logger] Initialized - logs will be saved to ${loggerInstance["logFile"]}`);
  }
  return loggerInstance;
}
function getLogger() {
  if (!loggerInstance) {
    return initializeLogger();
  }
  return loggerInstance;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  getLogger,
  initializeLogger
});
//# sourceMappingURL=logger.js.map
