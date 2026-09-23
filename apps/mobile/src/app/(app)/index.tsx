import React from 'react';
import { StyleSheet, View, TouchableOpacity, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapVisualizer from '@/components/MapVisualizer';
import { mockRoadbook } from '@/data/mockRoadbook';
import { generateAndShareGPX } from '@/lib/gpxBuilder';

export default function MapScreen() {
  const handleExport = async () => {
    await generateAndShareGPX(mockRoadbook);
  };

  return (
    <View style={styles.container}>
      <MapVisualizer roadbook={mockRoadbook} />
      <SafeAreaView style={styles.safeArea} pointerEvents="box-none">
        <View style={styles.topBar}>
          <View style={styles.titleCard}>
            <Text style={styles.title}>{mockRoadbook.title}</Text>
            <Text style={styles.subtitle}>{mockRoadbook.stats.distance} km • {mockRoadbook.stats.elevation.pos}m D+</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.exportButton} onPress={handleExport}>
          <Text style={styles.exportButtonText}>Exporter GPX (Montre)</Text>
        </TouchableOpacity>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    padding: 16,
  },
  topBar: {
    alignItems: 'center',
    marginTop: 10,
  },
  titleCard: {
    backgroundColor: 'rgba(20, 20, 20, 0.8)',
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  title: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  subtitle: {
    color: '#ddd',
    fontSize: 14,
  },
  exportButton: {
    backgroundColor: '#007AFF',
    padding: 16,
    borderRadius: 30,
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  exportButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },
});
