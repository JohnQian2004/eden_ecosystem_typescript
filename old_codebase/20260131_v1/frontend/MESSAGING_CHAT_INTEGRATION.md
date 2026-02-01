# Messaging System Chat Integration

## Overview

The Universal Messaging System has been integrated into the chat interface, allowing regular messaging to be routed through the chat windows.

## Implementation

### 1. Messaging Service (`frontend/src/app/services/messaging.service.ts`)

Created a new Angular service that provides methods for:
- Creating conversations
- Getting conversations (with filters)
- Sending messages
- Getting conversation messages
- Forgiving messages
- Updating conversation state
- Escalating conversations

### 2. Chat Component Integration (`workflow-chat-display.component.ts`)

Updated the chat component to:
- Import and inject `MessagingService`
- Track active conversations and messages
- Handle messaging WebSocket events:
  - `conversation_created` - Shows when a conversation is created
  - `message_sent` - Displays messages in the chat window
  - `message_forgiven` - Shows when a message is forgiven
  - `conversation_state_changed` - Shows when conversation state changes
  - `conversation_escalated` - Shows when a conversation is escalated

### 3. WebSocket Event Handling

The chat component now processes messaging events and displays them as:
- **User messages**: When `senderType === 'USER'`
- **Assistant messages**: When `senderType === 'GARDEN'`, `'PRIEST'`, or `'ROOT_AUTHORITY'`
- **System messages**: For conversation state changes, escalations, etc.

### 4. Message Display

Messages are displayed in the chat window with:
- Proper message type (user/assistant/system)
- Timestamp
- Message content (text from `payload.text`)
- Conversation context (stored in `data.conversationId`)

## How It Works

1. **When a conversation is created**: The `conversation_created` WebSocket event is broadcast, and the chat component displays a system message.

2. **When a message is sent**: The `message_sent` WebSocket event is broadcast, and the chat component:
   - Adds the message to the conversation's message list
   - Displays it in the chat window as a user or assistant message
   - Preserves the conversation context

3. **When a message is forgiven**: The `message_forgiven` WebSocket event is broadcast, and the chat component displays a system notification.

4. **When conversation state changes**: The `conversation_state_changed` WebSocket event is broadcast, and the chat component displays a system message with the new state.

5. **When a conversation is escalated**: The `conversation_escalated` WebSocket event is broadcast, and the chat component displays a system notification.

## Usage

### Creating a Conversation via API

```typescript
this.messagingService.createConversation({
  scope: {
    type: 'SYSTEM',
    referenceId: 'help-request-123'
  },
  participants: [userEmail],
  creatorId: userEmail,
  creatorType: 'USER',
  initialMessage: {
    messageType: 'TEXT',
    payload: { text: 'I need help with...' },
    senderId: userEmail,
    senderType: 'USER'
  }
}).subscribe(response => {
  console.log('Conversation created:', response.conversation);
});
```

### Sending a Message

```typescript
this.messagingService.sendMessage({
  conversationId: 'conv_123',
  messageType: 'TEXT',
  payload: { text: 'This is my message' },
  senderId: userEmail,
  senderType: 'USER'
}).subscribe(response => {
  console.log('Message sent:', response.message);
});
```

### Getting Messages

```typescript
this.messagingService.getConversationMessages(
  'conv_123',
  userEmail,
  'USER'
).subscribe(response => {
  console.log('Messages:', response.messages);
});
```

## WebSocket Events

The following events are automatically handled by the chat component:

- `conversation_created` - Conversation created
- `message_sent` - Message sent to conversation
- `message_forgiven` - Message forgiven
- `conversation_state_changed` - Conversation state updated
- `conversation_escalated` - Conversation escalated

## Files Modified

1. `frontend/src/app/services/messaging.service.ts` (NEW) - Messaging API service
2. `frontend/src/app/components/workflow-chat-display/workflow-chat-display.component.ts` - Added messaging event handling
3. `frontend/src/app/app.module.ts` - Added MessagingService to providers

## Next Steps

1. **UI for Creating Conversations**: Add a button or input to create conversations directly from the chat interface
2. **Conversation List**: Display a list of active conversations
3. **Message Threading**: Show messages grouped by conversation
4. **Message Actions**: Add UI for forgiving messages, escalating conversations, etc.
5. **Real-time Updates**: Ensure messages appear in real-time as they're sent

## Testing

To test the integration:

1. Create a conversation via API
2. Send messages to the conversation
3. Verify messages appear in the chat window
4. Check that WebSocket events are properly handled
5. Verify message types (user/assistant/system) are displayed correctly

