import React, { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, PROVIDER_DEFAULT } from 'react-native-maps';
import { Platform } from 'react-native';

export default function MapVisualizer({ roadbook }: { roadbook: any }) {
  const mapRef = useRef<MapView>(null);
  const [mapType, setMapType] = useState<'standard' | 'satellite' | 'hybrid' | 'terrain'>('standard');

  const initialRegion = {
    latitude: roadbook.points[0]?.lat || 45.0,
    longitude: roadbook.points[0]?.lon || 6.0,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  };

  const coordinates = roadbook.points.map((p: any) => ({
    latitude: p.lat,
    longitude: p.lon
  }));

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : PROVIDER_DEFAULT}
        initialRegion={initialRegion}
        showsUserLocation={true}
        mapType={mapType}
        pitchEnabled={true}
        shows3DBuildings={true}
      >
        <Polyline
          coordinates={coordinates}
          strokeColor="#007AFF"
          strokeWidth={4}
        />
        {roadbook.waypoints.map((wp: any, index: number) => (
          <Marker
            key={index}
            coordinate={{ latitude: wp.lat, longitude: wp.lon }}
            title={wp.name}
            description={wp.desc}
            pinColor={wp.type === 'start' ? 'green' : 'orange'}
          />
        ))}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    width: '100%',
    height: '100%',
  },
});
