import { useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams, usePathname } from 'expo-router';
import { areas, tabRoutes } from './wetzy-data';
import { RiskMap } from './RiskMap';

const navy = '#0b3974';
const blue = '#1689df';
const mainRoutes = new Set(tabRoutes);

function Label({ children, className = '', style }) { return <Text className={`text-[#0b3974] ${className}`} style={style}>{children}</Text>; }
function Card({ children, className = '' }) { return <View className={`rounded-2xl border border-sky-100 bg-white p-4 ${className}`}>{children}</View>; }
function Pill({ value }) {
  const color = value === 'สูง' ? '#ef4444' : value === 'ต่ำ' ? '#65a30d' : '#f59e0b';
  const bg = value === 'สูง' ? '#fee2e2' : value === 'ต่ำ' ? '#dcfce7' : '#fef3c7';
  return <View style={{ backgroundColor: bg }} className="rounded-full px-3 py-1"><Text style={{ color, fontWeight: '700', fontSize: 12 }}>{value}</Text></View>;
}
function Header({ title, back = true, right, onRight }) {
  return <View className="mb-3 min-h-11 flex-row items-center px-1">
    {back ? <Pressable accessibilityRole="button" accessibilityLabel="ย้อนกลับ" onPress={() => router.back()} className="mr-2 h-11 w-10 justify-center"><Text className="text-3xl leading-8 text-[#0b3974]">‹</Text></Pressable> : <View className="mr-2 w-10" />}
    <Label className="flex-1 text-lg font-bold">{title}</Label>
    {right ? <Pressable accessibilityRole="button" onPress={onRight} className="px-2 py-2"><Label className="font-semibold">{right}</Label></Pressable> : null}
  </View>;
}
function BottomTabs({ active }) {
  const tabs = [['/','⌂','หน้าหลัก'], ['/areas','◧','พื้นที่เสี่ยง'], ['/forecast','⌁','พยากรณ์'], ['/data','◉','ข้อมูล'], ['/about','ⓘ','เกี่ยวกับ']];
  return <View className="flex-row border-t border-sky-100 bg-white px-1 pt-2">{tabs.map(([route, icon, title]) => {
    const selected = active === route || (active === '/map' && route === '/areas');
    return <Pressable key={route} onPress={() => router.replace(route)} accessibilityRole="tab" accessibilityState={{ selected }} className="min-h-12 flex-1 items-center py-1">
      <Text className={`text-xl ${selected ? 'text-[#1689df]' : 'text-slate-500'}`}>{icon}</Text><Text className={`mt-0.5 text-[10px] ${selected ? 'font-bold text-[#1689df]' : 'text-slate-500'}`}>{title}</Text>
    </Pressable>;
  })}</View>;
}

function HomeBackground() {
  return <View pointerEvents="none" style={StyleSheet.absoluteFillObject} className="overflow-hidden bg-[#a8e2ff]">
    <Text style={{ position: 'absolute', left: '8%', top: '18%' }} className="text-4xl">☁️</Text>
    <Text style={{ position: 'absolute', right: '10%', top: '25%' }} className="text-3xl">☁️</Text>
    <Text style={{ position: 'absolute', right: '35%', top: '10%' }} className="text-2xl">☁️</Text>
    <View style={{ position: 'absolute', left: '-15%', right: '38%', bottom: '29%', height: 110, borderRadius: 100, backgroundColor: '#80c99a' }} />
    <View style={{ position: 'absolute', left: '35%', right: '-20%', bottom: '27%', height: 140, borderRadius: 120, backgroundColor: '#6dbf91' }} />
    <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '31%', backgroundColor: '#58bce5' }} />
    <View style={{ position: 'absolute', left: 0, right: 0, bottom: '25%', height: 14, backgroundColor: '#82d8e6' }} />
    <View style={{ position: 'absolute', left: '7%', bottom: '28%' }}><Text className="text-5xl">🌴</Text></View>
    <View style={{ position: 'absolute', left: '29%', bottom: '27%' }}><Text className="text-4xl">⌂</Text></View>
    <View style={{ position: 'absolute', left: '47%', bottom: '27%' }}><Text className="text-4xl">⌂</Text></View>
    <View style={{ position: 'absolute', right: '27%', bottom: '27%' }}><Text className="text-5xl">🗼</Text></View>
    <View style={{ position: 'absolute', right: '5%', bottom: '28%' }}><Text className="text-5xl">🌴</Text></View>
    <Text style={{ position: 'absolute', left: '18%', bottom: '8%' }} className="text-2xl">〰️　〰️　〰️</Text>
  </View>;
}

