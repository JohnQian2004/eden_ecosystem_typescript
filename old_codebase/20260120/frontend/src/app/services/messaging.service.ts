/**
 * Messaging Service
 * Handles Universal Messaging System API calls
 */

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { getApiBaseUrl } from './api-base';

export interface Conversation {
  conversationId: string;
  scope: {
    type: 'ORDER' | 'TRADE' | 'SERVICE' | 'DISPUTE' | 'SYSTEM' | 'GOVERNANCE';
    referenceId: string;
    gardenId?: string;
  };
  participants: string[];
  policy: any;
  state: 'OPEN' | 'FROZEN' | 'CLOSED';
  createdAt: number;
  updatedAt: number;
  closedAt?: number;
  frozenAt?: number;
  frozenBy?: string;
  closedBy?: string;
}

export interface Message {
  messageId: string;
  conversationId: string;
  senderId: string;
  senderType: 'USER' | 'GARDEN' | 'PRIEST' | 'ROOT_AUTHORITY';
  senderRole?: string;
  messageType: 'TEXT' | 'MEDIA' | 'ACTION' | 'SYSTEM';
  payload: {
    text?: string;
    mediaUrl?: string;
    mediaType?: string;
    action?: any;
    systemEvent?: any;
  };
  timestamp: number;
  state: 'ACTIVE' | 'FORGIVEN' | 'REDACTED';
  redactedAt?: number;
  redactedBy?: string;
  forgivenAt?: number;
  forgivenBy?: string;
  replyTo?: string;
}

export interface CreateConversationRequest {
  scope: {
    type: 'ORDER' | 'TRADE' | 'SERVICE' | 'DISPUTE' | 'SYSTEM' | 'GOVERNANCE';
    referenceId: string;
    gardenId?: string;
  };
  participants: string[];
  policy?: any;
  initialMessage?: {
    messageType: 'TEXT' | 'MEDIA' | 'ACTION' | 'SYSTEM';
    payload: {
      text?: string;
      mediaUrl?: string;
      action?: any;
      systemEvent?: any;
    };
    senderId: string;
    senderType: 'USER' | 'GARDEN' | 'PRIEST' | 'ROOT_AUTHORITY';
    senderRole?: string;
    replyTo?: string;
  };
  creatorId: string;
  creatorType: 'USER' | 'GARDEN' | 'PRIEST' | 'ROOT_AUTHORITY';
}

export interface SendMessageRequest {
  conversationId: string;
  messageType: 'TEXT' | 'MEDIA' | 'ACTION' | 'SYSTEM';
  payload: {
    text?: string;
    mediaUrl?: string;
    action?: any;
    systemEvent?: any;
  };
  replyTo?: string;
  senderId: string;
  senderType: 'USER' | 'GARDEN' | 'PRIEST' | 'ROOT_AUTHORITY';
  senderRole?: string;
}

@Injectable({
  providedIn: 'root'
})
export class MessagingService {
  private apiUrl: string;

  constructor(private http: HttpClient) {
    this.apiUrl = getApiBaseUrl();
  }

  /**
   * Create a new conversation
   */
  createConversation(request: CreateConversationRequest): Observable<{ success: boolean; conversation: Conversation }> {
    return this.http.post<{ success: boolean; conversation: Conversation }>(
      `${this.apiUrl}/api/messaging/conversations`,
      request
    );
  }

  /**
   * Get conversations with filters
   */
  getConversations(filters?: {
    scopeType?: string;
    referenceId?: string;
    participantId?: string;
    state?: string;
    gardenId?: string;
  }): Observable<{ success: boolean; conversations: Conversation[] }> {
    const params: any = {};
    if (filters) {
      if (filters.scopeType) params.scopeType = filters.scopeType;
      if (filters.referenceId) params.referenceId = filters.referenceId;
      if (filters.participantId) params.participantId = filters.participantId;
      if (filters.state) params.state = filters.state;
      if (filters.gardenId) params.gardenId = filters.gardenId;
    }
    return this.http.get<{ success: boolean; conversations: Conversation[] }>(
      `${this.apiUrl}/api/messaging/conversations`,
      { params }
    );
  }

  /**
   * Get conversation by ID
   */
  getConversation(conversationId: string): Observable<{ success: boolean; conversation: Conversation | null }> {
    return this.http.get<{ success: boolean; conversation: Conversation | null }>(
      `${this.apiUrl}/api/messaging/conversations/${conversationId}`
    );
  }

  /**
   * Send a message to a conversation
   */
  sendMessage(request: SendMessageRequest): Observable<{ success: boolean; message: Message }> {
    return this.http.post<{ success: boolean; message: Message }>(
      `${this.apiUrl}/api/messaging/conversations/${request.conversationId}/messages`,
      request
    );
  }

  /**
   * Get messages for a conversation
   */
  getConversationMessages(
    conversationId: string,
    entityId: string,
    entityType: 'USER' | 'GARDEN' | 'PRIEST' | 'ROOT_AUTHORITY',
    entityRole?: string
  ): Observable<{ success: boolean; messages: Message[] }> {
    const params: any = { entityId, entityType };
    if (entityRole) params.entityRole = entityRole;
    return this.http.get<{ success: boolean; messages: Message[] }>(
      `${this.apiUrl}/api/messaging/conversations/${conversationId}/messages`,
      { params }
    );
  }

  /**
   * Forgive a message
   */
  forgiveMessage(
    messageId: string,
    reason: string,
    forgiverId: string,
    forgiverType: 'USER' | 'GARDEN' | 'PRIEST' | 'ROOT_AUTHORITY',
    forgiverRole?: string
  ): Observable<{ success: boolean; message: Message }> {
    return this.http.post<{ success: boolean; message: Message }>(
      `${this.apiUrl}/api/messaging/messages/${messageId}/forgive`,
      { reason, forgiverId, forgiverType, forgiverRole }
    );
  }

  /**
   * Update conversation state
   */
  updateConversationState(
    conversationId: string,
    state: 'OPEN' | 'FROZEN' | 'CLOSED',
    reason: string,
    updaterId: string,
    updaterType: 'USER' | 'GARDEN' | 'PRIEST' | 'ROOT_AUTHORITY',
    updaterRole?: string
  ): Observable<{ success: boolean; conversation: Conversation }> {
    return this.http.post<{ success: boolean; conversation: Conversation }>(
      `${this.apiUrl}/api/messaging/conversations/${conversationId}/state`,
      { state, reason, updaterId, updaterType, updaterRole }
    );
  }

  /**
   * Escalate conversation
   */
  escalateConversation(
    conversationId: string,
    additionalParticipants: string[],
    reason: string,
    escalatorId: string,
    escalatorType: 'USER' | 'GARDEN' | 'PRIEST' | 'ROOT_AUTHORITY',
    escalatorRole?: string
  ): Observable<{ success: boolean; conversation: Conversation }> {
    return this.http.post<{ success: boolean; conversation: Conversation }>(
      `${this.apiUrl}/api/messaging/conversations/${conversationId}/escalate`,
      { additionalParticipants, reason, escalatorId, escalatorType, escalatorRole }
    );
  }
}

