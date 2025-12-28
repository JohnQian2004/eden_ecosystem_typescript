import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, firstValueFrom, catchError, throwError, timeout } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ChatService {
  // Use port 3000 when running in dev mode (ng serve), otherwise use relative path
  private apiUrl = window.location.port === '4200' 
    ? 'http://localhost:3000/api/chat' 
    : '/api/chat';

  constructor(private http: HttpClient) {}

  sendMessage(input: string, email: string): Observable<any> {
    console.log(`📤 Sending chat message to ${this.apiUrl}:`, { input: input.substring(0, 50), email });
    return this.http.post(this.apiUrl, { input, email }).pipe(
      timeout(120000), // 2 minute timeout
      catchError((error: HttpErrorResponse | Error) => {
        console.error('❌ HTTP error:', error);
        // Re-throw as a regular error so it can be caught in the component
        return throwError(() => error);
      })
    );
  }

  async sendMessageAsync(input: string, email: string): Promise<any> {
    try {
      const response = await firstValueFrom(this.sendMessage(input, email));
      console.log('✅ HTTP response received:', response);
      return response;
    } catch (error: any) {
      console.error('❌ sendMessageAsync error:', error);
      throw error;
    }
  }
}

