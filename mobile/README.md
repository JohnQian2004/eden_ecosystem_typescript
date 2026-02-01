# Garden of Eden Mobile App

A beautiful, nature-inspired mobile application for spiritual growth and inner peace.

## Design Philosophy
**Natural, Harmonious, Pure** - Organic curves, soft colors, and nature-inspired elements creating a tranquil, sacred experience.

## Tech Stack
- **Framework**: React Native (Expo)
- **Navigation**: React Navigation
- **State Management**: Redux Toolkit / Zustand
- **Styling**: React Native StyleSheet + Styled Components
- **Animations**: React Native Reanimated
- **AR**: React Native ARCore/ARKit (via expo-gl)

## Project Structure
```
mobile/
├── src/
│   ├── components/       # Reusable UI components
│   ├── screens/          # Main app screens
│   ├── navigation/       # Navigation configuration
│   ├── theme/            # Design system (colors, typography)
│   ├── services/         # API services
│   ├── store/            # State management
│   └── utils/            # Helper functions
├── assets/               # Images, fonts, sounds
└── package.json
```

## Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn
- Expo CLI
- iOS Simulator (Mac) or Android Emulator

### Installation
```bash
cd mobile
npm install
npx expo start
```

### Development
- Press `i` for iOS simulator
- Press `a` for Android emulator
- Scan QR code with Expo Go app on physical device

## Features

### Core Screens
1. **Launch/Loading** - Animated Tree of Life
2. **Home** - Daily content, nature sounds, AR walk
3. **Explore** - Four Rivers zones, Garden Wonders
4. **Tree of Life** - Spiritual growth visualization
5. **Spiritual Center** - Devotionals, prayers, AI companion
6. **My Garden** - Profile, achievements, settings

### Design System
- **Primary Color**: Forest Green (#2E8B57)
- **Secondary Colors**: Sky Blue (#87CEEB), Sunlight Gold (#FFD700), Earth Brown (#8B4513)
- **Background**: Parchment White (#F5F5DC), Light Cream (#FAF3E0)

## License
MIT

