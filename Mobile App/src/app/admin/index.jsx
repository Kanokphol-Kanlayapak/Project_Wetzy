import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { fetchAdminOverview } from '../../services/api';
import { useAsyncData } from '../../hooks/use-async-data';
import { Badge, Button, Card, ErrorBanner, SectionTitle, Spinner, StatCard, formatDate, formatNumber } from '../../components/admin/ui';
import { useStaffAuth } from '../../contexts/StaffAuthContext';
import { useIsCompact, useIsRoomy } from '../../components/admin/AdminShell';

function StatusRow({ label, ok, detail }) {
  return (
    <View className="flex-row items-center justify-between border-b border-slate-50 py-3">
      <View className="flex-1 pr-3">
        <Text className="font-semibold text-[#0b3974]">{label}</Text>
        {detail ? <Text numberOfLines={2} className="mt-0.5 text-xs text-slate-400">{detail}</Text> : null}
      </View>
      <Badge tone={ok ? 'green' : 'amber'}>{ok ? 'ปกติ' : 'ต้องตรวจสอบ'}</Badge>
    </View>
  );
}

export default function AdminDashboard() {
  const { user } = useStaffAuth();
  const compact = useIsCompact();
  const roomy = useIsRoomy();
  const statWidth = roomy ? '23.5%' : '48.5%';
  const halfWidth = roomy ? '49%' : '100%';
  const { data, error, reload: load } = useAsyncData(fetchAdminOverview, 'โหลดข้อมูลภาพรวมไม่สำเร็จ');

  return (
    <View>
      <SectionTitle title={`สวัสดี ${user?.username}`} subtitle="ภาพรวมระบบ Wetzy" right={<Button label="รีเฟรช" variant="secondary" size={compact ? 'sm' : 'md'} onPress={load} />} />
      <ErrorBanner message={error} onRetry={load} />
      {!data && !error ? <Spinner /> : null}
      {data ? (
        <>
          <View className={`mb-1 flex-row flex-wrap ${compact ? 'justify-between' : 'mb-4 gap-3'}`}>
            <StatCard compact={compact} width={statWidth} icon="♙" label="ผู้ใช้ทั้งหมด" value={formatNumber(data.users.total)} hint={`ใช้งานอยู่ ${formatNumber(data.users.active)} คน`} />
            <StatCard compact={compact} width={statWidth} icon="◈" label="ทีมผู้ดูแล" value={formatNumber(data.users.staff)} hint="Admin + Superadmin" />
            <StatCard compact={compact} width={statWidth} icon="▤" label="ชุดข้อมูลพร้อมใช้" value={formatNumber(data.datasets.ready)} hint={`ทั้งหมด ${formatNumber(data.datasets.total)} ชุด`} />
            <StatCard compact={compact} width={statWidth} icon="≣" label="แถวข้อมูลในระบบ" value={formatNumber(data.datasets.records)} hint="จากชุดที่นำเข้าแล้ว" />
          </View>

          <View className={`mb-1 flex-row flex-wrap ${compact ? 'justify-between' : 'mb-4 gap-3'}`}>
            <Card style={compact ? { width: halfWidth } : undefined} className={compact ? 'mb-3' : 'min-w-[280px] flex-1'}>
              <Text className="mb-1 font-extrabold text-[#0b3974]">สถานะบริการ</Text>
              <StatusRow label="MongoDB" ok detail="Wetzy_DB" />
              <StatusRow label="ML Service" ok={data.mlService.reachable} detail={data.mlService.reachable ? data.mlService.status : data.mlService.error} />
              <StatusRow label="ชุดข้อมูลของ ML" ok={data.mlService.datasetAvailable} />
              <StatusRow label="โมเดลพยากรณ์" ok={data.mlService.modelAvailable} detail={data.mlService.modelAvailable ? '' : 'ยังไม่มีไฟล์โมเดล'} />
            </Card>
            <Card style={compact ? { width: halfWidth } : undefined} className={compact ? 'mb-3 justify-between' : 'min-w-[280px] flex-1 justify-between'}>
              <View>
                <Text className="mb-1 font-extrabold text-[#0b3974]">เริ่มต้นใช้งานด่วน</Text>
                <Text className="mb-4 text-sm leading-6 text-slate-500">นำเข้าไฟล์ CSV ของฝน น้ำท่วม ความชื้น ระดับน้ำ หรือชุดข้อมูลรวม เข้าสู่ MongoDB ได้ด้วยตัวเอง</Text>
              </View>
              <Button label="＋ นำเข้าชุดข้อมูลใหม่" onPress={() => router.push('/admin/datasets')} />
            </Card>
          </View>

          <Card>
            <View className="mb-2 flex-row items-center justify-between">
              <Text className="font-extrabold text-[#0b3974]">กิจกรรมล่าสุด</Text>
              <Button label="ดูทั้งหมด" variant="ghost" size="sm" onPress={() => router.push('/admin/logs')} />
            </View>
            {data.recentLogs.length === 0 ? <Text className="py-4 text-sm text-slate-400">ยังไม่มีกิจกรรม</Text> : data.recentLogs.map((log) => (
              <View key={log.id} className="flex-row items-center justify-between border-b border-slate-50 py-2.5">
                <View className="flex-1 pr-2">
                  <Text numberOfLines={1} className="text-sm font-semibold text-[#0b3974]">{log.action}</Text>
                  <Text className="text-xs text-slate-400">{log.username || '—'} · {formatDate(log.timestamp)}</Text>
                </View>
                <Badge tone={log.status === 'success' ? 'green' : 'red'}>{log.status === 'success' ? 'สำเร็จ' : 'ล้มเหลว'}</Badge>
              </View>
            ))}
          </Card>
        </>
      ) : null}
    </View>
  );
}