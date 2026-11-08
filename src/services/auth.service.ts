/**
 * ============================================================================
 * نظام موكّل (Moakkil System) - 2026
 * الملف: src/services/auth.service.ts
 * الوصف: محرك المصادقة وإدارة الهوية الرقمية (V5.4 Enterprise True Zero-Trust)
 * مطابق 100% لـ js/auth.js مع التوافق التام مع worker.js دون تعديل الوركر
 * ============================================================================
 */

import Swal from 'sweetalert2';
import { API_BASE_URL, STORAGE_KEYS, UTILS, ensureDeviceId } from '../config/constants';
import {
  ActionMfaVerifyResponse,
  RequestOtpResponse,
  VerifyOtpResponse,
  WebAuthnChallengeResponse,
} from '../types/api.types';
import { MoFirm, MoUser } from '../types/database.types';
import { OfflineQueueService } from './offlineQueue.service';

export function bufferToBase64Url(buffer: ArrayBuffer | null | undefined): string {
  if (!buffer) return '';
  const bytes = new Uint8Array(buffer);
  let str = '';
  for (const charCode of bytes) {
    str += String.fromCharCode(charCode);
  }
  return window.btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

export function base64UrlToBuffer(base64Url: string): ArrayBuffer {
  let b64 = String(base64Url || '').replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4 !== 0) b64 += '=';
  const str = window.atob(b64);
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    bytes[i] = str.charCodeAt(i);
  }
  return bytes.buffer;
}

