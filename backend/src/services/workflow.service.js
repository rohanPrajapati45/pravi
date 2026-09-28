import AppError from "../utils/AppError.js";

// Config-driven state machines (PRD 7). `transitions` = { FROM: { TO: { roles, requires } } }.
// Role "SYSTEM" marks transitions the platform performs itself (e.g. maintenance start).
export function createMachine(name, transitions) {
  return { name, transitions };
}

export function assertTransition(machine, from, to, role) {
  const rule = machine.transitions[from]?.[to];
  if (!rule) {
    throw AppError.invalidTransition(`${machine.name} cannot move from ${from} to ${to}`);
  }
  if (rule.roles && !rule.roles.includes(role)) {
    throw AppError.forbidden(`${machine.name}: ${from} → ${to} needs one of ${rule.roles.join(", ")}`);
  }
  return rule;
}

export function allowedTransitions(machine, from, role) {
  return Object.entries(machine.transitions[from] ?? {})
    .filter(([, rule]) => !rule.roles || rule.roles.includes(role))
    .map(([to, rule]) => ({ to, requires: rule.requires ?? [] }));
}

const officers = ["HQ", "EE"];
const system = ["SYSTEM", "HQ", "EE"];
const retire = { roles: officers, requires: ["remarks"] };
// Closing to traffic: officers by hand, or the system when an emergency damage report says the asset is closed.
const closeToTraffic = { roles: [...officers, "SYSTEM"], requires: ["remarks"] };

// PRD 7.1 — asset lifecycle.
export const assetMachine = createMachine("Asset", {
  PLANNED: { UNDER_CONSTRUCTION: { roles: system }, RETIRED: retire },
  UNDER_CONSTRUCTION: { OPERATIONAL: { roles: system }, RETIRED: retire },
  OPERATIONAL: {
    UNDER_MAINTENANCE: { roles: ["SYSTEM"] },
    UNDER_REHABILITATION: { roles: system },
    CLOSED_TEMPORARILY: closeToTraffic,
    RETIRED: retire
  },
  UNDER_MAINTENANCE: { OPERATIONAL: { roles: ["SYSTEM"] }, CLOSED_TEMPORARILY: closeToTraffic, RETIRED: retire },
  UNDER_REHABILITATION: { OPERATIONAL: { roles: system }, RETIRED: retire },
  CLOSED_TEMPORARILY: { OPERATIONAL: closeToTraffic, RETIRED: retire },
  RETIRED: {}
});
