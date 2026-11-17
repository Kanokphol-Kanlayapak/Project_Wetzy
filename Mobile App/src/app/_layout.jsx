import '../global.css';
import { Stack } from 'expo-router';
import { StaffAuthProvider } from '../contexts/StaffAuthContext';

export default function RootLayout() {
  return (
    <StaffAuthProvider>
      <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }} />
    </StaffAuthProvider>
  );
}
