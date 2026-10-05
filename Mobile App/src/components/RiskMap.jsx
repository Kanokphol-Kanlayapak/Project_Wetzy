import { Pressable, Text, View } from 'react-native';
import { areas } from './wetzy-data';

export function RiskMap({ onSelect }) {
  const points = [
    { left: '41%', top: '28%', index: 0 }, { left: '54%', top: '36%', index: 1 },
    { left: '35%', top: '48%', index: 2 }, { left: '63%', top: '53%', index: 3 },
    { left: '47%', top: '66%', index: 4 }, { left: '30%', top: '73%', index: 5 },
  ];
  return <View className="min-h-[350px] flex-1 overflow-hidden rounded-3xl border border-sky-200 bg-[#d9f1fa]">
    <View className="absolute bottom-0 right-0 top-0 w-[28%] bg-[#b6e5f1]" />
    <Text className="absolute right-2 top-1/2 text-xs text-sky-700">อ่าวไทย</Text>
    <View className="absolute left-[18%] top-[8%] h-[82%] w-[55%] rotate-[8deg] rounded-[48%] border-2 border-white/80 bg-[#c4e9bd]" />
    <View className="absolute left-[30%] top-[19%] h-[60%] w-[30%] rotate-[-13deg] rounded-[45%] border border-white bg-[#a9d99e]" />
    {points.map(({ left, top, index }) => <Pressable key={index} onPress={() => onSelect(areas[index], index)} accessibilityRole="button" accessibilityLabel={`เปิด ${areas[index].short}`} style={{ left, top }} className="absolute h-10 w-10 items-center justify-center rounded-full border-[3px] border-white shadow"><View style={{ backgroundColor: areas[index].color }} className="h-6 w-6 rounded-full" /></Pressable>)}
    <View className="absolute bottom-3 left-3 rounded-2xl border border-sky-100 bg-white/95 p-3">
      <Text className="mb-1 text-xs font-bold text-[#0b3974]">ระดับความเสี่ยง</Text>
      {[['#ef4444','สูง'],['#f59e0b','ปานกลาง'],['#65a30d','ต่ำ'],['#93c5fd','ไม่มีข้อมูล']].map(([color,label]) => <View key={label} className="flex-row items-center py-0.5"><View style={{ backgroundColor: color }} className="mr-2 h-2.5 w-2.5 rounded-full"/><Text className="text-xs text-[#0b3974]">{label}</Text></View>)}
    </View>
  </View>;
}
