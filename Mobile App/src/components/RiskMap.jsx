import { Linking, Pressable, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { createOpenStreetMapHtml } from './openstreetmap-html';

function MapOverlay({ hasLocations }) {
  return <>
    {!hasLocations ? <View pointerEvents="none" className="absolute bottom-10 left-3 rounded-xl bg-white/95 p-3"><Text className="text-xs text-[#0b3974]">ไม่มีข้อมูลพิกัดพื้นที่</Text></View> : null}
    <Pressable accessibilityRole="link" onPress={() => Linking.openURL('https://www.openstreetmap.org/copyright')} className="absolute bottom-2 right-2 rounded bg-white/90 px-1.5 py-1">
      <Text className="text-[10px] text-[#0b3974]">© OpenStreetMap contributors</Text>
    </Pressable>
  </>;
}

export function RiskMap({ areas, onSelect }) {
  const locations = areas.filter((area) => Number.isFinite(area.latitude) && Number.isFinite(area.longitude));
  const html = createOpenStreetMapHtml(locations);

  const handleMessage = (event) => {
    const match = /^wetzy-area:(\d+)$/.exec(event.nativeEvent.data);
    if (!match) return;

    const index = Number(match[1]);
    if (Number.isInteger(index) && index >= 0 && index < locations.length) {
      onSelect(locations[index]);
    }
  };

  return <View className="min-h-[350px] flex-1 overflow-hidden rounded-3xl border border-sky-200 bg-white">
    <WebView
      source={{ html }}
      originWhitelist={['*']}
      javaScriptEnabled
      onMessage={handleMessage}
      style={{ flex: 1, backgroundColor: '#eaf2f8' }}
      applicationNameForUserAgent="Wetzy/1.0 (+https://github.com/Kanokphol-Kanlayapak/Project_Wetzy)"
      overScrollMode="never"
    />
    <MapOverlay hasLocations={locations.length > 0} />
  </View>;
}
