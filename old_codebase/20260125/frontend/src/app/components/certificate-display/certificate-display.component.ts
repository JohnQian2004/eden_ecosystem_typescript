import { Component, OnInit, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { WebSocketService } from '../../services/websocket.service';
import { SimulatorEvent } from '../../app.component';
import { getApiBaseUrl } from '../../services/api-base';

interface EdenCertificate {
  subject: string;
  issuer: string;
  capabilities: string[];
  constraints?: Record<string, any>;
  issuedAt: number;
  expiresAt: number;
  signature: string;
}

interface RevocationEvent {
  revoked_uuid: string;
  revoked_type: 'indexer' | 'service' | 'provider';
  issuer_uuid: string;
  reason: string;
  issued_at: number;
  effective_at: number;
  signature: string;
  cert_hash?: string;
  severity?: 'soft' | 'hard';
  metadata?: Record<string, any>;
  // Legacy fields for backward compatibility
  revoked?: string;
  by?: string;
  timestamp?: number;
}

interface CertificateInfo {
  uuid: string;
  name: string;
  certificate?: EdenCertificate;
  isValid: boolean;
  isRevoked: boolean;
  revocation?: RevocationEvent;
}

interface GardenInfo {
  id: string;
  name: string;
  stream: string;
  active: boolean;
  uuid: string;
  hasCertificate: boolean;
}

@Component({
  selector: 'app-certificate-display',
  templateUrl: './certificate-display.component.html',
  styleUrls: ['./certificate-display.component.scss']
})
export class CertificateDisplayComponent implements OnInit, OnDestroy {
  certificates: CertificateInfo[] = [];
  revokedCertificates: RevocationEvent[] = [];
  selectedCertificate: CertificateInfo | null = null;
  gardens: GardenInfo[] = []; // Gardens (formerly called indexers)
  private apiUrl = getApiBaseUrl();
  private subscription: any;

  constructor(
    private http: HttpClient,
    private wsService: WebSocketService
  ) {}

  ngOnInit() {
    this.fetchGardens();
    this.fetchCertificates();
    
    // Subscribe to certificate events
    this.subscription = this.wsService.events$.subscribe((event: SimulatorEvent) => {
      if (event.type === 'certificate_issued' || 
          event.type === 'certificate_revoked' || 
          event.type === 'certificate_validated' ||
          event.type === 'certificate_validation_failed') {
        this.fetchCertificates();
      }
    });
  }
  
  fetchGardens() {
    // Use /api/gardens endpoint (with fallback to /api/indexers for backward compatibility)
    this.http.get<{success: boolean, gardens?: GardenInfo[], indexers?: GardenInfo[]}>(`${this.apiUrl}/api/gardens`)
      .subscribe({
        next: (response) => {
          // Support both 'gardens' and 'indexers' response fields for backward compatibility
          if (response.success) {
            this.gardens = response.gardens || response.indexers || [];
            // Re-fetch certificates to update names
            this.fetchCertificates();
          }
        },
        error: (err) => {
          console.error('Failed to fetch gardens:', err);
        }
      });
  }

  ngOnDestroy() {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
  }

  fetchCertificates() {
    this.http.get<{success: boolean, certificates: EdenCertificate[], revoked: RevocationEvent[], total: number}>(`${this.apiUrl}/api/certificates`)
      .subscribe({
        next: (response) => {
          if (response.success) {
            this.revokedCertificates = response.revoked || [];
            
            // Build certificate info list
            const certMap = new Map<string, CertificateInfo>();
            
            // Add all certificates
            response.certificates.forEach(cert => {
              const revocation = this.revokedCertificates.find(r => 
                r.revoked_uuid === cert.subject || r.revoked === cert.subject
              );
              const isRevoked = !!revocation;
              certMap.set(cert.subject, {
                uuid: cert.subject,
                name: this.getEntityName(cert.subject),
                certificate: cert,
                isValid: !isRevoked && Date.now() < cert.expiresAt,
                isRevoked: isRevoked,
                revocation: revocation
              });
            });
            
            this.certificates = Array.from(certMap.values())
              .sort((a, b) => {
                // Sort by: ROOT CA first, then Gardens, then Service Providers
                if (a.uuid.includes('root')) return -1;
                if (b.uuid.includes('root')) return 1;
                if (a.uuid.includes('indexer') && !b.uuid.includes('indexer')) return -1;
                if (!a.uuid.includes('indexer') && b.uuid.includes('indexer')) return 1;
                return a.name.localeCompare(b.name);
              });
          }
        },
        error: (err) => {
          console.error('Failed to fetch certificates:', err);
        }
      });
  }

  getEntityName(uuid: string): string {
    if (uuid.includes('root')) return 'ROOT CA';
    if (uuid.includes('garden') || uuid.includes('indexer')) {
      // Match UUID to actual garden name from fetched gardens
      const garden = this.gardens.find(i => i.uuid === uuid);
      if (garden) {
        return garden.name;
      }
      // Fallback: try to extract from UUID if not found (shouldn't happen)
      return `Garden-${uuid.split(':').pop()?.substring(0, 1).toUpperCase() || '?'}`;
    }
    // Service provider UUIDs - try to match with known providers
    const providerMap: Record<string, string> = {
      '550e8400-e29b-41d4-a716-446655440001': 'AMC Theatres',
      '550e8400-e29b-41d4-a716-446655440002': 'MovieCom',
      '550e8400-e29b-41d4-a716-446655440003': 'Cinemark'
    };
    return providerMap[uuid] || uuid;
  }

  selectCertificate(cert: CertificateInfo) {
    this.selectedCertificate = cert;
  }

  closeDetails() {
    this.selectedCertificate = null;
  }

  formatDate(timestamp: number): string {
    return new Date(timestamp).toLocaleString();
  }

  getStatusClass(cert: CertificateInfo): string {
    if (cert.isRevoked) return 'revoked';
    if (!cert.isValid) return 'invalid';
    if (cert.certificate && Date.now() > cert.certificate.expiresAt) return 'expired';
    return 'valid';
  }

  getStatusIcon(cert: CertificateInfo): string {
    if (cert.isRevoked) return '🚫';
    if (!cert.isValid) return '❌';
    if (cert.certificate && Date.now() > cert.certificate.expiresAt) return '⏰';
    return '✅';
  }

  getStatusText(cert: CertificateInfo): string {
    if (cert.isRevoked) return 'Revoked';
    if (!cert.isValid) return 'Invalid';
    if (cert.certificate && Date.now() > cert.certificate.expiresAt) return 'Expired';
    return 'Valid';
  }

  stringify(obj: any): string {
    return JSON.stringify(obj, null, 2);
  }

  revokeCertificate() {
    if (!this.selectedCertificate) return;
    
    const reason = prompt('Enter revocation reason:');
    if (!reason) return;
    
    const revokedType = this.getRevokedType(this.selectedCertificate.uuid);
    const severity = confirm('Hard revocation? (OK = Hard, Cancel = Soft)') ? 'hard' : 'soft';
    
    this.http.post(`${this.apiUrl}/api/revoke`, {
      uuid: this.selectedCertificate.uuid,
      reason: reason,
      revoked_type: revokedType,
      severity: severity
    }).subscribe({
      next: (response: any) => {
        if (response.success) {
          alert('Certificate revoked successfully');
          this.fetchCertificates();
          this.closeDetails();
        } else {
          alert(`Failed to revoke: ${response.error}`);
        }
      },
      error: (err) => {
        alert(`Error revoking certificate: ${err.error?.error || err.message}`);
      }
    });
  }

  reinstateCertificate() {
    if (!this.selectedCertificate) return;
    
    if (!confirm(`Reinstate certificate for ${this.selectedCertificate.name}?`)) {
      return;
    }
    
    this.http.post(`${this.apiUrl}/api/reinstate`, {
      uuid: this.selectedCertificate.uuid
    }).subscribe({
      next: (response: any) => {
        if (response.success) {
          alert('Certificate reinstated successfully');
          this.fetchCertificates();
          this.closeDetails();
        } else {
          alert(`Failed to reinstate: ${response.error}`);
        }
      },
      error: (err) => {
        alert(`Error reinstating certificate: ${err.error?.error || err.message}`);
      }
    });
  }

  getRevokedType(uuid: string): 'indexer' | 'service' | 'provider' {
    if (uuid.includes('garden') || uuid.includes('indexer')) return 'indexer'; // Keep 'indexer' for backward compatibility with API
    if (uuid.includes('service')) return 'service';
    return 'provider';
  }

  canRevoke(cert: CertificateInfo): boolean {
    // Can revoke if certificate is valid and not already revoked
    return cert.isValid && !cert.isRevoked && cert.certificate !== undefined;
  }

  canReinstate(cert: CertificateInfo): boolean {
    // Can reinstate if certificate is revoked
    return cert.isRevoked;
  }
}

