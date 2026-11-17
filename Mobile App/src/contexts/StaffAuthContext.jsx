import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  clearStaffToken,
  fetchStaffProfile,
  getStaffToken,
  loginStaff as requestStaffLogin,
  logoutStaff as requestStaffLogout,
  saveStaffToken,
} from '../services/api';

const StaffAuthContext = createContext(null);

export function StaffAuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionError, setSessionError] = useState('');
  const [expiresAt, setExpiresAt] = useState(null);

  useEffect(() => {
    let active = true;

    async function restoreSession() {
      try {
        const token = await getStaffToken();
        if (!token) return;

        const session = await fetchStaffProfile(token);
        if (active) {
          setUser(session.user);
          setExpiresAt(session.expiresAt);
        }
      } catch (error) {
        if (error.status === 401 || error.status === 403) {
          try {
            await clearStaffToken();
          } catch (clearError) {
            if (active) setSessionError(clearError.message || 'ล้างข้อมูลเซสชันไม่สำเร็จ');
          }
        } else if (active) {
          setSessionError(error.message || 'ตรวจสอบสถานะบัญชีพนักงานไม่สำเร็จ');
        }
      } finally {
        if (active) setIsLoading(false);
      }
    }

    restoreSession();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!user || !expiresAt) return undefined;
    const timeout = setTimeout(() => {
      clearStaffToken().catch((error) => {
        setSessionError(error.message || 'ล้างข้อมูลเซสชันไม่สำเร็จ');
      });
      setUser(null);
      setExpiresAt(null);
    }, Math.max(0, expiresAt - Date.now()));
    return () => clearTimeout(timeout);
  }, [user, expiresAt]);

  const login = useCallback(async (identifier, password) => {
    const result = await requestStaffLogin(identifier, password);
    await saveStaffToken(result.token);
    setSessionError('');
    setUser(result.user);
    setExpiresAt(result.expiresAt);
  }, []);

  const logout = useCallback(async () => {
    try {
      const token = await getStaffToken();
      if (token) await requestStaffLogout(token);
    } finally {
      try {
        await clearStaffToken();
      } finally {
        setUser(null);
        setExpiresAt(null);
      }
    }
  }, []);

  const value = useMemo(
    () => ({ user, isLoading, sessionError, login, logout }),
    [user, isLoading, sessionError, login, logout],
  );
  return <StaffAuthContext.Provider value={value}>{children}</StaffAuthContext.Provider>;
}

export function useStaffAuth() {
  const context = useContext(StaffAuthContext);
  if (!context) throw new Error('useStaffAuth must be used within a StaffAuthProvider');
  return context;
}
