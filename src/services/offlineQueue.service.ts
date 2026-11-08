/**
 * ============================================================================
 * نظام موكّل (Moakkil System) - 2026
 * الملف: src/services/offlineQueue.service.ts
 * الوصف: محرك الطابور المحلي (Offline Queue Engine V5.4 Enterprise Zero-Trust)
 * مطابق 100% لمنطق الطابور في js/api.js
 * ============================================================================
 */

import { API_BASE_URL, STORAGE_KEYS, SYNCABLE_ENDPOINTS, ensureDeviceId } from '../config/constants';
import { HttpMethod, OfflineQueueItem } from '../types/api.types';
import { MoUser } from '../types/database.types';

function getCurrentIdentity(): { uid: string | null; firm_id: string | null } {
  try {
    const rawUser = localStorage.getItem(STORAGE_KEYS.USER);
    if (!rawUser) return { uid: null, firm_id: null };
    const user: MoUser = JSON.parse(rawUser);
    return {
      uid: user.id || null,
      firm_id: user.firm_id || null,
    };
  } catch {
    return { uid: null, firm_id: null };
  }
}

export const OfflineQueueService = {
  /**
   * التحقق مما إذا كان المسار قابلاً للعمل دون اتصال
   * ⚠️ أمنياً: عمليات DELETE وملفات R2 ومسارات Auth لا تُخزن محلياً أبداً
   */
  isSyncableRequest(endpoint: string, method: HttpMethod): method is 'POST' | 'PATCH' | 'PUT' {
    if (method === 'GET' || method === 'DELETE') return false;
    if (endpoint.includes('/api/r2/') || endpoint.includes('/api/auth/')) return false;
    return SYNCABLE_ENDPOINTS.some((syncPath) => endpoint.startsWith(syncPath));
  },

  /**
   * جلب محتويات الطابور المحلي
   */
  getQueue(): OfflineQueueItem[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.OFFLINE_QUEUE);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  },

  /**
   * حفظ الطابور المحلي
   */
  saveQueue(queue: OfflineQueueItem[]): void {
    localStorage.setItem(STORAGE_KEYS.OFFLINE_QUEUE, JSON.stringify(queue));
  },

  /**
   * مسح الطابور بالكامل (يُستدعى عند تسجيل الخروج أو تبديل الحساب)
   */
  clearQueue(): void {
    localStorage.removeItem(STORAGE_KEYS.OFFLINE_QUEUE);
  },

  /**
   * إضافة عملية إلى الطابور مع ربطها بـ uid و firm_id وتجريد أي رموز حساسة
   */
  enqueue(endpoint: string, method: 'POST' | 'PATCH' | 'PUT', body: Record<string, unknown> | null): OfflineQueueItem | null {
    const { uid, firm_id } = getCurrentIdentity();
    if (!uid) {
      console.warn('⚠️ [Offline Engine] رفض تخزين العملية محلياً لعدم وجود جلسة موثقة.');
      return null;
    }

    const sanitizedBody = body && typeof body === 'object' ? { ...body } : body;
    if (sanitizedBody && typeof sanitizedBody === 'object') {
      delete sanitizedBody.action_token;
      delete sanitizedBody.password;
      delete sanitizedBody.pin_code;
    }

    const queue = this.getQueue();
    const item: OfflineQueueItem = {
      id: Date.now() + Math.floor(Math.random() * 1000),
      endpoint,
      method,
      body: sanitizedBody,
      timestamp: new Date().toISOString(),
      uid,
      firm_id,
    };

    queue.push(item);
    this.saveQueue(queue);

    // تفعيل Background Sync إن كان مدعوماً في المتصفح
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
      navigator.serviceWorker.ready
        .then((sw) => (sw as ServiceWorkerRegistration & { sync?: { register: (tag: string) => Promise<void> } }).sync?.register('moakkil-offline-sync'))
        .catch(() => {});
    }

    window.dispatchEvent(new CustomEvent('moakkil:queue-updated', { detail: { count: queue.length } }));
    return item;
  },

  /**
   * مزامنة العمليات المتراكمة فور عودة الإنترنت مع عزل صارم للهوية (Cross-Tenant Protection)
   */
  async syncOfflineData(): Promise<{ syncedCount: number; failedCount: number }> {
    if (!navigator.onLine) return { syncedCount: 0, failedCount: 0 };

    const queue = this.getQueue();
    if (queue.length === 0) return { syncedCount: 0, failedCount: 0 };

    const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
    const { uid: currentUid, firm_id: currentFirmId } = getCurrentIdentity();

    if (!token || !currentUid) {
      console.warn('⚠️ [Offline Sync] لا توجد جلسة نشطة للمزامنة.');
      return { syncedCount: 0, failedCount: 0 };
    }

    const deviceId = ensureDeviceId();
    const failedQueue: OfflineQueueItem[] = [];
    let syncedCount = 0;

    for (const item of queue) {
      // 🛡️ منع تسرب العمليات بين الحسابات أو المكاتب المختلفة
      if (!item.uid || String(item.uid) !== String(currentUid) || String(item.firm_id || '') !== String(currentFirmId || '')) {
        console.warn(`🛡️ [Security] تم إهمال وحذف عملية Offline يتيمة لا تخص المستخدم الحالي: ${item.endpoint}`);
        continue;
      }

      // منع مزامنة أي عملية حذف قديمة مخزنة بالخطأ
      if (item.method === ('DELETE' as string)) {
        continue;
      }

      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-device-id': deviceId,
        };

        const response = await fetch(`${API_BASE_URL}${item.endpoint}`, {
          method: item.method,
          headers,
          body: item.body ? JSON.stringify(item.body) : undefined,
        });

        if (response.ok) {
          syncedCount++;
        } else if (response.status >= 400 && response.status < 500) {
          // أخطاء 4xx المرفوضة من السيرفر لا نعيد جدولتها للأبد حتى لا تسبب حلقة مفرغة
          console.error(`❌ [Offline Sync] السيرفر رفض العملية (${response.status}): ${item.endpoint}`);
        } else {
          failedQueue.push(item);
        }
      } catch {
        failedQueue.push(item);
      }
    }

    this.saveQueue(failedQueue);
    window.dispatchEvent(
      new CustomEvent('moakkil:sync-completed', {
        detail: { syncedCount, remainingCount: failedQueue.length },
      })
    );

    return { syncedCount, failedCount: failedQueue.length };
  },
};
