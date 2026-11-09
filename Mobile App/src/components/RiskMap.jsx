import { Linking, Pressable, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { areas } from './wetzy-data';
import { openStreetMapHtml } from './openstreetmap-html';

function MapOverlay() {
  return <>
    <View pointerEvents="none" className="absolute bottom-10 left-3 rounded-xl bg-white/95 p-3">
      <Text className="mb-1 text-xs font-bold text-[#0b3974]">ระดับความเสี่ยง</Text>
      {[['#ef4444','สูง'],['#f59e0b','ปานกลาง'],['#65a30d','ต่ำ']].map(([color,label]) => <View key={label} className="flex-row items-center py-0.5"><View style={{ backgroundColor: color }} className="mr-2 h-2.5 w-2.5 rounded-full"/><Text className="text-xs text-[#0b3974]">{label}</Text></View>)}
    </View>
    <Pressable accessibilityRole="link" onPress={() => Linking.openURL('https://www.openstreetmap.org/copyright')} className="absolute bottom-2 right-2 rounded bg-white/90 px-1.5 py-1">
      <Text className="text-[10px] text-[#0b3974]">© OpenStreetMap contributors</Text>
    </Pressable>
  </>;
}

export function RiskMap({ onSelect }) {
  const handleMessage = (event) => {
    const match = /^wetzy-area:(\d+)$/.exec(event.nativeEvent.data);
    if (!match) return;

    const index = Number(match[1]);
    if (Number.isInteger(index) && index >= 0 && index < areas.length) {
      onSelect(areas[index], index);
    }
  };

  return <View className="min-h-[350px] flex-1 overflow-hidden rounded-3xl border border-sky-200 bg-white">
    <WebView
      source={{ html: openStreetMapHtml }}
      originWhitelist={['*']}
      javaScriptEnabled
      onMessage={handleMessage}
      style={{ flex: 1, backgroundColor: '#eaf2f8' }}
      applicationNameForUserAgent="Wetzy/1.0 (+https://github.com/Kanokphol-Kanlayapak/Project_Wetzy)"
      overScrollMode="never"
    />
    <MapOverlay />
  </View>;
}
