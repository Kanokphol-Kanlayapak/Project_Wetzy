import { areas } from './wetzy-data';

const mapAreas = areas.map((area) => ({
  latitude: area.latitude,
  longitude: area.longitude,
  short: area.short,
  level: area.level,
  score: area.score,
  color: area.color,
}));

export const openStreetMapHtml = `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="">
  <style>html,body,#map{height:100%;margin:0}body{font-family:system-ui,sans-serif}.risk-marker{width:20px;height:20px;border:3px solid white;border-radius:50%;box-shadow:0 1px 5px #3338}</style>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
</head>
<body>
  <div id="map"></div>
  <script>
    const map = L.map('map', { zoomControl: true }).setView([8.58, 99.98], 8);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: ''
    }).addTo(map);
    const areas = ${JSON.stringify(mapAreas).replace(/</g, '\\u003c')};
    areas.forEach((area, index) => {
      const icon = L.divIcon({
        className: '',
        html: '<div class="risk-marker" style="background:' + area.color + '"></div>',
        iconSize: [26, 26],
        iconAnchor: [13, 13]
      });
      L.marker([area.latitude, area.longitude], { icon })
        .addTo(map)
        .bindPopup('<strong>' + area.short + '</strong><br>ความเสี่ยง' + area.level + ' · ' + area.score + '%')
        .on('click', () => {
          const message = 'wetzy-area:' + index;
          if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(message);
          else window.parent.postMessage(message, '*');
        });
    });
  </script>
</body>
</html>`;
