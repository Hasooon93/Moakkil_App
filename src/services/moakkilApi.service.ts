/**
 * ============================================================================
 * نظام موكّل (Moakkil System) - 2026
 * الملف: src/services/moakkilApi.service.ts
 * الوصف: المحرك البرمجي الشامل لواجهة التطبيق (Domain API Methods)
 * مطابق 100% لجميع دوال js/api.js دون أي تغيير في عقود Worker V5.4.0
 * ============================================================================
 */

import { ApiClient } from './apiClient';
import { R2Service } from './r2.service';
import { AuthService } from './auth.service';
import { API_BASE_URL, STORAGE_KEYS } from '../config/constants';

export const MoakkilAPI = {
    // ========================================================================
    // 1. إدارة الجلسة والمصادقة (Delegated to AuthService)
    // ========================================================================
    requestOTP: (phone: string) => AuthService.requestOtp(phone),
    verifyOTP: (phone: string, otp: string) => AuthService.verifyOtp(phone, otp),
    registerBiometric: () => AuthService.registerBiometric(),
    loginWithBiometric: (phone: string) => AuthService.loginWithBiometric(phone),
    requestDeleteOTP: (actionType: string, targetTable: string, targetId: string) =>
        ApiClient.post('/api/auth/request-delete-otp', {
            action_type: actionType,
            target_table: targetTable,
            target_id: targetId,
        }),
    verifyActionMFA: (code: string, actionType: string, targetTable: string, targetId: string) =>
        ApiClient.post('/api/auth/verify-action-mfa', {
            code,
            action_type: actionType,
            target_table: targetTable,
            target_id: targetId,
        }),

    // ========================================================================
    // 2. إدارة إعدادات المكتب (White-Labeling)
    // ========================================================================
    getFirmSettings: async (): Promise<any> => {
        try {
            const res = await ApiClient.get<any[]>('/api/settings');
            if (Array.isArray(res) && res.length > 0 && !(res as any).error) {
                localStorage.setItem(STORAGE_KEYS.FIRM_SETTINGS, JSON.stringify(res[0]));
                return res[0];
            }
            return res;
        } catch {
            const cached = localStorage.getItem(STORAGE_KEYS.FIRM_SETTINGS);
            return cached ? JSON.parse(cached) : null;
        }
    },

    updateFirmSettings: async (data: Record<string, any>): Promise<any> => {
        const res = await ApiClient.patch<any>('/api/settings', data);
        if (res && !res.error && !res.offline) {
            const current = JSON.parse(localStorage.getItem(STORAGE_KEYS.FIRM_SETTINGS) || '{}');
            const updated = { ...current, ...data };
            localStorage.setItem(STORAGE_KEYS.FIRM_SETTINGS, JSON.stringify(updated));
            AuthService.applyFirmBranding(updated);
        }
        return res;
    },

    // ========================================================================
    // 3. إدارة الموكلين (Clients - mo_clients)
    // ========================================================================
    getClients: async (): Promise<any[]> => {
        try {
            const data = await ApiClient.get<any[]>(
                '/api/clients?is_deleted=eq.false&select=*,mo_cases(id,total_agreed_fees,total_paid)&order=created_at.desc'
            );
            if (Array.isArray(data) && !(data as any).error) {
                localStorage.setItem('cache_clients', JSON.stringify(data));
                return data;
            }
            return [];
        } catch {
            return JSON.parse(localStorage.getItem('cache_clients') || '[]');
        }
    },

    getClientById: async (id: string): Promise<any> => {
        try {
            const res = await ApiClient.get<any[]>(`/api/clients?id=eq.${encodeURIComponent(id)}&select=*`);
            return Array.isArray(res) && res.length > 0 ? res[0] : null;
        } catch {
            const cached = JSON.parse(localStorage.getItem('cache_clients') || '[]');
            return cached.find((c: any) => String(c.id) === String(id)) || null;
        }
    },

    addClient: (data: Record<string, any>) => ApiClient.post<any>('/api/clients', data),

    updateClient: (id: string, data: Record<string, any>) =>
        ApiClient.patch<any>(`/api/clients?id=eq.${encodeURIComponent(id)}`, data),

    deleteClient: (id: string, actionToken?: string) =>
        ApiClient.delete<any>(
            `/api/clients?id=eq.${encodeURIComponent(id)}`,
            actionToken ? { 'x-action-token': actionToken } : {}
        ),

    // ========================================================================
    // 4. إدارة القضايا (Cases - mo_cases)
    // ========================================================================
    getCases: async (filterQuery = ''): Promise<any[]> => {
        const q = filterQuery ? `&${filterQuery}` : '';
        try {
            const data = await ApiClient.get<any[]>(
                `/api/cases?is_deleted=eq.false${q}&select=*,mo_clients(id,full_name,phone,national_id)&order=created_at.desc`
            );
            if (Array.isArray(data) && !(data as any).error) {
                if (!filterQuery) localStorage.setItem('cache_cases', JSON.stringify(data));
                return data;
            }
            return [];
        } catch {
            const cached: any[] = JSON.parse(localStorage.getItem('cache_cases') || '[]');
            if (filterQuery && filterQuery.includes('client_id=eq.')) {
                const cId = filterQuery.split('client_id=eq.')[1]?.split('&')[0];
                return cached.filter((c) => String(c.client_id) === String(cId));
            }
            return cached;
        }
    },

    getCaseById: async (id: string): Promise<any> => {
        try {
            const res = await ApiClient.get<any[]>(
                `/api/cases?id=eq.${encodeURIComponent(id)}&select=*,mo_clients(*)`
            );
            return Array.isArray(res) && res.length > 0 ? res[0] : null;
        } catch {
            const cached: any[] = JSON.parse(localStorage.getItem('cache_cases') || '[]');
            return cached.find((c) => String(c.id) === String(id)) || null;
        }
    },

    addCase: (data: Record<string, any>) => ApiClient.post<any>('/api/cases', data),

    updateCase: (id: string, data: Record<string, any>) =>
        ApiClient.patch<any>(`/api/cases?id=eq.${encodeURIComponent(id)}`, data),

    deleteCase: (id: string, actionToken?: string) =>
        ApiClient.delete<any>(
            `/api/cases?id=eq.${encodeURIComponent(id)}`,
            actionToken ? { 'x-action-token': actionToken } : {}
        ),

    // ========================================================================
    // 5. التحديثات والجلسات (Updates - mo_case_updates)
    // ========================================================================
    getUpdates: async (caseId: string): Promise<any[]> => {
        const res = await ApiClient.get<any[]>(
            `/api/updates?case_id=eq.${encodeURIComponent(caseId)}&order=created_at.desc`
        );
        return Array.isArray(res) ? res : [];
    },

    addUpdate: (data: Record<string, any>) => ApiClient.post<any>('/api/updates', data),

    deleteUpdate: (id: string, actionToken?: string) =>
        ApiClient.delete<any>(
            `/api/updates?id=eq.${encodeURIComponent(id)}`,
            actionToken ? { 'x-action-token': actionToken } : {}
        ),

    // ========================================================================
    // 6. الدفعات والأتعاب والمصاريف (Finance - mo_installments & mo_expenses)
    // ========================================================================
    getInstallments: async (caseId = ''): Promise<any[]> => {
        const q = caseId ? `case_id=eq.${encodeURIComponent(caseId)}&` : '';
        try {
            const data = await ApiClient.get<any[]>(`/api/installments?${q}order=created_at.desc`);
            if (Array.isArray(data) && !(data as any).error) {
                if (!caseId) localStorage.setItem('cache_installments', JSON.stringify(data));
                return data;
            }
            return [];
        } catch {
            const cached: any[] = JSON.parse(localStorage.getItem('cache_installments') || '[]');
            return caseId ? cached.filter((i) => String(i.case_id) === String(caseId)) : cached;
        }
    },

    addInstallment: (data: Record<string, any>) => ApiClient.post<any>('/api/installments', data),

    deleteInstallment: (id: string, actionToken?: string) =>
        ApiClient.delete<any>(
            `/api/installments?id=eq.${encodeURIComponent(id)}`,
            actionToken ? { 'x-action-token': actionToken } : {}
        ),

    getExpenses: async (caseId = ''): Promise<any[]> => {
        const q = caseId ? `case_id=eq.${encodeURIComponent(caseId)}&` : '';
        try {
            const data = await ApiClient.get<any[]>(`/api/expenses?${q}order=created_at.desc`);
            if (Array.isArray(data) && !(data as any).error) {
                if (!caseId) localStorage.setItem('cache_expenses', JSON.stringify(data));
                return data;
            }
            return [];
        } catch {
            const cached: any[] = JSON.parse(localStorage.getItem('cache_expenses') || '[]');
            return caseId ? cached.filter((e) => String(e.case_id) === String(caseId)) : cached;
        }
    },

    addExpense: (data: Record<string, any>) => ApiClient.post<any>('/api/expenses', data),

    deleteExpense: (id: string, actionToken?: string) =>
        ApiClient.delete<any>(
            `/api/expenses?id=eq.${encodeURIComponent(id)}`,
            actionToken ? { 'x-action-token': actionToken } : {}
        ),

    // ========================================================================
    // 7. الأجندة والمواعيد (Appointments - mo_appointments)
    // ========================================================================
    getAppointments: async (filterQuery = ''): Promise<any[]> => {
        const q = filterQuery ? `${filterQuery}&` : '';
        try {
            const data = await ApiClient.get<any[]>(
                `/api/appointments?${q}select=*,mo_clients(full_name),mo_cases(case_internal_id,current_court)&order=appt_date.asc`
            );
            if (Array.isArray(data) && !(data as any).error) {
                if (!filterQuery) localStorage.setItem('cache_appts', JSON.stringify(data));
                return data;
            }
            return [];
        } catch {
            const cached: any[] = JSON.parse(localStorage.getItem('cache_appts') || '[]');
            if (filterQuery && filterQuery.includes('client_id=eq.')) {
                const cId = filterQuery.split('client_id=eq.')[1]?.split('&')[0];
                return cached.filter((a) => String(a.client_id) === String(cId));
            }
            return cached;
        }
    },

    addAppointment: (data: Record<string, any>) => ApiClient.post<any>('/api/appointments', data),

    updateAppointment: (id: string, data: Record<string, any>) =>
        ApiClient.patch<any>(`/api/appointments?id=eq.${encodeURIComponent(id)}`, data),

    deleteAppointment: (id: string, actionToken?: string) =>
        ApiClient.delete<any>(
            `/api/appointments?id=eq.${encodeURIComponent(id)}`,
            actionToken ? { 'x-action-token': actionToken } : {}
        ),

    // ========================================================================
    // 8. الموارد البشرية (Staff - mo_users)
    // ========================================================================
    getStaff: async (): Promise<any[]> => {
        try {
            const data = await ApiClient.get<any[]>('/api/staff?order=created_at.asc');
            if (Array.isArray(data) && !(data as any).error) {
                localStorage.setItem('cache_staff', JSON.stringify(data));
                return data;
            }
            return [];
        } catch {
            return JSON.parse(localStorage.getItem('cache_staff') || '[]');
        }
    },

    addStaff: (data: Record<string, any>) => ApiClient.post<any>('/api/staff', data),

    updateStaff: (id: string, data: Record<string, any>) =>
        ApiClient.patch<any>(`/api/staff?id=eq.${encodeURIComponent(id)}`, data),

    deleteStaff: (id: string, actionToken?: string) =>
        ApiClient.delete<any>(
            `/api/staff?id=eq.${encodeURIComponent(id)}`,
            actionToken ? { 'x-action-token': actionToken } : {}
        ),

    // ========================================================================
    // 9. الأرشيف السحابي والملفات (Files & R2 Storage - mo_files)
    // ========================================================================
    getFiles: async (filterQuery = ''): Promise<any[]> => {
        const q = filterQuery ? `&${filterQuery}` : '';
        const res = await ApiClient.get<any[]>(
            `/api/files?is_deleted=eq.false${q}&order=created_at.desc`
        );
        return Array.isArray(res) ? res : [];
    },

    addFileRecord: (data: Record<string, any>) => ApiClient.post<any>('/api/files', data),

    deleteFile: (id: string, actionToken?: string) =>
        ApiClient.delete<any>(
            `/api/files?id=eq.${encodeURIComponent(id)}`,
            actionToken ? { 'x-action-token': actionToken } : {}
        ),

    uploadFileToR2: async (file: File, caseId = 'general', category = 'general') => {
        return R2Service.uploadFile(file, caseId);
    },

    downloadR2File: async (r2Key: string, fileName = 'document') => {
        return R2Service.downloadOrPreviewFile(r2Key, fileName);
    },

    cleanupOrphanR2File: async (r2Key: string) => {
        if (!r2Key || !navigator.onLine) return;
        try {
            await R2Service.deleteFile(r2Key);
        } catch {
            // Silent cleanup fallback
        }
    },

    // ========================================================================
    // 10. السجل الأمني والإشعارات والرادار (Audit Logs, Notifications, Search)
    // ========================================================================
    getHistory: async (filterQuery = ''): Promise<any[]> => {
        const q = filterQuery ? `${filterQuery}&` : '';
        const res = await ApiClient.get<any[]>(
            `/api/history?${q}select=*,mo_users(full_name)&order=created_at.desc&limit=100`
        );
        return Array.isArray(res) ? res : [];
    },

    getNotifications: async (): Promise<any[]> => {
        const res = await ApiClient.get<any[]>('/api/notifications?is_read=eq.false&order=created_at.desc&limit=25');
        return Array.isArray(res) ? res : [];
    },

    markNotificationAsRead: (id: string) =>
        ApiClient.patch<any>(`/api/notifications?id=eq.${encodeURIComponent(id)}`, { is_read: true }),

    smartSearch: (query: string) =>
        ApiClient.get<any>(`/api/search?q=${encodeURIComponent(query)}`),

    checkConflict: (name: string) =>
        ApiClient.post<any>('/api/conflict-check', { name }),

    sendHeartbeat: () => ApiClient.sendHeartbeat(),

    getOnlineUsers: async (): Promise<any[]> => {
        try {
            const res = await ApiClient.get<any>('/api/presence/online');
            return res && Array.isArray(res.online_users) ? res.online_users : [];
        } catch {
            return [];
        }
    },

    // ========================================================================
    // 11. الذكاء الاصطناعي القانوني (Cloudflare Workers AI + Vectorize RAG)
    // ========================================================================
    askAI: (content: string, history: Array<{ role: string; content: string }> = [], deepAnalysis = false) =>
        ApiClient.post<any>('/api/ai/process', {
            type: deepAnalysis ? 'deep_legal_analysis' : 'legal_advisor',
            content,
            history,
        }),

    readOCR: (imageBase64: string) =>
        ApiClient.post<any>('/api/ai/ocr', { image_base64: imageBase64 }),

    extractDataAI: (text: string, mode = 'id_extractor') =>
        ApiClient.post<any>('/api/ai/process', { type: mode, content: text }),

    extractLegalData: (content: string) =>
        ApiClient.post<any>('/api/ai/process', { type: 'extract_legal_data', content }),

    generateLegalDraft: (draftType: string, caseData: Record<string, any>, instructions = '') =>
        ApiClient.post<any>('/api/ai/process', {
            type: 'draft_generator',
            draft_type: draftType,
            case_data: caseData,
            content: instructions,
        }),

    generateSmartContract: (data: {
        contract_type: string;
        first_party: string;
        second_party: string;
        terms: string;
    }) =>
        ApiClient.post<any>('/api/ai/process', {
            type: 'smart_contract',
            ...data,
        }),

    findSimilarCases: (caseFacts: string, currentCaseId: string) =>
        ApiClient.post<any>('/api/ai/similar-cases', {
            facts: caseFacts,
            exclude_id: currentCaseId,
        }),

    // ========================================================================
    // 12. التحقق العام وبوابة الموكل والـ Super Admin
    // ========================================================================
    verifyDocumentPublic: async (docHash: string): Promise<any> => {
        const res = await fetch(`${API_BASE_URL}/api/public/verify-doc?hash=${encodeURIComponent(docHash)}`);
        return res.json();
    },
};

// Expose globally on window.API and window.fetchAPI for backward compatibility with any inline handlers
if (typeof window !== 'undefined') {
    (window as any).API = MoakkilAPI;
    (window as any).fetchAPI = (endpoint: string, method = 'GET', body: any = null, customHeaders: Record<string, string> = {}) =>
        ApiClient.request(endpoint, { method: method as any, body, headers: customHeaders });
}
