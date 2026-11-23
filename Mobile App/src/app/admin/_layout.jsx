import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Slot, router } from 'expo-router';
import { useStaffAuth } from '../../contexts/StaffAuthContext';
import { AdminShell } from '../../components/admin/AdminShell';

// Route guard: every /admin/* screen requires a signed-in staff account.
// (The Backend independently enforces roles on every request.)
export default function AdminLayout() {
  const { user, isLoading } = useStaffAuth();

  useEffect(() => {
    if (!isLoading && !user) router.replace('/staff-login');
  }, [isLoading, user]);

  if (isLoading || !user) {
    return (
      <View className="flex-1 items-center justify-center bg-[#f3faff]">
        <ActivityIndicator color="#1689df" />
      </View>
    );
  }

  return <AdminShell><Slot /></AdminShell>;
}
