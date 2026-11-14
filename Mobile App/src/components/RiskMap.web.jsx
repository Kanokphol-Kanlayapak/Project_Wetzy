import { useEffect, useMemo, useRef } from 'react';
import { Pressable, Text, View } from 'react-native';
import { createOpenStreetMapHtml } from './openstreetmap-html';

function MapOverlay({ hasLocations }) {
  return <>
    {!hasLocations ? <View pointerEvents="none" className="absolute bottom-10 left-3 rounded-xl bg-white/95 p-3"><Text className="text-xs text-[#0b3974]">ไม่มีข้อมูลพิกัดพื้นที่</Text></View> : null}
    <Pressable accessibilityRole="link" onPress={() => window.open('https://www.openstreetmap.org/copyright', '_blank', 'noopener,noreferrer')} className="absolute bottom-2 right-2 rounded bg-white/90 px-1.5 py-1">
      <Text className="text-[10px] text-[#0b3974]">© OpenStreetMap contributors</Text>
    </Pressable>
  </>;
}

export function RiskMap({ areas, onSelect }) {
  const frame = useRef(null);
  const locations = useMemo(
    () => areas.filter((area) => Number.isFinite(area.latitude) && Number.isFinite(area.longitude)),
    [areas],
  );
  const html = useMemo(() => createOpenStreetMapHtml(locations), [locations]);

  useEffect(() => {
    const handleMessage = (event) => {
      if (event.source !== frame.current?.contentWindow || typeof event.data !== 'string') return;

      const match = /^wetzy-area:(\d+)$/.exec(event.data);
      if (!match) return;

      const index = Number(match[1]);
      if (Number.isInteger(index) && index >= 0 && index < locations.length) {
        onSelect(locations[index]);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [locations, onSelect]);

  return <View className="min-h-[350px] flex-1 overflow-hidden rounded-3xl border border-sky-200 bg-white">
    <iframe
      ref={frame}
      title="แผนที่พื้นที่จาก OpenStreetMap"
      srcDoc={html}
      className="h-full w-full flex-1 border-0"
      style={{ minHeight: 350 }}
    />
    <MapOverlay hasLocations={locations.length > 0} />
  </View>;
}
