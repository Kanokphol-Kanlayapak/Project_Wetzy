import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { fetchAdminLogs } from '../../services/api';
import { useAsyncData } from '../../hooks/use-async-data';
import { Badge, Button, Card, Chips, DataTable, EmptyState, ErrorBanner, SectionTitle, Spinner, formatDate } from '../../components/admin/ui';

const COLUMNS = [
  { key: 'timestamp', title: 'เวลา', width: 170, render: (log) => <Text className="text-sm text-slate-500">{formatDate(log.timestamp)}</Text> },
  { key: 'username', title: 'ผู้ใช้', width: 140 },
  { key: 'role', title: 'บทบาท', width: 110 },
  { key: 'action', title: 'การกระทำ', width: 280 },
  { key: 'status', title: 'ผลลัพธ์', width: 110, render: (log) => <Badge tone={log.status === 'success' ? 'green' : 'red'}>{log.status === 'success' ? 'สำเร็จ' : 'ล้มเหลว'}</Badge> },
];

export default function AdminLogs() {
  const [status, setStatus] = useState('');
  const fetchLogs = useCallback(() => fetchAdminLogs(status), [status]);
  const { data: logs, error, reload: load } = useAsyncData(fetchLogs, 'โหลดบันทึกระบบไม่สำเร็จ');

  return (
    <View>
      <SectionTitle title="บันทึกระบบ" subtitle="ประวัติการเข้าสู่ระบบและการจัดการข้อมูลล่าสุด 100 รายการ" right={<Button label="รีเฟรช" variant="secondary" onPress={load} />} />
      <Card>
        <Chips value={status} onChange={setStatus} options={[{ value: '', label: 'ทั้งหมด' }, { value: 'success', label: 'สำเร็จ' }, { value: 'failure', label: 'ล้มเหลว' }]} />
        <ErrorBanner message={error} onRetry={load} />
        {logs === null && !error ? <Spinner /> : logs?.length === 0
          ? <EmptyState icon="☰" title="ยังไม่มีบันทึก" />
          : logs ? <DataTable columns={COLUMNS} rows={logs} keyExtractor={(log) => log.id} /> : null}
      </Card>
    </View>
  );
}