export default function WetzyScreen({ screen }) {
  const pathname = usePathname();
  const params = useLocalSearchParams();
  const [query, setQuery] = useState('');
  const [mapMode, setMapMode] = useState(true);
  const [helpOpen, setHelpOpen] = useState('');
  const lastX = useRef(0);
  const lastY = useRef(0);
  const activeAreaIndex = Number(params.area || 0);
  const activeArea = areas[Number.isInteger(activeAreaIndex) && activeAreaIndex >= 0 && activeAreaIndex < areas.length ? activeAreaIndex : 0];
  const filtered = useMemo(() => areas.filter((area) => area.name.includes(query) || area.short.includes(query)), [query]);
  const openDetail = (area) => router.push({ pathname: '/detail', params: { area: areas.indexOf(area) } });
  const gestures = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, g) => mainRoutes.has(pathname) && Math.abs(g.dx) > 18 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
    onPanResponderGrant: (_, g) => { lastX.current = g.x0; lastY.current = g.y0; },
    onPanResponderRelease: (_, g) => {
      if (!mainRoutes.has(pathname) || Math.abs(g.dx) < 60 || Math.abs(g.dx) < Math.abs(g.dy) * 1.5) return;
      const index = tabRoutes.indexOf(pathname);
      const next = g.dx < 0 ? Math.min(tabRoutes.length - 1, index + 1) : Math.max(0, index - 1);
      if (next !== index) router.replace(tabRoutes[next]);
    },
  })).current;

  return <SafeAreaView className="flex-1 bg-[#f3faff]" edges={['top','bottom']} {...gestures.panHandlers}>
    {screen === 'home' ? <HomeBackground /> : null}
    <View className="flex-1">
      {screen === 'home' && <ScrollView className="flex-1" showsVerticalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 20, paddingTop: 26, paddingBottom: 16 }}>
        <View className="items-center"><View className="flex-row items-center"><Text className="mr-2 text-5xl text-[#1689df]">◉</Text><Text className="text-4xl font-extrabold tracking-tight text-[#07539d]">Wetzy</Text></View>
          <Label className="mt-1 text-2xl font-extrabold">รู้ก่อน น้ำมา</Label><Label className="mt-1 text-center text-base leading-6">ตรวจสอบความเสี่ยงน้ำท่วม{ '\n' }ในพื้นที่เสี่ยงของคุณ</Label></View>
        <View className="min-h-10 flex-1" />
        <Card className="mb-3 bg-white/95 p-4 shadow-md"><Label className="mb-1 text-xs text-slate-500">จังหวัด</Label><Pressable onPress={() => router.push('/areas')} className="mb-3 min-h-11 flex-row items-center justify-between rounded-xl border border-sky-100 px-3"><Label className="font-semibold">นครศรีธรรมราช</Label><Label>⌄</Label></Pressable><Pressable onPress={() => router.push('/areas')} className="items-center rounded-full bg-[#1689df] py-3"><Text className="font-bold text-white">⌕　ตรวจสอบความเสี่ยง</Text></Pressable></Card>
        <Card className="flex-row items-center bg-white/95 p-4 shadow-md"><View className="mr-3 h-14 w-14 items-center justify-center rounded-full bg-sky-100"><Text className="text-2xl">🌊</Text></View><Label className="flex-1 text-sm leading-5">โฟกัสพื้นที่เสี่ยงน้ำท่วมซ้ำ{ '\n' }ในจังหวัดนครศรีธรรมราช{ '\n' }และคาดการณ์ล่วงหน้า 1 วัน</Label></Card>
      </ScrollView>}

      {screen === 'areas' && <View className="flex-1 px-4 pt-2"><Header title="เลือกพื้นที่เสี่ยง" back={router.canGoBack()} right="แผนที่" onRight={() => router.push('/map')} />
        <Card className="mb-3 flex-row items-center bg-[#e4f5ff] py-3"><Text className="mr-3 text-3xl">📍</Text><View><Label className="font-bold">จังหวัดนครศรีธรรมราช</Label><Label className="text-xs text-slate-500">พื้นที่เกิดน้ำท่วมซ้ำบ่อย</Label></View><Text className="ml-auto text-2xl">🏞️</Text></Card>
        <View className="mb-2 flex-row items-center rounded-xl border border-sky-200 bg-white px-3"><Text className="mr-2 text-lg text-slate-400">⌕</Text><TextInput value={query} onChangeText={setQuery} placeholder="ค้นหาอำเภอ..." placeholderTextColor="#8ba2b8" className="h-11 flex-1 text-sm text-[#0b3974]" /></View>
        <ScrollView showsVerticalScrollIndicator={false}>{filtered.map((area) => <Pressable key={area.name} onPress={() => router.push({ pathname: '/map', params: { area: areas.indexOf(area) } })} className="mb-2 flex-row items-center rounded-xl border border-sky-100 bg-white px-3 py-3"><Text className="mr-3 text-lg" style={{ color: area.color }}>●</Text><Label className="flex-1 text-sm font-semibold">{area.name}</Label><Pill value={area.level}/><Text className="ml-3 text-xl text-blue-600">›</Text></Pressable>)}</ScrollView>
      </View>}

      {screen === 'map' && <View className="flex-1 px-3 pt-2"><Header title="แผนที่พื้นที่เสี่ยง" />
        <View className="mb-2 flex-row rounded-full border border-sky-200 bg-white p-1"><Pressable onPress={() => setMapMode(true)} className={`flex-1 items-center rounded-full py-2 ${mapMode ? 'bg-[#1689df]' : ''}`}><Text className={mapMode ? 'font-bold text-white' : 'text-blue-700'}>แผนที่</Text></Pressable><Pressable onPress={() => setMapMode(false)} className={`flex-1 items-center rounded-full py-2 ${!mapMode ? 'bg-[#1689df]' : ''}`}><Text className={!mapMode ? 'font-bold text-white' : 'text-blue-700'}>รายการพื้นที่</Text></Pressable></View>
        {mapMode ? <RiskMap onSelect={openDetail}/> : <ScrollView>{areas.map((area) => <Pressable key={area.name} onPress={() => openDetail(area)} className="mb-2 flex-row items-center justify-between rounded-xl border border-sky-100 bg-white p-3"><Label>{area.short}</Label><Pill value={area.level}/></Pressable>)}</ScrollView>}
      </View>}

      {screen === 'detail' && <View className="flex-1 px-4 pt-2"><Header title="รายละเอียดพื้นที่"/><ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 12 }}>
        <Card className="mb-2 flex-row items-center"><Text className="mr-3 text-3xl">📍</Text><View><Label className="font-bold">{activeArea.short}</Label><Label className="text-xs">จ.นครศรีธรรมราช</Label></View></Card>
        <View className="mb-2 flex-row items-center justify-between rounded-2xl border border-red-100 bg-red-50 p-4"><View><Text className="text-xs font-semibold text-red-500">⚠ ความเสี่ยงพรุ่งนี้</Text><Text style={{ color: activeArea.color }} className="mt-1 text-3xl font-extrabold">{activeArea.level}</Text></View><View className="h-20 w-20 items-center justify-center rounded-full border-[5px] border-red-400"><Text className="text-xl font-extrabold text-red-600">{activeArea.score}%</Text><Text className="text-[10px] text-red-500">/100</Text></View></View>
        <View className="mb-2 flex-row gap-2">{[['☔','ปริมาณฝน',activeArea.rain],['⌁','ระดับน้ำ',activeArea.water],['⚠','ประวัติน้ำท่วม',activeArea.history]].map(([icon,label,value]) => <View key={label} className="flex-1 rounded-xl border border-sky-100 bg-white p-3"><Text className="text-xl text-blue-500">{icon}</Text><Label className="mt-1 text-xs">{label}</Label><Label className="text-base font-bold">{value}</Label></View>)}</View>
        <Label className="mb-2 mt-1 font-bold">ปัจจัยที่ใช้ในการประเมิน</Label>{[['☔','ปริมาณฝน (คาดการณ์)',activeArea.rain],['⌁','ระดับน้ำ',activeArea.water],['◉','ประวัติน้ำท่วม',activeArea.history]].map(([icon,label,value]) => <View key={label} className="flex-row items-center border-b border-sky-100 py-2"><Text className="mr-2 text-blue-600">{icon}</Text><Label className="flex-1 text-xs">{label}</Label><Text style={{ color: activeArea.color }} className="text-xs font-bold">{value}</Text></View>)}
        <Pressable onPress={() => router.push({ pathname: '/forecast', params: { area: activeAreaIndex } })} className="mt-3 items-center rounded-full bg-[#1689df] py-3"><Text className="font-bold text-white">ดูพยากรณ์ล่วงหน้า 1 วัน</Text></Pressable>
      </ScrollView></View>}

      {screen === 'forecast' && <View className="flex-1 px-4 pt-2"><Header title="พยากรณ์ล่วงหน้า 1 วัน" back={pathname !== '/forecast' || router.canGoBack?.()}/><ScrollView><Card className="mb-3 flex-row items-center"><Text className="mr-3 text-3xl">📍</Text><View><Label className="font-bold">{activeArea.short}</Label><Label className="text-xs">จ.นครศรีธรรมราช</Label></View></Card>
        <View className="mb-3 flex-row items-center justify-between rounded-2xl border border-red-100 bg-red-50 p-4"><View><Text className="text-xs font-semibold text-red-500">⚠ ความเสี่ยงน้ำท่วมพรุ่งนี้</Text><Text style={{ color: activeArea.color }} className="mt-1 text-3xl font-extrabold">{activeArea.level}</Text></View><View className="h-20 w-20 items-center justify-center rounded-full border-[5px] border-red-400"><Text className="text-xl font-extrabold text-red-600">{activeArea.score}%</Text><Text className="text-[10px] text-red-500">/100</Text></View></View>
        <Card className="mb-3"><Label className="mb-3 font-bold">แนวโน้มความเสี่ยง <Text className="text-xs font-normal">(อีก 1 วันข้างหน้า)</Text></Label><View className="h-36 justify-end border-b border-l border-sky-200 px-3"><View className="absolute left-0 top-0 w-full border-t border-slate-100"/><View className="absolute left-0 top-1/2 w-full border-t border-slate-100"/><View className="flex-row items-end justify-around"><View className="h-10 w-2/5 border-t-2 border-red-400 bg-red-50"/><View className="h-24 w-2/5 border-t-2 border-red-500 bg-red-100"/></View></View><View className="mt-2 flex-row justify-around"><Label className="text-xs">วันนี้</Label><Label className="text-xs">พรุ่งนี้</Label></View></Card>
        <Card className="bg-sky-50"><Label className="font-bold">💡 คำแนะนำ</Label><Label className="mt-1 text-xs leading-5">พื้นที่มีความเสี่ยงน้ำท่วม{activeArea.level}ในวันพรุ่งนี้{ '\n' }ควรติดตามสถานการณ์และเตรียมรับมือ</Label></Card>
      </ScrollView></View>}

      {screen === 'data' && <ScrollView className="flex-1 px-4 pt-3"><Header title="ข้อมูลพื้นที่" back={false}/><Label className="mb-3 text-sm">ภาพรวมความเสี่ยงในจังหวัดนครศรีธรรมราช</Label>{areas.map((area) => <Pressable key={area.name} onPress={() => openDetail(area)} className="mb-2 flex-row items-center rounded-xl border border-sky-100 bg-white p-3"><View style={{ backgroundColor: area.color }} className="mr-3 h-3 w-3 rounded-full"/><Label className="flex-1 text-sm">{area.short}</Label><Label className="mr-3 font-bold">{area.score}%</Label><Pill value={area.level}/></Pressable>)}</ScrollView>}

      {screen === 'about' && <ScrollView className="flex-1 px-4 pt-3"><Header title="เกี่ยวกับ Wetzy" back={false}/><Card className="mb-3"><View className="my-2 flex-row items-center"><Text className="mr-3 text-5xl text-blue-500">◉</Text><View><Text className="text-2xl font-extrabold text-[#07539d]">Wetzy</Text><Text className="text-xs text-blue-700">Know Before It Flows.</Text></View></View><Label className="text-sm leading-6">Wetzy Demo ช่วยสื่อสารความเสี่ยงน้ำท่วมจากข้อมูลตัวอย่างด้านฝน ระดับน้ำ และพื้นที่เกิดน้ำท่วมซ้ำ เพื่อให้ผู้ใช้เตรียมตัวล่วงหน้า</Label></Card><Card><Label className="mb-2 font-bold">ข้อมูลโครงการ</Label>{[['ⓘ','วัตถุประสงค์'],['◉','ขอบเขตข้อมูลตัวอย่าง'],['⌖','พื้นที่ศึกษา: นครศรีธรรมราช']].map(([icon,title]) => <Pressable key={title} onPress={() => setHelpOpen(helpOpen === title ? '' : title)} className="mb-2 flex-row items-center rounded-xl border border-sky-100 px-3 py-3"><Text className="mr-3 text-blue-500">{icon}</Text><Label className="flex-1 text-sm">{title}</Label><Label>›</Label>{helpOpen === title ? <Label className="basis-full pt-2 text-xs">ใช้สำหรับสาธิตหน้าจอและลำดับการใช้งาน Wetzy</Label> : null}</Pressable>)}</Card></ScrollView>}
    </View>
    <BottomTabs active={pathname}/>
  </SafeAreaView>;
}
