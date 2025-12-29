import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { WebSocketService } from './services/websocket.service';
import { ChatService } from './services/chat.service';

export interface ServiceProvider {
  id: string;
  name: string;
  serviceType: string;
  location: string;
  bond: number;
  reputation: number;
  indexerId: string;
  status: string;
  // Snake Service Fields
  // Note: Snake is a SERVICE TYPE (serviceType: "snake"), not a provider type
  // Each Snake service belongs to an indexer (indexerId)
  insuranceFee?: number;
  iGasMultiplier?: number;
  iTaxMultiplier?: number;
  maxInfluence?: number;
  contextsAllowed?: string[];
  contextsForbidden?: string[];
  adCapabilities?: string[];
}

export interface SimulatorEvent {
  type: string;
  component: string;
  message: string;
  timestamp: number;
  data?: any;
}

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit, OnDestroy {
  title = 'Eden Simulator Dashboard';
  userInput: string = '';
  isProcessing: boolean = false;
  userEmail: string = ''; // Will be set from localStorage or default
  
  // Context sensing - tracks which service type is selected
  selectedServiceType: string | null = null;
  inputPlaceholder: string = 'Select a service type above or type your query...';
  
  // Service Types (Garden of Eden Main Street)
  serviceTypes: Array<{type: string, icon: string, adText: string, sampleQuery: string}> = [
    {
      type: 'movie',
      icon: '🎬',
      adText: 'Movie Tickets',
      sampleQuery: 'I want a sci-fi movie to watch tonight at the best price'
    },
    {
      type: 'dex',
      icon: '💰',
      adText: 'DEX Tokens',
      sampleQuery: 'I want to BUY 2 SOLANA token A at 1 Token/SOL or with best price'
    },
    {
      type: 'airline',
      icon: '✈️',
      adText: 'Airline Tickets',
      sampleQuery: 'I want to book a flight from New York to Los Angeles next week at the best price'
    },
    {
      type: 'autoparts',
      icon: '🔧',
      adText: 'Auto Parts',
      sampleQuery: 'I need brake pads for a 2020 Toyota Camry at the best price'
    },
    {
      type: 'hotel',
      icon: '🏨',
      adText: 'Hotel Booking',
      sampleQuery: 'I want to book a hotel in San Francisco for 3 nights at the best price'
    },
    {
      type: 'restaurant',
      icon: '🍽️',
      adText: 'Restaurant Reservations',
      sampleQuery: 'I want to make a dinner reservation for 2 people tonight at the best restaurant'
    }
  ];
  
  isLoadingServices: boolean = false;
  
  // Snake (Advertising) Service Providers
  snakeProviders: ServiceProvider[] = [];
  isLoadingSnakeProviders: boolean = false;
  
  private apiUrl = window.location.port === '4200' 
    ? 'http://localhost:3000' 
    : '';
  
  constructor(
    public wsService: WebSocketService,
    private chatService: ChatService,
    private cdr: ChangeDetectorRef,
    private http: HttpClient
  ) {}

  ngOnInit() {
    // Suppress console errors from browser extensions
    const originalError = console.error;
    console.error = (...args: any[]) => {
      if (args[0] && typeof args[0] === 'string' && args[0].includes('solana')) {
        return; // Ignore Solana extension errors
      }
      originalError.apply(console, args);
    };

    // Get email from localStorage or use default (alice@gmail.com from USERS array)
    this.userEmail = localStorage.getItem('userEmail') || 'alice@gmail.com';
    this.wsService.connect();
    
    // Load services from ROOT CA ServiceRegistry (Garden of Eden Main Street)
    this.loadServices();
    // Load Snake providers separately
    this.loadSnakeProviders();
  }
  
  loadServices() {
    // Query ROOT CA ServiceRegistry to verify service types are available
    // This is a quick in-memory lookup - no LLM needed
    // Note: Mocked service types (airline, autoparts, hotel, restaurant) are always shown
    this.isLoadingServices = true;
    this.http.get<{success: boolean, providers: ServiceProvider[], count: number}>(`${this.apiUrl}/api/root-ca/service-registry`)
      .subscribe({
        next: (response) => {
          if (response.success && response.providers) {
            const availableTypes = new Set(response.providers.filter(p => p.status === 'active').map(p => p.serviceType));
            // Mocked service types that should always be shown
            const mockedTypes = new Set(['airline', 'autoparts', 'hotel', 'restaurant']);
            
            // Filter service types: show mocked ones always, or real ones if available in registry
            this.serviceTypes = this.serviceTypes.filter(st => 
              mockedTypes.has(st.type) || availableTypes.has(st.type)
            );
            console.log(`✅ Loaded service types: ${this.serviceTypes.map(st => st.type).join(', ')}`);
            console.log(`   Real providers: ${Array.from(availableTypes).join(', ')}`);
            console.log(`   Mocked types: ${Array.from(mockedTypes).join(', ')}`);
          }
          this.isLoadingServices = false;
          this.cdr.detectChanges();
        },
        error: (err) => {
          console.error('Failed to load services:', err);
          // Keep all service types (including mocked ones) even if API fails
          console.log(`✅ Using all service types (including mocked): ${this.serviceTypes.map(st => st.type).join(', ')}`);
          this.isLoadingServices = false;
          this.cdr.detectChanges();
        }
      });
  }
  
  loadSnakeProviders() {
    // Query ROOT CA ServiceRegistry for Snake services
    // Snake is a service type (serviceType: "snake"), each belongs to an indexer
    this.isLoadingSnakeProviders = true;
    this.http.get<{success: boolean, providers: ServiceProvider[], count: number}>(`${this.apiUrl}/api/root-ca/service-registry?serviceType=snake`)
      .subscribe({
        next: (response) => {
          if (response.success && response.providers) {
            this.snakeProviders = response.providers.filter(p => p.status === 'active');
            console.log(`🐍 Loaded ${this.snakeProviders.length} Snake services:`, this.snakeProviders.map(p => `${p.name} (indexer: ${p.indexerId})`).join(', '));
          }
          this.isLoadingSnakeProviders = false;
          this.cdr.detectChanges();
        },
        error: (err) => {
          console.error('Failed to load Snake services:', err);
          this.snakeProviders = [];
          this.isLoadingSnakeProviders = false;
          this.cdr.detectChanges();
        }
      });
  }
  
  selectServiceType(serviceType: {type: string, icon: string, adText: string, sampleQuery: string}) {
    // Set context and populate input with sample query
    this.selectedServiceType = serviceType.type;
    this.userInput = serviceType.sampleQuery;
    
    // Update placeholder based on service type
    this.inputPlaceholder = serviceType.sampleQuery;
    
    // Focus on the unified input
    setTimeout(() => {
      const input = document.querySelector('input[name="userInput"]') as HTMLInputElement;
      if (input) {
        input.focus();
        input.select();
      }
    }, 100);
  }
  
  // Context sensing - detect service type from user input
  detectServiceType(input: string): string | null {
    const lowerInput = input.toLowerCase();
    
    // DEX indicators
    if (lowerInput.includes('buy') || lowerInput.includes('sell') || 
        lowerInput.includes('token') || lowerInput.includes('dex') ||
        lowerInput.includes('solana') || lowerInput.includes('sol') ||
        lowerInput.includes('pool') || lowerInput.includes('trade')) {
      return 'dex';
    }
    
    // Movie indicators
    if (lowerInput.includes('movie') || lowerInput.includes('film') ||
        lowerInput.includes('watch') || lowerInput.includes('cinema') ||
        lowerInput.includes('theatre') || lowerInput.includes('ticket')) {
      return 'movie';
    }
    
    // Airline indicators
    if (lowerInput.includes('flight') || lowerInput.includes('airline') ||
        lowerInput.includes('airport') || lowerInput.includes('fly')) {
      return 'airline';
    }
    
    // Auto parts indicators
    if (lowerInput.includes('auto') || lowerInput.includes('car') ||
        lowerInput.includes('brake') || lowerInput.includes('parts') ||
        lowerInput.includes('tire') || lowerInput.includes('engine')) {
      return 'autoparts';
    }
    
    // Hotel indicators
    if (lowerInput.includes('hotel') || lowerInput.includes('lodging') ||
        lowerInput.includes('accommodation') || lowerInput.includes('stay')) {
      return 'hotel';
    }
    
    // Restaurant indicators
    if (lowerInput.includes('restaurant') || lowerInput.includes('dining') ||
        lowerInput.includes('dinner') || lowerInput.includes('lunch') ||
        lowerInput.includes('reservation') || lowerInput.includes('food')) {
      return 'restaurant';
    }
    
    return null;
  }

  ngOnDestroy() {
    this.wsService.disconnect();
  }

  async onSubmit() {
    if (!this.userInput.trim() || this.isProcessing) {
      console.log('⚠️ Submit blocked:', { 
        hasInput: !!this.userInput.trim(), 
        isProcessing: this.isProcessing 
      });
      return;
    }

    // Context sensing - detect service type if not already set
    if (!this.selectedServiceType) {
      this.selectedServiceType = this.detectServiceType(this.userInput);
      console.log(`🔍 Detected service type from input: ${this.selectedServiceType || 'unknown'}`);
    }

    console.log('📤 Submitting chat message:', this.userInput);
    console.log(`📋 Context: Service Type = ${this.selectedServiceType || 'auto-detected'}`);
    
    this.isProcessing = true;
    const input = this.userInput.trim();
    this.userInput = ''; // Clear input after submission
    this.selectedServiceType = null; // Reset context
    this.inputPlaceholder = 'Select a service type above or type your query...';
    
    // Force change detection to update UI
    this.cdr.detectChanges();

    // Set a safety timeout to ensure isProcessing is always reset
    const safetyTimeout = setTimeout(() => {
      if (this.isProcessing) {
        console.warn('⚠️ Safety timeout: Resetting isProcessing flag');
        this.isProcessing = false;
        this.cdr.detectChanges();
      }
    }, 180000); // 3 minutes safety timeout

    try {
      const response = await this.chatService.sendMessageAsync(input, this.userEmail);
      console.log('✅ Chat message sent successfully:', response);
    } catch (error: any) {
      console.error('❌ Error caught in onSubmit:', error);
      // Ignore Solana extension errors
      if (error && !error.message?.includes('solana') && !error.message?.includes('Solana')) {
        const errorMsg = error.error?.error || error.message || 'Failed to send message. Please try again.';
        console.error('Error details:', { 
          error, 
          errorType: error?.constructor?.name,
          errorMessage: error?.message,
          errorStatus: error?.status
        });
        alert(`Error: ${errorMsg}`);
        // Restore input so user can retry
        this.userInput = input;
      } else {
        // Even for Solana errors, log and continue
        console.log('⚠️ Solana extension error ignored');
      }
    } finally {
      // Clear safety timeout
      clearTimeout(safetyTimeout);
      
      // Always reset processing state to allow next request
      console.log('🔄 Entering finally block, resetting isProcessing...');
      this.isProcessing = false;
      console.log('✅ Reset isProcessing flag, ready for next request');
      
      // Force change detection to update UI immediately
      this.cdr.detectChanges();
      
      // Double-check that isProcessing is false after a brief delay
      setTimeout(() => {
        if (this.isProcessing) {
          console.error('❌ CRITICAL: isProcessing still true after reset! Forcing reset...');
          this.isProcessing = false;
          this.cdr.detectChanges();
        } else {
          console.log('✅ Verified: isProcessing is false');
        }
      }, 100);
    }
  }

}

