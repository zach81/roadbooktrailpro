import { useRouter } from 'expo-router';
import { StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from 'react-native';

export default function WelcomeScreen() {
  const router = useRouter();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const colors = Colors[scheme];

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedView style={styles.content}>
          <ThemedText type="title" style={styles.title}>
            mykairn
          </ThemedText>
          <ThemedText style={styles.subtitle}>
            Préparez, gérez et dominez votre prochaine course.
          </ThemedText>
          
          <ThemedView style={styles.features}>
            <ThemedText>- Importation GPX facile</ThemedText>
            <ThemedText>- Planification détaillée des ravitos</ThemedText>
            <ThemedText>- Mode Course optimisé</ThemedText>
            <ThemedText>- Export pour votre assistance</ThemedText>
          </ThemedView>
        </ThemedView>

        <Pressable
          style={[styles.button, { backgroundColor: colors.primary }]}
          onPress={() => router.push('/login')}>
          <ThemedText style={styles.buttonText}>
            Commencer l&apos;aventure
          </ThemedText>
        </Pressable>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    padding: 24,
    justifyContent: 'space-between',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'flex-start',
    gap: 16,
  },
  title: {
    fontSize: 32,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 18,
    opacity: 0.8,
    marginBottom: 32,
  },
  features: {
    gap: 12,
  },
  button: {
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 'auto',
  },
  buttonText: {
    color: '#FFFFFF', // White text on colored button
  },
});
