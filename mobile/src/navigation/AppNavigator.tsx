/**
 * Garden of Eden Mobile App - Main Navigation
 * Bottom Tab Navigation with 5 main sections
 */

import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StyleSheet } from 'react-native';
import { theme } from '../theme';

// Screens
import LaunchScreen from '../screens/LaunchScreen';
import HomeScreen from '../screens/HomeScreen';
import WebWrapperScreen from '../screens/WebWrapperScreen';
import ExploreScreen from '../screens/ExploreScreen';
import TreeOfLifeScreen from '../screens/TreeOfLifeScreen';
import SpiritualCenterScreen from '../screens/SpiritualCenterScreen';
import MyGardenScreen from '../screens/MyGardenScreen';

// Icons (using text icons for now, can be replaced with custom icons)
const Tab = createBottomTabNavigator();

export default function AppNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.text.muted,
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabLabel,
      }}
    >
      <Tab.Screen
        name="Launch"
        component={LaunchScreen}
        options={{
          tabBarButton: () => null, // Hide from tab bar
        }}
      />
      <Tab.Screen
        name="Home"
        component={WebWrapperScreen}
        options={{
          tabBarIcon: () => <TabIcon label="🏠" />,
          tabBarLabel: 'Home',
        }}
      />
      <Tab.Screen
        name="Explore"
        component={ExploreScreen}
        options={{
          tabBarIcon: () => <TabIcon label="🌍" />,
          tabBarLabel: 'Explore',
        }}
      />
      <Tab.Screen
        name="TreeOfLife"
        component={TreeOfLifeScreen}
        options={{
          tabBarIcon: () => <TabIcon label="🌳" />,
          tabBarLabel: 'Tree of Life',
        }}
      />
      <Tab.Screen
        name="Spiritual"
        component={SpiritualCenterScreen}
        options={{
          tabBarIcon: () => <TabIcon label="🙏" />,
          tabBarLabel: 'Spiritual',
        }}
      />
      <Tab.Screen
        name="MyGarden"
        component={MyGardenScreen}
        options={{
          tabBarIcon: () => <TabIcon label="🌿" />,
          tabBarLabel: 'My Garden',
        }}
      />
    </Tab.Navigator>
  );
}

// Simple icon component (replace with custom icons later)
function TabIcon({ label }: { label: string }) {
  return <>{label}</>;
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: theme.colors.background.parchment,
    borderTopColor: theme.colors.border,
    borderTopWidth: 1,
    height: 60,
    paddingBottom: 8,
    paddingTop: 8,
  },
  tabLabel: {
    fontSize: theme.typography.sizes.xs,
    fontFamily: theme.typography.serif.regular,
  },
});

