/**
 * Eden Universal Messaging System - Type Definitions
 * 
 * Messaging is a first-class system primitive for all Eden interactions.
 */

/**
 * Conversation Lifecycle States
 */
export type ConversationState = 'OPEN' | 'FROZEN' | 'CLOSED';

/**
 * Message Types
 */
export type MessageType = 'TEXT' | 'MEDIA' | 'ACTION' | 'SYSTEM';

/**
 * Message States
 */
export type MessageState = 'ACTIVE' | 'FORGIVEN' | 'REDACTED';

/**
 * Entity Types (messaging participants)
 */
export type MessagingEntityType = 'USER' | 'GARDEN' | 'PRIEST' | 'ROOT_AUTHORITY';

/**
 * Conversation
 * Primary container for messaging
 */
export interface Conversation {
  conversationId: string;           // Unique identifier
  scope: ConversationScope;        // Scoped object reference
  participants: string[];           // Entity IDs (bounded participant set)
  policy: ConversationPolicy;       // Governing policy
  state: ConversationState;         // Lifecycle state
  createdAt: number;
  updatedAt: number;
  closedAt?: number;
  frozenAt?: number;
  frozenBy?: string;                 // Entity ID that froze it
  closedBy?: string;                 // Entity ID that closed it
}

/**
 * Conversation Scope
 * Defines the operational context
 */
export interface ConversationScope {
  type: 'ORDER' | 'TRADE' | 'SERVICE' | 'DISPUTE' | 'SYSTEM' | 'GOVERNANCE';
  referenceId: string;               // e.g., order ID, trade ID, service ID
  gardenId?: string;                 // Optional garden context
}

/**
 * Conversation Policy
 * Defines permissions and governance rules
 */
export interface ConversationPolicy {
  readPermissions: PermissionRule[];      // Who may read
  writePermissions: PermissionRule[];     // Who may write
  invitePermissions: PermissionRule[];     // Who may invite participants
  escalatePermissions: PermissionRule[]; // Who may escalate
  closePermissions: PermissionRule[];      // Who may close
  moderationRules?: ModerationRule[];      // Optional moderation rules
}

/**
 * Permission Rule
 */
export interface PermissionRule {
  entityType?: MessagingEntityType;  // Optional entity type filter
  entityId?: string;                 // Optional specific entity
  role?: string;                     // Optional role requirement (e.g., 'PRIEST', 'OWNER')
  gardenId?: string;                 // Optional garden context
  condition?: string;                // Optional condition expression
}

/**
 * Moderation Rule
 */
export interface ModerationRule {
  trigger: string;                   // Trigger condition (e.g., keyword, pattern)
  action: 'WARN' | 'REDACT' | 'FREEZE' | 'ESCALATE';
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
}

/**
 * Message Event
 * Immutable event appended to a conversation
 */
export interface Message {
  messageId: string;                 // Unique identifier
  conversationId: string;             // Parent conversation
  senderId: string;                   // Entity ID of sender
  senderType: MessagingEntityType;   // Entity type of sender
  senderRole?: string;                // Optional role (e.g., 'PRIEST', 'OWNER')
  messageType: MessageType;
  payload: MessagePayload;
  timestamp: number;
  state: MessageState;
  redactedAt?: number;
  redactedBy?: string;
  forgivenAt?: number;
  forgivenBy?: string;
  replyTo?: string;                   // Optional reference to another message
}

/**
 * Message Payload
 */
export interface MessagePayload {
  text?: string;                      // For TEXT messages
  mediaUrl?: string;                  // For MEDIA messages
  mediaType?: string;                 // MIME type
  action?: ActionPayload;             // For ACTION messages
  systemEvent?: SystemEventPayload;   // For SYSTEM messages
}

/**
 * Action Payload (machine-readable instructions)
 */
export interface ActionPayload {
  actionType: string;                 // e.g., 'APPROVE', 'REJECT', 'ESCALATE'
  parameters: Record<string, any>;     // Action-specific parameters
}

/**
 * System Event Payload (governance actions)
 */
export interface SystemEventPayload {
  eventType: string;                 // e.g., 'CONVERSATION_FROZEN', 'PARTICIPANT_ADDED'
  data: Record<string, any>;          // Event-specific data
}

/**
 * Create Conversation Request
 */
export interface CreateConversationRequest {
  scope: ConversationScope;
  participants: string[];
  policy?: Partial<ConversationPolicy>;
  initialMessage?: Omit<Message, 'messageId' | 'conversationId' | 'timestamp' | 'state'>;
}

/**
 * Send Message Request
 */
export interface SendMessageRequest {
  conversationId: string;
  messageType: MessageType;
  payload: MessagePayload;
  replyTo?: string;
}

/**
 * Forgive Message Request
 */
export interface ForgiveMessageRequest {
  messageId: string;
  reason?: string;
}

/**
 * Update Conversation State Request
 */
export interface UpdateConversationStateRequest {
  conversationId: string;
  state: ConversationState;
  reason?: string;
}

/**
 * Escalate Conversation Request
 */
export interface EscalateConversationRequest {
  conversationId: string;
  additionalParticipants: string[];
  reason: string;
}

/**
 * Conversation Query Filters
 */
export interface ConversationFilters {
  scopeType?: ConversationScope['type'];
  referenceId?: string;
  participantId?: string;
  state?: ConversationState;
  gardenId?: string;
}

