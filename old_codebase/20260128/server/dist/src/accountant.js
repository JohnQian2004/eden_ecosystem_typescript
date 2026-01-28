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
var accountant_exports = {};
__export(accountant_exports, {
  getAccountantState: () => getAccountantState,
  getFinancialSummary: () => getFinancialSummary,
  initializeAccountant: () => initializeAccountant,
  recordFeePayment: () => recordFeePayment,
  saveAccountantState: () => saveAccountantState
});
module.exports = __toCommonJS(accountant_exports);
var fs = __toESM(require("fs"));
var path = __toESM(require("path"));
let ACCOUNTANT_STATE = {
  totalIGas: 0,
  totalITax: 0,
  totalRootCAFees: 0,
  totalIndexerFees: 0,
  totalProviderFees: 0,
  totalCashierFees: 0,
  revenueByServiceType: {},
  lastUpdated: Date.now(),
  createdAt: Date.now()
};
const ACCOUNTANT_PERSISTENCE_FILE = path.join(__dirname, "..", "eden-accountant-persistence.json");
function initializeAccountant() {
  loadAccountantState();
  console.log(`\u{1F4CA} [Accountant] Initialized. Total iGas: ${ACCOUNTANT_STATE.totalIGas.toFixed(6)}`);
}
function loadAccountantState() {
  try {
    if (fs.existsSync(ACCOUNTANT_PERSISTENCE_FILE)) {
      const fileContent = fs.readFileSync(ACCOUNTANT_PERSISTENCE_FILE, "utf-8");
      const persisted = JSON.parse(fileContent);
      ACCOUNTANT_STATE = {
        totalIGas: persisted.totalIGas || 0,
        totalITax: persisted.totalITax || 0,
        totalRootCAFees: persisted.totalRootCAFees || 0,
        totalIndexerFees: persisted.totalIndexerFees || 0,
        totalProviderFees: persisted.totalProviderFees || 0,
        totalCashierFees: persisted.totalCashierFees || 0,
        revenueByServiceType: persisted.revenueByServiceType || {},
        lastUpdated: persisted.lastUpdated || Date.now(),
        createdAt: persisted.createdAt || Date.now()
      };
      console.log(`\u{1F4CA} [Accountant] Loaded state from persistence`);
      console.log(`   Total iGas: ${ACCOUNTANT_STATE.totalIGas.toFixed(6)}`);
      console.log(`   Total iTax: ${ACCOUNTANT_STATE.totalITax.toFixed(6)}`);
      console.log(`   Total ROOT CA Fees: ${ACCOUNTANT_STATE.totalRootCAFees.toFixed(6)}`);
      console.log(`   Total Indexer Fees: ${ACCOUNTANT_STATE.totalIndexerFees.toFixed(6)}`);
    }
  } catch (err) {
    console.warn(`\u26A0\uFE0F  [Accountant] Failed to load state: ${err.message}`);
  }
}
function saveAccountantState() {
  try {
    ACCOUNTANT_STATE.lastUpdated = Date.now();
    const data = {
      ...ACCOUNTANT_STATE,
      lastSaved: (/* @__PURE__ */ new Date()).toISOString()
    };
    fs.writeFileSync(ACCOUNTANT_PERSISTENCE_FILE, JSON.stringify(data, null, 2), "utf-8");
    console.log(`\u{1F4BE} [Accountant] State saved to persistence`);
  } catch (err) {
    console.error(`\u274C [Accountant] Failed to save state: ${err.message}`);
  }
}
function recordFeePayment(serviceType, iGas, iTax, rootCAFee, indexerFee, providerFee = 0, cashierFee = 0) {
  ACCOUNTANT_STATE.totalIGas += iGas;
  ACCOUNTANT_STATE.totalITax += iTax;
  ACCOUNTANT_STATE.totalRootCAFees += rootCAFee;
  ACCOUNTANT_STATE.totalIndexerFees += indexerFee;
  ACCOUNTANT_STATE.totalProviderFees += providerFee;
  ACCOUNTANT_STATE.totalCashierFees += cashierFee;
  if (!ACCOUNTANT_STATE.revenueByServiceType[serviceType]) {
    ACCOUNTANT_STATE.revenueByServiceType[serviceType] = {
      count: 0,
      totalAmount: 0,
      totalIGas: 0,
      totalITax: 0,
      totalRootCAFees: 0,
      totalIndexerFees: 0,
      totalProviderFees: 0,
      totalCashierFees: 0
    };
  }
  const serviceStats = ACCOUNTANT_STATE.revenueByServiceType[serviceType];
  serviceStats.count++;
  serviceStats.totalIGas += iGas;
  serviceStats.totalITax += iTax;
  serviceStats.totalRootCAFees += rootCAFee;
  serviceStats.totalIndexerFees += indexerFee;
  serviceStats.totalProviderFees += providerFee;
  serviceStats.totalCashierFees += cashierFee;
  ACCOUNTANT_STATE.lastUpdated = Date.now();
  console.log(`\u{1F4CA} [Accountant] Recorded fees for ${serviceType}: iGas=${iGas.toFixed(6)}, iTax=${iTax.toFixed(6)}, ROOT CA=${rootCAFee.toFixed(6)}, Indexer=${indexerFee.toFixed(6)}`);
}
function getAccountantState() {
  return { ...ACCOUNTANT_STATE };
}
function getFinancialSummary() {
  const totalRevenue = ACCOUNTANT_STATE.totalRootCAFees + ACCOUNTANT_STATE.totalIndexerFees + ACCOUNTANT_STATE.totalProviderFees + ACCOUNTANT_STATE.totalCashierFees;
  return {
    totalIGas: ACCOUNTANT_STATE.totalIGas,
    totalITax: ACCOUNTANT_STATE.totalITax,
    totalRootCAFees: ACCOUNTANT_STATE.totalRootCAFees,
    totalIndexerFees: ACCOUNTANT_STATE.totalIndexerFees,
    totalProviderFees: ACCOUNTANT_STATE.totalProviderFees,
    totalCashierFees: ACCOUNTANT_STATE.totalCashierFees,
    totalRevenue,
    revenueByServiceType: ACCOUNTANT_STATE.revenueByServiceType
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  getAccountantState,
  getFinancialSummary,
  initializeAccountant,
  recordFeePayment,
  saveAccountantState
});
//# sourceMappingURL=accountant.js.map
