import React from 'react';
import { StyleSheet, View, Text, FlatList, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedView } from '@/components/themed-view';
import { mockRoadbook } from '@/data/mockRoadbook';
import { useRouter } from 'expo-router';

export default function RoadbooksScreen() {
  const router = useRouter();
  
  // For now, we just have one mock roadbook in the list
  const roadbooks = [mockRoadbook];

  const renderItem = ({ item }: { item: any }) => (
    <TouchableOpacity 
      style={styles.card} 
      onPress={() => router.push('/')} // Go to Map (index)
    >
      <Text style={styles.cardTitle}>{item.title}</Text>
      <Text style={styles.cardSubtitle}>
        {item.stats.distance} km • {item.stats.elevation.pos}m D+
      </Text>
      <Text style={styles.cardSubtitle}>Coach: {item.coach}</Text>
    </TouchableOpacity>
  );

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <Text style={styles.header}>Mes Roadbooks</Text>
        <FlatList
          data={roadbooks}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
        />
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
    paddingHorizontal: 16,
  },
  header: {
    fontSize: 28,
    fontWeight: 'bold',
    marginVertical: 20,
    color: 'white', // Assuming dark theme for now
  },
  list: {
    paddingBottom: 20,
  },
  card: {
    backgroundColor: '#1C1C1E',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: 'white',
    marginBottom: 8,
  },
  cardSubtitle: {
    fontSize: 14,
    color: '#8E8E93',
    marginBottom: 4,
  }
});
