/**
 * ROOT CA Component
 * The root certificate authority and law enforcement layer
 */

import { ROOT_CA_UUID } from "../constants";
import type { EdenPKI, EdenIdentity } from "../../EdenPKI";

export class ROOTCAComponent {
  private rootCA: EdenPKI | null = null;
  private rootCAIdentity: EdenIdentity | null = null;
  private uuid: string = ROOT_CA_UUID;

  constructor() {
    this.initialize();
  }

  private initialize(): void {
    // ROOT CA initialization will be done via initializeRootCA() function
    // This component provides the interface
  }

  setRootCA(rootCA: EdenPKI, identity: EdenIdentity): void {
    this.rootCA = rootCA;
    this.rootCAIdentity = identity;
  }

  getRootCA(): EdenPKI | null {
    return this.rootCA;
  }

  getRootCAIdentity(): EdenIdentity | null {
    return this.rootCAIdentity;
  }

  getUUID(): string {
    return this.uuid;
  }

  isInitialized(): boolean {
    return this.rootCA !== null && this.rootCAIdentity !== null;
  }
}

