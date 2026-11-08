/**
 * ============================================================================
 * نظام موكّل (Moakkil System) - 2026
 * الملف: src/services/apiClient.ts
 * الوصف: المحرك المركزي للاتصال بالخادم (Zero-Trust API Client V5.4)
 * مطابق 100% لـ js/api.js
 * ============================================================================
 */

import {
  API_BASE_URL,
  ENDPOINT_TABLE_MAP,
  STORAGE_KEYS,
  UTILS,
  VAPID_PUBLIC_KEY,
  ensureDeviceId,
} from '../config/constants';
import { HttpMethod } from '../types/api.types';
import { AuthService } from './auth.service';
import { OfflineQueueService } from './offlineQueue.service';

export interface ApiRequestOptions {
  customHeaders?: Record<string, string>;
  skipActionMfa?: boolean;
  actionLabel?: string;
}

/**
 * استخراج اسم الجدول ومعرّف السجل من رابط الطلب لإصدار تذكرة الحذف المقيدة (Scoped Action Ticket)
 */
export function resolveTargetFromEndpoint(endpoint: string): { targetTable: string; targetId: string } {
  const [rawPath, rawQuery] = String(endpoint || '').split('?');
  const targetTable = ENDPOINT_TABLE_MAP[rawPath] || '';
  let targetId = '';

  if (rawQuery) {
    const params = new URLSearchParams(rawQuery);
    const idParam = params.get('id') || '';
    targetId = idParam.startsWith('eq.') ? idParam.slice(3).trim() : idParam.trim();
  }

  return { targetTable, targetId };
}

export const ApiClient = {
  /**
   * الدالة المركزية لإرسال الطلبات للوركر مع دعم:
   * - التوكن وبصمة الجهاز (x-device-id)
   * - تذاكر الحذف المقيدة (x-action-token)
   * - طابور العمل دون اتصال (Offline Queue)
   */
  async request<T = any>(
    endpoint: string,
    method: HttpMethod = 'GET',
    body: Record<string, unknown> | null = null,
    options: ApiRequestOptions = {}
  ): Promise<T> {
    const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
    const deviceId = ensureDeviceId();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-device-id': deviceId,
      ...(options.customHeaders || {}),
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    // 🛡️ بوابة التحقق المزدوج (Action MFA) لجميع عمليات الحذف DELETE
    if (method === 'DELETE' && !endpoint.startsWith('/api/public/')) {
      if (!navigator.onLine) {
        throw new Error('لا يمكن تنفيذ عمليات الحذف في وضع عدم الاتصال (Offline). يرجى الاتصال بالإنترنت للتأكيد الأمني.');
      }

      if (!headers['x-action-token'] && !options.skipActionMfa) {
        const { targetTable, targetId } = resolveTargetFromEndpoint(endpoint);
        const actionToken = await AuthService.requireActionMFA(
          options.actionLabel || `حذف سجل (${endpoint.split('?')[0].replace('/api/', '')})`,
          targetTable,
          targetId
        );
        headers['x-action-token'] = actionToken;
      }
    }

    // 🌐 فحص الاتصال بالإنترنت قبل الإرسال
    if (!navigator.onLine) {
      if (OfflineQueueService.isSyncableRequest(endpoint, method)) {
        const queued = OfflineQueueService.enqueue(endpoint, method, body);
        if (!queued) {
          throw new Error('رفض النظام تخزين العملية محلياً لعدم وجود جلسة موثقة.');
        }
        return {
          offline: true,
          message: 'تم الحفظ محلياً وسيتم الرفع تلقائياً فور عودة الإنترنت',
          tempData: [body],
        } as unknown as T;
      }
      if (method === 'DELETE') {
        throw new Error('لا يمكن تنفيذ عمليات الحذف دون اتصال بالإنترنت.');
      }
      throw new Error('أنت في وضع عدم الاتصال (Offline)، وهذه الميزة تتطلب اتصالاً مباشراً بالخادم السحابي.');
    }

    try {
      const fetchOptions: RequestInit = { method, headers };
      if (body && method !== 'GET') {
        fetchOptions.body = JSON.stringify(body);
      }

      const response = await fetch(`${API_BASE_URL}${endpoint}`, fetchOptions);

      // 🚨 معالجة انتهاء الجلسة أو الدخول من جهاز آخر (401)
      if (response.status === 401 && !endpoint.includes('/auth/') && !endpoint.includes('/public/')) {
        await AuthService.logout(true);
        throw new Error('انتهت صلاحية الجلسة أو تم الدخول من جهاز آخر.');
      }

      let data: any = null;
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        data = await response.json();
      } else {
        const text = await response.text();
        try {
          data = JSON.parse(text);
        } catch {
          data = { message: text };
        }
      }

      if (!response.ok) {
        throw new Error(data?.error || data?.message || `خطأ في الخادم (${response.status})`);
      }

      return data as T;
    } catch (error: any) {
      // في حال سقوط الشبكة المفاجئ أثناء الإرسال (Failed to fetch)
      const isNetworkFailure =
        !navigator.onLine ||
        error?.name === 'TypeError' ||
        String(error?.message || '').includes('Failed to fetch');

      if (isNetworkFailure && OfflineQueueService.isSyncableRequest(endpoint, method)) {
        const queued = OfflineQueueService.enqueue(endpoint, method, body);
        if (queued) {
          return {
            offline: true,
            message: 'تم الحفظ في الطابور المحلي بسبب ضعف الشبكة',
            tempData: [body],
          } as unknown as T;
        }
      }
      throw error;
    }
  },

  get<T = any>(endpoint: string, options?: ApiRequestOptions): Promise<T> {
    return this.request<T>(endpoint, 'GET', null, options);
  },

  post<T = any>(endpoint: string, body: Record<string, unknown>, options?: ApiRequestOptions): Promise<T> {
    return this.request<T>(endpoint, 'POST', body, options);
  },

  patch<T = any>(endpoint: string, body: Record<string, unknown>, options?: ApiRequestOptions): Promise<T> {
    return this.request<T>(endpoint, 'PATCH', body, options);
  },

  delete<T = any>(endpoint: string, options?: ApiRequestOptions): Promise<T> {
    return this.request<T>(endpoint, 'DELETE', null, options);
  },

  /**
   * إرسال نبضة اتصال (Heartbeat) للتحقق من صلاحية الجلسة الأحادية وحالة اشتراك المكتب
   */
  async sendHeartbeat(): Promise<void> {
    if (!navigator.onLine) return;
    const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
    if (!token) return;
    try {
      await this.get('/api/ping');
    } catch {
      // يتم التعامل مع 401 تلقائياً داخل request()
    }
  },

  /**
   * الاشتراك في الإشعارات الفورية (Web Push Notifications)
   */
  async initPushNotifications(): Promise<boolean> {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
    try {
      const registration = await navigator.serviceWorker.ready;
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return false;

      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        const convertedVapidKey = UTILS.urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: convertedVapidKey as unknown as BufferSource,
        });
      }

      const subJson = subscription.toJSON();
      await this.post('/api/push/subscribe', {
        endpoint: subJson.endpoint,
        keys: subJson.keys,
        user_agent: navigator.userAgent,
      });
      return true;
    } catch (err) {
      console.warn('Push Subscription Warning:', err);
      return false;
    }
  },
};
