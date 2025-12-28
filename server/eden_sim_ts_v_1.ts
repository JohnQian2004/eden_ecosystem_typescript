/**
 * EDEN Simulation Engine
 * File: eden-sim.ts
 * Version: 1.3 (Final CTO Release)
 * Status: FROZEN – DEV OWNERSHIP BEGINS
 *
 * Purpose:
 * - Deterministic simulation core for EDEN protocol
 * - Supports scenario replay, governance testing, and AI evaluation
 * - CTO-complete: stable interfaces, no breaking changes expected
 */

/* ==========================
   Core Types
   ========================== */

export type EdenEntityType = 'agent' | 'validator' | 'observer' | 'environment';

export interface EdenEntity {
  id: string;
  type: EdenEntityType;
  state: Record<string, any>;
}

export interface EdenAction {
  tick: number;
  actorId: string;
  action: string;
  payload?: Record<string, any>;
}

export interface EdenSnapshot {
  tick: number;
  entities: EdenEntity[];
  metadata?: Record<string, any>;
}

export interface EdenSimConfig {
  maxTicks: number;
  deterministic: boolean;
  seed?: number;
  logLevel?: 'silent' | 'info' | 'debug';
}

/* ==========================
   Utility: Deterministic RNG
   ========================== */

class EdenRNG {
  private seed: number;

  constructor(seed = 1) {
    this.seed = seed;
  }

  next(): number {
    // Linear congruential generator (LCG)
    this.seed = (this.seed * 48271) % 0x7fffffff;
    return this.seed / 0x7fffffff;
  }
}

/* ==========================
   EDEN Simulation Core
   ========================== */

export class EdenSim {
  private tick = 0;
  private entities = new Map<string, EdenEntity>();
  private actions: EdenAction[] = [];
  private snapshots: EdenSnapshot[] = [];
  private rng?: EdenRNG;

  constructor(private config: EdenSimConfig) {
    if (config.deterministic) {
      this.rng = new EdenRNG(config.seed ?? 1);
    }
    this.log('info', 'EDEN Simulation initialized');
  }

  /* ==========================
     Entity Management
     ========================== */

  registerEntity(entity: EdenEntity): void {
    if (this.entities.has(entity.id)) {
      throw new Error(`Entity already registered: ${entity.id}`);
    }
    this.entities.set(entity.id, structuredClone(entity));
    this.log('debug', `Registered entity ${entity.id}`);
  }

  getEntity(id: string): EdenEntity | undefined {
    return this.entities.get(id);
  }

  listEntities(): EdenEntity[] {
    return Array.from(this.entities.values());
  }

  /* ==========================
     Action Scheduling
     ========================== */

  scheduleAction(action: EdenAction): void {
    if (action.tick < this.tick) {
      throw new Error('Cannot schedule action in the past');
    }
    this.actions.push(action);
  }

  /* ==========================
     Simulation Loop
     ========================== */

  step(): void {
    if (this.tick >= this.config.maxTicks) return;

    const currentActions = this.actions.filter(a => a.tick === this.tick);

    for (const action of currentActions) {
      this.applyAction(action);
    }

    this.captureSnapshot();
    this.tick++;
  }

  run(): EdenSnapshot[] {
    while (this.tick < this.config.maxTicks) {
      this.step();
    }
    return this.snapshots;
  }

  /* ==========================
     Action Resolution
     ========================== */

  private applyAction(action: EdenAction): void {
    const entity = this.entities.get(action.actorId);
    if (!entity) return;

    // Default deterministic mutation hook
    entity.state = {
      ...entity.state,
      lastAction: action.action,
      lastPayload: action.payload ?? null,
      randomness: this.rng ? this.rng.next() : Math.random(),
    };

    this.log('debug', `Applied action ${action.action} by ${action.actorId}`);
  }

  /* ==========================
     Snapshot & Replay
     ========================== */

  private captureSnapshot(): void {
    const snapshot: EdenSnapshot = {
      tick: this.tick,
      entities: this.listEntities().map(e => structuredClone(e)),
    };

    this.snapshots.push(snapshot);
  }

  getSnapshots(): EdenSnapshot[] {
    return this.snapshots;
  }

  replay(snapshotIndex: number): EdenSnapshot {
    const snap = this.snapshots[snapshotIndex];
    if (!snap) throw new Error('Snapshot not found');
    return structuredClone(snap);
  }

  /* ==========================
     Logging
     ========================== */

  private log(level: 'silent' | 'info' | 'debug', message: string): void {
    const allowed = this.config.logLevel ?? 'silent';
    if (allowed === 'silent') return;
    if (allowed === 'info' && level === 'debug') return;

    console.log(`[EDEN:${level.toUpperCase()}] ${message}`);
  }
}

/* ==========================
   Version Stamp
   ========================== */

export const EDEN_SIM_VERSION = '1.3.0';

/**
 * END OF FILE
 *
 * CTO SIGN-OFF:
 * - Deterministic
 * - Replayable
 * - Auditable
 * - Safe for AI & governance simulations
 */
