import { useMemo } from 'react';
import { Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { createOpenStreetMapHtml } from './openstreetmap-html';

export function RiskMap({ areas, onSelect }) {
  const locations = useMemo(
    () => areas.filter((area) => Number.isFinite(area.latitude) && Number.isFinite(area.longitude)),
    [areas],
  );
  const html = useMemo(() => createOpenStreetMapHtml(locations), [locations]);
  const source = useMemo(() => ({ html }), [html]);

  const handleMessage = (event) => {
    const match = /^wetzy-area:(\d+)$/.exec(event.nativeEvent.data);
    if (!match) return;

    const index = Number(match[1]);
    if (Number.isInteger(index) && index >= 0 && index < locations.length) {
      onSelect(locations[index]);
    }
  };

  return <View className="min-h-[350px] flex-1 overflow-hidden rounded-3xl border border-sky-200 bg-white">
    {locations.length
      ? <WebView
          source={source}
          originWhitelist={['*']}
          javaScriptEnabled
          onMessage={handleMessage}
          style={{ flex: 1, backgroundColor: '#eaf2f8' }}
          applicationNameForUserAgent="Wetzy/1.0 (+https://github.com/Kanokphol-Kanlayapak/Project_Wetzy)"
          overScrollMode="never"
        />
      : <View className="flex-1 items-center justify-center px-6"><Text className="text-sm text-slate-500">ยังไม่มีพิกัดพื้นที่ให้แสดงแผนที่</Text></View>}
  </View>;
}
