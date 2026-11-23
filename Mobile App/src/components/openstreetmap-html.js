export function createOpenStreetMapHtml(areas) {
  const mapAreas = areas.map((area) => ({
    latitude: area.latitude,
    longitude: area.longitude,
    name: area.short || area.name || area.district || '',
    riskLevel: area.prediction?.riskLevel || '',
    probability: area.prediction?.riskProbabilityPercent ?? null,
    periodLabel: area.prediction?.periodLabel || '',
  }));
  const serializedAreas = JSON.stringify(mapAreas).replace(/</g, '\\u003c');

  return `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="">
  <style>
    html,body,#map{height:100%;margin:0}
    body{font-family:system-ui,sans-serif}
    .area-legend{background:#ffffffed;border-radius:10px;box-shadow:0 1px 6px #0003;padding:8px 10px;font-size:12px;line-height:1.6}
    .area-legend-title{font-weight:700;margin-bottom:3px}
    .area-legend-note{color:#64748b;font-size:10px;margin-bottom:3px}
    .area-legend-row{align-items:center;display:flex;gap:6px;white-space:nowrap}
    .area-legend-dot{border:1px solid #fff;border-radius:50%;box-shadow:0 0 1px #333;display:inline-block;height:10px;width:10px}
    .area-popup strong{display:block;font-size:14px}
    .area-popup-risk{font-weight:700;margin-top:3px}
    .area-popup-period{color:#64748b;font-size:11px;margin-top:3px}
    .area-popup button{background:#1689df;border:0;border-radius:6px;color:white;cursor:pointer;font-size:12px;margin-top:8px;padding:6px 10px}
  </style>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
</head>
<body>
  <div id="map"></div>
  <script>
    const map = L.map('map', { zoomControl: true }).setView([0, 0], 2);
    L.tileLayer('https://tile.openstreetmap.de/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);
    const areas = ${serializedAreas};
    const points = areas.map((area) => [area.latitude, area.longitude]);
    const riskColors = {
      'ต่ำ': '#16a34a',
      'ปานกลาง': '#eab308',
      'สูง': '#f97316',
      'สูงมาก': '#dc2626'
    };
    function createAreaPopup(area, index, color) {
      const popup = document.createElement('div');
      popup.className = 'area-popup';
      const name = document.createElement('strong');
      name.textContent = area.name;
      const risk = document.createElement('div');
      risk.className = 'area-popup-risk';
      risk.style.color = color;
      risk.textContent = area.riskLevel
        ? 'ความเสี่ยง ' + area.riskLevel + (typeof area.probability === 'number' ? ' · ' + area.probability + '%' : '')
        : 'ไม่มีข้อมูลความเสี่ยง';
      popup.append(name, risk);
      if (area.periodLabel) {
        const period = document.createElement('div');
        period.className = 'area-popup-period';
        period.textContent = area.periodLabel;
        popup.append(period);
      }
      const detailButton = document.createElement('button');
      detailButton.type = 'button';
      detailButton.textContent = 'ดูรายละเอียดพื้นที่';
      detailButton.addEventListener('click', () => {
        const message = 'wetzy-area:' + index;
        if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(message);
        else window.parent.postMessage(message, '*');
      });
      popup.append(detailButton);
      return popup;
    }

    function cross(origin, first, second) {
      return (first[0] - origin[0]) * (second[1] - origin[1])
        - (first[1] - origin[1]) * (second[0] - origin[0]);
    }

    function convexHull(pointsToBound) {
      const sorted = [...pointsToBound].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      if (sorted.length <= 2) return sorted;
      const lower = [];
      const upper = [];
      sorted.forEach((point) => {
        while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) lower.pop();
        lower.push(point);
      });
      [...sorted].reverse().forEach((point) => {
        while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) upper.pop();
        upper.push(point);
      });
      return lower.slice(0, -1).concat(upper.slice(0, -1));
    }

    function isInsideHull(point, hull) {
      let inside = false;
      for (let current = 0, previous = hull.length - 1; current < hull.length; previous = current++) {
        const [currentX, currentY] = hull[current];
        const [previousX, previousY] = hull[previous];
        const crosses = (currentY > point[1]) !== (previousY > point[1])
          && point[0] < ((previousX - currentX) * (point[1] - currentY)) / (previousY - currentY) + currentX;
        if (crosses) inside = !inside;
      }
      return inside;
    }

    function findNearestArea(latitude, longitude) {
      const latitudeScale = 111320;
      const longitudeScale = latitudeScale * Math.cos(latitude * Math.PI / 180);
      return areas.reduce((nearest, area, index) => {
        const latitudeDistance = (area.latitude - latitude) * latitudeScale;
        const longitudeDistance = (area.longitude - longitude) * longitudeScale;
        const distance = latitudeDistance * latitudeDistance + longitudeDistance * longitudeDistance;
        return distance < nearest.distance ? { index, distance } : nearest;
      }, { index: 0, distance: Number.POSITIVE_INFINITY }).index;
    }

    if (points.length >= 3) {
      const hull = convexHull(areas.map((area) => [area.longitude, area.latitude]));
      const minimumLatitude = Math.min(...areas.map((area) => area.latitude));
      const maximumLatitude = Math.max(...areas.map((area) => area.latitude));
      const minimumLongitude = Math.min(...areas.map((area) => area.longitude));
      const maximumLongitude = Math.max(...areas.map((area) => area.longitude));
      const cellSizeMeters = 5000;
      const latitudeStep = cellSizeMeters / 111320;
      const longitudeStep = cellSizeMeters / (111320 * Math.cos(((minimumLatitude + maximumLatitude) / 2) * Math.PI / 180));
      const firstLatitude = Math.floor(minimumLatitude / latitudeStep) * latitudeStep;
      const firstLongitude = Math.floor(minimumLongitude / longitudeStep) * longitudeStep;

      for (let south = firstLatitude; south < maximumLatitude; south += latitudeStep) {
        for (let west = firstLongitude; west < maximumLongitude; west += longitudeStep) {
          const centerLatitude = south + latitudeStep / 2;
          const centerLongitude = west + longitudeStep / 2;
          if (!isInsideHull([centerLongitude, centerLatitude], hull)) continue;

          const areaIndex = findNearestArea(centerLatitude, centerLongitude);
          const area = areas[areaIndex];
          const color = riskColors[area.riskLevel] || '#64748b';
          L.rectangle(
            [[south, west], [south + latitudeStep, west + longitudeStep]],
            { color: '#ffffff', weight: 0.5, fillColor: color, fillOpacity: 0.48 },
          ).bindPopup(createAreaPopup(area, areaIndex, color), { maxWidth: 250 }).addTo(map);
        }
      }
    }

    const legend = L.control({ position: 'bottomleft' });
    legend.onAdd = () => {
      const container = L.DomUtil.create('div', 'area-legend');
      const title = L.DomUtil.create('div', 'area-legend-title', container);
      title.textContent = 'ระดับความเสี่ยง';
      const note = L.DomUtil.create('div', 'area-legend-note', container);
      note.textContent = 'กริดประมาณ 5 กม. จากจุดอำเภอ';
      [
        ['ต่ำ', riskColors['ต่ำ']],
        ['ปานกลาง', riskColors['ปานกลาง']],
        ['สูง', riskColors['สูง']],
        ['สูงมาก', riskColors['สูงมาก']],
        ['ไม่มีข้อมูล', '#64748b']
      ].forEach(([label, color]) => {
        const row = L.DomUtil.create('div', 'area-legend-row', container);
        const dot = L.DomUtil.create('span', 'area-legend-dot', row);
        dot.style.backgroundColor = color;
        const text = L.DomUtil.create('span', '', row);
        text.textContent = label;
      });
      L.DomEvent.disableClickPropagation(container);
      return container;
    };
    legend.addTo(map);
    if (points.length) {
      const locationBounds = L.latLngBounds(points);
      const mapBounds = locationBounds.pad(0.12);
      map.fitBounds(locationBounds, { padding: [20, 20], maxZoom: 12 });
      map.setMaxBounds(mapBounds);
      map.setMinZoom(map.getBoundsZoom(mapBounds, true));
      map.options.maxBoundsViscosity = 1;
    }
  </script>
</body>
</html>`;
}
