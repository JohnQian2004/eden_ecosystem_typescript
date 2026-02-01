/**
 * Chat Service for React Native
 * Handles chat API calls
 */

import { getApiBaseUrl } from './api-base';

export interface ChatMessage {
  input: string;
  email: string;
  conversationId?: string;
  mode?: string;
}

export interface ChatResponse {
  success?: boolean;
  message?: any;
  conversationId?: string;
  response?: string;
}

class ChatService {
  private apiUrl: string;
  private baseUrl: string;

  constructor() {
    this.baseUrl = getApiBaseUrl();
    this.apiUrl = `${this.baseUrl}/api/chat`;
  }

  // Test if server is accessible
  async testConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000), // 5 second timeout
      });
      return response.ok || response.status < 500;
    } catch (error) {
      console.error('Connection test failed:', error);
      return false;
    }
  }

  async sendMessage(
    input: string,
    email: string,
    conversationId?: string,
    mode?: string
  ): Promise<ChatResponse> {
    try {
      console.log(`📤 Sending chat message to ${this.apiUrl}:`, {
        input: input.substring(0, 50),
        email,
        conversationId,
        mode,
      });

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ input, email, conversationId, mode }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Check content type to detect HTML responses (errors)
      const contentType = response.headers.get('content-type') || '';
      const isJson = contentType.includes('application/json');
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ HTTP error! status: ${response.status}, content-type: ${contentType}, body: ${errorText.substring(0, 200)}`);
        
        // If we got HTML, it's likely a 404 or server error page
        if (!isJson) {
          throw new Error(
            `Server returned HTML instead of JSON (status ${response.status}). ` +
            `This usually means the endpoint doesn't exist or the server is returning an error page. ` +
            `URL: ${this.apiUrl}`
          );
        }
        
        throw new Error(`HTTP ${response.status}: ${errorText || 'Server error'}`);
      }

      // If response is not JSON, something went wrong
      if (!isJson) {
        const text = await response.text();
        console.error(`❌ Server returned non-JSON response: ${text.substring(0, 200)}`);
        throw new Error(
          `Server returned HTML/text instead of JSON. ` +
          `This usually means the endpoint doesn't exist. ` +
          `URL: ${this.apiUrl}, Response: ${text.substring(0, 100)}`
        );
      }

      const data = await response.json();
      console.log('✅ HTTP response received:', data);
      return data;
    } catch (error: any) {
      console.error('❌ sendMessage error:', error);
      
      // Handle timeout
      if (error.name === 'AbortError' || error.message?.includes('timeout')) {
        throw new Error(
          `Request timed out after 30 seconds.\n` +
          `The server at ${this.apiUrl} is not responding.\n` +
          `Please check:\n` +
          `1. Server is running on port 3000\n` +
          `2. Server is accessible from your network\n` +
          `3. Firewall allows connections to port 3000`
        );
      }
      
      // Provide more helpful error messages
      if (error.message?.includes('Network request failed') || 
          error.message?.includes('Failed to fetch') || 
          error.name === 'TypeError' ||
          error.message?.includes('ERR_CONNECTION_REFUSED') ||
          error.message?.includes('ERR_NETWORK_CHANGED') ||
          error.message?.includes('ERR_CONNECTION_RESET')) {
        
        // Test connection to base URL
        const connectionTest = await this.testConnection();
        
        // Check if it's a CORS error
        const isCorsError = error.message?.includes('CORS') || error.message?.includes('cross-origin');
        
        let errorMsg = 'Connection failed. Please check:\n';
        errorMsg += `1. Backend server is running and accessible at ${this.baseUrl}\n`;
        errorMsg += `2. Server is reachable: ${connectionTest ? '✅ Yes' : '❌ No - Server not accessible'}\n`;
        errorMsg += '3. Server allows CORS from your origin (server has CORS enabled)\n';
        errorMsg += '4. Firewall/network allows connections to port 3000\n';
        errorMsg += '5. Try accessing in browser: ' + this.baseUrl + '\n';
        
        // Suggest HTTPS if HTTP fails
        if (!connectionTest && this.baseUrl.startsWith('http://')) {
          errorMsg += '\n💡 Tip: Server might be using HTTPS. Try: ' + this.baseUrl.replace('http://', 'https://') + '\n';
        }
        
        if (isCorsError) {
          errorMsg += '\n⚠️ CORS Error: Server needs to allow requests from your origin.\n';
          errorMsg += 'Check server CORS configuration.\n';
        }
        
        errorMsg += `\nCurrent API URL: ${this.apiUrl}`;
        errorMsg += `\nBase URL: ${this.baseUrl}`;
        errorMsg += `\nError: ${error.message || error.toString()}`;
        
        throw new Error(errorMsg);
      }
      
      // Handle JSON parse errors (HTML response)
      if (error.message?.includes('JSON') || error.message?.includes('<!DOCTYPE')) {
        throw new Error(
          `Server returned HTML instead of JSON. This usually means:\n` +
          `1. The endpoint doesn't exist (404 error)\n` +
          `2. Server is redirecting to an error page\n` +
          `3. Wrong protocol (HTTP vs HTTPS)\n` +
          `Try: ${this.apiUrl.replace('http://', 'https://')} or vice versa\n` +
          `Original error: ${error.message}`
        );
      }
      
      throw error;
    }
  }
}

export default new ChatService();

