import { useCallback, useEffect, useMemo, useState } from 'react';
import { PanResponder, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams, usePathname } from 'expo-router';
import { ApiError, fetchArea, fetchAreas, fetchForecast } from '../services/api';
import { useStaffAuth } from '../contexts/StaffAuthContext';
import { tabRoutes } from './wetzy-data';
import { RiskMap } from './RiskMap';

const mainRoutes = new Set(tabRoutes);

function Label({ children, className = '', style }) { return <Text className={`text-[#0b3974] ${className}`} style={style}>{children}</Text>; }
function Card({ children, className = '' }) { return <View className={`rounded-2xl border border-sky-100 bg-white p-4 ${className}`}>{children}</View>; }
function Pill({ value }) {
  if (!value) return null;
  return <View className="rounded-full bg-sky-50 px-3 py-1"><Text className="text-xs font-bold text-[#0b3974]">{value}</Text></View>;
}
function Header({ title, back = true, right, onRight }) {
  return <View className="mb-3 min-h-11 flex-row items-center px-1">
    {back ? <Pressable accessibilityRole="button" accessibilityLabel="ย้อนกลับ" onPress={() => router.back()} className="mr-2 h-11 w-10 justify-center"><Text className="text-3xl leading-8 text-[#0b3974]">‹</Text></Pressable> : <View className="mr-2 w-10" />}
    <Label className="flex-1 text-lg font-bold">{title}</Label>
    {right ? <Pressable accessibilityRole="button" onPress={onRight} className="px-2 py-2"><Label className="font-semibold">{right}</Label></Pressable> : null}
  </View>;
}
function BottomTabs({ active }) {
  const tabs = [['/', '⌂', 'หน้าหลัก'], ['/areas', '◧', 'พื้นที่'], ['/data', '◉', 'ข้อมูล'], ['/profile', '♙', 'โปรไฟล์']];
  return <View className="flex-row border-t border-sky-100 bg-white px-1 pt-2">{tabs.map(([route, icon, title]) => {
    const selected = active === route || (active === '/map' && route === '/areas');
    return <Pressable key={route} onPress={() => router.replace(route)} accessibilityRole="tab" accessibilityState={{ selected }} className="min-h-12 flex-1 items-center py-1">
      <Text className={`text-xl ${selected ? 'text-[#1689df]' : 'text-slate-500'}`}>{icon}</Text><Text className={`mt-0.5 text-[10px] ${selected ? 'font-bold text-[#1689df]' : 'text-slate-500'}`}>{title}</Text>
    </Pressable>;
  })}</View>;
}
function StatusMessage({ title, message, onRetry }) {
  return <Card className="my-3 items-center">
    <Label className="text-center font-bold">{title}</Label>
    {message ? <Text className="mt-2 text-center text-sm text-slate-500">{message}</Text> : null}
    {onRetry ? <Pressable accessibilityRole="button" onPress={onRetry} className="mt-3 rounded-full bg-[#1689df] px-5 py-2"><Text className="font-bold text-white">ลองอีกครั้ง</Text></Pressable> : null}
  </Card>;
}
function BusyMessage() {
  return <StatusMessage title="กำลังโหลดข้อมูล..." />;
}
function displayAreaName(area) {
  return area?.short || area?.name || area?.district || 'ไม่มีข้อมูลชื่อพื้นที่';
}
function displayProbability(value) {
  return typeof value === 'number' && Number.isFinite(value) ? `${value}%` : 'ไม่มีข้อมูล';
}
function displayValue(value, unit = '') {
  if (value === null || value === undefined || value === '') return 'ไม่มีข้อมูล';
  return `${value}${unit}`;
}
function observedFloodStatus(area) {
  const observation = area?.observations;
  if (typeof observation?.flooded !== 'boolean') return 'ไม่มีข้อมูลย้อนหลัง';
  return observation.floodStatus || (observation.flooded ? 'ท่วม' : 'ไม่ท่วม');
}
function errorMessage(error) {
  return error instanceof ApiError ? error.message : 'เกิดข้อผิดพลาดในการโหลดข้อมูล';
}

