export function createOpenStreetMapHtml(areas) {
  const mapAreas = areas.map((area) => ({
    latitude: area.latitude,
    longitude: area.longitude,
    name: area.short || area.name || area.district || '',
    riskLevel: area.prediction?.riskLevel || '',
    probability: area.prediction?.riskProbabilityPercent ?? null,
    probabilityStatus: area.prediction?.probabilityStatus || 'unvalidated_inputs',
    dataQualityWarning: [
      area.prediction?.probabilityNote,
      area.prediction?.dataQualityWarning,
    ].filter(Boolean).join(' '),
    periodLabel: area.prediction?.periodLabel || '',
  }));
  const serializedAreas = JSON.stringify(mapAreas).replace(/</g, '\\u003c');

  return `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="">
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
  <script src="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
</head>
<body>
  <div id="map"></div>
  <script>
    const mapContainer = document.getElementById('map');
    if (typeof L === 'undefined') {
      mapContainer.textContent = 'โหลดแผนที่ไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ต';
      mapContainer.style.cssText = 'align-items:center;display:flex;justify-content:center;padding:24px;text-align:center;color:#64748b';
    } else {
    const map = L.map('map', { zoomControl: true });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
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
        ? (area.probabilityStatus === 'validated'
          ? 'ความเสี่ยง ' + area.riskLevel + (typeof area.probability === 'number' ? ' · ' + area.probability.toFixed(1) + '%' : '')
          : 'คะแนนโมเดล ' + (typeof area.probability === 'number' ? area.probability.toFixed(1) + '%' : 'ไม่มีข้อมูล') + ' · ' + area.riskLevel)
        : 'ไม่มีข้อมูลความเสี่ยง';
      popup.append(name, risk);
      if (area.dataQualityWarning) {
        const warning = document.createElement('div');
        warning.className = 'area-popup-period';
        warning.textContent = area.dataQualityWarning;
        popup.append(warning);
      }
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

    areas.forEach((area, index) => {
      const color = riskColors[area.riskLevel] || '#64748b';
      L.circleMarker([area.latitude, area.longitude], {
        radius: 9,
        color: '#ffffff',
        weight: 2,
        fillColor: color,
        fillOpacity: 0.9,
      }).bindPopup(createAreaPopup(area, index, color), { maxWidth: 250 }).addTo(map);
    });

    const legend = L.control({ position: 'bottomleft' });
    legend.onAdd = () => {
      const container = L.DomUtil.create('div', 'area-legend');
      const title = L.DomUtil.create('div', 'area-legend-title', container);
      title.textContent = 'ระดับความเสี่ยง';
      const note = L.DomUtil.create('div', 'area-legend-note', container);
      const hasUnvalidatedPredictions = areas.some((area) => (
        area.riskLevel && area.probabilityStatus !== 'validated'
      ));
      note.textContent = hasUnvalidatedPredictions
        ? 'สีแสดงคะแนนโมเดลที่ยังไม่ยืนยัน · จุดคือพิกัดอำเภอจาก GEE'
        : 'จุดแสดงพิกัดอำเภอจาก Google Earth Engine';
      const legendRows = [
        ['ต่ำ 0-25%', riskColors['ต่ำ']],
        ['ปานกลาง 25-50%', riskColors['ปานกลาง']],
        ['สูง 50-75%', riskColors['สูง']],
        ['สูงมาก 75-100%', riskColors['สูงมาก']],
        ['ไม่มีข้อมูล', '#64748b']
      ];
      legendRows.forEach(([label, color]) => {
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
    if (points.length === 1) {
      map.setView(points[0], 9);
    } else if (points.length > 1) {
      map.fitBounds(L.latLngBounds(points), { padding: [24, 24], maxZoom: 10 });
    }
    }
  </script>
</body>
</html>`;
}
