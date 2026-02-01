/**
 * Home Screen
 * Main screen with chat interface and Eden features
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../theme';
import ChatInterface from '../components/ChatInterface';

type HomeTab = 'chat' | 'features';

export default function HomeScreen() {
  const [activeTab, setActiveTab] = useState<HomeTab>('chat');
  const userName = 'Adam'; // TODO: Get from user profile
  const userEmail = 'adam@eden.com'; // TODO: Get from user profile/identity
  const currentTime = new Date().getHours();
  const greeting = currentTime < 12 ? 'Morning' : currentTime < 18 ? 'Afternoon' : 'Evening';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.greeting}>
          {userName}, peace be with you this {greeting}
        </Text>
        <Text style={styles.weather}>☀️ Eden's Climate: Perfect</Text>
      </View>

      {/* Tab Selector */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'chat' && styles.tabActive]}
          onPress={() => setActiveTab('chat')}
        >
          <Text style={[styles.tabText, activeTab === 'chat' && styles.tabTextActive]}>
            💬 Chat
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'features' && styles.tabActive]}
          onPress={() => setActiveTab('features')}
        >
          <Text style={[styles.tabText, activeTab === 'features' && styles.tabTextActive]}>
            🌿 Features
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content Area */}
      {activeTab === 'chat' ? (
        <ChatInterface userEmail={userEmail} />
      ) : (
        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          {/* Fruit of Wisdom Today */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>🍎 Fruit of Wisdom Today</Text>
            <Text style={styles.cardContent}>
              "And the Lord God planted a garden eastward in Eden; and there he put the man whom he had formed."
              {'\n\n'}— Genesis 2:8
            </Text>
          </View>

          {/* River Sounds */}
          <TouchableOpacity style={styles.card}>
            <Text style={styles.cardTitle}>🌊 River Sounds</Text>
            <Text style={styles.cardContent}>
              Listen to the gentle flow of Eden's rivers
            </Text>
          </TouchableOpacity>

          {/* Garden Walk */}
          <TouchableOpacity style={styles.card}>
            <Text style={styles.cardTitle}>🚶 Garden Walk</Text>
            <Text style={styles.cardContent}>
              Take a virtual walk through the Garden
            </Text>
          </TouchableOpacity>

          {/* Animal Friends */}
          <TouchableOpacity style={styles.card}>
            <Text style={styles.cardTitle}>🦁 Animal Friends</Text>
            <Text style={styles.cardContent}>
              Interact with the creatures of Eden
            </Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* Floating Prayer Button */}
      {activeTab === 'features' && (
        <TouchableOpacity style={styles.prayerButton}>
          <Text style={styles.prayerButtonText}>🙏</Text>
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background.lightCream,
  },
  scrollView: {
    flex: 1,
    padding: theme.spacing.md,
  },
  header: {
    padding: theme.spacing.md,
    backgroundColor: theme.colors.background.white,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.divider,
  },
  greeting: {
    fontSize: theme.typography.sizes.xl,
    fontFamily: theme.typography.serif.regular,
    color: theme.colors.primary,
    marginBottom: theme.spacing.xs,
  },
  weather: {
    fontSize: theme.typography.sizes.base,
    color: theme.colors.text.secondary,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: theme.colors.background.white,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.divider,
  },
  tab: {
    flex: 1,
    padding: theme.spacing.md,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: theme.colors.primary,
  },
  tabText: {
    fontSize: theme.typography.sizes.base,
    fontFamily: theme.typography.serif.regular,
    color: theme.colors.text.muted,
  },
  tabTextActive: {
    fontFamily: theme.typography.serif.bold,
    color: theme.colors.primary,
  },
  card: {
    backgroundColor: theme.colors.background.parchment,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    ...theme.shadows.md,
  },
  cardTitle: {
    fontSize: theme.typography.sizes.lg,
    fontFamily: theme.typography.serif.bold,
    color: theme.colors.primary,
    marginBottom: theme.spacing.sm,
  },
  cardContent: {
    fontSize: theme.typography.sizes.base,
    fontFamily: theme.typography.serif.regular,
    color: theme.colors.text.dark,
    lineHeight: theme.typography.lineHeights.relaxed * theme.typography.sizes.base,
  },
  prayerButton: {
    position: 'absolute',
    bottom: 100,
    right: theme.spacing.md,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    ...theme.shadows.lg,
  },
  prayerButtonText: {
    fontSize: 28,
  },
});