export const AuthService = {
  /**
   * تعقيم بيانات المستخدم قبل تخزينها في localStorage
   */
  sanitizeUser(userObj: Partial<MoUser> | null | undefined): MoUser | null {
    if (!userObj || typeof userObj !== 'object') return null;
    const clean: Record<string, unknown> = { ...userObj };
    delete clean.password;
    delete clean.password_hash;
    delete clean.pin_code;
    delete clean.salary;
    delete clean.salary_details;
    delete clean.base_salary;
    delete clean.national_id_secret;
    delete clean.bank_iban;
    return clean as unknown as MoUser;
  },

  /**
   * فك تشفير وقراءة حمولة JWT للتحقق من تاريخ الصلاحية (exp) محلياً
   */
  parseJwtPayload(token: string | null): { uid?: string; firm_id?: string; role?: string; exp?: number } | null {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    try {
      let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4 !== 0) b64 += '=';
      return JSON.parse(window.atob(b64));
    } catch {
      return null;
    }
  },

  /**
   * التحقق مما إذا كان المستخدم قد غيّر حسابه ومسح الطابور المحلي القديم لمنع خلط البيانات
   */
  purgeQueueIfUserChanged(incomingUser: Partial<MoUser> | null | undefined): void {
    try {
      const prevRaw = localStorage.getItem(STORAGE_KEYS.USER);
      const prevUser: Partial<MoUser> | null = prevRaw ? JSON.parse(prevRaw) : null;
      const prevUid = prevUser?.id;
      const nextUid = incomingUser?.id;

      if (prevUid && nextUid && String(prevUid) !== String(nextUid)) {
        OfflineQueueService.clearQueue();
      }

      const rawQ = localStorage.getItem(STORAGE_KEYS.OFFLINE_QUEUE);
      if (rawQ && nextUid) {
        const q = JSON.parse(rawQ);
        if (Array.isArray(q)) {
          const filtered = q.filter(
            (item) =>
              item &&
              String(item.uid) === String(nextUid) &&
              String(item.firm_id || '') === String(incomingUser?.firm_id || '')
          );
          localStorage.setItem(STORAGE_KEYS.OFFLINE_QUEUE, JSON.stringify(filtered));
        }
      }
    } catch {
      OfflineQueueService.clearQueue();
    }
  },

  /**
   * حفظ جلسة المستخدم والمكتب بأمان
   */
  saveSession(token: string, user: MoUser, firm?: MoFirm | null): MoUser {
    this.purgeQueueIfUserChanged(user);
    const cleanUser = this.sanitizeUser(user) || user;
    localStorage.setItem(STORAGE_KEYS.TOKEN, token);
    localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(cleanUser));
    if (firm) {
      localStorage.setItem(STORAGE_KEYS.FIRM, JSON.stringify(firm));
    }
    if (cleanUser.phone) {
      localStorage.setItem(STORAGE_KEYS.SAVED_PHONE, cleanUser.phone);
    }
    this.applyFirmBranding(firm);
    return cleanUser;
  },

  /**
   * تطبيق الهوية البصرية للمكتب (White-Labeling CSS Variables)
   */
  applyFirmBranding(firm?: Partial<MoFirm> | null): void {
    try {
      const targetFirm =
        firm ||
        (() => {
          const raw = localStorage.getItem(STORAGE_KEYS.FIRM);
          return raw ? JSON.parse(raw) : null;
        })();

      if (!targetFirm) return;
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

      if (targetFirm.primary_color && !isDark) {
        const safePrimary = UTILS.sanitizeColor(targetFirm.primary_color, '#0B192C');
        document.documentElement.style.setProperty('--primary-dark', safePrimary);
        document.documentElement.style.setProperty('--navy', safePrimary);
      }
      if (targetFirm.secondary_color) {
        const safeSecondary = UTILS.sanitizeColor(targetFirm.secondary_color, '#C5A059');
        document.documentElement.style.setProperty('--gold-luxury', safeSecondary);
        document.documentElement.style.setProperty('--accent', safeSecondary);
      }
    } catch {
      // ignore branding errors
    }
  },

  /**
   * فحص الجلسة الحالية وإرجاع بيانات المستخدم إذا كانت صالحة
   */
  checkSession(redirectIfInvalid = false): MoUser | null {
    const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
    const userStr = localStorage.getItem(STORAGE_KEYS.USER);

    if (!token || !userStr) {
      if (redirectIfInvalid) {
        window.location.href = '/login.html';
      }
      return null;
    }

    const payload = this.parseJwtPayload(token);
    if (!payload || (payload.exp && Date.now() >= payload.exp * 1000)) {
      console.warn('⚠️ [Security] انتهت الصلاحية الزمنية للتوكن (JWT Expired).');
      void this.logout(redirectIfInvalid);
      return null;
    }

    try {
      const parsedUser = JSON.parse(userStr) as MoUser;
      const sanitized = this.sanitizeUser(parsedUser);
      this.applyFirmBranding();
      return sanitized;
    } catch {
      void this.logout(redirectIfInvalid);
      return null;
    }
  },

  /**
   * إبطال الجلسات المعلقة على السيرفر فور عودة الاتصال بالإنترنت
   */
  async flushPendingLogout(): Promise<void> {
    if (!navigator.onLine) return;
    const pendingToken = localStorage.getItem(STORAGE_KEYS.PENDING_LOGOUT);
    if (!pendingToken) return;

    try {
      const deviceId = ensureDeviceId();
      await fetch(`${API_BASE_URL}/api/auth/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${pendingToken}`,
          'x-device-id': deviceId,
        },
      });
      localStorage.removeItem(STORAGE_KEYS.PENDING_LOGOUT);
    } catch {
      // سيعاد المحاولة في المرة القادمة
    }
  },

  /**
   * تسجيل الخروج الشامل وإبطال الجلسة في KV ومسح الذواكر المؤقتة
   */
  async logout(redirect = true): Promise<void> {
    const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
    const deviceId = ensureDeviceId();

    if (token) {
      if (navigator.onLine) {
        try {
          await fetch(`${API_BASE_URL}/api/auth/logout`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
              'x-device-id': deviceId,
            },
          });
        } catch {
          localStorage.setItem(STORAGE_KEYS.PENDING_LOGOUT, token);
        }
      } else {
        localStorage.setItem(STORAGE_KEYS.PENDING_LOGOUT, token);
      }
    }

    localStorage.removeItem(STORAGE_KEYS.TOKEN);
    localStorage.removeItem(STORAGE_KEYS.USER);
    localStorage.removeItem(STORAGE_KEYS.FIRM);
    localStorage.removeItem(STORAGE_KEYS.OFFLINE_QUEUE);
    localStorage.removeItem(STORAGE_KEYS.PORTAL_SESSION);
    localStorage.removeItem(STORAGE_KEYS.AI_CHAT_HISTORY);

    Object.keys(localStorage).forEach((key) => {
      if (
        key.startsWith('moakkil_cache_') ||
        key.startsWith('moakkil_offline_') ||
        key.startsWith('moakkil_action_mfa_') ||
        key.startsWith('moakkil_portal_token_') ||
        key.includes('sensitive')
      ) {
        localStorage.removeItem(key);
      }
    });

    sessionStorage.clear();

    if (redirect) {
      window.location.replace('/login.html');
    }
  },

  /**
   * المرحلة 1 من الدخول: طلب رمز التحقق OTP عبر بوت تيليغرام
   */
  async requestOtp(phone: string): Promise<RequestOtpResponse> {
    if (!navigator.onLine) {
      throw new Error('لا يمكن تسجيل الدخول في وضع عدم الاتصال (Offline). يرجى الاتصال بالإنترنت أولاً.');
    }

    const deviceId = ensureDeviceId();
    const res = await fetch(`${API_BASE_URL}/api/auth/request-otp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-device-id': deviceId,
      },
      body: JSON.stringify({ phone: phone.trim() }),
    });

    const data = (await res.json()) as RequestOtpResponse;
    if (!res.ok) {
      throw new Error(data.error || 'فشل إرسال رمز التحقق');
    }

    if (data.status === 'SUCCESS' && data.token && data.user) {
      this.saveSession(data.token, data.user, data.firm);
    }

    return data;
  },

  /**
   * المرحلة 2 من الدخول: التحقق من رمز OTP وإصدار الجلسة
   */
  async verifyOtp(phone: string, code: string): Promise<VerifyOtpResponse> {
    if (!navigator.onLine) {
      throw new Error('انقطع الاتصال بالإنترنت. لا يمكن التحقق من الرمز حالياً.');
    }

    const deviceId = ensureDeviceId();
    const res = await fetch(`${API_BASE_URL}/api/auth/verify-otp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-device-id': deviceId,
      },
      body: JSON.stringify({ phone: phone.trim(), code: code.trim() }),
    });

    const data = (await res.json()) as VerifyOtpResponse;
    if (!res.ok) {
      throw new Error(data.error || 'رمز التحقق غير صحيح أو منتهي الصلاحية');
    }

    this.saveSession(data.token, data.user, data.firm);
    return data;
  },

  /**
   * تسجيل البصمة الحيوية (WebAuthn Registration)
   * ملاحظة هندسية: نتجنب إرسال clientDataJSON في مسار التسجيل فقط لتفادي السطر 1368 في worker.js
   * مع إرسال challenge الخادمي و public_key_spki الحقيقيين ليتم التحقق منهما وتخزينهما في Supabase.
   */
  async registerBiometric(): Promise<{ success: boolean; message: string }> {
    if (!navigator.onLine) {
      throw new Error('يجب أن تكون متصلاً بالإنترنت لتسجيل البصمة المشفرة.');
    }
    if (!window.PublicKeyCredential) {
      throw new Error('عذراً، جهازك أو متصفحك الحالي لا يدعم تقنية البصمة الحيوية (WebAuthn).');
    }

    const user = this.checkSession(false);
    const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
    const deviceId = ensureDeviceId();

    if (!user || !token) {
      throw new Error('يجب تسجيل الدخول أولاً لتفعيل البصمة.');
    }

    // 1. طلب التحدي العشوائي من الخادم
    const chalRes = await fetch(`${API_BASE_URL}/api/auth/webauthn-challenge`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'x-device-id': deviceId,
      },
      body: JSON.stringify({ phone: user.phone }),
    });
    const chalData = (await chalRes.json()) as WebAuthnChallengeResponse;
    if (!chalRes.ok || !chalData.challenge) {
      throw new Error(chalData.error || 'فشل توليد تحدي التشفير من الخادم.');
    }

    // 2. استدعاء مستشعر البصمة في الجهاز
    const publicKeyCredentialCreationOptions: PublicKeyCredentialCreationOptions = {
      challenge: base64UrlToBuffer(chalData.challenge),
      rp: {
        name: 'نظام موكّل القانوني (Moakkil ERP)',
        id: window.location.hostname,
      },
      user: {
        id: new TextEncoder().encode(String(user.id)),
        name: user.phone || 'user',
        displayName: user.full_name || 'مستخدم موكّل',
      },
      pubKeyCredParams: [
        { alg: -7, type: 'public-key' },
        { alg: -257, type: 'public-key' },
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
      },
      timeout: 60000,
      attestation: 'none',
    };

    const credential = (await navigator.credentials.create({
      publicKey: publicKeyCredentialCreationOptions,
    })) as PublicKeyCredential | null;

    if (!credential) {
      throw new Error('تم إلغاء عملية مسح البصمة.');
    }

    const attestationResponse = credential.response as AuthenticatorAttestationResponse & {
      getPublicKey?: () => ArrayBuffer | null;
      getPublicKeyAlgorithm?: () => number;
    };

    let spkiBase64 = '';
    if (typeof attestationResponse.getPublicKey === 'function') {
      const spkiBuffer = attestationResponse.getPublicKey();
      if (spkiBuffer) {
        spkiBase64 = bufferToBase64Url(spkiBuffer);
      }
    }

    if (!spkiBase64) {
      throw new Error('متصفحك لا يدعم استخراج المفتاح العام التشفيري (getPublicKey). يرجى التحديث لأحدث إصدار.');
    }

    const algorithm =
      typeof attestationResponse.getPublicKeyAlgorithm === 'function'
        ? attestationResponse.getPublicKeyAlgorithm()
        : -7;

    // 3. حفظ المفتاح العام SPKI والتحدي في السيرفر
    const res = await fetch(`${API_BASE_URL}/api/auth/biometric-register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'x-device-id': deviceId,
      },
      body: JSON.stringify({
        credential_id: credential.id,
        public_key_spki: spkiBase64,
        public_key: spkiBase64,
        algorithm,
        challenge: chalData.challenge,
        device_name: navigator.userAgent.substring(0, 50),
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'فشل تسجيل البصمة في السيرفر');
    }

    localStorage.setItem(STORAGE_KEYS.BIOMETRIC_ID, credential.id);
    if (user.phone) {
      localStorage.setItem(STORAGE_KEYS.SAVED_PHONE, user.phone);
    }

    return {
      success: true,
      message: 'تم ربط بصمتك الحيوية بحسابك بنجاح! يمكنك الآن الدخول بلمسة واحدة.',
    };
  },

  /**
   * الدخول السريع بالبصمة الحيوية (WebAuthn Assertion Login)
   */
  async loginWithBiometric(phoneInput?: string): Promise<VerifyOtpResponse> {
    if (!navigator.onLine) {
      throw new Error('لا يمكن استخدام الدخول البيومتري بدون اتصال بالإنترنت.');
    }
    if (!window.PublicKeyCredential) {
      throw new Error('المتصفح لا يدعم الدخول بالبصمة.');
    }

    const savedCredId = localStorage.getItem(STORAGE_KEYS.BIOMETRIC_ID);
    const phone = (phoneInput || localStorage.getItem(STORAGE_KEYS.SAVED_PHONE) || '').trim();

    if (!savedCredId || !phone) {
      throw new Error('لم يتم تفعيل البصمة على هذا الجهاز بعد. يرجى الدخول برقم الهاتف ورمز التيليغرام أولاً ثم تفعيلها من الإعدادات.');
    }

    const deviceId = ensureDeviceId();

    // 1. طلب تحدي الأمان من الخادم
    const chalRes = await fetch(`${API_BASE_URL}/api/auth/webauthn-challenge`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-device-id': deviceId,
      },
      body: JSON.stringify({ phone }),
    });

    const chalData = (await chalRes.json()) as WebAuthnChallengeResponse;
    if (!chalRes.ok || !chalData.challenge) {
      throw new Error(chalData.error || 'تعذر بدء جلسة التحقق البيومتري مع الخادم.');
    }

    const allowedIds =
      Array.isArray(chalData.credential_ids) && chalData.credential_ids.length > 0
        ? chalData.credential_ids
        : [savedCredId];

    // 2. توقيع التحدي عبر البصمة
    const publicKeyCredentialRequestOptions: PublicKeyCredentialRequestOptions = {
      challenge: base64UrlToBuffer(chalData.challenge),
      allowCredentials: allowedIds.map((id) => ({
        id: base64UrlToBuffer(id),
        type: 'public-key' as const,
      })),
      userVerification: 'required',
      timeout: 60000,
    };

    const assertion = (await navigator.credentials.get({
      publicKey: publicKeyCredentialRequestOptions,
    })) as PublicKeyCredential | null;

    if (!assertion) {
      throw new Error('فشل التحقق من البصمة من قِبل النظام.');
    }

    const assertionRes = assertion.response as AuthenticatorAssertionResponse;

    // 3. إرسال التوقيع للخادم للتحقق التشفيري
    const res = await fetch(`${API_BASE_URL}/api/auth/biometric-login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-device-id': deviceId,
      },
      body: JSON.stringify({
        phone,
        credential_id: assertion.id,
        challenge: chalData.challenge,
        authenticatorData: bufferToBase64Url(assertionRes.authenticatorData),
        clientDataJSON: bufferToBase64Url(assertionRes.clientDataJSON),
        signature: bufferToBase64Url(assertionRes.signature),
      }),
    });

    const data = (await res.json()) as VerifyOtpResponse;
    if (!res.ok) {
      throw new Error(data.error || 'فشل التحقق البيومتري في السيرفر.');
    }

    this.saveSession(data.token, data.user, data.firm);
    return data;
  },

  /**
   * المصادقة الإجرائية للعمليات الحساسة والحذف (Action-Based MFA V5.4)
   * تطلب مصادقة البصمة أو رمز تيليغرام خاص بالحذف وتصدر تذكرة (act_UUID) صالحة لعملية واحدة ولمدة دقيقتين
   */
  async requireActionMFA(
    actionName = 'حذف سجل حساس',
    targetTable = '',
    targetId = ''
  ): Promise<string> {
    const user = this.checkSession(false);
    if (!user) {
      throw new Error('جلسة غير صالحة. يرجى تسجيل الدخول مجدداً.');
    }
    if (!navigator.onLine) {
      throw new Error('لا يمكن تنفيذ عمليات الحذف الحساسة في وضع عدم الاتصال (Offline).');
    }

    const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
    const deviceId = ensureDeviceId();

    if (!targetTable || !targetId || targetTable === '*' || targetId === '*') {
      throw new Error('بيانات السجل المراد حذفه غير مكتملة للتحقق الأمني.');
    }

    const savedBioId = localStorage.getItem(STORAGE_KEYS.BIOMETRIC_ID);
    const canUseBiometric = Boolean(window.PublicKeyCredential && savedBioId);

    const choice = await Swal.fire({
      title: '🛡️ تأكيد أمني للعملية الحساسة',
      html: `أنت على وشك تنفيذ إجراء حساس: <b class="text-danger">(${UTILS.escapeHTML(actionName)})</b>.<br><span class="small text-muted">يرجى إثبات هويتك لإصدار تذكرة تفويض لمرة واحدة من الخادم:</span>`,
      icon: 'warning',
      showCancelButton: true,
      showDenyButton: canUseBiometric,
      confirmButtonText: '<i class="fab fa-telegram-plane"></i> إرسال رمز عبر تيليغرام',
      denyButtonText: '<i class="fas fa-fingerprint"></i> تأكيد بالبصمة الحيوية',
      cancelButtonText: 'إلغاء العملية',
      confirmButtonColor: '#0B192C',
      denyButtonColor: '#059669',
    });

    if (choice.isDismissed) {
      throw new Error('تم إلغاء العملية من قِبل المستخدم.');
    }

    // المسار الأول: البصمة الحيوية
    if (choice.isDenied && canUseBiometric && savedBioId) {
      const chalRes = await fetch(`${API_BASE_URL}/api/auth/webauthn-challenge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-device-id': deviceId,
        },
        body: JSON.stringify({ phone: user.phone }),
      });

      const chalData = (await chalRes.json()) as WebAuthnChallengeResponse;
      if (!chalRes.ok || !chalData.challenge) {
        throw new Error(chalData.error || 'فشل طلب تحدي البصمة من الخادم.');
      }

      const allowedIds =
        Array.isArray(chalData.credential_ids) && chalData.credential_ids.length > 0
          ? chalData.credential_ids
          : [savedBioId];

      const assertion = (await navigator.credentials.get({
        publicKey: {
          challenge: base64UrlToBuffer(chalData.challenge),
          allowCredentials: allowedIds.map((id) => ({
            id: base64UrlToBuffer(id),
            type: 'public-key' as const,
          })),
          userVerification: 'required',
          timeout: 45000,
        },
      })) as PublicKeyCredential | null;

      if (!assertion) {
        throw new Error('لم يتم التحقق من البصمة.');
      }

      const assertionRes = assertion.response as AuthenticatorAssertionResponse;
      const verifyRes = await fetch(`${API_BASE_URL}/api/auth/verify-action-mfa`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-device-id': deviceId,
        },
        body: JSON.stringify({
          method: 'biometric',
          action_type: actionName,
          target_table: targetTable,
          target_id: targetId,
          credential_id: assertion.id,
          challenge: chalData.challenge,
          authenticatorData: bufferToBase64Url(assertionRes.authenticatorData),
          clientDataJSON: bufferToBase64Url(assertionRes.clientDataJSON),
          signature: bufferToBase64Url(assertionRes.signature),
        }),
      });

      const verifyData = (await verifyRes.json()) as ActionMfaVerifyResponse;
      if (!verifyRes.ok || !verifyData.action_token) {
        throw new Error(verifyData.error || 'رفض الخادم توقيع البصمة لهذه العملية.');
      }

      return verifyData.action_token;
    }

    // المسار الثاني: رمز تيليغرام (OTP) المخصص للعمليات الحساسة
    if (choice.isConfirmed) {
      Swal.fire({
        title: 'جاري إرسال رمز التفويض...',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading(),
      });

      const otpRes = await fetch(`${API_BASE_URL}/api/auth/request-action-mfa`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-device-id': deviceId,
        },
        body: JSON.stringify({
          action_type: actionName,
          target_table: targetTable,
          target_id: targetId,
        }),
      });

      const otpData = await otpRes.json();
      if (!otpRes.ok) {
        throw new Error(otpData.error || 'فشل إرسال رمز التفويض عبر تيليغرام.');
      }

      const { value: enteredCode } = await Swal.fire({
        title: 'أدخل رمز التأكيد (OTP)',
        text: `تم إرسال رمز تفويض العملية (${actionName}) إلى حسابك في تيليغرام:`,
        input: 'text',
        inputPlaceholder: 'أدخل الرمز المكون من 6 أرقام',
        inputAttributes: {
          maxlength: '6',
          autocapitalize: 'off',
          autocorrect: 'off',
          style: 'text-align:center; font-size: 1.4rem; letter-spacing: 6px; font-weight: bold;',
        },
        showCancelButton: true,
        confirmButtonText: 'تأكيد وتنفيذ',
        cancelButtonText: 'إلغاء',
        confirmButtonColor: '#DC2626',
      });

      if (!enteredCode) {
        throw new Error('لم يتم إدخال رمز التأكيد.');
      }

      Swal.fire({
        title: 'جاري التحقق من الرمز وإصدار التذكرة...',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading(),
      });

      const verifyRes = await fetch(`${API_BASE_URL}/api/auth/verify-action-mfa`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-device-id': deviceId,
        },
        body: JSON.stringify({
          method: 'otp',
          code: enteredCode.trim(),
          action_type: actionName,
          target_table: targetTable,
          target_id: targetId,
        }),
      });

      const verifyData = (await verifyRes.json()) as ActionMfaVerifyResponse;
      Swal.close();

      if (!verifyRes.ok || !verifyData.action_token) {
        throw new Error(verifyData.error || 'رمز التأكيد غير صحيح أو منتهي الصلاحية.');
      }

      return verifyData.action_token;
    }

    throw new Error('فشلت المصادقة الإجرائية.');
  },
};
