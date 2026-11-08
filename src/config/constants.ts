/**
 * ============================================================================
 * نظام موكّل (Moakkil System) - 2026
 * الملف: src/config/constants.ts
 * الوصف: ملف الإعدادات المركزية والتكوين العام (V5.4 Enterprise True Zero-Trust)
 * مطابق 100% لـ js/config.js
 * ============================================================================
 */

export const API_BASE_URL: string =
  import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.DEV
    ? '/api-proxy'
    : 'https://curly-pond-9975.hassan-alsakka.workers.dev');

export const VAPID_PUBLIC_KEY: string =
  import.meta.env.VITE_VAPID_PUBLIC_KEY ||
  'BC0-l79uJ9x-c-W-e9y2U2a-t5B1y3_k8N6x0Z4m1P5q7R9w2Y4v6X8z0A2c4E6g8I0k2M4o6Q8s0U2w4Y6a8';

export const STORAGE_KEYS = {
  TOKEN: 'moakkil_token',
  USER: 'moakkil_user',
  FIRM: 'moakkil_firm',
  DEVICE_ID: 'moakkil_device_id',
  OFFLINE_QUEUE: 'moakkil_offline_queue',
  PENDING_LOGOUT: 'moakkil_pending_logout_token',
  PORTAL_SESSION: 'moakkil_portal_session',
  PORTAL_TOKEN_PREFIX: 'moakkil_portal_token_',
  BIOMETRIC_ID: 'moakkil_biometric_id',
  SAVED_PHONE: 'moakkil_saved_phone',
  DARK_MODE: 'moakkil_dark_mode',
  THEME: 'moakkil_theme',
  LEGACY_THEME: 'theme',
  ACTION_MFA_PREFIX: 'moakkil_action_mfa_',
  AI_CHAT_HISTORY: 'moakkil_ai_chat_history',
} as const;

export const CONFIG = {
  API_URL: API_BASE_URL,
  APP_NAME: 'نظام موكّل لإدارة المحاماة (Moakkil Legal ERP)',
  VERSION: '4.1.0 Enterprise',
  VAPID_PUBLIC_KEY,
  TOKEN_KEY: STORAGE_KEYS.TOKEN,
  USER_KEY: STORAGE_KEYS.USER,
  FIRM_KEY: STORAGE_KEYS.FIRM,
  OFFLINE_QUEUE_KEY: STORAGE_KEYS.OFFLINE_QUEUE,
  DEFAULT_THEME: {
    PRIMARY_COLOR: '#0B192C',
    SECONDARY_COLOR: '#C5A059',
    FIRM_NAME: 'نظام موكّل القانوني',
  },
} as const;

export const ENDPOINT_TABLE_MAP: Record<string, string> = {
  '/api/cases': 'mo_cases',
  '/api/clients': 'mo_clients',
  '/api/sessions': 'mo_sessions',
  '/api/appointments': 'mo_appointments',
  '/api/tasks': 'mo_tasks',
  '/api/finance': 'mo_installments',
  '/api/installments': 'mo_installments',
  '/api/expenses': 'mo_expenses',
  '/api/files': 'mo_files',
  '/api/updates': 'mo_case_updates',
  '/api/staff': 'mo_users',
  '/api/library': 'legal_brain',
};

export const SYNCABLE_ENDPOINTS: readonly string[] = [
  '/api/cases',
  '/api/clients',
  '/api/sessions',
  '/api/appointments',
  '/api/tasks',
  '/api/finance',
  '/api/expenses',
  '/api/updates',
  '/api/files',
  '/api/staff',
  '/api/settings',
  '/api/library',
];

export const UTILS = {
  /**
   * تعقيم النصوص لمنع هجمات حقن الأكواد الخبيثة (XSS Sanitizer)
   */
  escapeHTML: (str: unknown): string => {
    if (str === null || str === undefined) return '';
    return String(str).replace(/[&<>'"]/g, (tag) => {
      const chars: Record<string, string> = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;',
      };
      return chars[tag] || tag;
    });
  },

  /**
   * التحقق الصارم من صيغة الألوان لمنع حقن CSS (CSS Injection Protection)
   */
  sanitizeColor: (color: string | null | undefined, fallback = '#0B192C'): string => {
    if (!color || typeof color !== 'string') return fallback;
    const trimmed = color.trim();
    if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(trimmed)) {
      return trimmed;
    }
    if (/^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/.test(trimmed)) {
      return trimmed;
    }
    return fallback;
  },

  /**
   * تحويل مفتاح VAPID من صيغة Base64 إلى مصفوفة بايتات (Uint8Array)
   */
  urlBase64ToUint8Array: (base64String: string): Uint8Array => {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  },

  /**
   * تنسيق الأرقام والمبالغ المالية (العملة الأردنية JOD)
   */
  formatCurrency: (amount: string | number | null | undefined): string => {
    const num = parseFloat(String(amount ?? 0));
    return isNaN(num) ? '0.00 دينار' : num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' دينار';
  },

  /**
   * تنسيق التواريخ للعرض باللغة العربية
   */
  formatDate: (dateString: string | null | undefined): string => {
    if (!dateString) return 'غير محدد';
    const options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'long', day: 'numeric' };
    try {
      return new Date(dateString).toLocaleDateString('ar-JO', options);
    } catch {
      return String(dateString);
    }
  },
};

/**
 * ضمان وجود بصمة الجهاز في localStorage منذ لحظة تشغيل التطبيق
 */
export function ensureDeviceId(): string {
  let devId = localStorage.getItem(STORAGE_KEYS.DEVICE_ID);
  if (!devId) {
    const uuidPart =
      typeof window !== 'undefined' && window.crypto && typeof window.crypto.randomUUID === 'function'
        ? window.crypto.randomUUID()
        : Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 12);
    devId = 'DEV_' + uuidPart;
    localStorage.setItem(STORAGE_KEYS.DEVICE_ID, devId);
  }
  return devId;
}
