# LLM Messaging System Instructions

## Overview

The LLM has been configured to understand and use the Universal Messaging System, explain Eden to users, and guide them through the UI interface.

## What the LLM Knows

### 1. About the Garden of Eden

The LLM can explain Eden using concepts from the white paper:

- **Core Philosophy**: "In Eden, no action is valid unless it is understandable, attributable, and reversible by intelligence."
- **Key Features**: Gas-free, garden-driven, LLM-native (iGas), service-oriented, self-governing
- **System Actors**: ROOT CA (Law/Moses), Gardens (Knowledge Trees), Users, Service Providers
- **Architecture**: Federated gardens, ROOT CA governance, intelligence-priced economy

### 2. Universal Messaging System

The LLM understands:
- **Conversations**: Scoped containers (ORDER, TRADE, SERVICE, DISPUTE, SYSTEM, GOVERNANCE)
- **Messages**: Immutable events (TEXT, MEDIA, ACTION, SYSTEM) with states (ACTIVE, FORGIVEN, REDACTED)
- **When to Use**: For questions about Eden, order/trade inquiries, service help, disputes, governance
- **API Endpoints**: How to create conversations and send messages

### 3. UI Interface (Workflow Display Component)

The LLM can guide users on:
- **Chat Input**: How to type natural language requests
- **Workflow Execution**: How the system automatically detects service types and loads workflows
- **Decision Points**: How to respond to prompts (Yes/No, option selection)
- **Video Player**: How movie previews work
- **Ledger Display**: How to view transactions

## How It Works

### Response Formatting Prompt

The `LLM_RESPONSE_FORMATTING_PROMPT` in `server/src/llm.ts` has been updated to include:

1. Instructions to explain Eden when asked
2. Instructions to mention the messaging system for communication/support
3. Instructions to guide users through the UI interface
4. Instructions to suggest creating conversations for ongoing help

### Messaging System Prompt

A new prompt file `server/src/messaging/llmMessagingPrompt.ts` contains:

- Complete explanation of Eden's architecture
- Detailed messaging system documentation
- UI usage instructions
- Example user interactions
- Response guidelines

## Example LLM Responses

### User: "What is the Garden of Eden?"

**LLM Response:**
"The Garden of Eden (Eden) is a garden-first economic and intelligence system that replaces traditional blockchain with LLM-governed intelligence fees. Eden separates trust, execution, and intelligence into independent planes governed by ROOT CA. Key features include: gas-free transactions, garden-driven architecture, LLM-native intelligence (iGas), and self-governing federated gardens. Would you like me to create a conversation to explain more about Eden's architecture?"

### User: "How do I use this interface?"

**LLM Response:**
"To use the Eden interface: 1) Type your request in the chat input (e.g., 'I want to watch a movie' or 'Trade 2 SOL with TOKEN'), 2) The system will automatically detect the service type and load the workflow, 3) Follow the prompts and make decisions when asked, 4) View your transactions in the ledger display. The interface guides you through each step automatically!"

### User: "I have a question about my order"

**LLM Response:**
"I can help you with your order! I'll create a conversation for you. What's your order ID or what would you like to know?"

## Integration Points

1. **Response Formatting**: The LLM response formatter includes messaging system knowledge
2. **Query Extraction**: The LLM can detect when users are asking about Eden or the interface
3. **Workflow Actions**: The LLM can suggest creating conversations during workflow execution
4. **Error Handling**: The LLM can guide users to use messaging for support

## Files Modified

1. `server/src/llm.ts`:
   - Updated `LLM_RESPONSE_FORMATTING_PROMPT` to include Eden/messaging/UI instructions

2. `server/src/messaging/llmMessagingPrompt.ts` (NEW):
   - Complete messaging system prompt for LLM
   - Eden architecture explanation
   - UI usage guide
   - Example interactions

## Next Steps

1. **Test LLM Responses**: Verify that the LLM correctly explains Eden and guides users
2. **Add Conversation Creation**: Implement automatic conversation creation when users ask questions
3. **Enhance UI Guidance**: Add more specific instructions for different workflow types
4. **Integrate with Workflows**: Add messaging actions to workflow steps

## Usage

The LLM will automatically use this knowledge when:
- Users ask "what is Eden" or "how does Eden work"
- Users ask "how do I use this" or "how does the interface work"
- Users need help with orders, trades, or services
- Users want to escalate issues or communicate with governance

All responses come from the LLM, ensuring consistent, helpful explanations based on the white paper and messaging system architecture.

