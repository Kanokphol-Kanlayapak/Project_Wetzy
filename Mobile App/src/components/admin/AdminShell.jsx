import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { router, usePathname } from 'expo-router';
import { useStaffAuth } from '../../contexts/StaffAuthContext';
import { Badge } from './ui';

const NAV = [
  { href: '/admin', icon: '◈', label: 'ภาพรวม' },
  { href: '/admin/datasets', icon: '▤', label: 'ชุดข้อมูล' },
  { href: '/admin/users', icon: '♙', label: 'ผู้ใช้' },
  { href: '/admin/logs', icon: '☰', label: 'บันทึกระบบ' },
];
export const WIDE_BREAKPOINT = 900;
export const FORCE_MOBILE = false;
export const MOBILE_MAX_WIDTH = 860;

const pressFeedback = ({ pressed }) => (
  pressed ? { opacity: 0.82, transform: [{ scale: 0.98 }] } : undefined
);

// true when the centered column is wide enough (>= 640px) to put cards side by side
export function useIsRoomy() {
  const { width } = useWindowDimensions();
  return Math.min(width, MOBILE_MAX_WIDTH) >= 640;
}

export function useIsCompact() {
  const { width } = useWindowDimensions();
  return FORCE_MOBILE || width < WIDE_BREAKPOINT;
}

function isActive(pathname, href) {
  return href === '/admin' ? pathname === '/admin' || pathname === '/admin/' : pathname.startsWith(href);
}

