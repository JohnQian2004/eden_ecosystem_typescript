/**
 * QR-Code Device Binding Service (v1.24)
 * 
 * Handles device binding via QR codes for authentication
 */

import type { DeviceBinding, QRCodeBindingData } from './types';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
// QR code generation will be added when qrcode package is installed
// import * as qrcode from 'qrcode';

class DeviceBindingService {
  private bindings: Map<string, DeviceBinding> = new Map();
  private activeChallenges: Map<string, QRCodeBindingData> = new Map();
  private bindingsPath: string;
  private challengeExpiry = 5 * 60 * 1000; // 5 minutes
  
  constructor(dataPath: string = './data') {
    this.bindingsPath = path.join(dataPath, 'device-bindings.json');
    this.loadBindings();
  }
  
  private loadBindings(): void {
    try {
      if (fs.existsSync(this.bindingsPath)) {
        const data = fs.readFileSync(this.bindingsPath, 'utf-8');
        const bindings: DeviceBinding[] = JSON.parse(data);
        bindings.forEach(binding => {
          this.bindings.set(binding.deviceId, binding);
        });
        console.log(`✅ [DeviceBinding] Loaded ${bindings.length} device bindings`);
      }
    } catch (error: any) {
      console.error(`❌ [DeviceBinding] Failed to load bindings:`, error.message);
    }
  }
  
  private saveBindings(): void {
    try {
      const bindings = Array.from(this.bindings.values());
      fs.writeFileSync(this.bindingsPath, JSON.stringify(bindings, null, 2), 'utf-8');
    } catch (error: any) {
      console.error(`❌ [DeviceBinding] Failed to save bindings:`, error.message);
    }
  }
  
  /**
   * Generate QR code for device binding
   */
  async generateQRCode(userId: string, identityHint: string): Promise<{ qrData: QRCodeBindingData; qrImage: string }> {
    const challenge = crypto.randomBytes(32).toString('hex');
    const timestamp = new Date().toISOString();
    const expiresAt = Date.now() + this.challengeExpiry;
    
    const qrData: QRCodeBindingData = {
      challenge,
      timestamp,
      identityHint,
      bindingUrl: `/api/governance/device-bind`,
      expiresAt
    };
    
    // Store challenge temporarily
    this.activeChallenges.set(challenge, qrData);
    
    // Clean up expired challenges
    this.cleanupExpiredChallenges();
    
    // Generate QR code image (base64)
    // TODO: Install qrcode package: npm install qrcode @types/qrcode
    // const qrcode = require('qrcode');
    // const qrImage = await qrcode.toDataURL(JSON.stringify(qrData));
    const qrImage = `data:image/svg+xml;base64,${Buffer.from(JSON.stringify(qrData)).toString('base64')}`; // Placeholder
    
    console.log(`✅ [DeviceBinding] Generated QR code for user: ${userId}`);
    
    return { qrData, qrImage };
  }
  
  /**
   * Verify and complete device binding
   */
  async bindDevice(
    challenge: string,
    publicKey: string,
    deviceId: string,
    userId: string,
    metadata?: { deviceName?: string; deviceType?: string; userAgent?: string }
  ): Promise<DeviceBinding> {
    const qrData = this.activeChallenges.get(challenge);
    
    if (!qrData) {
      throw new Error('Invalid or expired challenge');
    }
    
    if (Date.now() > qrData.expiresAt) {
      this.activeChallenges.delete(challenge);
      throw new Error('Challenge expired');
    }
    
    // Check if device is already bound
    const existingBinding = this.bindings.get(deviceId);
    if (existingBinding && !existingBinding.revoked) {
      throw new Error('Device already bound');
    }
    
    // Create new binding
    const binding: DeviceBinding = {
      deviceId,
      userId,
      publicKey,
      boundAt: Date.now(),
      lastUsedAt: Date.now(),
      revoked: false,
      metadata
    };
    
    this.bindings.set(deviceId, binding);
    this.activeChallenges.delete(challenge);
    this.saveBindings();
    
    console.log(`✅ [DeviceBinding] Device bound: ${deviceId} for user: ${userId}`);
    
    return binding;
  }
  
  /**
   * Verify device authentication
   */
  verifyDevice(deviceId: string, signature: string, data: string): boolean {
    const binding = this.bindings.get(deviceId);
    
    if (!binding || binding.revoked) {
      return false;
    }
    
    // Update last used timestamp
    binding.lastUsedAt = Date.now();
    this.saveBindings();
    
    // Verify signature using public key
    try {
      const verify = crypto.createVerify('SHA256');
      verify.update(data);
      verify.end();
      return verify.verify(binding.publicKey, signature, 'hex');
    } catch (error: any) {
      console.error(`❌ [DeviceBinding] Signature verification failed:`, error.message);
      return false;
    }
  }
  
  /**
   * Revoke device binding
   */
  revokeDevice(deviceId: string): boolean {
    const binding = this.bindings.get(deviceId);
    
    if (!binding || binding.revoked) {
      return false;
    }
    
    binding.revoked = true;
    binding.revokedAt = Date.now();
    this.saveBindings();
    
    console.log(`✅ [DeviceBinding] Device revoked: ${deviceId}`);
    
    return true;
  }
  
  /**
   * Get device bindings for a user
   */
  getUserDevices(userId: string): DeviceBinding[] {
    return Array.from(this.bindings.values()).filter(
      b => b.userId === userId && !b.revoked
    );
  }
  
  /**
   * Get device binding by ID
   */
  getDeviceBinding(deviceId: string): DeviceBinding | undefined {
    return this.bindings.get(deviceId);
  }
  
  /**
   * Clean up expired challenges
   */
  private cleanupExpiredChallenges(): void {
    const now = Date.now();
    for (const [challenge, qrData] of this.activeChallenges.entries()) {
      if (now > qrData.expiresAt) {
        this.activeChallenges.delete(challenge);
      }
    }
  }
}

// Singleton instance
let deviceBindingInstance: DeviceBindingService | null = null;

export function initializeDeviceBinding(dataPath?: string): DeviceBindingService {
  if (!deviceBindingInstance) {
    deviceBindingInstance = new DeviceBindingService(dataPath);
  }
  return deviceBindingInstance;
}

export function getDeviceBindingService(): DeviceBindingService {
  if (!deviceBindingInstance) {
    throw new Error('DeviceBindingService not initialized. Call initializeDeviceBinding() first.');
  }
  return deviceBindingInstance;
}

