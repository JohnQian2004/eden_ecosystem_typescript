import { Component, OnInit, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { getApiBaseUrl } from '../../services/api-base';
import { Subscription } from 'rxjs';

interface EvaluationHistoryEntry {
  timestamp: number;
  context: any;
  result: any;
}

interface EvaluationStats {
  totalEvaluations: number;
  allowedCount: number;
  deniedCount: number;
  escalatedCount: number;
  complianceRate: number;
  averageTrustScore: number;
  recentEvaluations: number;
}

@Component({
  selector: 'app-llm-governance',
  templateUrl: './llm-governance.component.html',
  styleUrls: ['./llm-governance.component.scss']
})
export class LlmGovernanceComponent implements OnInit, OnDestroy {
  // Automated monitoring dashboard state
  evaluationHistory: EvaluationHistoryEntry[] = [];
  evaluationStats: EvaluationStats | null = null;
  isLoadingHistory: boolean = false;
  isLoadingStats: boolean = false;
  error: string | null = null;
  
  // Auto-refresh interval
  private refreshInterval: any = null;
  private readonly REFRESH_INTERVAL_MS = 10000; // Refresh every 10 seconds (less aggressive)
  private isComponentVisible: boolean = false;
  private httpSubscriptions: Subscription[] = [];

  private apiUrl = getApiBaseUrl();

  constructor(private http: HttpClient) {}

  ngOnInit() {
    // DON'T load data on init - only load when user clicks refresh
    // This prevents HTTP requests when component is initialized but tab is not active
    // Users can manually refresh by clicking the refresh button
  }

  ngOnDestroy() {
    this.stopAutoRefresh();
    this.cleanupVisibilityObserver();
    // Unsubscribe from all HTTP requests to prevent memory leaks
    this.httpSubscriptions.forEach(sub => {
      if (sub && !sub.closed) {
        sub.unsubscribe();
      }
    });
    this.httpSubscriptions = [];
  }

  /**
   * Setup IntersectionObserver to detect when component is visible
   */
  private visibilityObserver: IntersectionObserver | null = null;
  
  setupVisibilityObserver() {
    // Use a small delay to ensure DOM is ready
    setTimeout(() => {
      const element = document.querySelector('app-llm-governance');
      if (element && 'IntersectionObserver' in window) {
        this.visibilityObserver = new IntersectionObserver((entries) => {
          entries.forEach(entry => {
            this.isComponentVisible = entry.isIntersecting;
            if (this.isComponentVisible) {
              // Component is visible - start auto-refresh
              if (!this.refreshInterval) {
                this.startAutoRefresh();
              }
            } else {
              // Component is hidden - stop auto-refresh to save resources
              this.stopAutoRefresh();
            }
          });
        }, { threshold: 0.1 });
        this.visibilityObserver.observe(element);
      } else {
        // Fallback: start auto-refresh if IntersectionObserver not available
        this.startAutoRefresh();
      }
    }, 500);
  }

  cleanupVisibilityObserver() {
    if (this.visibilityObserver) {
      this.visibilityObserver.disconnect();
      this.visibilityObserver = null;
    }
  }

  /**
   * Start auto-refreshing evaluation data (only when component is visible)
   */
  startAutoRefresh() {
    // Don't start if already running
    if (this.refreshInterval) {
      return;
    }
    
    this.refreshInterval = setInterval(() => {
      // Only refresh if component is visible
      if (this.isComponentVisible) {
        this.loadEvaluationHistory();
        this.loadEvaluationStats();
      }
    }, this.REFRESH_INTERVAL_MS);
  }

  /**
   * Stop auto-refreshing
   */
  stopAutoRefresh() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  /**
   * Load evaluation history (automated evaluations)
   */
  loadEvaluationHistory() {
    // Don't load if already loading to prevent overlapping requests
    if (this.isLoadingHistory) {
      return;
    }
    
    this.isLoadingHistory = true;
    const sub = this.http.get<any>(`${this.apiUrl}/api/governance/history?limit=50`).subscribe({
      next: (response) => {
        if (response.success && response.history) {
          this.evaluationHistory = response.history;
        } else {
          this.evaluationHistory = [];
        }
        this.isLoadingHistory = false;
      },
      error: (err) => {
        console.error('❌ Error loading evaluation history:', err);
        this.error = err.error?.error || err.message || 'Failed to load evaluation history';
        this.isLoadingHistory = false;
      }
    });
    this.httpSubscriptions.push(sub);
  }

  /**
   * Load evaluation statistics (self-scoring metrics)
   */
  loadEvaluationStats() {
    // Don't load if already loading to prevent overlapping requests
    if (this.isLoadingStats) {
      return;
    }
    
    this.isLoadingStats = true;
    const sub = this.http.get<any>(`${this.apiUrl}/api/governance/stats`).subscribe({
      next: (response) => {
        if (response.success && response.stats) {
          this.evaluationStats = response.stats;
        } else {
          this.evaluationStats = null;
        }
        this.isLoadingStats = false;
      },
      error: (err) => {
        console.error('❌ Error loading evaluation stats:', err);
        this.error = err.error?.error || err.message || 'Failed to load evaluation stats';
        this.isLoadingStats = false;
      }
    });
    this.httpSubscriptions.push(sub);
  }

  /**
   * Format timestamp for display
   */
  formatTimestamp(timestamp: number): string {
    const date = new Date(timestamp);
    return date.toLocaleString();
  }

  /**
   * Get decision badge class
   */
  getDecisionBadgeClass(decision: string): string {
    switch (decision) {
      case 'ALLOW':
        return 'bg-success';
      case 'DENY':
        return 'bg-danger';
      case 'ESCALATE':
        return 'bg-warning text-dark';
      default:
        return 'bg-secondary';
    }
  }
}
