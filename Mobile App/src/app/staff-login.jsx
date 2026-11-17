import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ApiError } from '../services/api';
import { useStaffAuth } from '../contexts/StaffAuthContext';

export default function StaffLoginRoute() {
  const { user, isLoading, login } = useStaffAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!isLoading && user) router.replace('/profile');
  }, [isLoading, user]);

  async function handleLogin() {
    if (isSubmitting || !identifier.trim() || !password) return;

    setIsSubmitting(true);
    setErrorMessage('');
    try {
      await login(identifier.trim(), password);
      router.replace('/profile');
    } catch (error) {
      setErrorMessage(error instanceof ApiError
        ? error.message
        : 'เข้าสู่ระบบไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง');
    } finally {
      setIsSubmitting(false);
    }
  }

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/profile');
  }

  return (
    <SafeAreaView className="flex-1 bg-[#f3faff]" edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 20 }}
          keyboardShouldPersistTaps="handled"
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="ย้อนกลับ"
            onPress={goBack}
            className="mb-6 h-11 w-11 items-center justify-center rounded-full border border-sky-100 bg-white"
          >
            <Text className="text-3xl leading-8 text-[#07539d]">‹</Text>
          </Pressable>

          <View className="mb-6 items-center">
            <View className="mb-4 h-16 w-16 items-center justify-center rounded-2xl bg-[#07539d]">
              <Text className="text-3xl text-white">◈</Text>
            </View>
            <Text className="text-3xl font-extrabold tracking-tight text-[#07539d]">Wetzy</Text>
            <Text className="mt-2 text-lg font-bold text-[#0b3974]">เข้าสู่ระบบพนักงาน</Text>
            <Text className="mt-1 text-center text-sm text-slate-500">
              สำหรับผู้ดูแลระบบเท่านั้น
            </Text>
          </View>

          <View className="rounded-3xl border border-sky-100 bg-white p-5 shadow-sm">
            <Text className="mb-2 text-sm font-semibold text-[#0b3974]">Username หรือ Email</Text>
            <TextInput
              value={identifier}
              onChangeText={setIdentifier}
              placeholder="กรอก Username หรือ Email"
              placeholderTextColor="#8ba2b8"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="username"
              textContentType="username"
              keyboardType="email-address"
              editable={!isSubmitting}
              returnKeyType="next"
              className="mb-5 h-12 rounded-xl border border-sky-100 bg-[#f8fcff] px-4 text-base text-[#0b3974]"
            />

            <Text className="mb-2 text-sm font-semibold text-[#0b3974]">รหัสผ่าน</Text>
            <View className="mb-4 h-12 flex-row items-center rounded-xl border border-sky-100 bg-[#f8fcff]">
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="กรอกรหัสผ่าน"
                placeholderTextColor="#8ba2b8"
                secureTextEntry={!passwordVisible}
                autoComplete="current-password"
                textContentType="password"
                editable={!isSubmitting}
                returnKeyType="go"
                onSubmitEditing={handleLogin}
                className="h-full flex-1 px-4 text-base text-[#0b3974]"
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={passwordVisible ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                onPress={() => setPasswordVisible((visible) => !visible)}
                className="px-4 py-3"
              >
                <Text className="text-sm font-semibold text-[#1689df]">
                  {passwordVisible ? 'ซ่อน' : 'แสดง'}
                </Text>
              </Pressable>
            </View>

            {errorMessage ? (
              <View accessibilityRole="alert" className="mb-4 rounded-xl bg-red-50 px-3 py-3">
                <Text className="text-sm leading-5 text-red-700">{errorMessage}</Text>
              </View>
            ) : null}

            <Pressable
              accessibilityRole="button"
              disabled={isSubmitting || isLoading || !identifier.trim() || !password}
              onPress={handleLogin}
              className={`min-h-12 flex-row items-center justify-center rounded-xl px-4 ${
                isSubmitting || isLoading || !identifier.trim() || !password
                  ? 'bg-sky-300'
                  : 'bg-[#1689df]'
              }`}
            >
              {isSubmitting ? <ActivityIndicator color="white" /> : (
                <Text className="font-bold text-white">เข้าสู่ระบบ</Text>
              )}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
