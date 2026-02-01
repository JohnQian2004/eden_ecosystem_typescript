# Installation Instructions

## Setup Steps

1. **Navigate to mobile directory**:
   ```bash
   cd mobile
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Install Expo-compatible packages** (if needed):
   ```bash
   npx expo install expo-av expo-gl
   ```

4. **Start the development server**:
   ```bash
   npx expo start
   ```

## Troubleshooting

If you encounter dependency conflicts:
- Use `npm install --legacy-peer-deps` to bypass peer dependency checks
- Or use `npx expo install --fix` to auto-fix versions after initial install

## Notes

- Removed `expo-three` and `three` from initial dependencies (can be added later if needed for 3D features)
- Removed `@types/react-native` as it's not needed (Expo includes types)
- All packages are compatible with Expo SDK 54

