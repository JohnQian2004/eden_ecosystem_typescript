/**
 * Eden Universal Messaging System - Conversation Service
 * 
 * Manages conversations, messages, and governance
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import {
  Conversation,
  Message,
  ConversationState,
  MessageState,
  MessageType,
  MessagingEntityType,
  CreateConversationRequest,
  SendMessageRequest,
  ForgiveMessageRequest,
  UpdateConversationStateRequest,
  EscalateConversationRequest,
  ConversationFilters,
  ConversationPolicy,
  PermissionRule
} from './types';

// In-memory storage (in production, use Redis/database)
const CONVERSATIONS: Map<string, Conversation> = new Map();
const MESSAGES: Map<string, Message> = new Map();
const CONVERSATION_MESSAGES: Map<string, string[]> = new Map(); // conversationId -> messageId[]
const ENTITY_CONVERSATIONS: Map<string, string[]> = new Map(); // entityId -> conversationId[]

/**
 * Initialize messaging system
 */
export function initializeMessaging(): void {
  console.log('💬 [Messaging] Initializing Universal Messaging System...');
  loadMessagingPersistence();
  console.log(`✅ [Messaging] Messaging system initialized. Conversations: ${CONVERSATIONS.size}, Messages: ${MESSAGES.size}`);
}

/**
 * Create a new conversation
 */
