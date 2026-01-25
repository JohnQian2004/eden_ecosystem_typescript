# Universal Messaging System Implementation

## Overview

The Eden Universal Messaging System has been implemented as a first-class system primitive, providing governed, auditable, real-time communication for all Eden entities.

## Implementation Status

### ✅ Completed

1. **Type Definitions** (`server/src/messaging/types.ts`)
   - Conversation, Message, ConversationPolicy interfaces
   - Message types: TEXT, MEDIA, ACTION, SYSTEM
   - Conversation states: OPEN, FROZEN, CLOSED
   - Message states: ACTIVE, FORGIVEN, REDACTED
   - Entity types: USER, GARDEN, PRIEST, ROOT_AUTHORITY

2. **Conversation Service** (`server/src/messaging/conversationService.ts`)
   - `createConversation()` - Create new conversations with policies
   - `getConversation()` - Retrieve conversation by ID
   - `getConversations()` - List conversations with filters
   - `sendMessage()` - Send messages with permission checks
   - `getConversationMessages()` - Retrieve messages for a conversation
   - `forgiveMessage()` - Forgive messages (PRIEST/ROOT_AUTHORITY only)
   - `redactMessage()` - Redact message content
   - `updateConversationState()` - Update conversation lifecycle state
   - `escalateConversation()` - Escalate to governance operators
   - Permission checking via `hasPermission()`
   - Persistence to `eden-messaging-persistence.json`

3. **API Endpoints** (in `server/eden-sim-redis.ts`)
   - `POST /api/messaging/conversations` - Create conversation
   - `GET /api/messaging/conversations` - List conversations (with filters)
   - `GET /api/messaging/conversations/:conversationId` - Get conversation
   - `POST /api/messaging/conversations/:conversationId/messages` - Send message
   - `GET /api/messaging/conversations/:conversationId/messages` - Get messages
   - `POST /api/messaging/messages/:messageId/forgive` - Forgive message
   - `POST /api/messaging/conversations/:conversationId/state` - Update state
   - `POST /api/messaging/conversations/:conversationId/escalate` - Escalate

4. **WebSocket Integration**
   - Events broadcast via `broadcastEvent()`:
     - `conversation_created`
     - `message_sent`
     - `message_forgiven`
     - `conversation_state_changed`
     - `conversation_escalated`

5. **Server Integration**
   - Messaging system initialized in `main()` function
   - Integrated with existing server architecture

## Architecture

### Conversation Model

Each conversation is scoped to an operational context:
- **ORDER** - Order-related conversations
- **TRADE** - DEX trade conversations
- **SERVICE** - Service provider conversations
- **DISPUTE** - Dispute resolution conversations
- **SYSTEM** - System-level conversations
- **GOVERNANCE** - Governance conversations

### Permission Model

Conversation policies define:
- **Read permissions** - Who can view messages
- **Write permissions** - Who can send messages
- **Invite permissions** - Who can add participants
- **Escalate permissions** - Who can escalate to governance
- **Close permissions** - Who can close conversations

### Forgiveness Model

- Messages can be forgiven by PRIEST or ROOT_AUTHORITY
- Forgiven messages are redacted but not deleted
- Historical records remain intact
- Behavioral penalties are neutralized

### Escalation Model

- Conversations can be escalated to governance operators
- Escalation extends the conversation scope (doesn't create new conversation)
- Additional participants (PRIEST/ROOT_AUTHORITY) are added automatically

## Usage Examples

### Create a Conversation

```typescript
POST /api/messaging/conversations
{
  "scope": {
    "type": "ORDER",
    "referenceId": "order-123",
    "gardenId": "garden-alpha"
  },
  "participants": ["user-1", "user-2"],
  "creatorId": "user-1",
  "creatorType": "USER",
  "initialMessage": {
    "messageType": "TEXT",
    "payload": { "text": "Hello, I have a question about this order." },
    "senderId": "user-1",
    "senderType": "USER"
  }
}
```

### Send a Message

```typescript
POST /api/messaging/conversations/{conversationId}/messages
{
  "messageType": "TEXT",
  "payload": { "text": "This is my response." },
  "senderId": "user-2",
  "senderType": "USER",
  "replyTo": "msg-123" // optional
}
```

### Forgive a Message

```typescript
POST /api/messaging/messages/{messageId}/forgive
{
  "reason": "User apologized",
  "forgiverId": "priest-1",
  "forgiverType": "PRIEST"
}
```

### Escalate Conversation

```typescript
POST /api/messaging/conversations/{conversationId}/escalate
{
  "additionalParticipants": ["priest-1"],
  "reason": "Dispute requires governance review",
  "escalatorId": "user-1",
  "escalatorType": "USER"
}
```

## Next Steps (TODO)

1. **Frontend Components**
   - Conversation list UI
   - Message thread UI
   - Message composer
   - Permission indicators
   - Escalation UI

2. **Behavioral Integration**
   - Attitude adjustments based on message content
   - Positive/negative behavior detection
   - Integration with AttiJuice system

3. **Advanced Features**
   - Media message support (file uploads)
   - Action message handlers
   - System event processing
   - Cross-garden messaging
   - Federation support

4. **Testing**
   - Unit tests for conversation service
   - Integration tests for API endpoints
   - Permission testing
   - Escalation flow testing

## Files Created

- `server/src/messaging/types.ts` - Type definitions
- `server/src/messaging/conversationService.ts` - Core service implementation
- `server/MESSAGING_IMPLEMENTATION.md` - This document

## Files Modified

- `server/eden-sim-redis.ts` - Added API endpoints and initialization
- `requirements/eden_sim_whitepaper_v1_20251229.md` - Added Section 6 (Universal Messaging System)

## Persistence

Messages and conversations are persisted to:
- `server/eden-messaging-persistence.json`

This file is automatically loaded on server startup and saved after each operation.

## Security Notes

- All permission checks are enforced server-side
- Only PRIEST and ROOT_AUTHORITY can forgive/redact messages
- Only authorized entities can escalate conversations
- Conversation state changes are logged and auditable

