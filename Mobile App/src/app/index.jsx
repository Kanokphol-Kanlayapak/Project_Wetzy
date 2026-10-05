import { useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, PanResponder, Pressable, ScrollView, StatusBar, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const areas = [
  { name: 'อำเภอเมืองนครศรีธรรมราช', short: 'อ.เมืองนครศรีธรรมราช', level: 'สูง', score: 78, rain: '145 mm', water: '3.8 m', history: 'สูง', color: '#ef4444' },
  { name: 'อำเภอท่าศาลา', short: 'อ.ท่าศาลา', level: 'ปานกลาง', score: 54, rain: '82 mm', water: '2.1 m', history: 'ปานกลาง', color: '#f59e0b' },
  { name: 'อำเภอหัวไทร', short: 'อ.หัวไทร', level: 'ปานกลาง', score: 48, rain: '76 mm', water: '1.9 m', history: 'ปานกลาง', color: '#f59e0b' },
  { name: 'อำเภอสิชล', short: 'อ.สิชล', level: 'ต่ำ', score: 26, rain: '32 mm', water: '0.8 m', history: 'ต่ำ', color: '#65a30d' },
  { name: 'อำเภอขนอม', short: 'อ.ขนอม', level: 'ต่ำ', score: 19, rain: '24 mm', water: '0.6 m', history: 'ต่ำ', color: '#65a30d' },
  { name: 'อำเภอร่อนพิบูลย์', short: 'อ.ร่อนพิบูลย์', level: 'ปานกลาง', score: 43, rain: '64 mm', water: '1.5 m', history: 'ปานกลาง', color: '#f59e0b' },
];
const navy = '#0b3974';
const blue = '#1689df';

function Label({ children, className = '', style }) {
  return <Text className={`text-[#0b3974] ${className}`} style={style}>{children}</Text>;
}
function Card({ children, className = '', style }) {
  return <View className={`rounded-2xl border border-sky-100 bg-white p-4 ${className}`} style={style}>{children}</View>;
}
function Pill({ value }) {
  const color = value === 'สูง' ? '#ef4444' : value === 'ต่ำ' ? '#65a30d' : '#f59e0b';
  const bg = value === 'สูง' ? '#fee2e2' : value === 'ต่ำ' ? '#dcfce7' : '#fef3c7';
  return <View className="rounded-full px-4 py-1" style={{ backgroundColor: bg }}><Text style={{ color, fontWeight: '700', fontSize: 12 }}>{value}</Text></View>;
}
function Header({ title, back, onBack, right }) {
  return <View className="mb-3 flex-row items-center justify-between px-1 py-1">
    <Pressable accessibilityRole="button" accessibilityLabel="ย้อนกลับ" onPress={onBack} className="mr-2 h-11 w-10 items-start justify-center"><Text className="text-3xl leading-8 text-[#0b3974]">{back ? '‹' : ''}</Text></Pressable>
    <Label className="flex-1 text-lg font-bold">{title}</Label><Pressable onPress={right?.onPress}><Label className="text-xl">{right?.label || ''}</Label></Pressable>
  </View>;
}

export default function HomeScreen() {
  const [screen, setRawScreen] = useState('home');
  const currentScreen = useRef('home');
  const navigationHistory = useRef(['home']);
  const [selected, setSelected] = useState(areas[0]);
  const [query, setQuery] = useState('');
  const [mapMode, setMapMode] = useState(true);
  const [helpOpen, setHelpOpen] = useState('');
  const filtered = useMemo(() => areas.filter((area) => area.name.includes(query) || area.short.includes(query)), [query]);
  const mainTabs = ['home', 'areas', 'forecast', 'data', 'profile'];
  const setScreen = (next) => {
    navigationHistory.current = [...navigationHistory.current, next];
    currentScreen.current = next;
    setRawScreen(next);
  };
  const goTab = (next) => {
    navigationHistory.current = [next];
    currentScreen.current = next;
    setRawScreen(next);
  };
  const goBack = () => {
    if (navigationHistory.current.length <= 1) return false;
    navigationHistory.current = navigationHistory.current.slice(0, -1);
    const next = navigationHistory.current[navigationHistory.current.length - 1];
    currentScreen.current = next;
    setRawScreen(next);
    return true;
  };
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', goBack);
    return () => subscription.remove();
  }, []);
  const swipeResponder = PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => mainTabs.includes(currentScreen.current)
      && Math.abs(gesture.dx) > 68 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.4,
    onPanResponderRelease: (_, gesture) => {
      if (Math.abs(gesture.dx) < 68 || Math.abs(gesture.dx) < Math.abs(gesture.dy) * 1.4) return;
      const index = mainTabs.indexOf(currentScreen.current);
      const nextIndex = gesture.dx < 0 ? Math.min(mainTabs.length - 1, index + 1) : Math.max(0, index - 1);
      if (nextIndex !== index) goTab(mainTabs[nextIndex]);
    },
  });
  const openDetail = (area) => { setSelected(area); setScreen('detail'); };

  const tabs = [
    ['home', '⌂', 'หน้าหลัก'], ['areas', '◧', 'พื้นที่เสี่ยง'], ['forecast', '⌁', 'พยากรณ์'], ['data', '◉', 'ข้อมูล'], ['profile', '♟', 'โปรไฟล์'],
  ];

  return <SafeAreaView className="flex-1 bg-[#f3faff]" edges={['top', 'bottom']} {...swipeResponder.panHandlers}>
    <StatusBar barStyle="dark-content" backgroundColor="#f3faff" />
    {screen === 'home' && <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 18 }}>
      <View className="mx-3 mt-2 overflow-hidden rounded-[30px] bg-[#a8e2ff] px-5 pb-4 pt-3">
        <Pressable className="mt-3 self-end" onPress={() => setScreen('profile')}><Label className="text-2xl">☰</Label></Pressable>
        <View className="items-center pb-5 pt-1">
          <View className="flex-row items-center"><Text className="mr-2 text-6xl text-[#1689df]">◉</Text><Text className="text-4xl font-extrabold tracking-tight text-[#07539d]">Wetzy</Text></View>
          <Label className="mt-2 text-2xl font-extrabold">รู้ก่อน น้ำมา</Label>
          <Label className="mt-1 text-center text-base leading-6">ตรวจสอบความเสี่ยงน้ำท่วม{ '\n' }ในพื้นที่เสี่ยงของคุณ</Label>
        </View>
        <View className="h-28 overflow-hidden rounded-2xl bg-[#59bcea]">
          <View className="absolute inset-x-0 top-0 h-10 bg-[#c8efff]" />
          <Text className="mt-2 text-center text-3xl">☁️　☁️　☁️</Text>
          <View className="absolute bottom-0 h-12 w-full flex-row items-end justify-around bg-[#79d4e9]">
            <Text className="text-3xl">🌴</Text><Text className="text-2xl">⌂　⌂</Text><Text className="text-3xl">🗼</Text><Text className="text-3xl">🌴</Text>
          </View>
        </View>
      </View>
      <Card className="mx-5 -mt-2 p-3 shadow-sm">
        <Label className="mb-1 text-xs text-slate-500">จังหวัด</Label>
        <Pressable onPress={() => setScreen('areas')} className="mb-3 flex-row items-center justify-between rounded-xl border border-sky-100 px-3 py-2"><Label className="font-semibold">นครศรีธรรมราช</Label><Label>⌄</Label></Pressable>
        <Pressable onPress={() => setScreen('areas')} className="items-center rounded-full bg-[#1689df] py-3"><Text className="font-bold text-white">⌕   ตรวจสอบความเสี่ยง</Text></Pressable>
      </Card>
      <Card className="mx-5 mt-3 flex-row items-center bg-[#f7fcff]">
        <View className="mr-3 h-14 w-14 items-center justify-center rounded-full bg-sky-100"><Text className="text-2xl">🌊</Text></View>
        <Label className="flex-1 text-sm leading-5">โฟกัสพื้นที่เสี่ยงน้ำท่วมซ้ำ{ '\n' }ในจังหวัดนครศรีธรรมราช{ '\n' }และคาดการณ์ล่วงหน้า 1 วัน</Label>
      </Card>
    </ScrollView>}

    {screen === 'areas' && <View className="flex-1 px-4 pt-2">
      <Header title="เลือกพื้นที่" back onBack={goBack} right={{ label: '⌖', onPress: () => setScreen('map') }} />
      <Card className="mb-3 flex-row items-center bg-[#e4f5ff] py-3"><Text className="mr-3 text-3xl">📍</Text><View><Label className="font-bold">จังหวัดนครศรีธรรมราช</Label><Label className="text-xs text-slate-500">พื้นที่เกิดน้ำท่วมซ้ำบ่อย</Label></View><Text className="ml-auto text-2xl">🏞️</Text></Card>
      <View className="mb-2 flex-row items-center rounded-xl border border-sky-200 bg-white px-3"><Text className="mr-2 text-lg text-slate-400">⌕</Text><TextInput value={query} onChangeText={setQuery} placeholder="ค้นหาอำเภอ..." placeholderTextColor="#8ba2b8" className="h-11 flex-1 text-sm text-[#0b3974]" /></View>
      <ScrollView showsVerticalScrollIndicator={false}>{filtered.map((area) => <Pressable key={area.name} onPress={() => openDetail(area, 'areas')} className="mb-2 flex-row items-center rounded-xl border border-sky-100 bg-white px-3 py-3"><Text className="mr-3 text-lg" style={{ color: area.color }}>●</Text><Label className="flex-1 text-sm font-semibold">{area.name}</Label><Pill value={area.level} /><Text className="ml-3 text-xl text-blue-600">›</Text></Pressable>)}</ScrollView>
    </View>}

    {screen === 'map' && <View className="flex-1 px-3 pt-2">
      <Header title="แผนที่พื้นที่เสี่ยง" back onBack={goBack} />
      <View className="mb-2 flex-row rounded-full border border-sky-200 bg-white p-1"><Pressable onPress={() => setMapMode(true)} className={`flex-1 items-center rounded-full py-2 ${mapMode ? 'bg-[#1689df]' : ''}`}><Text className={mapMode ? 'font-bold text-white' : 'text-blue-700'}>แผนที่</Text></Pressable><Pressable onPress={() => setMapMode(false)} className={`flex-1 items-center rounded-full py-2 ${!mapMode ? 'bg-[#1689df]' : ''}`}><Text className={!mapMode ? 'font-bold text-white' : 'text-blue-700'}>รายการพื้นที่</Text></Pressable></View>
      {!mapMode ? <ScrollView>{areas.map((area) => <Pressable key={area.name} onPress={() => openDetail(area)} className="mb-2 flex-row items-center justify-between rounded-xl border border-sky-100 bg-white p-3"><Label>{area.short}</Label><Pill value={area.level} /></Pressable>)}</ScrollView> : <View className="flex-1 overflow-hidden rounded-2xl bg-[#b9e5fb]">
        <View className="absolute inset-0"><View className="absolute left-0 top-0 h-full w-1/3 bg-[#cceafa]"/><View className="absolute right-0 top-0 h-full w-1/3 bg-[#a8dcf8]"/><Text className="absolute right-4 top-1/2 text-sm text-blue-400">อ่าวไทย</Text></View>
        <View className="mt-2 flex-row justify-center"><View className="w-4/5 items-center">
          {['  🟨🟨  ',' 🟨🟩🟨 ','🟩🟨🟥🟨',' 🟨🟥🟥 ',' 🟩🟧🟨 ','  🟩🟨  ','   🟨   '].map((row, i) => <Pressable key={`${row}-${i}`} onPress={() => openDetail(areas[i % areas.length], 'map')}><Text className="text-4xl leading-[45px]">{row}</Text></Pressable>)}
        </View></View>
        <View className="absolute right-2 top-2 rounded-xl border border-sky-100 bg-white/95 p-2"><Label className="mb-1 text-xs font-bold">ระดับความเสี่ยง</Label><Text className="text-xs leading-5">🔴 สูง{ '\n' }🟡 ปานกลาง{ '\n' }🟢 ต่ำ{ '\n' }🔵 ไม่มีข้อมูล</Text></View>
        <Pressable onPress={() => openDetail(selected)} className="absolute bottom-20 left-3 rounded-xl bg-white px-3 py-2"><Label className="text-xs font-bold">{selected.short}</Label><Text className="text-xs text-slate-600">ความเสี่ยง: <Text style={{ color: selected.color }}>{selected.level}</Text></Text></Pressable>
        <View className="absolute bottom-4 right-3 overflow-hidden rounded-xl bg-white"><Pressable className="border-b border-slate-200 px-3 py-1"><Text className="text-xl text-blue-700">＋</Text></Pressable><Pressable className="px-3 py-1"><Text className="text-xl text-blue-700">−</Text></Pressable></View>
      </View>}
    </View>}

    {screen === 'detail' && <View className="flex-1 px-4 pt-2">
      <Header title="รายละเอียดพื้นที่" back onBack={goBack} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 12 }}>
        <Card className="mb-2 flex-row items-center"><Text className="mr-3 text-3xl">📍</Text><View><Label className="font-bold">{selected.short}</Label><Label className="text-xs">จ.นครศรีธรรมราช</Label></View></Card>
        <View className="mb-2 flex-row items-center justify-between rounded-2xl border border-red-100 bg-red-50 p-4"><View><Text className="text-xs font-semibold text-red-500">⚠  ความเสี่ยงพรุ่งนี้</Text><Text className="mt-1 text-3xl font-extrabold text-red-600">{selected.level}</Text></View><View className="h-20 w-20 items-center justify-center rounded-full border-[5px] border-red-400"><Text className="text-xl font-extrabold text-red-600">{selected.score}%</Text><Text className="text-[10px] text-red-500">/100</Text></View></View>
        <View className="mb-2 flex-row gap-2">{[['☔','ปริมาณฝน',selected.rain],['⌁','ระดับน้ำ',selected.water],['⚠','ประวัติน้ำท่วม',selected.history]].map(([icon, label, value]) => <View key={label} className="flex-1 rounded-xl border border-sky-100 bg-white p-3"><Text className="text-xl text-blue-500">{icon}</Text><Label className="mt-1 text-xs">{label}</Label><Label className="text-lg font-bold" style={label === 'ประวัติน้ำท่วม' ? { color: selected.color } : null}>{value}</Label></View>)}</View>
        <Label className="mb-2 mt-1 font-bold">ปัจจัยที่ใช้ในการประเมิน</Label>
        {[['📍','ปริมาณฝน (Rainfall)',`${selected.rain} (คาดการณ์)`],['♢','ระดับน้ำ (Water Level)',selected.water],['♙','ประวัติน้ำท่วม (Flood History)',selected.history],['◉','ความถี่การเกิดน้ำท่วมซ้ำ',selected.history]].map(([icon, label, value]) => <View key={label} className="flex-row items-center border-b border-sky-100 py-2"><Text className="mr-2 text-blue-600">{icon}</Text><Label className="flex-1 text-xs">{label}</Label><Text style={{ color: selected.color }} className="text-xs font-bold">{value}</Text></View>)}
        <Pressable onPress={() => setScreen('forecast')} className="mt-3 items-center rounded-full bg-[#1689df] py-3"><Text className="font-bold text-white">ดูรายละเอียดเพิ่มเติม</Text></Pressable>
      </ScrollView>
    </View>}

    {screen === 'forecast' && <View className="flex-1 px-4 pt-2">
      <Header title="ผลการพยากรณ์ล่วงหน้า 1 วัน" back onBack={goBack} />
      <ScrollView><Card className="mb-3 flex-row items-center"><Text className="mr-3 text-3xl">📍</Text><View><Label className="font-bold">{selected.short}</Label><Label className="text-xs">จ.นครศรีธรรมราช</Label></View></Card>
        <View className="mb-3 flex-row items-center justify-between rounded-2xl border border-red-100 bg-red-50 p-4"><View><Text className="text-xs font-semibold text-red-500">⚠  ความเสี่ยงน้ำท่วมพรุ่งนี้</Text><Text className="mt-1 text-3xl font-extrabold text-red-600">{selected.level}</Text></View><View className="h-20 w-20 items-center justify-center rounded-full border-[5px] border-red-400"><Text className="text-xl font-extrabold text-red-600">{selected.score}%</Text><Text className="text-[10px] text-red-500">/100</Text></View></View>
        <Card className="mb-3"><Label className="mb-3 font-bold">แนวโน้มความเสี่ยง <Text className="text-xs font-normal">(อีก 1 วันข้างหน้า)</Text></Label><View className="h-36 justify-end border-b border-l border-sky-200 px-3"><View className="absolute left-0 top-0 w-full border-t border-slate-100"/><View className="absolute left-0 top-1/2 w-full border-t border-slate-100"/><View className="flex-row items-end justify-around"><View className="h-10 w-2/5 border-t-2 border-red-400 bg-red-50"/><View className="h-24 w-2/5 border-t-2 border-red-500 bg-red-100"/></View></View><View className="mt-2 flex-row justify-around"><Label className="text-xs">วันนี้</Label><Label className="text-xs">พรุ่งนี้</Label></View></Card>
        <Card className="bg-sky-50"><Label className="font-bold">💡  คำแนะนำ</Label><Label className="mt-1 text-xs leading-5">พื้นที่มีความเสี่ยงน้ำท่วมสูงในวันพรุ่งนี้{ '\n' }ควรติดตามสถานการณ์และเตรียมรับมือ</Label></Card>
      </ScrollView>
    </View>}

    {screen === 'profile' && <View className="flex-1 px-4 pt-2"><Header title="" />
      <ScrollView><View className="mb-3 flex-row items-center"><View className="mr-4 h-16 w-16 items-center justify-center rounded-full bg-sky-100"><Text className="text-4xl">👤</Text></View><View className="flex-1"><Label className="font-bold">Guest</Label><Label className="text-xs">ผู้ใช้งานทั่วไป</Label></View><Pressable onPress={() => setHelpOpen(helpOpen === 'settings' ? '' : 'settings')}><Label className="text-2xl">⚙</Label></Pressable></View>
        <Card className="mb-3"><Label className="font-bold">เกี่ยวกับ Wetzy</Label><View className="my-2 flex-row items-center"><Text className="mr-3 text-5xl text-blue-500">◉</Text><View><Text className="text-2xl font-extrabold text-[#07539d]">Wetzy</Text><Text className="text-xs text-blue-700">Know Before It Flows.</Text></View></View><Label className="text-sm leading-6">Wetzy เป็นแอปพลิเคชันที่นำข้อมูลสภาพอากาศ ข้อมูลพื้นที่ และข้อมูลน้ำท่วมซ้ำมาวิเคราะห์เพื่อประเมินความเสี่ยงน้ำท่วมและช่วยให้คุณเตรียมตัวได้ล่วงหน้า</Label></Card>
        <Card><Label className="mb-2 font-bold">เมนูเพิ่มเติม</Label>{[['ⓘ','ช่วยเหลือ / คำถามที่พบบ่อย'],['ⓘ','เกี่ยวกับโครงการ'],['✉','ติดต่อเรา']].map(([icon, label]) => <Pressable key={label} onPress={() => setHelpOpen(helpOpen === label ? '' : label)} className="mb-1 flex-row items-center rounded-xl border border-sky-100 px-3 py-3"><Text className="mr-3 text-blue-500">{icon}</Text><Label className="flex-1 text-sm">{label}</Label><Label>›</Label>{helpOpen === label && <Label className="basis-full pt-2 text-xs">Wetzy Demo — ข้อมูลตัวอย่างสำหรับการนำเสนอ</Label>}</Pressable>)}</Card>
      </ScrollView>
    </View>}

    {screen === 'data' && <View className="flex-1 px-4 pt-2"><Header title="ข้อมูลพื้นที่" /><Label className="mb-3 text-sm">ภาพรวมความเสี่ยงในจังหวัดนครศรีธรรมราช</Label>{areas.map((area) => <Pressable key={area.name} onPress={() => openDetail(area, 'data')} className="mb-2 flex-row items-center rounded-xl border border-sky-100 bg-white p-3"><View className="mr-3 h-3 w-3 rounded-full" style={{ backgroundColor: area.color }}/><Label className="flex-1 text-sm">{area.short}</Label><Label className="mr-3 font-bold">{area.score}%</Label><Pill value={area.level}/></Pressable>)}</View>}

    <View className="flex-row border-t border-sky-100 bg-white px-1 pt-2">{tabs.map(([id, icon, label]) => <Pressable key={id} onPress={() => goTab(id)} className="min-h-12 flex-1 items-center py-1"><Text className={`text-xl ${screen === id || (['detail', 'map'].includes(screen) && id === 'areas') ? 'text-[#1689df]' : 'text-slate-500'}`}>{icon}</Text><Text className={`mt-0.5 text-[10px] ${screen === id || (['detail', 'map'].includes(screen) && id === 'areas') ? 'font-bold text-[#1689df]' : 'text-slate-500'}`}>{label}</Text></Pressable>)}</View>
  </SafeAreaView>;
}
