/**
 * Launch/Loading Screen
 * Animated Tree of Life with growing animation
 * Soft fade-in of birdsong and nature sounds
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { theme } from '../theme';

export default function LaunchScreen() {
  const navigation = useNavigation();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    // Animate tree growth
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 2000,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
    ]).start();

    // Navigate to Home after animation
    const timer = setTimeout(() => {
      navigation.navigate('Home' as never);
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.treeContainer,
          {
            opacity: fadeAnim,
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
        <Text style={styles.treeIcon}>🌳</Text>
        <Text style={styles.tagline}>Return to Purity</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background.lightCream,
    justifyContent: 'center',
    alignItems: 'center',
  },
  treeContainer: {
    alignItems: 'center',
  },
  treeIcon: {
    fontSize: 120,
    marginBottom: theme.spacing.lg,
  },
  tagline: {
    fontSize: theme.typography.sizes['2xl'],
    fontFamily: theme.typography.handwritten.regular,
    color: theme.colors.primary,
    textAlign: 'center',
  },
});

