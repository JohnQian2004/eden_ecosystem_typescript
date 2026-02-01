/**
 * Chat Interface Component
 * Main chat interface with message display and input
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import ChatMessage, { ChatMessageData } from './ChatMessage';
import chatService from '../services/chat.service';
import websocketService from '../services/websocket.service';
import { getApiBaseUrl } from '../services/api-base';
import { theme } from '../theme';

interface ChatInterfaceProps {
  userEmail: string;
}

export default function ChatInterface({ userEmail }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const scrollViewRef = useRef<ScrollView>(null);

  useEffect(() => {
    // Connect WebSocket
    websocketService.connect();

    // Subscribe to WebSocket events
    const unsubscribe = websocketService.subscribe((event) => {
      handleWebSocketEvent(event);
    });

    return () => {
      unsubscribe();
      websocketService.disconnect();
    };
  }, []);

  const handleWebSocketEvent = (event: any) => {
    if (event.type === 'llm_response' || event.type === 'workflow_message') {
      const content = event.data?.response || event.message || '';
      if (content) {
        addMessage({
          role: 'ASSISTANT',
          content,
          timestamp: event.timestamp || Date.now(),
          videoUrl: event.data?.videoUrl || event.data?.response?.videoUrl,
          movieTitle: event.data?.movieTitle || event.data?.response?.movieTitle,
        });
      }
    }
  };

  const addMessage = (message: ChatMessageData) => {
    setMessages((prev) => [...prev, message]);
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  const sendMessage = async () => {
    if (!input.trim() || isProcessing) return;

    const userMessage: ChatMessageData = {
      role: 'USER',
      content: input.trim(),
      timestamp: Date.now(),
    };

    addMessage(userMessage);
    setInput('');
    setIsProcessing(true);

    try {
      const response = await chatService.sendMessage(
        userMessage.content,
        userEmail,
        conversationId
      );

      if (response.conversationId && !conversationId) {
        setConversationId(response.conversationId);
      }

      if (response.response || response.message) {
        addMessage({
          role: 'ASSISTANT',
          content: response.response || response.message || 'Response received',
          timestamp: Date.now(),
        });
      }
    } catch (error: any) {
      console.error('Error sending message:', error);
      const errorMessage = error?.message || 'Failed to send message. Please try again.';
      const currentApiUrl = getApiBaseUrl();
      const platformInfo = Platform.OS === 'web' 
        ? '\n\nNote: You are on web. If testing on a device, use the IP address instead of localhost.'
        : `\n\nCurrent API URL: ${currentApiUrl}\nPlatform: ${Platform.OS}`;
      
      addMessage({
        role: 'SYSTEM',
        content: `Error: ${errorMessage}${platformInfo}`,
        timestamp: Date.now(),
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle}>🌿 Eden Chat</Text>
        <Text style={styles.headerSubtitle}>• Certified Session</Text>
      </View>

      <ScrollView
        ref={scrollViewRef}
        style={styles.messagesContainer}
        contentContainerStyle={styles.messagesContent}
      >
        {messages.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🌿</Text>
            <Text style={styles.emptyTitle}>Welcome to Eden Chat</Text>
            <Text style={styles.emptyText}>
              Start a conversation by typing a message below. You can ask
              questions, request services, or start workflows.
            </Text>
          </View>
        )}

        {messages.map((msg, index) => (
          <ChatMessage key={msg.id || index} message={msg} />
        ))}

        {isProcessing && (
          <View style={styles.typingIndicator}>
            <Text style={styles.typingText}>Eden is thinking...</Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="💬 Type your workflow or question..."
          placeholderTextColor={theme.colors.text.muted}
          multiline
          editable={!isProcessing}
          onSubmitEditing={sendMessage}
        />
        <TouchableOpacity
          style={[styles.sendButton, (!input.trim() || isProcessing) && styles.sendButtonDisabled]}
          onPress={sendMessage}
          disabled={!input.trim() || isProcessing}
        >
          <Text style={styles.sendButtonText}>
            {isProcessing ? '⏳' : '📤'}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background.lightCream,
  },
  header: {
    padding: theme.spacing.md,
    backgroundColor: theme.colors.background.white,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.divider,
  },
  headerTitle: {
    fontSize: theme.typography.sizes.lg,
    fontFamily: theme.typography.serif.bold,
    color: theme.colors.primary,
  },
  headerSubtitle: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.text.muted,
    marginTop: theme.spacing.xs,
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    padding: theme.spacing.md,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing['2xl'],
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: theme.spacing.md,
  },
  emptyTitle: {
    fontSize: theme.typography.sizes.xl,
    fontFamily: theme.typography.serif.bold,
    color: theme.colors.primary,
    marginBottom: theme.spacing.sm,
  },
  emptyText: {
    fontSize: theme.typography.sizes.base,
    color: theme.colors.text.muted,
    textAlign: 'center',
    paddingHorizontal: theme.spacing.lg,
  },
  typingIndicator: {
    padding: theme.spacing.md,
    alignItems: 'center',
  },
  typingText: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.text.muted,
    fontStyle: 'italic',
  },
  inputContainer: {
    flexDirection: 'row',
    padding: theme.spacing.md,
    backgroundColor: theme.colors.background.white,
    borderTopWidth: 1,
    borderTopColor: theme.colors.divider,
    alignItems: 'flex-end',
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    padding: theme.spacing.sm,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.background.lightCream,
    fontSize: theme.typography.sizes.base,
    fontFamily: theme.typography.serif.regular,
    color: theme.colors.text.dark,
    marginRight: theme.spacing.sm,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: theme.colors.text.muted,
    opacity: 0.5,
  },
  sendButtonText: {
    fontSize: theme.typography.sizes.lg,
  },
});

