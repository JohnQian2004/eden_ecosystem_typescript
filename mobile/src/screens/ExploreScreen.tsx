/**
 * Explore Screen
 * Four Rivers zones, Garden Wonders, Sacred Experiences
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

const FourRivers = [
  { name: 'Pishon', emoji: '💎', description: 'Gemstone knowledge' },
  { name: 'Gihon', emoji: '🏛️', description: 'Ancient Ethiopian culture' },
  { name: 'Tigris', emoji: '📜', description: 'Mesopotamian civilization' },
  { name: 'Euphrates', emoji: '🌍', description: 'Ancient history' },
];

const GardenWonders = [
  { name: 'Tree of Life', emoji: '🌳', type: '3D Model' },
  { name: 'Tree of Knowledge', emoji: '🍎', type: 'Interactive Story' },
  { name: 'Gold, Pearls & Gems', emoji: '💎', type: 'Gallery' },
];

const SacredExperiences = [
  { name: 'Voice of God', emoji: '🔊', type: 'Audio Meditation' },
  { name: 'Evening Walk', emoji: '🌅', type: 'Immersive VR' },
  { name: 'Creation Narrative', emoji: '📖', type: 'Interactive Timeline' },
];

export default function ExploreScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Explore Eden</Text>

        {/* Four Rivers */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Four Rivers</Text>
          {FourRivers.map((river, index) => (
            <TouchableOpacity key={index} style={styles.card}>
              <Text style={styles.cardEmoji}>{river.emoji}</Text>
              <View style={styles.cardContent}>
                <Text style={styles.cardTitle}>{river.name}</Text>
                <Text style={styles.cardDescription}>{river.description}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Garden Wonders */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Garden Wonders</Text>
          {GardenWonders.map((wonder, index) => (
            <TouchableOpacity key={index} style={styles.card}>
              <Text style={styles.cardEmoji}>{wonder.emoji}</Text>
              <View style={styles.cardContent}>
                <Text style={styles.cardTitle}>{wonder.name}</Text>
                <Text style={styles.cardDescription}>{wonder.type}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Sacred Experiences */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Sacred Experiences</Text>
          {SacredExperiences.map((experience, index) => (
            <TouchableOpacity key={index} style={styles.card}>
              <Text style={styles.cardEmoji}>{experience.emoji}</Text>
              <View style={styles.cardContent}>
                <Text style={styles.cardTitle}>{experience.name}</Text>
                <Text style={styles.cardDescription}>{experience.type}</Text>
              </View>
            </TouchableOpacity>
          ))}
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
});

