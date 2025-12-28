import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, firstValueFrom } from 'rxjs';

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
    return this.http.post(this.apiUrl, { input, email });
  }

  async sendMessageAsync(input: string, email: string): Promise<any> {
    return await firstValueFrom(this.sendMessage(input, email));
  }
}

