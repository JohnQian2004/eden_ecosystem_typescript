/**
 * My Garden Screen
 * Profile, achievements, settings, customizable garden
 */

import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../theme';

export default function MyGardenScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Profile Header */}
        <View style={styles.profileHeader}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>🌿</Text>
          </View>
          <Text style={styles.profileName}>Adam</Text>
          <Text style={styles.profileSubtitle}>Garden Keeper</Text>
        </View>

        {/* My Garden Stats */}
        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>12</Text>
            <Text style={styles.statLabel}>Fruits</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>45</Text>
            <Text style={styles.statLabel}>Days</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>8.5</Text>
            <Text style={styles.statLabel}>Hours</Text>
          </View>
        </View>

        {/* Customizable Garden */}
        <TouchableOpacity style={styles.sectionCard}>
          <Text style={styles.sectionCardTitle}>🌳 Customize Garden</Text>
          <Text style={styles.sectionCardDescription}>
            Personalize your virtual garden space
          </Text>
        </TouchableOpacity>

        {/* Collected Fruits */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Collected Fruits</Text>
          <View style={styles.fruitsRow}>
            {['❤️', '😊', '🕊️'].map((emoji, index) => (
              <View key={index} style={styles.fruitBadge}>
                <Text style={styles.fruitBadgeEmoji}>{emoji}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Garden Walk Records */}
        <TouchableOpacity style={styles.sectionCard}>
          <Text style={styles.sectionCardTitle}>🚶 Garden Walk Records</Text>
          <Text style={styles.sectionCardDescription}>
            Steps: 12,345 • Time: 2.5 hours
          </Text>
        </TouchableOpacity>

        {/* Achievement Badges */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Achievements</Text>
          <View style={styles.badgesGrid}>
            {['🏆', '⭐', '🎖️', '💎'].map((badge, index) => (
              <View key={index} style={styles.badge}>
                <Text style={styles.badgeEmoji}>{badge}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Settings</Text>
          <TouchableOpacity style={styles.settingItem}>
            <Text style={styles.settingLabel}>🔊 Nature Sound Mixer</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.settingItem}>
            <Text style={styles.settingLabel}>🎨 Visual Theme</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.settingItem}>
            <Text style={styles.settingLabel}>🔔 Notifications</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.settingItem}>
            <Text style={styles.settingLabel}>🔒 Privacy & Sharing</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
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
  profileHeader: {
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
    paddingBottom: theme.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.divider,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
    ...theme.shadows.md,
  },
  avatarText: {
    fontSize: 50,
  },
  profileName: {
    fontSize: theme.typography.sizes['2xl'],
    fontFamily: theme.typography.serif.bold,
    color: theme.colors.primary,
    marginBottom: theme.spacing.xs,
  },
  profileSubtitle: {
    fontSize: theme.typography.sizes.base,
    fontFamily: theme.typography.serif.regular,
    color: theme.colors.text.secondary,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: theme.spacing.lg,
  },
  statCard: {
    alignItems: 'center',
    backgroundColor: theme.colors.background.parchment,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    minWidth: 80,
    ...theme.shadows.sm,
  },
  statNumber: {
    fontSize: theme.typography.sizes['3xl'],
    fontFamily: theme.typography.serif.bold,
    color: theme.colors.primary,
    marginBottom: theme.spacing.xs,
  },
  statLabel: {
    fontSize: theme.typography.sizes.sm,
    fontFamily: theme.typography.serif.regular,
    color: theme.colors.text.secondary,
  },
  section: {
    marginBottom: theme.spacing.xl,
  },
  sectionTitle: {
    fontSize: theme.typography.sizes.xl,
    fontFamily: theme.typography.serif.bold,
    color: theme.colors.primary,
    marginBottom: theme.spacing.md,
  },
  sectionCard: {
    backgroundColor: theme.colors.background.parchment,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    ...theme.shadows.md,
  },
  sectionCardTitle: {
    fontSize: theme.typography.sizes.lg,
    fontFamily: theme.typography.serif.bold,
    color: theme.colors.primary,
    marginBottom: theme.spacing.xs,
  },
  sectionCardDescription: {
    fontSize: theme.typography.sizes.base,
    fontFamily: theme.typography.serif.regular,
    color: theme.colors.text.secondary,
  },
  fruitsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  fruitBadge: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: theme.colors.background.parchment,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
    ...theme.shadows.sm,
  },
  fruitBadgeEmoji: {
    fontSize: 30,
  },
  badgesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  badge: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: theme.colors.secondary.sunlightGold,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
    ...theme.shadows.md,
  },
  badgeEmoji: {
    fontSize: 35,
  },
  settingItem: {
    backgroundColor: theme.colors.background.parchment,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    ...theme.shadows.sm,
  },
  settingLabel: {
    fontSize: theme.typography.sizes.base,
    fontFamily: theme.typography.serif.regular,
    color: theme.colors.primary,
  },
});