export function AdminShell({ children }) {
  const compact = useIsCompact();
  const pathname = usePathname();
  const { user, logout } = useStaffAuth();
  const wide = !compact;
  const [menuOpen, setMenuOpen] = useState(false);

  async function handleLogout() {
    try { await logout(); } finally { router.replace('/staff-login'); }
  }

  const identity = (
    <View className="flex-row items-center">
      <View className="mr-3 h-10 w-10 items-center justify-center rounded-full bg-sky-100">
        <Text className="font-bold text-[#07539d]">{(user?.username || '?').slice(0, 1).toUpperCase()}</Text>
      </View>
      <View>
        <Text className="font-bold text-[#0b3974]">{user?.username}</Text>
        <Badge tone="blue">{user?.role === 'superadmin' ? 'Superadmin' : 'Admin'}</Badge>
      </View>
    </View>
  );

  if (wide) {
    return (
      <SafeAreaView className="flex-1 bg-[#f3faff]" edges={['top', 'bottom']}>
        <View className="flex-1 flex-row">
          <View className="w-64 border-r border-sky-100 bg-white p-4">
            <View className="mb-6 flex-row items-center">
              <Image source={require('../../../assets/images/wetzy-logo.png')} contentFit="contain" accessibilityLabel="โลโก้ Wetzy" style={{ width: 44, height: 44, marginRight: 10 }} />
              <View>
                <Text className="text-xl font-extrabold text-[#07539d]">Wetzy</Text>
                <Text className="text-xs text-slate-500">ระบบจัดการหลังบ้าน</Text>
              </View>
            </View>
            <View className="flex-1">
              {NAV.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <Pressable
                    key={item.href}
                    accessibilityRole="link"
                    accessibilityState={{ selected: active }}
                    onPress={() => router.replace(item.href)}
                    style={pressFeedback}
                    className={`mb-1 min-h-11 flex-row items-center rounded-xl px-3 ${active ? 'bg-[#1689df]' : 'bg-transparent hover:bg-sky-50'}`}
                  >
                    <Text className={`mr-3 text-lg ${active ? 'text-white' : 'text-[#1689df]'}`}>{item.icon}</Text>
                    <Text className={`font-semibold ${active ? 'text-white' : 'text-[#0b3974]'}`}>{item.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <View className="border-t border-sky-100 pt-4">
              <View className="mb-3">{identity}</View>
              <Pressable onPress={() => router.replace('/profile')} className="min-h-10 justify-center"><Text className="text-sm font-semibold text-[#1689df]">← กลับไปหน้าแอป</Text></Pressable>
              <Pressable onPress={handleLogout} className="min-h-10 justify-center"><Text className="text-sm font-semibold text-red-600">ออกจากระบบ</Text></Pressable>
            </View>
          </View>
          <ScrollView className="flex-1" contentContainerStyle={{ padding: 28 }}>
            <View className="w-full max-w-[1100px] self-center">{children}</View>
          </ScrollView>
        </View>
      </SafeAreaView>
    );
  }

  // ---------- Phone layout ----------
  const activeItem = NAV.find((item) => isActive(pathname, item.href)) || NAV[0];
  return (
    <SafeAreaView className="flex-1 bg-slate-200" edges={['top', 'bottom']}>
     <View
        style={{ width: '100%', maxWidth: MOBILE_MAX_WIDTH, alignSelf: 'center' }}
        className="flex-1 overflow-hidden bg-[#f3faff]"
      >
      {/* App bar: logo + current page, avatar opens the account menu */}
      <View className="flex-row items-center justify-between border-b border-sky-100 bg-white px-4 py-2.5">
        <View className="flex-1 flex-row items-center pr-3">
          <Image source={require('../../../assets/images/wetzy-logo.png')} contentFit="contain" accessibilityLabel="โลโก้ Wetzy" style={{ width: 38, height: 38, marginRight: 10 }} />
          <View className="flex-1">
            <Text className="text-base font-extrabold leading-5 text-[#07539d]">Wetzy</Text>
            <Text numberOfLines={1} className="text-xs text-slate-500">{activeItem.label} · ระบบจัดการหลังบ้าน</Text>
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="เมนูบัญชี"
          onPress={() => setMenuOpen(true)}
          style={pressFeedback}
          className="h-11 w-11 items-center justify-center rounded-full bg-sky-100"
        >
          <Text className="text-base font-bold text-[#07539d]">{(user?.username || '?').slice(0, 1).toUpperCase()}</Text>
        </Pressable>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 28 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>

      {/* Bottom tab bar */}
      <View accessibilityRole="tablist" className="flex-row border-t border-sky-100 bg-white px-1 pt-1">
        {NAV.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Pressable
              key={item.href}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              onPress={() => router.replace(item.href)}
              style={pressFeedback}
              className="min-h-14 flex-1 items-center justify-center pb-1 hover:bg-sky-50"
            >
              <View className={`h-7 w-14 items-center justify-center rounded-full ${active ? 'bg-sky-100' : 'bg-transparent'}`}>
                <Text className={`text-lg ${active ? 'text-[#1689df]' : 'text-slate-400'}`}>{item.icon}</Text>
              </View>
              <Text numberOfLines={1} className={`mt-0.5 text-[11px] font-semibold ${active ? 'text-[#07539d]' : 'text-slate-400'}`}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* Account menu (bottom sheet) */}
      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable className="flex-1 justify-end bg-black/40" onPress={() => setMenuOpen(false)}>
          <Pressable style={{ width: '100%', maxWidth: MOBILE_MAX_WIDTH, alignSelf: 'center' }} className="rounded-t-3xl bg-white px-5 pb-8 pt-3" onPress={() => {}}>
            <View className="mb-4 h-1 w-10 self-center rounded-full bg-slate-200" />
            <View className="mb-3 border-b border-sky-100 pb-4">{identity}</View>
            <Pressable
              onPress={() => { setMenuOpen(false); router.replace('/profile'); }}
              className="min-h-12 justify-center"
            >
              <Text className="text-base font-semibold text-[#1689df]">← กลับไปหน้าแอป</Text>
            </Pressable>
            <Pressable
              onPress={() => { setMenuOpen(false); handleLogout(); }}
              className="min-h-12 justify-center"
            >
              <Text className="text-base font-semibold text-red-600">ออกจากระบบ</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
     </View>
    </SafeAreaView>
  );
}