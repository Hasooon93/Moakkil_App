/**
 * ============================================================================
 * نظام موكّل (Moakkil System) - 2026
 * الملف: src/services/r2.service.ts
 * الوصف: محرك الأرشيف السحابي المشفر (Cloudflare R2 Vault Service V5.4)
 * مطابق 100% لدوال uploadFileToR2 و downloadFileFromR2 و fetchR2FileAsBlob في js/api.js
 * ============================================================================
 */

import { API_BASE_URL, STORAGE_KEYS, ensureDeviceId } from '../config/constants';
import { AuthService } from './auth.service';

export interface R2UploadMetadata {
  caseId?: string | null;
  clientId?: string | null;
}

export interface R2UploadResponse {
  success?: boolean;
  key: string;
  file_url?: string;
  url?: string;
  error?: string;
}

const blobUrlCache = new Map<string, string>();

export const R2Service = {
  /**
   * رفع ملف إلى خزنة Cloudflare R2 المشفرة
   */
  async uploadFile(file: File, metadata: R2UploadMetadata = {}): Promise<R2UploadResponse> {
    if (!navigator.onLine) {
      throw new Error('عذراً، لا يمكن رفع الملفات السحابية أثناء انقطاع الإنترنت.');
    }

    const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
    const deviceId = ensureDeviceId();

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      'x-device-id': deviceId,
      'Content-Type': file.type || 'application/octet-stream',
      'x-file-name': encodeURIComponent(file.name),
    };

    if (metadata.caseId) headers['x-case-id'] = String(metadata.caseId);
    if (metadata.clientId) headers['x-client-id'] = String(metadata.clientId);

    const response = await fetch(`${API_BASE_URL}/api/r2/upload`, {
      method: 'PUT',
      headers,
      body: file,
    });

    if (response.status === 401) {
      await AuthService.logout(true);
      throw new Error('انتهت صلاحية الجلسة.');
    }

    const data = (await response.json()) as R2UploadResponse;
    if (!response.ok) {
      throw new Error(data.error || 'فشل رفع الملف إلى الخزنة السحابية R2');
    }

    return data;
  },

  /**
   * جلب ملف من R2 كـ Blob محمي بالتوكن وعرضه كـ Object URL
   */
  async fetchFileAsBlobUrl(fileKey: string): Promise<string> {
    if (!fileKey) return '';
    if (fileKey.startsWith('http://') || fileKey.startsWith('https://') || fileKey.startsWith('data:')) {
      return fileKey;
    }

    if (blobUrlCache.has(fileKey)) {
      return blobUrlCache.get(fileKey)!;
    }

    if (!navigator.onLine) {
      throw new Error('لا يمكن جلب المرفق السحابي دون اتصال بالإنترنت.');
    }

    const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
    const deviceId = ensureDeviceId();

    const response = await fetch(
      `${API_BASE_URL}/api/r2/download?key=${encodeURIComponent(fileKey)}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'x-device-id': deviceId,
        },
      }
    );

    if (response.status === 401) {
      await AuthService.logout(true);
      throw new Error('انتهت الجلسة');
    }

    if (!response.ok) {
      throw new Error('الملف غير موجود أو لا تملك صلاحية الوصول إليه.');
    }

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    blobUrlCache.set(fileKey, objectUrl);
    return objectUrl;
  },

  /**
   * تحميل أو فتح ملف من R2 للمستخدم المصادق عليه
   */
  async downloadOrPreviewFile(fileKey: string, fileName = 'document'): Promise<void> {
    const objectUrl = await this.fetchFileAsBlobUrl(fileKey);
    const win = window.open(objectUrl, '_blank');
    if (!win) {
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  },

  /**
   * حذف ملف من R2 (يُستخدم أيضاً في التنظيف التلقائي للملفات اليتيمة Orphan Cleanup)
   */
  async deleteFile(fileKey: string, actionToken?: string): Promise<void> {
    if (!fileKey || !navigator.onLine) return;
    const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
    const deviceId = ensureDeviceId();

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      'x-device-id': deviceId,
    };
    if (actionToken) {
      headers['x-action-token'] = actionToken;
    }

    await fetch(`${API_BASE_URL}/api/r2/delete?key=${encodeURIComponent(fileKey)}`, {
      method: 'DELETE',
      headers,
    });

    if (blobUrlCache.has(fileKey)) {
      URL.revokeObjectURL(blobUrlCache.get(fileKey)!);
      blobUrlCache.delete(fileKey);
    }
  },
};
