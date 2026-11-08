/**
 * ============================================================================
 * نظام موكّل (Moakkil System) - 2026
 * الملف: src/context/AuthContext.tsx
 * الوصف: سياق المصادقة والجلسة الأحادية ونبضات القلب والعلامة المائية الأمنية
 * ============================================================================
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import Swal from 'sweetalert2';
import { STORAGE_KEYS } from '../config/constants';
import { ApiClient } from '../services/apiClient';
import { AuthService } from '../services/auth.service';
import { OfflineQueueService } from '../services/offlineQueue.service';
import { MoFirm, MoUser, UserPermissions } from '../types/database.types';

interface AuthContextValue {
  user: MoUser | null;
  firm: MoFirm | null;
  isAuthenticated: boolean;
  isOnline: boolean;
  offlineQueueCount: number;
  refreshSession: () => void;
  updateFirmLocal: (updatedFirm: Partial<MoFirm>) => void;
  logout: () => Promise<void>;
  hasPermission: (permKey: keyof UserPermissions) => boolean;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  firm: null,
  isAuthenticated: false,
  isOnline: navigator.onLine,
  offlineQueueCount: 0,
  refreshSession: () => {},
  updateFirmLocal: () => {},
  logout: async () => {},
  hasPermission: () => false,
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<MoUser | null>(() => AuthService.checkSession(false));
  const [firm, setFirm] = useState<MoFirm | null>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.FIRM);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [offlineQueueCount, setOfflineQueueCount] = useState<number>(() => OfflineQueueService.getQueue().length);

  const refreshSession = () => {
    const currentUser = AuthService.checkSession(false);
    setUser(currentUser);
    try {
      const rawFirm = localStorage.getItem(STORAGE_KEYS.FIRM);
      setFirm(rawFirm ? JSON.parse(rawFirm) : null);
    } catch {
      setFirm(null);
    }
    setOfflineQueueCount(OfflineQueueService.getQueue().length);
  };

  const updateFirmLocal = (updatedFirm: Partial<MoFirm>) => {
    setFirm((prev) => {
      const merged = { ...(prev || {}), ...updatedFirm } as MoFirm;
      localStorage.setItem(STORAGE_KEYS.FIRM, JSON.stringify(merged));
      AuthService.applyFirmBranding(merged);
      return merged;
    });
  };

  const logout = async () => {
    await AuthService.logout(true);
    setUser(null);
    setFirm(null);
  };

  const hasPermission = (permKey: keyof UserPermissions): boolean => {
    if (!user) return false;
    if (user.role === 'admin' || user.role === 'super_admin' || user.role === 'superadmin') {
      return true;
    }
    if (!user.permissions) return false;
    try {
      const perms: UserPermissions =
        typeof user.permissions === 'string' ? JSON.parse(user.permissions) : user.permissions;
      return Boolean(perms[permKey]);
    } catch {
      return false;
    }
  };

  useEffect(() => {
    // إبطال أي جلسة قديمة معلقة عند الإقلاع
    void AuthService.flushPendingLogout();

    // مزامنة الطابور إن وجد
    if (navigator.onLine && user) {
      void OfflineQueueService.syncOfflineData();
    }

    const handleOnline = async () => {
      setIsOnline(true);
      await AuthService.flushPendingLogout();
      if (AuthService.checkSession(false)) {
        const res = await OfflineQueueService.syncOfflineData();
        setOfflineQueueCount(OfflineQueueService.getQueue().length);
        if (res.syncedCount > 0) {
          Swal.fire({
            toast: true,
            position: 'top-end',
            icon: 'success',
            title: `تمت مزامنة ${res.syncedCount} عمليات سحابياً بنجاح`,
            showConfirmButton: false,
            timer: 3000,
          });
        }
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    const handleQueueUpdated = () => {
      setOfflineQueueCount(OfflineQueueService.getQueue().length);
    };

    const handleSwMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'START_OFFLINE_SYNC') {
        void handleOnline();
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('moakkil:queue-updated', handleQueueUpdated);
    window.addEventListener('moakkil:sync-completed', handleQueueUpdated);
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleSwMessage);
    }

    // نبضات القلب الدورية (Heartbeat) كل 5 دقائق للتحقق من الجلسة الأحادية وحالة الاشتراك
    const heartbeatTimer = window.setInterval(() => {
      if (AuthService.checkSession(false)) {
        void ApiClient.sendHeartbeat();
      }
    }, 5 * 60 * 1000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('moakkil:queue-updated', handleQueueUpdated);
      window.removeEventListener('moakkil:sync-completed', handleQueueUpdated);
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', handleSwMessage);
      }
      window.clearInterval(heartbeatTimer);
    };
  }, [user?.id]);

  return (
    <AuthContext.Provider
      value={{
        user,
        firm,
        isAuthenticated: Boolean(user),
        isOnline,
        offlineQueueCount,
        refreshSession,
        updateFirmLocal,
        logout,
        hasPermission,
      }}
    >
      {children}
      {/* العلامة المائية الأمنية الخفية لمنع تسريب الشاشة (#screen-leak-protection) */}
      {user && (
        <div
          id="screen-leak-protection"
          style={{
            position: 'fixed',
            inset: 0,
            pointerEvents: 'none',
            zIndex: 9999,
            opacity: 0.025,
            backgroundImage: `repeating-linear-gradient(-35deg, transparent, transparent 140px, rgba(197,160,89,0.2) 140px, rgba(197,160,89,0.2) 141px)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.1rem',
            fontWeight: 900,
            color: 'var(--text-main)',
            userSelect: 'none',
            overflow: 'hidden',
          }}
          aria-hidden="true"
        >
          <span>{`${user.full_name || ''} • ${user.phone || ''} • Moakkil Zero-Trust`}</span>
        </div>
      )}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
