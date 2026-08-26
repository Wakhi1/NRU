// Haversine distance in metres — the ST_DWithin-equivalent used for circle-geometry zones without
// requiring PostGIS at this scale. See architecture doc §6.
function distanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Evaluates the check-in gate against a single zone (architecture doc §5, step 4).
function evaluateZone(zone, lat, lng, accuracyM, policy) {
  const distance_m = Math.round(distanceMeters(zone.center_lat, zone.center_lng, lat, lng));
  const tolerance = zone.radius_m || policy.default_radius_m;
  const inside = distance_m <= tolerance;
  const accuracyOk = accuracyM == null || accuracyM <= policy.accuracy_ceiling_m;
  return { distance_m, inside, accuracyOk };
}

module.exports = { distanceMeters, evaluateZone };
