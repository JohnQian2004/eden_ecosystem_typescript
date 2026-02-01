/**
 * Web Wrapper Screen
 * Loads Angular app from server in WebView
 */

import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Text,
  TouchableOpacity,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../theme';

const SERVER_URL = 'https://50.76.0.85:3000/app';

export default function WebWrapperScreen() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [webViewRef, setWebViewRef] = useState<any>(null);

  const handleLoadStart = () => {
    setLoading(true);
    setError(null);
  };

  const handleLoadEnd = () => {
    setLoading(false);
  };

  const handleError = (syntheticEvent: any) => {
    const { nativeEvent } = syntheticEvent;
    console.error('WebView error:', nativeEvent);
    setError(nativeEvent.description || 'Failed to load page');
    setLoading(false);
  };

  const handleNavigationStateChange = (navState: any) => {
    setCanGoBack(navState.canGoBack);
  };

  const handleGoBack = () => {
    if (webViewRef && canGoBack) {
      webViewRef.goBack();
    }
  };

  const handleReload = () => {
    if (webViewRef) {
      webViewRef.reload();
      setError(null);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header with controls */}
      <View style={styles.header}>
        <TouchableOpacity
          style={[styles.button, !canGoBack && styles.buttonDisabled]}
          onPress={handleGoBack}
          disabled={!canGoBack}>
          <Text style={styles.buttonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Eden</Text>
        <TouchableOpacity style={styles.button} onPress={handleReload}>
          <Text style={styles.buttonText}>↻ Reload</Text>
        </TouchableOpacity>
      </View>

      {/* Loading indicator */}
      {loading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Loading Eden...</Text>
        </View>
      )}

      {/* Error message */}
      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>⚠️ {error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={handleReload}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* WebView */}
      <WebView
        ref={(ref) => setWebViewRef(ref)}
        source={{ uri: SERVER_URL }}
        style={styles.webview}
        onLoadStart={handleLoadStart}
        onLoadEnd={handleLoadEnd}
        onError={handleError}
        onNavigationStateChange={handleNavigationStateChange}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        startInLoadingState={true}
        scalesPageToFit={true}
        mixedContentMode="always"
        // Allow self-signed certificates (for development)
        originWhitelist={['*']}
        // Handle HTTPS with self-signed certs
        onShouldStartLoadWithRequest={(request) => {
          return request.url.startsWith('https://50.76.0.85') || 
                 request.url.startsWith('http://50.76.0.85');
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background.lightCream,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.background.white,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.divider,
  },
  title: {
    fontSize: theme.typography.sizes.lg,
    fontFamily: theme.typography.serif.bold,
    color: theme.colors.primary,
  },
  button: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.background.parchment,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.primary,
  },
  webview: {
    flex: 1,
    backgroundColor: theme.colors.background.lightCream,
  },
  loadingContainer: {
    position: 'absolute',
    top: 100,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 1,
  },
  loadingText: {
    marginTop: theme.spacing.sm,
    fontSize: theme.typography.sizes.base,
    color: theme.colors.text.secondary,
  },
  errorContainer: {
    position: 'absolute',
    top: 100,
    left: theme.spacing.md,
    right: theme.spacing.md,
    backgroundColor: theme.colors.background.white,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.lg,
    alignItems: 'center',
    zIndex: 2,
    ...theme.shadows.md,
  },
  errorText: {
    fontSize: theme.typography.sizes.base,
    color: theme.colors.text.dark,
    textAlign: 'center',
    marginBottom: theme.spacing.sm,
  },
  retryButton: {
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.md,
  },
  retryButtonText: {
    fontSize: theme.typography.sizes.base,
    color: theme.colors.background.white,
    fontFamily: theme.typography.serif.bold,
  },
});

