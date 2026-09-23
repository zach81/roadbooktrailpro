export const mockRoadbook = {
  id: 'rb_mock_1',
  title: 'UTMB - Section Chamonix -> Les Houches',
  athlete: 'Athlete 1',
  coach: 'Coach 1',
  stats: {
    distance: 8.5, // km
    elevation: {
      pos: 450,
      neg: 120,
      max: 1050,
      min: 1000,
    }
  },
  points: [
    // Ligne de départ
    { lat: 45.9237, lon: 6.8694, ele: 1035 },
    { lat: 45.9220, lon: 6.8680, ele: 1040 },
    { lat: 45.9180, lon: 6.8650, ele: 1050 },
    { lat: 45.9100, lon: 6.8500, ele: 1020 },
    // Les Houches
    { lat: 45.8900, lon: 6.7980, ele: 1000 },
  ],
  waypoints: [
    {
      name: 'Départ Chamonix',
      lat: 45.9237,
      lon: 6.8694,
      ele: 1035,
      desc: 'Départ officiel devant l\'église',
      type: 'start'
    },
    {
      name: 'Ravito Les Houches',
      lat: 45.8900,
      lon: 6.7980,
      ele: 1000,
      desc: 'Ravitaillement complet. Eau, solide.',
      type: 'ravito'
    }
  ]
};
