/**
 * Chat Message Component
 * Displays individual chat messages
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../theme';

export interface ChatMessageData {
  id?: string;
  role: 'USER' | 'ASSISTANT' | 'SYSTEM';
  content: string;
  timestamp: number;
  videoUrl?: string;
  movieTitle?: string;
}

interface ChatMessageProps {
  message: ChatMessageData;
}

export default function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'USER';
  const isSystem = message.role === 'SYSTEM';

  return (
    <View
      style={[
        styles.container,
        isUser && styles.userMessage,
        isSystem && styles.systemMessage,
      ]}
    >
      <View style={styles.header}>
        <Text style={styles.role}>
          {isUser ? 'You' : isSystem ? 'System' : '🌿 Eden'}
        </Text>
        <Text style={styles.timestamp}>
          {new Date(message.timestamp).toLocaleTimeString()}
        </Text>
      </View>
      <Text style={[styles.content, isUser && styles.userContent]}>
        {message.content}
      </Text>
      {message.videoUrl && (
        <View style={styles.videoContainer}>
          <Text style={styles.videoLabel}>
            🎬 {message.movieTitle || 'Video'}
          </Text>
          <Text style={styles.videoUrl}>{message.videoUrl}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: theme.spacing.md,
    marginVertical: theme.spacing.xs,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.background.white,
    ...theme.shadows.sm,
  },
  userMessage: {
    backgroundColor: theme.colors.primaryLight + '20',
    alignSelf: 'flex-end',
    maxWidth: '80%',
  },
  systemMessage: {
    backgroundColor: theme.colors.text.muted + '20',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.xs,
  },
  role: {
    fontSize: theme.typography.sizes.sm,
    fontFamily: theme.typography.serif.bold,
    color: theme.colors.primary,
  },
  timestamp: {
    fontSize: theme.typography.sizes.xs,
    color: theme.colors.text.muted,
  },
  content: {
    fontSize: theme.typography.sizes.base,
    fontFamily: theme.typography.serif.regular,
    color: theme.colors.text.dark,
    lineHeight: theme.typography.lineHeights.normal * theme.typography.sizes.base,
  },
  userContent: {
    color: theme.colors.text.dark,
  },
  videoContainer: {
    marginTop: theme.spacing.sm,
    padding: theme.spacing.sm,
    backgroundColor: theme.colors.background.lightCream,
    borderRadius: theme.borderRadius.sm,
  },
  videoLabel: {
    fontSize: theme.typography.sizes.sm,
    fontFamily: theme.typography.serif.bold,
    color: theme.colors.primary,
    marginBottom: theme.spacing.xs,
  },
  videoUrl: {
    fontSize: theme.typography.sizes.xs,
    color: theme.colors.text.muted,
  },
});

