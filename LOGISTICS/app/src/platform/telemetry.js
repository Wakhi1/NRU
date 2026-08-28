// Simulated vehicle telemetry for the Live tracking screen — stands in for a real GPS/OBD vehicle
// tracking unit, exactly the same "documented as simulated, not faked as real hardware" pattern
// SPTS uses for its own VoIP module (see voip.routes.js there). Only vehicles currently "On trip"
// are nudged; everything else holds its last known position. Ticked by node-cron in server.js.
const db = require('./db');

// Roughly the Mbabane–Manzini–Matsapha corridor, Eswatini — keeps the simulated fleet inside a
// believable area rather than drifting into the ocean.
const BOUNDS = { latMin: -27.0, latMax: -25.9, lngMin: 30.9, lngMax: 31.9 };

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

async function tick() {
  const vehicles = await db.query(
    `SELECT id, current_lat, current_lng, heading_deg, speed_kmh FROM vehicle WHERE status = 'On trip'`
  );
  for (const v of vehicles) {
    let lat = Number(v.current_lat) || (BOUNDS.latMin + BOUNDS.latMax) / 2;
    let lng = Number(v.current_lng) || (BOUNDS.lngMin + BOUNDS.lngMax) / 2;
    let heading = v.heading_deg != null ? Number(v.heading_deg) : Math.floor(Math.random() * 360);
    // Small random heading drift keeps movement looking like road travel, not a straight line
    // to nowhere.
    heading = (heading + (Math.random() * 30 - 15) + 360) % 360;
    const speed = Math.max(0, Math.round((v.speed_kmh || 40) + (Math.random() * 12 - 6)));
    const distanceDeg = (speed / 3600) * 5 * 0.009; // ~5s tick, 0.009 deg ≈ 1km at this latitude
    let lat2 = lat + Math.cos((heading * Math.PI) / 180) * distanceDeg;
    let lng2 = lng + Math.sin((heading * Math.PI) / 180) * distanceDeg;
    lat2 = clamp(lat2, BOUNDS.latMin, BOUNDS.latMax);
    lng2 = clamp(lng2, BOUNDS.lngMin, BOUNDS.lngMax);

    await db.query(
      `UPDATE vehicle SET current_lat = ?, current_lng = ?, heading_deg = ?, speed_kmh = ?, last_ping_at = NOW() WHERE id = ?`,
      [lat2, lng2, Math.round(heading), speed, v.id]
    );
  }
}

module.exports = { tick };
