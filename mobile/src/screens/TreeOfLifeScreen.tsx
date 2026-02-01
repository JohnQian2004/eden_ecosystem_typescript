/**
 * Tree of Life Screen
 * 12 Spiritual Fruits visualization and interaction
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

const SpiritualFruits = [
  { id: 1, name: 'Love', emoji: '❤️', unlocked: true },
  { id: 2, name: 'Joy', emoji: '😊', unlocked: true },
  { id: 3, name: 'Peace', emoji: '🕊️', unlocked: true },
  { id: 4, name: 'Patience', emoji: '⏳', unlocked: false },
  { id: 5, name: 'Kindness', emoji: '🤝', unlocked: false },
  { id: 6, name: 'Goodness', emoji: '✨', unlocked: false },
  { id: 7, name: 'Faithfulness', emoji: '🙏', unlocked: false },
  { id: 8, name: 'Gentleness', emoji: '🌿', unlocked: false },
  { id: 9, name: 'Self-Control', emoji: '🧘', unlocked: false },
  { id: 10, name: 'Wisdom', emoji: '🧠', unlocked: false },
  { id: 11, name: 'Knowledge', emoji: '📚', unlocked: false },
  { id: 12, name: 'Reverence', emoji: '🙇', unlocked: false },
];

export default function TreeOfLifeScreen() {
  const [selectedFruit, setSelectedFruit] = useState<number | null>(null);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Tree of Life</Text>
        <Text style={styles.subtitle}>Grow in spiritual fruits</Text>

        {/* Tree Visualization */}
        <View style={styles.treeContainer}>
          <Text style={styles.treeIcon}>🌳</Text>
          <Text style={styles.treeLabel}>Your Spiritual Growth</Text>
        </View>

        {/* Spiritual Fruits Grid */}
        <View style={styles.fruitsGrid}>
          {SpiritualFruits.map((fruit) => (
            <TouchableOpacity
              key={fruit.id}
              style={[
                styles.fruitCard,
                !fruit.unlocked && styles.fruitCardLocked,
              ]}
              onPress={() => setSelectedFruit(fruit.id)}
            >
              <Text style={styles.fruitEmoji}>{fruit.emoji}</Text>
              <Text
                style={[
                  styles.fruitName,
                  !fruit.unlocked && styles.fruitNameLocked,
                ]}
              >
                {fruit.name}
              </Text>
              {!fruit.unlocked && (
                <Text style={styles.lockIcon}>🔒</Text>
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* Selected Fruit Details */}
        {selectedFruit && (
          <View style={styles.detailsCard}>
            <Text style={styles.detailsTitle}>
              {SpiritualFruits.find((f) => f.id === selectedFruit)?.name}
            </Text>
            <Text style={styles.detailsText}>
              Tap to learn more about this spiritual fruit and related
              scriptures.
            </Text>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setSelectedFruit(null)}
            >
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Water/Fertilize Button */}
        <TouchableOpacity style={styles.actionButton}>
          <Text style={styles.actionButtonText}>💧 Water Tree</Text>
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
    marginBottom: theme.spacing.xs,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: theme.typography.sizes.base,
    fontFamily: theme.typography.serif.regular,
    color: theme.colors.text.secondary,
    textAlign: 'center',
    marginBottom: theme.spacing.lg,
  },
  treeContainer: {
    alignItems: 'center',
    marginBottom: theme.spacing.xl,
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.background.parchment,
    borderRadius: theme.borderRadius.xl,
    ...theme.shadows.md,
  },
  treeIcon: {
    fontSize: 80,
    marginBottom: theme.spacing.sm,
  },
  treeLabel: {
    fontSize: theme.typography.sizes.lg,
    fontFamily: theme.typography.serif.regular,
    color: theme.colors.primary,
  },
  fruitsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.lg,
  },
  fruitCard: {
    width: '30%',
    aspectRatio: 1,
    backgroundColor: theme.colors.background.parchment,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.sm,
    marginBottom: theme.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    ...theme.shadows.sm,
  },
  fruitCardLocked: {
    opacity: 0.5,
  },
  fruitEmoji: {
    fontSize: 32,
    marginBottom: theme.spacing.xs,
  },
  fruitName: {
    fontSize: theme.typography.sizes.sm,
    fontFamily: theme.typography.serif.regular,
    color: theme.colors.primary,
    textAlign: 'center',
  },
  fruitNameLocked: {
    color: theme.colors.text.muted,
  },
  lockIcon: {
    fontSize: 16,
    marginTop: theme.spacing.xs,
  },
  detailsCard: {
    backgroundColor: theme.colors.background.parchment,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    ...theme.shadows.md,
  },
  detailsTitle: {
    fontSize: theme.typography.sizes.xl,
    fontFamily: theme.typography.serif.bold,
    color: theme.colors.primary,
    marginBottom: theme.spacing.sm,
  },
  detailsText: {
    fontSize: theme.typography.sizes.base,
    fontFamily: theme.typography.serif.regular,
    color: theme.colors.text.dark,
    lineHeight: theme.typography.lineHeights.relaxed * theme.typography.sizes.base,
    marginBottom: theme.spacing.md,
  },
  closeButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.sm,
    alignItems: 'center',
  },
  closeButtonText: {
    color: theme.colors.background.white,
    fontFamily: theme.typography.serif.bold,
    fontSize: theme.typography.sizes.base,
  },
  actionButton: {
    backgroundColor: theme.colors.secondary.skyBlue,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
    ...theme.shadows.md,
  },
  actionButtonText: {
    fontSize: theme.typography.sizes.lg,
    fontFamily: theme.typography.serif.bold,
    color: theme.colors.background.white,
  },
});

