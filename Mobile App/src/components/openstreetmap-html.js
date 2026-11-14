export function createOpenStreetMapHtml(areas) {
  const mapAreas = areas.map((area) => ({
    latitude: area.latitude,
    longitude: area.longitude,
    name: area.short || area.name || area.district || '',
  }));
  const serializedAreas = JSON.stringify(mapAreas).replace(/</g, '\\u003c');

  return `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="">
  <style>html,body,#map{height:100%;margin:0}body{font-family:system-ui,sans-serif}.area-marker{width:20px;height:20px;border:3px solid white;border-radius:50%;box-shadow:0 1px 5px #3338}</style>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
</head>
<body>
  <div id="map"></div>
  <script>
    const map = L.map('map', { zoomControl: true }).setView([0, 0], 2);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: ''
    }).addTo(map);
    const areas = ${serializedAreas};
    const points = [];
    areas.forEach((area, index) => {
      const icon = L.divIcon({
        className: '',
        html: '<div class="area-marker" style="background:#1689df"></div>',
        iconSize: [26, 26],
        iconAnchor: [13, 13]
      });
      const marker = L.marker([area.latitude, area.longitude], { icon }).addTo(map);
      const popup = document.createElement('span');
      popup.textContent = area.name;
      marker.bindPopup(popup).on('click', () => {
          const message = 'wetzy-area:' + index;
          if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(message);
          else window.parent.postMessage(message, '*');
        });
      points.push([area.latitude, area.longitude]);
    });
    if (points.length) map.fitBounds(points, { padding: [20, 20], maxZoom: 12 });
  </script>
</body>
</html>`;
}