export function createConversation(
  request: CreateConversationRequest,
  creatorId: string,
  creatorType: MessagingEntityType
): Conversation {
  const conversationId = `conv_${Date.now()}_${crypto.randomUUID().substring(0, 8)}`;
  
  // Default policy if not provided
  const policy: ConversationPolicy = request.policy || {
    readPermissions: [{ entityType: creatorType, entityId: creatorId }],
    writePermissions: [{ entityType: creatorType, entityId: creatorId }],
    invitePermissions: [{ entityType: creatorType, entityId: creatorId }],
    escalatePermissions: [{ entityType: 'PRIEST' }, { entityType: 'ROOT_AUTHORITY' }],
    closePermissions: [{ entityType: creatorType, entityId: creatorId }, { entityType: 'PRIEST' }, { entityType: 'ROOT_AUTHORITY' }]
  };

  // Ensure creator is in participants
  const participants = [...new Set([creatorId, ...request.participants])];

  const conversation: Conversation = {
    conversationId,
    scope: request.scope,
    participants,
    policy,
    state: 'OPEN',
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  CONVERSATIONS.set(conversationId, conversation);
  
  // Index by participants
  participants.forEach(participantId => {
    const existing = ENTITY_CONVERSATIONS.get(participantId) || [];
    existing.push(conversationId);
    ENTITY_CONVERSATIONS.set(participantId, existing);
  });

  // Create initial message if provided
  if (request.initialMessage) {
    try {
      // Use the senderId and senderType from initialMessage, not from creator
      // This allows the initial message to be from a different sender (e.g., user sending to GOD)
      const initialMsg = sendMessage({
        conversationId,
        messageType: request.initialMessage.messageType,
        payload: request.initialMessage.payload,
        replyTo: request.initialMessage.replyTo
      }, request.initialMessage.senderId, request.initialMessage.senderType, request.initialMessage.senderRole);
      
      // Verify message was stored
      const storedMsg = MESSAGES.get(initialMsg.messageId);
      if (!storedMsg) {
        console.error(`❌ [Messaging] CRITICAL: Initial message ${initialMsg.messageId} was not stored!`);
        MESSAGES.set(initialMsg.messageId, initialMsg);
      }
      
      // Verify message is in conversation's message list
      const convMessages = CONVERSATION_MESSAGES.get(conversationId) || [];
      if (!convMessages.includes(initialMsg.messageId)) {
        console.error(`❌ [Messaging] CRITICAL: Initial message ${initialMsg.messageId} is NOT in conversation's message list!`);
        convMessages.push(initialMsg.messageId);
        CONVERSATION_MESSAGES.set(conversationId, convMessages);
      }
    } catch (error: any) {
      console.error(`❌ [Messaging] Failed to create initial message:`, error.message);
      // Don't fail the conversation creation, but log the error
    }
  }

  saveMessagingPersistence();
  console.log(`✅ [Messaging] Created conversation: ${conversationId} (scope: ${request.scope.type}/${request.scope.referenceId})`);
  console.log(`✅ [Messaging] Conversation has ${CONVERSATION_MESSAGES.get(conversationId)?.length || 0} messages`);

  return conversation;
}

/**
 * Get conversation by ID
 */
export function getConversation(conversationId: string): Conversation | null {
  return CONVERSATIONS.get(conversationId) || null;
}

/**
 * Get conversations by filters (optimized)
 */
export function getConversations(filters: ConversationFilters): Conversation[] {
  const startTime = Date.now();
  const totalConversations = CONVERSATIONS.size;
  
  // Optimize: Apply all filters in a single pass instead of multiple filter() calls
  let results: Conversation[] = [];
  
  // If no filters, return all (but still need to convert to array for sorting)
  if (!filters.scopeType && !filters.referenceId && !filters.participantId && !filters.state && !filters.gardenId) {
    results = Array.from(CONVERSATIONS.values());
  } else {
    // Single pass filtering
    for (const conversation of CONVERSATIONS.values()) {
      let matches = true;
      
      if (filters.scopeType && conversation.scope.type !== filters.scopeType) {
        matches = false;
      }
      
      if (matches && filters.referenceId && conversation.scope.referenceId !== filters.referenceId) {
        matches = false;
      }
      
      if (matches && filters.participantId && !conversation.participants.includes(filters.participantId)) {
        matches = false;
      }
      
      if (matches && filters.state && conversation.state !== filters.state) {
        matches = false;
      }
      
      if (matches && filters.gardenId && conversation.scope.gardenId !== filters.gardenId) {
        matches = false;
      }
      
      if (matches) {
        results.push(conversation);
      }
    }
  }

  // Sort by updatedAt (newest first)
  results.sort((a, b) => b.updatedAt - a.updatedAt);
  
  const duration = Date.now() - startTime;
  if (duration > 50 || totalConversations > 100) {
    console.log(`[Messaging] getConversations: ${results.length} results from ${totalConversations} total conversations in ${duration}ms`);
  }
  
  return results;
}

/**
 * Check if entity has permission
 */
export function hasPermission(
  conversation: Conversation,
  entityId: string,
  entityType: MessagingEntityType,
  permissionType: 'read' | 'write' | 'invite' | 'escalate' | 'close',
  entityRole?: string
): boolean {
  const rules = permissionType === 'read' ? conversation.policy.readPermissions :
                permissionType === 'write' ? conversation.policy.writePermissions :
                permissionType === 'invite' ? conversation.policy.invitePermissions :
                permissionType === 'escalate' ? conversation.policy.escalatePermissions :
                conversation.policy.closePermissions;

  // Check if entity is a participant (basic requirement)
  if (!conversation.participants.includes(entityId)) {
    return false;
  }

  // Check permission rules
  for (const rule of rules) {
    // Check entity type
    if (rule.entityType && rule.entityType !== entityType) {
      continue;
    }

    // Check specific entity
    if (rule.entityId && rule.entityId !== entityId) {
      continue;
    }

    // Check role
    if (rule.role && entityRole !== rule.role) {
      continue;
    }

    // Check garden context
    if (rule.gardenId && conversation.scope.gardenId !== rule.gardenId) {
      continue;
    }

    // Rule matches
    return true;
  }

  // No matching rule
  return false;
}

/**
 * Send a message to a conversation
 */
export function sendMessage(
  request: SendMessageRequest,
  senderId: string,
  senderType: MessagingEntityType,
  senderRole?: string
): Message {
  const conversation = CONVERSATIONS.get(request.conversationId);
  if (!conversation) {
    throw new Error(`Conversation not found: ${request.conversationId}`);
  }

  // Check write permission
  // For ROOT_AUTHORITY, always allow write access to GOVERNANCE conversations
  const isRootAuthority = senderType === 'ROOT_AUTHORITY';
  const isGovernanceConversation = conversation.scope.type === 'GOVERNANCE';
  const isRootWriteAccess = isRootAuthority && isGovernanceConversation;
  
  const hasWritePermission = hasPermission(conversation, senderId, senderType, 'write', senderRole);
  
  if (!hasWritePermission && !isRootWriteAccess) {
    console.warn(`[Messaging] Entity ${senderId} (${senderType}) attempted to write to conversation ${request.conversationId} without permission.`);
    console.warn(`[Messaging] Has write permission: ${hasWritePermission}, Is ROOT write access: ${isRootWriteAccess}`);
    throw new Error(`Entity ${senderId} does not have write permission for conversation ${request.conversationId}`);
  }
  
  if (isRootWriteAccess) {
    console.log(`[Messaging] ROOT_AUTHORITY writing to GOVERNANCE conversation ${request.conversationId} (bypassing permission check)`);
  }

  // Check conversation state
  if (conversation.state === 'CLOSED') {
    throw new Error(`Cannot send message to closed conversation: ${request.conversationId}`);
  }

  if (conversation.state === 'FROZEN') {
    throw new Error(`Cannot send message to frozen conversation: ${request.conversationId}`);
  }

  const messageId = `msg_${Date.now()}_${crypto.randomUUID().substring(0, 8)}`;
  
  const message: Message = {
    messageId,
    conversationId: request.conversationId,
    senderId,
    senderType,
    senderRole,
    messageType: request.messageType,
    payload: request.payload,
    timestamp: Date.now(),
    state: 'ACTIVE',
    replyTo: request.replyTo
  };

  MESSAGES.set(messageId, message);
  
  // Add to conversation's message list
  const messageList = CONVERSATION_MESSAGES.get(request.conversationId) || [];
  messageList.push(messageId);
  CONVERSATION_MESSAGES.set(request.conversationId, messageList);

  // Update conversation timestamp
  conversation.updatedAt = Date.now();
  CONVERSATIONS.set(request.conversationId, conversation);

  saveMessagingPersistence();

  return message;
}

/**
 * Get messages for a conversation
 */
export function getConversationMessages(
  conversationId: string,
  entityId: string,
  entityType: MessagingEntityType,
  entityRole?: string
): Message[] {
  const startTime = Date.now();
  
  const conversation = CONVERSATIONS.get(conversationId);
  if (!conversation) {
    console.error(`[Messaging] Conversation not found: ${conversationId}. Total conversations: ${CONVERSATIONS.size}`);
    throw new Error(`Conversation not found: ${conversationId}`);
  }

  // Check if entity is a participant (basic requirement)
  const isParticipant = conversation.participants.includes(entityId);
  
  // For ROOT_AUTHORITY, always allow access to GOVERNANCE conversations
  const isRootAuthority = entityType === 'ROOT_AUTHORITY';
  const isGovernanceConversation = conversation.scope.type === 'GOVERNANCE';
  const isRootAccess = isRootAuthority && isGovernanceConversation;
  
  // Check read permission
  const hasReadPermission = hasPermission(conversation, entityId, entityType, 'read', entityRole);
  
  // Allow access if:
  // 1. Entity is a participant, OR
  // 2. Entity has explicit read permission, OR
  // 3. Entity is ROOT_AUTHORITY accessing a GOVERNANCE conversation
  if (!isParticipant && !hasReadPermission && !isRootAccess) {
    console.warn(`[Messaging] Entity ${entityId} (${entityType}) attempted to read conversation ${conversationId} without permission.`);
    throw new Error(`Entity ${entityId} does not have read permission for conversation ${conversationId}`);
  }

  const messageIds = CONVERSATION_MESSAGES.get(conversationId) || [];
  
  if (messageIds.length === 0) {
    console.warn(`[Messaging] WARNING: Conversation ${conversationId} has NO message IDs`);
  }
  
  const missingMessageIds: string[] = [];
  const messages = messageIds
    .map(id => {
      const msg = MESSAGES.get(id);
      if (!msg) {
        missingMessageIds.push(id);
      }
      return msg;
    })
    .filter((msg): msg is Message => msg !== undefined)
    .sort((a, b) => a.timestamp - b.timestamp);

  // Clean up orphaned message IDs (message IDs that don't have corresponding messages)
  if (missingMessageIds.length > 0) {
    console.warn(`[Messaging] Cleaning up ${missingMessageIds.length} orphaned message IDs from conversation ${conversationId}`);
    const cleanedMessageIds = messageIds.filter(id => !missingMessageIds.includes(id));
    CONVERSATION_MESSAGES.set(conversationId, cleanedMessageIds);
    saveMessagingPersistence();
  }

  const duration = Date.now() - startTime;
  if (duration > 50 || messages.length === 0 && messageIds.length > 0) {
    console.log(`[Messaging] Retrieved ${messages.length} messages for conversation ${conversationId} in ${duration}ms`);
    if (messages.length === 0 && messageIds.length > 0) {
      console.error(`[Messaging] WARNING: ${messageIds.length} message IDs but 0 messages retrieved!`);
    }
  }
  
  return messages;
}

/**
 * Forgive a message
 */
export function forgiveMessage(
  request: ForgiveMessageRequest,
  forgiverId: string,
  forgiverType: MessagingEntityType,
  forgiverRole?: string
): Message {
  const message = MESSAGES.get(request.messageId);
  if (!message) {
    throw new Error(`Message not found: ${request.messageId}`);
  }

  const conversation = CONVERSATIONS.get(message.conversationId);
  if (!conversation) {
    throw new Error(`Conversation not found: ${message.conversationId}`);
  }

  // Only PRIEST or ROOT_AUTHORITY can forgive
  if (forgiverType !== 'PRIEST' && forgiverType !== 'ROOT_AUTHORITY') {
    throw new Error(`Only PRIEST or ROOT_AUTHORITY can forgive messages`);
  }

  // Update message state
  message.state = 'FORGIVEN';
  message.forgivenAt = Date.now();
  message.forgivenBy = forgiverId;

  // Redact content if needed
  if (message.payload.text) {
    message.payload.text = '[Content redacted - forgiven]';
  }

  MESSAGES.set(request.messageId, message);
  saveMessagingPersistence();

  console.log(`✅ [Messaging] Message forgiven: ${request.messageId} by ${forgiverId}`);

  return message;
}

/**
 * Redact a message
 */
export function redactMessage(
  messageId: string,
  redactorId: string,
  redactorType: MessagingEntityType,
  redactorRole?: string
): Message {
  const message = MESSAGES.get(messageId);
  if (!message) {
    throw new Error(`Message not found: ${messageId}`);
  }

  const conversation = CONVERSATIONS.get(message.conversationId);
  if (!conversation) {
    throw new Error(`Conversation not found: ${message.conversationId}`);
  }

  // Only PRIEST or ROOT_AUTHORITY can redact
  if (redactorType !== 'PRIEST' && redactorType !== 'ROOT_AUTHORITY') {
    throw new Error(`Only PRIEST or ROOT_AUTHORITY can redact messages`);
  }

  // Update message state
  message.state = 'REDACTED';
  message.redactedAt = Date.now();
  message.redactedBy = redactorId;

  // Redact content
  if (message.payload.text) {
    message.payload.text = '[Content redacted]';
  }
  if (message.payload.mediaUrl) {
    message.payload.mediaUrl = undefined;
  }

  MESSAGES.set(messageId, message);
  saveMessagingPersistence();

  console.log(`✅ [Messaging] Message redacted: ${messageId} by ${redactorId}`);

  return message;
}

/**
 * Update conversation state
 */
export function updateConversationState(
  request: UpdateConversationStateRequest,
  updaterId: string,
  updaterType: MessagingEntityType,
  updaterRole?: string
): Conversation {
  const conversation = CONVERSATIONS.get(request.conversationId);
  if (!conversation) {
    throw new Error(`Conversation not found: ${request.conversationId}`);
  }

  // Check close permission for CLOSED state
  if (request.state === 'CLOSED' && !hasPermission(conversation, updaterId, updaterType, 'close', updaterRole)) {
    throw new Error(`Entity ${updaterId} does not have permission to close conversation ${request.conversationId}`);
  }

  // Only PRIEST or ROOT_AUTHORITY can freeze
  if (request.state === 'FROZEN' && updaterType !== 'PRIEST' && updaterType !== 'ROOT_AUTHORITY') {
    throw new Error(`Only PRIEST or ROOT_AUTHORITY can freeze conversations`);
  }

  conversation.state = request.state;
  conversation.updatedAt = Date.now();

  if (request.state === 'FROZEN') {
    conversation.frozenAt = Date.now();
    conversation.frozenBy = updaterId;
  } else if (request.state === 'CLOSED') {
    conversation.closedAt = Date.now();
    conversation.closedBy = updaterId;
  }

  CONVERSATIONS.set(request.conversationId, conversation);
  saveMessagingPersistence();

  console.log(`✅ [Messaging] Conversation ${request.conversationId} state updated to ${request.state} by ${updaterId}`);

  return conversation;
}

/**
 * Escalate conversation
 */
export function escalateConversation(
  request: EscalateConversationRequest,
  escalatorId: string,
  escalatorType: MessagingEntityType,
  escalatorRole?: string
): Conversation {
  const conversation = CONVERSATIONS.get(request.conversationId);
  if (!conversation) {
    throw new Error(`Conversation not found: ${request.conversationId}`);
  }

  // Check escalate permission
  if (!hasPermission(conversation, escalatorId, escalatorType, 'escalate', escalatorRole)) {
    throw new Error(`Entity ${escalatorId} does not have permission to escalate conversation ${request.conversationId}`);
  }

  // Add additional participants
  const newParticipants = request.additionalParticipants.filter(p => !conversation.participants.includes(p));
  conversation.participants = [...conversation.participants, ...newParticipants];

  // Index new participants
  newParticipants.forEach(participantId => {
    const existing = ENTITY_CONVERSATIONS.get(participantId) || [];
    if (!existing.includes(request.conversationId)) {
      existing.push(request.conversationId);
      ENTITY_CONVERSATIONS.set(participantId, existing);
    }
  });

  // Create system message about escalation
  sendMessage({
    conversationId: request.conversationId,
    messageType: 'SYSTEM',
    payload: {
      systemEvent: {
        eventType: 'CONVERSATION_ESCALATED',
        data: {
          escalatedBy: escalatorId,
          reason: request.reason,
          additionalParticipants: newParticipants
        }
      }
    }
  }, escalatorId, escalatorType, escalatorRole);

  conversation.updatedAt = Date.now();
  CONVERSATIONS.set(request.conversationId, conversation);
  saveMessagingPersistence();

  console.log(`✅ [Messaging] Conversation ${request.conversationId} escalated by ${escalatorId}`);

  return conversation;
}

/**
 * Load messaging persistence
 */
function loadMessagingPersistence(): void {
  try {
    const persistencePath = path.join(__dirname, '../eden-messaging-persistence.json');
    if (fs.existsSync(persistencePath)) {
      const data = JSON.parse(fs.readFileSync(persistencePath, 'utf-8'));
      
      if (data.conversations) {
        for (const conv of data.conversations) {
          CONVERSATIONS.set(conv.conversationId, conv);
        }
      }

      if (data.messages) {
        for (const msg of data.messages) {
          MESSAGES.set(msg.messageId, msg);
        }
      }

      if (data.conversationMessages) {
        for (const [convId, msgIds] of Object.entries(data.conversationMessages)) {
          CONVERSATION_MESSAGES.set(convId, msgIds as string[]);
        }
      }

      if (data.entityConversations) {
        for (const [entityId, convIds] of Object.entries(data.entityConversations)) {
          ENTITY_CONVERSATIONS.set(entityId, convIds as string[]);
        }
      }

      console.log(`📦 [Messaging] Loaded ${CONVERSATIONS.size} conversations and ${MESSAGES.size} messages from persistence`);
    }
  } catch (error) {
    console.error('❌ [Messaging] Failed to load messaging persistence:', error);
  }
}

/**
 * Save messaging persistence
 */
function saveMessagingPersistence(): void {
  try {
    const persistencePath = path.join(__dirname, '../eden-messaging-persistence.json');
    const data = {
      conversations: Array.from(CONVERSATIONS.values()),
      messages: Array.from(MESSAGES.values()),
      conversationMessages: Object.fromEntries(CONVERSATION_MESSAGES),
      entityConversations: Object.fromEntries(ENTITY_CONVERSATIONS),
      savedAt: Date.now()
    };
    fs.writeFileSync(persistencePath, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('❌ [Messaging] Failed to save messaging persistence:', error);
  }
}

