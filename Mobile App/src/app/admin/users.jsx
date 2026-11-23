import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { createAdminUser, fetchUsers, setUserRole, setUserStatus } from '../../services/api';
import { useStaffAuth } from '../../contexts/StaffAuthContext';
import { useAsyncData } from '../../hooks/use-async-data';
import { Badge, Button, Card, Chips, ErrorBanner, SectionTitle, Spinner, TextField, EmptyState, formatDate } from '../../components/admin/ui';

const ROLE_LABEL = { superadmin: ['blue', 'Superadmin'], admin: ['blue', 'Admin'], user: ['slate', 'ผู้ใช้'] };

function CreateAdminCard({ onCreated }) {
  const [form, setForm] = useState({ username: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const set = (key) => (value) => setForm((current) => ({ ...current, [key]: value }));
  const valid = form.username.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()) && form.password.length >= 12;

  async function submit() {
    setBusy(true); setError(''); setDone('');
    try {
      await createAdminUser({ username: form.username.trim(), email: form.email.trim(), password: form.password });
      setDone(`สร้างแอดมิน "${form.username.trim()}" แล้ว`);
      setForm({ username: '', email: '', password: '' });
      onCreated();
    } catch (e) { setError(e.message || 'สร้างบัญชีไม่สำเร็จ'); } finally { setBusy(false); }
  }

  return (
    <Card className="mb-5">
      <Text className="mb-3 text-base font-extrabold text-[#0b3974]">เพิ่มผู้ดูแลระบบ (Superadmin)</Text>
      <TextField label="Username" value={form.username} onChangeText={set('username')} />
      <TextField label="Email" value={form.email} onChangeText={set('email')} keyboardType="email-address" />
      <TextField label="รหัสผ่าน" value={form.password} onChangeText={set('password')} secureTextEntry hint="อย่างน้อย 12 ตัวอักษร" />
      <ErrorBanner message={error} />
      {done ? <Text className="mb-3 text-sm font-semibold text-emerald-700">✓ {done}</Text> : null}
      <Button label="สร้างบัญชีแอดมิน" onPress={submit} disabled={!valid} loading={busy} />
    </Card>
  );
}

function UserRow({ account, viewerIsSuper, onChanged, onError }) {
  const [busy, setBusy] = useState(false);
  const [tone, roleLabel] = ROLE_LABEL[account.role] || ['slate', account.role];
  const protectedAccount = account.role === 'superadmin';

  async function run(action) {
    setBusy(true);
    try { await action(); await onChanged(); } catch (e) { onError(e.message || 'ดำเนินการไม่สำเร็จ'); } finally { setBusy(false); }
  }

  return (
    <View className="border-b border-slate-100 py-3">
      <View className="flex-row items-start justify-between">
        <View className="flex-1 pr-3">
          <Text className="font-bold text-[#0b3974]">{account.username}</Text>
          <Text className="text-xs text-slate-500">{account.email}</Text>
          <Text className="text-xs text-slate-400">สมัครเมื่อ {formatDate(account.createdAt)}</Text>
        </View>
        <View className="items-end gap-1">
          <Badge tone={tone}>{roleLabel}</Badge>
          <Badge tone={account.isActive ? 'green' : 'red'}>{account.isActive ? 'ใช้งานได้' : 'ถูกระงับ'}</Badge>
        </View>
      </View>
      {!protectedAccount ? (
        <View className="mt-2 flex-row flex-wrap gap-2">
          <Button
            label={account.isActive ? 'ระงับบัญชี' : 'เปิดใช้งาน'} variant={account.isActive ? 'secondary' : 'primary'}
            onPress={() => run(() => setUserStatus(account.id, !account.isActive))} loading={busy}
          />
          {viewerIsSuper ? (
            <Button
              label={account.role === 'admin' ? 'ลดเป็นผู้ใช้' : 'เลื่อนเป็นแอดมิน'} variant="secondary"
              onPress={() => run(() => setUserRole(account.id, account.role === 'admin' ? 'user' : 'admin'))} disabled={busy}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export default function AdminUsers() {
  const { user } = useStaffAuth();
  const viewerIsSuper = user?.role === 'superadmin';
  const { data: users, error, reload: load, setError } = useAsyncData(fetchUsers, 'โหลดรายชื่อผู้ใช้ไม่สำเร็จ');
  const [query, setQuery] = useState('');
  const [role, setRole] = useState('all');

  const visible = useMemo(() => (users || []).filter((account) => (
    (role === 'all' || account.role === role)
    && (!query.trim() || `${account.username} ${account.email}`.toLowerCase().includes(query.trim().toLowerCase()))
  )), [users, query, role]);

  return (
    <View>
      <SectionTitle title="ผู้ใช้งาน" subtitle={viewerIsSuper ? 'จัดการผู้ใช้และผู้ดูแลทั้งหมด' : 'จัดการสถานะบัญชีผู้ใช้'} />
      {viewerIsSuper ? <CreateAdminCard onCreated={load} /> : null}
      <Card>
        <TextField value={query} onChangeText={setQuery} placeholder="ค้นหาด้วยชื่อหรืออีเมล" className="mb-3" />
        {viewerIsSuper ? <Chips value={role} onChange={setRole} options={[{ value: 'all', label: 'ทั้งหมด' }, { value: 'user', label: 'ผู้ใช้' }, { value: 'admin', label: 'Admin' }, { value: 'superadmin', label: 'Superadmin' }]} /> : null}
        <ErrorBanner message={error} onRetry={load} />
        {users === null && !error ? <Spinner /> : visible.length === 0
          ? <EmptyState icon="♙" title="ไม่พบผู้ใช้" subtitle="ลองเปลี่ยนคำค้นหาหรือตัวกรอง" />
          : visible.map((account) => <UserRow key={account.id} account={account} viewerIsSuper={viewerIsSuper} onChanged={load} onError={setError} />)}
      </Card>
    </View>
  );
}