export default function WetzyScreen({ screen }) {
  const pathname = usePathname();
  const params = useLocalSearchParams();
  const { user, isLoading: authLoading, sessionError, logout } = useStaffAuth();
  const [query, setQuery] = useState('');
  const [mapMode, setMapMode] = useState(true);
  const [helpOpen, setHelpOpen] = useState('');
  const [logoutError, setLogoutError] = useState('');
  const [areas, setAreas] = useState([]);
  const [areasLoading, setAreasLoading] = useState(true);
  const [areasError, setAreasError] = useState(null);
  const [areasReloadKey, setAreasReloadKey] = useState(0);
  const [detailRetryKey, setDetailRetryKey] = useState(0);
  const [detailResult, setDetailResult] = useState(null);
  const [forecastResult, setForecastResult] = useState(null);
  const requestedAreaId = Array.isArray(params.area) ? params.area[0] : params.area;

  const loadAreas = useCallback(async () => {
    setAreasLoading(true);
    setAreasError(null);
    setAreasReloadKey((key) => key + 1);
  }, []);

  useEffect(() => {
    let active = true;
    fetchAreas()
      .then((result) => { if (active) setAreas(result); })
      .catch((error) => { if (active) { setAreas([]); setAreasError(errorMessage(error)); } })
      .finally(() => { if (active) setAreasLoading(false); });
    return () => { active = false; };
  }, [areasReloadKey]);

  const selectedArea = useMemo(
    () => areas.find((area) => String(area.id) === String(requestedAreaId)) || null,
    [areas, requestedAreaId],
  );
  const areaRequestKey = selectedArea?.id ? `${screen}:${selectedArea.id}:${detailRetryKey}` : null;
  const currentDetail = detailResult?.key === areaRequestKey ? detailResult : null;
  const currentForecast = forecastResult?.key === areaRequestKey ? forecastResult : null;
  const activeArea = currentDetail?.area || selectedArea;
  const detailLoading = Boolean(areaRequestKey && !currentDetail);
  const forecastLoading = screen === 'forecast' && Boolean(areaRequestKey && !currentForecast);

  useEffect(() => {
    if (screen !== 'detail' && screen !== 'forecast') return undefined;
    if (!selectedArea?.id) return undefined;

    let active = true;

    fetchArea(selectedArea.id)
      .then((area) => { if (active) setDetailResult({ key: areaRequestKey, area }); })
      .catch((error) => { if (active) setDetailResult({ key: areaRequestKey, error: errorMessage(error) }); });

    if (screen === 'forecast') {
      fetchForecast(selectedArea.id)
        .then((result) => { if (active) setForecastResult({ key: areaRequestKey, forecast: result }); })
        .catch((error) => { if (active) setForecastResult({ key: areaRequestKey, error: errorMessage(error) }); });
    }

    return () => { active = false; };
  }, [screen, selectedArea?.id, areaRequestKey]);

  const filtered = useMemo(() => areas.filter((area) => (
    displayAreaName(area).includes(query) || String(area.district || '').includes(query)
  )), [areas, query]);
  const rankedAreas = useMemo(() => areas
    .filter((area) => typeof area.prediction?.riskProbabilityPercent === 'number'
      && Number.isFinite(area.prediction.riskProbabilityPercent))
    .sort((a, b) => b.prediction.riskProbabilityPercent - a.prediction.riskProbabilityPercent), [areas]);
  const provinces = useMemo(() => [...new Set(areas.map((area) => area.province).filter(Boolean))], [areas]);

  const openDetail = useCallback((area) => {
    if (!area?.id) return;
    router.push({ pathname: '/detail', params: { area: String(area.id) } });
  }, []);
  const retrySelectedArea = useCallback(() => {
    if (areasError) loadAreas();
    setDetailRetryKey((key) => key + 1);
  }, [areasError, loadAreas]);
  const handleLogout = useCallback(async () => {
    setLogoutError('');
    try {
      await logout();
    } catch {
      setLogoutError('ล้างสถานะในแอปแล้ว แต่ไม่สามารถบันทึกการออกจากระบบที่ Backend ได้');
    }
  }, [logout]);
  const panHandlers = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, g) => mainRoutes.has(pathname) && Math.abs(g.dx) > 18 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
    onPanResponderRelease: (_, g) => {
      if (!mainRoutes.has(pathname) || Math.abs(g.dx) < 60 || Math.abs(g.dx) < Math.abs(g.dy) * 1.5) return;
      const index = tabRoutes.indexOf(pathname);
      const next = g.dx < 0 ? Math.min(tabRoutes.length - 1, index + 1) : Math.max(0, index - 1);
      if (next !== index) router.replace(tabRoutes[next]);
    },
  }).panHandlers, [pathname]);

  const listStatus = areasLoading
    ? <BusyMessage />
    : areasError
      ? <StatusMessage title="โหลดข้อมูลพื้นที่ไม่สำเร็จ" message={areasError} onRetry={loadAreas} />
      : areas.length === 0
        ? <StatusMessage title="ไม่มีข้อมูลพื้นที่" message="ยังไม่มีข้อมูลจาก Backend" />
        : null;

  return <SafeAreaView className="flex-1 bg-[#f3faff]" edges={['top', 'bottom']} {...panHandlers}>
    <View className="flex-1">
      {screen === 'home' && <ScrollView className="flex-1" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: 20 }}>
        <View className="mb-4">
          <Text className="text-2xl font-extrabold tracking-tight text-[#07539d]">Wetzy</Text>
          <Label className="mt-1 text-sm">ข้อมูลความเสี่ยงจาก Backend</Label>
        </View>
        {listStatus || <>
          {rankedAreas.length > 0 ? <Pressable onPress={() => openDetail(rankedAreas[0])} accessibilityRole="button" className="mb-3 rounded-3xl bg-[#07539d] p-5">
            <View className="mb-3 flex-row items-center justify-between">
              <Text className="text-sm font-semibold text-sky-100">ผลประเมินที่มีข้อมูล</Text>
              <Pill value={rankedAreas[0].prediction?.riskLevel} />
            </View>
            <Text className="text-xl font-bold text-white">{displayAreaName(rankedAreas[0])}</Text>
            <View className="mt-4 flex-row items-end">
              <Text className="text-5xl font-extrabold text-white">{displayProbability(rankedAreas[0].prediction?.riskProbabilityPercent)}</Text>
              <Text className="mb-2 ml-auto text-sm font-semibold text-sky-100">ค่าจาก Backend</Text>
            </View>
            <Text className="mt-3 text-xs text-sky-100">{rankedAreas[0].prediction?.periodLabel || 'ช่วงเวลาพยากรณ์ไม่ได้ระบุ'}</Text>
          </Pressable> : <StatusMessage
            title="ยังไม่มีผลพยากรณ์จากโมเดล"
            message="สถานะน้ำท่วมที่แสดงเป็นข้อมูลย้อนหลังจาก Dataset ไม่ใช่การทำนาย"
          />}

          <View className="mb-5 flex-row gap-3">
            <Card className="flex-1 p-4">
              <Text className="text-xs text-slate-500">พื้นที่จาก Backend</Text>
              <Label className="mt-2 text-3xl font-extrabold">{areas.length}</Label>
            </Card>
            <Card className="flex-1 p-4">
              <Text className="text-xs text-slate-500">พื้นที่ที่มีผลพยากรณ์จากโมเดล</Text>
              <Label className="mt-2 text-3xl font-extrabold">{rankedAreas.length}</Label>
            </Card>
          </View>

          <View className="mb-3 flex-row items-center justify-between">
            <Label className="text-base font-bold">
              {rankedAreas.length > 0 ? 'พื้นที่ที่มีผลประเมิน' : 'สถานะน้ำท่วมล่าสุด (ข้อมูลย้อนหลัง)'}
            </Label>
            <Pressable onPress={() => router.push('/areas')} accessibilityRole="button" className="px-2 py-1">
              <Text className="text-sm font-semibold text-[#1689df]">ดูทั้งหมด →</Text>
            </Pressable>
          </View>
          {(rankedAreas.length > 0 ? rankedAreas : areas).slice(0, 3).map((area) => <Pressable
            key={area.id}
            onPress={() => openDetail(area)}
            accessibilityRole="button"
            className="mb-2 flex-row items-center rounded-2xl border border-sky-100 bg-white px-3 py-3"
          >
            <View className="mr-3 h-3 w-3 rounded-full bg-sky-500" />
            <View className="flex-1">
              <Label className="text-sm font-semibold">{displayAreaName(area)}</Label>
              <Text className="mt-1 text-xs text-slate-500">
                {area.prediction
                  ? displayProbability(area.prediction.riskProbabilityPercent)
                  : `ข้อมูลล่าสุด ${area.observations?.recordedAt || 'ไม่ระบุวันที่'}`}
              </Text>
            </View>
            <Pill value={area.prediction?.riskLevel || observedFloodStatus(area)} />
            <Text className="ml-2 text-lg text-blue-600">›</Text>
          </Pressable>)}
        </>}
      </ScrollView>}

      {screen === 'areas' && <View className="flex-1 px-4 pt-2">
        <Header title="เลือกพื้นที่" back={router.canGoBack()} right="แผนที่" onRight={() => router.push('/map')} />
        <Card className="mb-3 flex-row items-center bg-[#e4f5ff] py-3">
          <Text className="mr-3 text-3xl">📍</Text>
          <View><Label className="font-bold">{provinces.length === 1 ? provinces[0] : 'พื้นที่จากข้อมูลจริง'}</Label><Label className="text-xs text-slate-500">สถานะจาก Dataset ย้อนหลัง ไม่ใช่ผลพยากรณ์</Label></View>
        </Card>
        <View className="mb-2 flex-row items-center rounded-xl border border-sky-200 bg-white px-3"><Text className="mr-2 text-lg text-slate-400">⌕</Text><TextInput value={query} onChangeText={setQuery} placeholder="ค้นหาอำเภอ..." placeholderTextColor="#8ba2b8" className="h-11 flex-1 text-sm text-[#0b3974]" /></View>
        {listStatus || <ScrollView showsVerticalScrollIndicator={false}>
          {filtered.length === 0 ? <StatusMessage title="ไม่พบพื้นที่" /> : filtered.map((area) => <Pressable key={area.id} onPress={() => openDetail(area)} className="mb-2 flex-row items-center rounded-xl border border-sky-100 bg-white px-3 py-3"><Text className="mr-3 text-lg text-sky-500">●</Text><View className="flex-1"><Label className="text-sm font-semibold">{area.name || area.district}</Label><Text className="mt-1 text-xs text-slate-500">{area.observations?.recordedAt || ''}</Text></View><Pill value={area.prediction?.riskLevel || observedFloodStatus(area)}/><Text className="ml-3 text-xl text-blue-600">›</Text></Pressable>)}
        </ScrollView>}
      </View>}

      {screen === 'map' && <View className="flex-1 px-3 pt-2"><Header title="แผนที่พื้นที่" />
        <View className="mb-2 flex-row rounded-full border border-sky-200 bg-white p-1"><Pressable onPress={() => setMapMode(true)} className={`flex-1 items-center rounded-full py-2 ${mapMode ? 'bg-[#1689df]' : ''}`}><Text className={mapMode ? 'font-bold text-white' : 'text-blue-700'}>แผนที่</Text></Pressable><Pressable onPress={() => setMapMode(false)} className={`flex-1 items-center rounded-full py-2 ${!mapMode ? 'bg-[#1689df]' : ''}`}><Text className={!mapMode ? 'font-bold text-white' : 'text-blue-700'}>รายการพื้นที่</Text></Pressable></View>
        {listStatus || (mapMode
          ? <RiskMap areas={areas} onSelect={openDetail}/>
          : <ScrollView>{areas.map((area) => <Pressable key={area.id} onPress={() => openDetail(area)} className="mb-2 flex-row items-center justify-between rounded-xl border border-sky-100 bg-white p-3"><Label>{displayAreaName(area)}</Label><Pill value={area.prediction?.riskLevel || observedFloodStatus(area)}/></Pressable>)}</ScrollView>)}
      </View>}

      {screen === 'detail' && <View className="flex-1 px-4 pt-2"><Header title="รายละเอียดพื้นที่"/><ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 12 }}>
        {areasLoading || detailLoading
          ? <BusyMessage />
          : areasError || currentDetail?.error
            ? <StatusMessage title="โหลดรายละเอียดไม่สำเร็จ" message={areasError || currentDetail.error} onRetry={retrySelectedArea} />
            : !activeArea
              ? <StatusMessage title="ไม่มีข้อมูลพื้นที่" message="ไม่พบพื้นที่ที่เลือกในข้อมูลจาก Backend" />
              : <>
                <Card className="mb-2 flex-row items-center"><Text className="mr-3 text-3xl">📍</Text><View><Label className="font-bold">{displayAreaName(activeArea)}</Label><Label className="text-xs">{activeArea.province || 'ไม่มีข้อมูลจังหวัด'}</Label></View></Card>
                <View className="mb-2 rounded-2xl border border-sky-100 bg-white p-4">
                  <Text className="text-xs font-semibold text-slate-500">
                    {activeArea.prediction ? 'ผลพยากรณ์จากโมเดล' : 'สถานะน้ำท่วมที่บันทึก (ข้อมูลย้อนหลัง)'}
                  </Text>
                  {activeArea.prediction
                    ? <View className="mt-1 flex-row items-center justify-between"><Label className="text-2xl font-extrabold">{activeArea.prediction.riskLevel || 'ไม่มีข้อมูล'}</Label><Label className="text-xl font-extrabold">{displayProbability(activeArea.prediction.riskProbabilityPercent)}</Label></View>
                    : <Label className="mt-1 text-2xl font-extrabold">{observedFloodStatus(activeArea)}</Label>}
                  <Text className="mt-2 text-xs text-slate-500">
                    {activeArea.prediction?.periodLabel
                      || `ข้อมูลล่าสุด ${activeArea.observations?.recordedAt || 'ไม่ระบุวันที่'} · ไม่ใช่ผลพยากรณ์`}
                  </Text>
                </View>
                <View className="mb-2 flex-row gap-2">{[
                  ['☔', 'ปริมาณฝน', displayValue(activeArea.observations?.rainfallMm, ' mm')],
                  ['⌁', 'ระดับน้ำ', displayValue(activeArea.observations?.waterLevelM, ' m')],
                  ['⚠', 'เดือนที่พบว่าน้ำท่วม', displayValue(activeArea.observations?.floodHistory, ' เดือน')],
                ].map(([icon, label, value]) => <View key={label} className="flex-1 rounded-xl border border-sky-100 bg-white p-3"><Text className="text-xl text-blue-500">{icon}</Text><Label className="mt-1 text-xs">{label}</Label><Label className="text-base font-bold">{value}</Label></View>)}</View>
                <Pressable onPress={() => router.push({ pathname: '/forecast', params: { area: String(activeArea.id) } })} className="mt-3 items-center rounded-full bg-[#1689df] py-3"><Text className="font-bold text-white">ดูผลพยากรณ์</Text></Pressable>
              </>}
      </ScrollView></View>}

      {screen === 'forecast' && <View className="flex-1 px-4 pt-2"><Header title="ผลพยากรณ์พื้นที่" back={pathname !== '/forecast' || router.canGoBack?.()}/><ScrollView>
        {areasLoading || detailLoading || forecastLoading
          ? <BusyMessage />
          : areasError || currentDetail?.error || currentForecast?.error
            ? <StatusMessage title="โหลดผลพยากรณ์ไม่สำเร็จ" message={areasError || currentDetail?.error || currentForecast?.error} onRetry={retrySelectedArea} />
            : !activeArea || !currentForecast?.forecast
              ? <StatusMessage title="ไม่มีข้อมูลพยากรณ์" message="ยังไม่มีผลพยากรณ์จาก Backend" />
              : <>
                <Card className="mb-3 flex-row items-center"><Text className="mr-3 text-3xl">📍</Text><View><Label className="font-bold">{displayAreaName(activeArea)}</Label><Label className="text-xs">{activeArea.province || 'ไม่มีข้อมูลจังหวัด'}</Label></View></Card>
                <View className="mb-3 rounded-2xl border border-sky-100 bg-white p-4"><Text className="text-xs font-semibold text-slate-500">ผลพยากรณ์จาก Backend</Text><View className="mt-1 flex-row items-center justify-between"><Label className="text-2xl font-extrabold">{currentForecast.forecast.riskLevel || 'ไม่มีข้อมูล'}</Label><Label className="text-xl font-extrabold">{displayProbability(currentForecast.forecast.riskProbabilityPercent)}</Label></View><Text className="mt-2 text-xs text-slate-500">{currentForecast.forecast.periodLabel || 'ไม่มีข้อมูลช่วงเวลาพยากรณ์'}</Text></View>
                <Card className="bg-sky-50"><Label className="font-bold">ข้อมูลเพิ่มเติม</Label><Label className="mt-1 text-xs leading-5">{currentForecast.forecast.advice || 'ไม่มีคำแนะนำจาก Backend'}</Label></Card>
              </>}
      </ScrollView></View>}

      {screen === 'data' && <ScrollView className="flex-1 px-4 pt-3"><Header title="ข้อมูลพื้นที่" back={false}/><Label className="mb-3 text-sm">ผลลัพธ์ที่ได้รับจาก Backend</Label>
        {listStatus || areas.map((area) => <Pressable key={area.id} onPress={() => openDetail(area)} className="mb-2 flex-row items-center rounded-xl border border-sky-100 bg-white p-3"><View className="mr-3 h-3 w-3 rounded-full bg-sky-500"/><View className="flex-1"><Label className="text-sm">{displayAreaName(area)}</Label><Text className="mt-1 text-xs text-slate-500">{area.observations?.recordedAt || ''}</Text></View><Pill value={area.prediction?.riskLevel || observedFloodStatus(area)}/></Pressable>)}
      </ScrollView>}

      {screen === 'profile' && <ScrollView className="flex-1 px-4 pt-3" contentContainerStyle={{ paddingBottom: 16 }}>
        <Header title="โปรไฟล์" back={false}/>
        <Card className="mb-3">
          <Label className="mb-3 font-bold">บัญชีพนักงาน</Label>
          {authLoading
            ? <Label className="text-sm">กำลังตรวจสอบสถานะบัญชี...</Label>
            : user
              ? <>
                <View className="mb-3 flex-row items-center">
                  <View className="mr-3 h-12 w-12 items-center justify-center rounded-full bg-sky-100">
                    <Text className="text-xl text-[#1689df]">♙</Text>
                  </View>
                  <View className="flex-1">
                    <Label className="font-bold">{user.username}</Label>
                    <Text className="mt-1 text-sm text-slate-500">{user.email}</Text>
                  </View>
                </View>
                <View className="mb-3 self-start rounded-full bg-sky-50 px-3 py-1">
                  <Text className="text-xs font-bold text-[#07539d]">
                    {user.role === 'superadmin' ? 'Superadmin' : 'Admin'}
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  onPress={handleLogout}
                  className="min-h-11 items-center justify-center rounded-xl border border-sky-200 bg-white px-4"
                >
                  <Text className="font-bold text-[#07539d]">ออกจากระบบ</Text>
                </Pressable>
                {logoutError ? <Text accessibilityRole="alert" className="mt-2 text-sm text-red-700">{logoutError}</Text> : null}
              </>
              : <Pressable
                accessibilityRole="button"
                onPress={() => router.push('/staff-login')}
                className="min-h-12 flex-row items-center justify-center rounded-xl bg-[#1689df] px-4"
              >
                <Text className="mr-2 text-lg text-white">◈</Text>
                <Text className="font-bold text-white">เข้าสู่ระบบพนักงาน</Text>
              </Pressable>}
          {!authLoading && sessionError && !user
            ? <Text accessibilityRole="alert" className="mt-2 text-sm text-red-700">{sessionError}</Text>
            : null}
        </Card>
        <Card className="mb-3">
          <Label className="mb-2 font-bold">เกี่ยวกับ Wetzy</Label>
          <Label className="mb-3 text-sm leading-6">
            ติดตามข้อมูลพื้นที่และความเสี่ยงน้ำท่วมจากแหล่งข้อมูลที่เชื่อมต่อ
          </Label>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/about')}
            className="min-h-10 flex-row items-center"
          >
            <Label className="flex-1 text-sm font-semibold">ข้อมูลโครงการ</Label>
            <Label className="text-xl">›</Label>
          </Pressable>
        </Card>
      </ScrollView>}

      {screen === 'about' && <ScrollView className="flex-1 px-4 pt-3"><Header title="เกี่ยวกับ Wetzy" back={false}/><Card className="mb-3"><View className="my-2 flex-row items-center"><Text className="mr-3 text-5xl text-blue-500">◉</Text><View><Text className="text-2xl font-extrabold text-[#07539d]">Wetzy</Text><Text className="text-xs text-blue-700">Know Before It Flows.</Text></View></View><Label className="text-sm leading-6">แอปแสดงข้อมูลพื้นที่และผลพยากรณ์ที่ได้รับจาก Backend โดยไม่สร้างผลประเมินขึ้นในแอป</Label></Card><Card><Label className="mb-2 font-bold">ข้อมูลโครงการ</Label>{[['ⓘ', 'วัตถุประสงค์', 'ติดตามข้อมูลความเสี่ยงน้ำท่วมจากแหล่งข้อมูลที่เชื่อมต่อ'], ['◉', 'การประเมินความเสี่ยง', 'แสดงผลตามข้อมูลที่ Backend ส่งกลับ'], ['⌖', 'พื้นที่ศึกษา', 'รายชื่อพื้นที่โหลดจาก Backend']].map(([icon, title, description]) => <Pressable key={title} onPress={() => setHelpOpen(helpOpen === title ? '' : title)} className="mb-2 flex-row items-center rounded-xl border border-sky-100 px-3 py-3"><Text className="mr-3 text-blue-500">{icon}</Text><Label className="flex-1 text-sm">{title}</Label><Label>›</Label>{helpOpen === title ? <Label className="basis-full pt-2 text-xs">{description}</Label> : null}</Pressable>)}</Card></ScrollView>}
    </View>
    <BottomTabs active={pathname}/>
  </SafeAreaView>;
}
