import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { IdentityService } from '../../services/identity.service';
import { EdenUser, UsernameRegistrationRequest } from '../../models/identity.models';

@Component({
  selector: 'app-username-registration',
  templateUrl: './username-registration.component.html',
  styleUrls: ['./username-registration.component.scss']
})
export class UsernameRegistrationComponent implements OnInit {
  @Input() googleUserId!: string;
  @Input() email!: string;
  @Output() registrationComplete = new EventEmitter<EdenUser>();
  @Output() cancel = new EventEmitter<void>();

  registrationForm!: FormGroup;
  isCheckingAvailability = false;
  isRegistering = false;
  usernameAvailable: boolean | null = null;
  usernameError: string = '';
  suggestedUsernames: string[] = [];

  constructor(
    private fb: FormBuilder,
    private identityService: IdentityService
  ) {}

  ngOnInit() {
    // Generate suggested usernames from email
    this.suggestedUsernames = this.generateSuggestedUsernames(this.email);

    this.registrationForm = this.fb.group({
      globalUsername: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(30)]],
      globalNickname: ['', [Validators.maxLength(50)]]
    });

    // Auto-check availability when username changes
    this.registrationForm.get('globalUsername')?.valueChanges.subscribe(username => {
      if (username && username.length >= 3) {
        this.checkUsernameAvailability(username);
      } else {
        this.usernameAvailable = null;
        this.usernameError = '';
      }
    });
  }

  /**
   * Generate suggested usernames from email
   */
  private generateSuggestedUsernames(email: string): string[] {
    const suggestions: string[] = [];
    const localPart = email.split('@')[0];
    
    // Clean local part (remove dots, numbers, special chars)
    const cleanLocal = localPart.replace(/[^a-zA-Z]/g, '').toLowerCase();
    
    if (cleanLocal.length >= 3) {
      suggestions.push(cleanLocal);
      suggestions.push(`${cleanLocal}_${Math.floor(Math.random() * 100)}`);
      suggestions.push(`${cleanLocal}${Math.floor(Math.random() * 1000)}`);
    }
    
    // Add generic suggestions
    suggestions.push(`user_${Math.floor(Math.random() * 10000)}`);
    
    return suggestions.slice(0, 3);
  }

  /**
   * Check if username is available
   */
  checkUsernameAvailability(username: string): void {
    const validation = this.identityService.validateUsername(username);
    if (!validation.valid) {
      this.usernameAvailable = false;
      this.usernameError = validation.error || 'Invalid username';
      return;
    }

    this.isCheckingAvailability = true;
    this.usernameError = '';
    
    this.identityService.checkUsernameAvailability(username).subscribe({
      next: (available) => {
        this.usernameAvailable = available;
        this.isCheckingAvailability = false;
        if (!available) {
          this.usernameError = 'Username is already taken';
        }
      },
      error: (error) => {
        console.error('❌ [UsernameRegistration] Availability check failed:', error);
        this.usernameAvailable = false;
        this.usernameError = 'Failed to check availability';
        this.isCheckingAvailability = false;
      }
    });
  }

  /**
   * Use suggested username
   */
  useSuggestedUsername(username: string): void {
    this.registrationForm.patchValue({ globalUsername: username });
    this.checkUsernameAvailability(username);
  }

  /**
   * Submit registration
   */
  onSubmit(): void {
    if (this.registrationForm.invalid || !this.usernameAvailable) {
      return;
    }

    const formValue = this.registrationForm.value;
    const request: UsernameRegistrationRequest = {
      googleUserId: this.googleUserId,
      email: this.email,
      globalUsername: formValue.globalUsername,
      globalNickname: formValue.globalNickname || undefined
    };

    this.isRegistering = true;

    this.identityService.registerUsername(request).subscribe({
      next: (user) => {
        console.log('✅ [UsernameRegistration] Registration successful:', user);
        this.registrationComplete.emit(user);
        this.isRegistering = false;
      },
      error: (error) => {
        console.error('❌ [UsernameRegistration] Registration failed:', error);
        this.usernameError = error.error?.message || 'Registration failed. Please try again.';
        this.isRegistering = false;
      }
    });
  }

  /**
   * Cancel registration
   */
  onCancel(): void {
    this.cancel.emit();
  }
}

