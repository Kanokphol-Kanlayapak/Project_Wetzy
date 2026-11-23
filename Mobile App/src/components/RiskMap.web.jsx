import { useEffect, useMemo, useRef } from 'react';
import { Text, View } from 'react-native';
import { createOpenStreetMapHtml } from './openstreetmap-html';

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
    {locations.length
      ? <iframe
          ref={frame}
          title="แผนที่พื้นที่จาก OpenStreetMap"
          srcDoc={html}
          className="h-full w-full flex-1 border-0"
          style={{ minHeight: 350 }}
        />
      : <View className="flex-1 items-center justify-center px-6"><Text className="text-sm text-slate-500">ยังไม่มีพิกัดพื้นที่ให้แสดงแผนที่</Text></View>}
  </View>;
}
