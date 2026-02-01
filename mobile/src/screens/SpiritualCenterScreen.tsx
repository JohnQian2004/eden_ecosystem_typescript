/**
 * Spiritual Center Screen
 * Daily devotional modules, AI companion, Scripture Garden, Prayer Wall
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

const Devotionals = [
  { name: 'Morning Dew', emoji: '🌅', duration: '5 min', time: 'Morning' },
  { name: 'Noon Rest', emoji: '☀️', duration: 'Break', time: 'Noon' },
  { name: 'Evening Reflection', emoji: '🌙', duration: 'Journal', time: 'Evening' },
];

export default function SpiritualCenterScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Spiritual Center</Text>

        {/* Daily Devotionals */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Daily Devotionals</Text>
          {Devotionals.map((devotional, index) => (
            <TouchableOpacity key={index} style={styles.card}>
              <Text style={styles.cardEmoji}>{devotional.emoji}</Text>
              <View style={styles.cardContent}>
                <Text style={styles.cardTitle}>{devotional.name}</Text>
                <Text style={styles.cardDescription}>
                  {devotional.duration} • {devotional.time}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Garden Guardian */}
        <TouchableOpacity style={styles.largeCard}>
          <Text style={styles.largeCardEmoji}>🤖</Text>
          <Text style={styles.largeCardTitle}>Garden Guardian</Text>
          <Text style={styles.largeCardDescription}>
            AI companion for faith questions
          </Text>
        </TouchableOpacity>

        {/* Scripture Garden */}
        <TouchableOpacity style={styles.largeCard}>
          <Text style={styles.largeCardEmoji}>📖</Text>
          <Text style={styles.largeCardTitle}>Scripture Garden</Text>
          <Text style={styles.largeCardDescription}>
            Thematically organized verses
          </Text>
        </TouchableOpacity>

        {/* Prayer Wall */}
        <TouchableOpacity style={styles.largeCard}>
          <Text style={styles.largeCardEmoji}>🧱</Text>
          <Text style={styles.largeCardTitle}>Prayer Wall</Text>
          <Text style={styles.largeCardDescription}>
            Community prayers & testimonies
          </Text>
        </TouchableOpacity>
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
  title: {
    fontSize: theme.typography.sizes['3xl'],
    fontFamily: theme.typography.handwritten.regular,
    color: theme.colors.primary,
    marginBottom: theme.spacing.lg,
    textAlign: 'center',
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
  card: {
    flexDirection: 'row',
    backgroundColor: theme.colors.background.parchment,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    alignItems: 'center',
    ...theme.shadows.md,
  },
  cardEmoji: {
    fontSize: 40,
    marginRight: theme.spacing.md,
  },
  cardContent: {
    flex: 1,
  },
  cardTitle: {
    fontSize: theme.typography.sizes.lg,
    fontFamily: theme.typography.serif.bold,
    color: theme.colors.primary,
    marginBottom: theme.spacing.xs,
  },
  cardDescription: {
    fontSize: theme.typography.sizes.base,
    fontFamily: theme.typography.serif.regular,
    color: theme.colors.text.secondary,
  },
  largeCard: {
    backgroundColor: theme.colors.background.parchment,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.md,
    alignItems: 'center',
    ...theme.shadows.lg,
  },
  largeCardEmoji: {
    fontSize: 60,
    marginBottom: theme.spacing.sm,
  },
  largeCardTitle: {
    fontSize: theme.typography.sizes['2xl'],
    fontFamily: theme.typography.serif.bold,
    color: theme.colors.primary,
    marginBottom: theme.spacing.xs,
  },
  largeCardDescription: {
    fontSize: theme.typography.sizes.base,
    fontFamily: theme.typography.serif.regular,
    color: theme.colors.text.secondary,
    textAlign: 'center',
  },
});

