/**
 * ============================================================================
 * نظام موكّل (Moakkil System) - 2026
 * الملف: src/features/dashboard/MainAppPage.tsx
 * الوصف: لوحة القيادة المركزية (SPA 5-View Shell: الرئيسية، القضايا، الموكلين، الأجندة، الأدوات)
 * مطابق 100% لملف app.html + js/app-core.js + js/app-cases.js + js/app-clients.js
 * + js/app-agenda.js + js/app-settings.js
 * ============================================================================
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import Swal from 'sweetalert2';
import { MoakkilAPI } from '../../services/moakkilApi.service';
import { AuthService } from '../../services/auth.service';
import { AIHandler } from '../../services/aiHandler.service';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { STORAGE_KEYS } from '../../config/constants';
import { BottomNav, NavTab } from '../../components/layout/BottomNav';

/**
 * توليد رمز دخول سري عشوائي لبوابة الموكل (أحرف وأرقام واضحة Alphanumeric PIN)
 */
function generateAlphanumericPin(len = 6): string {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    const arr = new Uint8Array(len);
    window.crypto.getRandomValues(arr);
    return Array.from(arr)
        .map((b) => chars[b % chars.length])
        .join('');
}

export const MainAppPage: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { user, isOnline, queueLength, logout } = useAuth();
    const { isDark, toggleDarkMode, updateFirmBranding } = useTheme();

    // التبويب النشط من الـ Hash أو التخزين المحلي
    const getInitialView = (): NavTab => {
        const h = location.hash.replace('#', '') as NavTab;
        if (['dashboard', 'cases', 'clients', 'agenda', 'tools'].includes(h)) return h;
        const saved = localStorage.getItem('last_active_view') as NavTab;
        return ['dashboard', 'cases', 'clients', 'agenda', 'tools'].includes(saved) ? saved : 'dashboard';
    };

    const [activeView, setActiveView] = useState<NavTab>(getInitialView);

    useEffect(() => {
        const h = location.hash.replace('#', '') as NavTab;
        if (['dashboard', 'cases', 'clients', 'agenda', 'tools'].includes(h)) {
            setActiveView(h);
        }
    }, [location.hash]);

    const switchView = (tab: NavTab) => {
        setActiveView(tab);
        localStorage.setItem('last_active_view', tab);
        window.history.replaceState(null, '', `/app.html#${tab}`);
    };

    // البيانات المركزية
    const [cases, setCases] = useState<any[]>([]);
    const [clients, setClients] = useState<any[]>([]);
    const [appointments, setAppointments] = useState<any[]>([]);
    const [staff, setStaff] = useState<any[]>([]);
    const [notifications, setNotifications] = useState<any[]>([]);
    const [onlineUsers, setOnlineUsers] = useState<any[]>([]);
    const [loadingData, setLoadingData] = useState(true);

    // البحث الشامل
    const [globalSearchQuery, setGlobalSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<any | null>(null);

    // فلاتر القضايا والموكلين والأجندة
    const [caseSearch, setCaseSearch] = useState('');
    const [caseStatusFilter, setCaseStatusFilter] = useState('all');
    const [clientSearch, setClientSearch] = useState('');
    const [agendaViewMode, setAgendaViewMode] = useState<'list' | 'kanban'>('list');

    // نافذة إضافة قضية جديدة + فحص تعارض المصالح
    const [showAddCaseModal, setShowAddCaseModal] = useState(false);
    const [newCaseInternalId, setNewCaseInternalId] = useState(`CASE-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`);
    const [newCaseClientId, setNewCaseClientId] = useState('');
    const [newCaseType, setNewCaseType] = useState('حقوقية');
    const [newCaseCourt, setNewCaseCourt] = useState('');
    const [newCaseCourtNum, setNewCaseCourtNum] = useState('');
    const [newCaseOpponent, setNewCaseOpponent] = useState('');
    const [newCaseFees, setNewCaseFees] = useState('');
    const [newCasePin, setNewCasePin] = useState(generateAlphanumericPin(6));
    const [conflictWarning, setConflictWarning] = useState<string | null>(null);
    const [savingNewCase, setSavingNewCase] = useState(false);

    // نافذة إضافة موكل جديد + مسح الهوية بالكاميرا (OCR)
    const [showAddClientModal, setShowAddClientModal] = useState(false);
    const [newClientName, setNewClientName] = useState('');
    const [newClientPhone, setNewClientPhone] = useState('');
    const [newClientNatId, setNewClientNatId] = useState('');
    const [newClientAddress, setNewClientAddress] = useState('');
    const [savingNewClient, setSavingNewClient] = useState(false);

    // نافذة إضافة موعد / مهمة للأجندة
    const [showAddApptModal, setShowAddApptModal] = useState(false);
    const [newApptTitle, setNewApptTitle] = useState('');
    const [newApptDate, setNewApptDate] = useState(new Date().toISOString().split('T')[0]);
    const [newApptTime, setNewApptTime] = useState('09:00');
    const [newApptType, setNewApptType] = useState('جلسة محكمة');
    const [newApptClientId, setNewApptClientId] = useState('');
    const [newApptCaseId, setNewApptCaseId] = useState('');
    const [newApptNotes, setNewApptNotes] = useState('');
    const [savingNewAppt, setSavingNewAppt] = useState(false);

    // نافذة السجل الأمني (Audit Trail + AI Human Logs + Time Machine Diff)
    const [showAuditModal, setShowAuditModal] = useState(false);
    const [auditLogs, setAuditLogs] = useState<any[]>([]);
    const [loadingAudit, setLoadingAudit] = useState(false);
    const [selectedDiffLog, setSelectedDiffLog] = useState<any | null>(null);

    // نافذة مولد العقود الذكي بالذكاء الاصطناعي
    const [showSmartContractModal, setShowSmartContractModal] = useState(false);
    const [scType, setScType] = useState('عقد أتعاب محاماة ومصالحات');
    const [scFirstParty, setScFirstParty] = useState('');
    const [scSecondParty, setScSecondParty] = useState('');
    const [scTerms, setScTerms] = useState('');
    const [scOutput, setScOutput] = useState('');
    const [generatingSc, setGeneratingSc] = useState(false);

    // نافذة إعدادات هوية المكتب (White-Labeling)
    const [showSettingsModal, setShowSettingsModal] = useState(false);
    const [firmNameInput, setFirmNameInput] = useState('');
    const [primaryColorInput, setPrimaryColorInput] = useState('#0B132B');
    const [accentColorInput, setAccentColorInput] = useState('#D4AF37');
    const [savingSettings, setSavingSettings] = useState(false);

    // نافذة بطاقة الأعمال الرقمية (vCard QR)
    const [showVCardModal, setShowVCardModal] = useState(false);
    const vcardQrRef = useRef<HTMLDivElement>(null);

    const loadAllDashboardData = useCallback(async () => {
        setLoadingData(true);
        try {
            const [casesRes, clientsRes, apptsRes, staffRes, notifRes, onlineRes] = await Promise.all([
                MoakkilAPI.getCases(),
                MoakkilAPI.getClients(),
                MoakkilAPI.getAppointments(),
                MoakkilAPI.getStaff(),
                MoakkilAPI.getNotifications(),
                MoakkilAPI.getOnlineUsers(),
            ]);

            setCases(Array.isArray(casesRes) ? casesRes : []);
            setClients(Array.isArray(clientsRes) ? clientsRes : []);
            setAppointments(Array.isArray(apptsRes) ? apptsRes : []);
            setStaff(Array.isArray(staffRes) ? staffRes : []);
            setNotifications(Array.isArray(notifRes) ? notifRes : []);
            setOnlineUsers(Array.isArray(onlineRes) ? onlineRes : []);
        } catch (err) {
            console.error('Dashboard fetch error:', err);
        } finally {
            setLoadingData(false);
        }
    }, []);

    useEffect(() => {
        loadAllDashboardData();
    }, [loadAllDashboardData]);

    // توليد QR لبطاقة المحامي الرقمية (vCard)
    useEffect(() => {
        const QRCode = (window as any).QRCode;
        if (showVCardModal && vcardQrRef.current && QRCode && user) {
            vcardQrRef.current.innerHTML = '';
            const vcard = `BEGIN:VCARD\nVERSION:3.0\nFN:${user.full_name || ''}\nTEL:${
                user.phone || ''
            }\nORG:مكتب المحاماة\nEND:VCARD`;
            new QRCode(vcardQrRef.current, {
                text: vcard,
                width: 180,
                height: 180,
            });
        }
    }, [showVCardModal, user]);

    // البحث الذكي الشامل
    const handleGlobalSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        const q = globalSearchQuery.trim();
        if (!q) {
            setSearchResults(null);
            return;
        }
        try {
            const res = await MoakkilAPI.smartSearch(q);
            setSearchResults(res);
        } catch {
            setSearchResults(null);
        }
    };

    // فحص تعارض المصالح التلقائي عند كتابة اسم الخصم
    const handleCheckConflict = async (opponentName: string) => {
        setNewCaseOpponent(opponentName);
        if (opponentName.trim().length < 3 || !isOnline) {
            setConflictWarning(null);
            return;
        }
        try {
            const res = await MoakkilAPI.checkConflict(opponentName.trim());
            if (res && res.conflict_found) {
                setConflictWarning(
                    res.message || `تحذير تعارض مصالح: الاسم (${opponentName}) مسجل كموكل سابق في المكتب!`
                );
            } else {
                setConflictWarning(null);
            }
        } catch {
            setConflictWarning(null);
        }
    };

    // إضافة قضية جديدة
    const handleCreateCase = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newCaseClientId) {
            Swal.fire('تنبيه', 'يرجى اختيار الموكل المرتبط بالقضية', 'warning');
            return;
        }
        setSavingNewCase(true);
        try {
            const payload = {
                case_internal_id: newCaseInternalId.trim(),
                client_id: newCaseClientId,
                case_type: newCaseType,
                current_court: newCaseCourt.trim() || null,
                court_case_number: newCaseCourtNum.trim() || null,
                opponent_name: newCaseOpponent.trim() || null,
                total_agreed_fees: parseFloat(newCaseFees) || 0,
                access_pin: newCasePin.trim().toUpperCase(),
                public_token: window.crypto?.randomUUID ? window.crypto.randomUUID() : 'tok_' + Date.now(),
                status: 'نشطة',
            };
            const res = await MoakkilAPI.addCase(payload);
            if (res && !res.error) {
                Swal.fire({
                    toast: true,
                    position: 'top-end',
                    icon: 'success',
                    title: 'تم فتح ملف القضية وتوليد بوابة الموكل بنجاح',
                    showConfirmButton: false,
                    timer: 2500,
                });
                setShowAddCaseModal(false);
                setNewCaseInternalId(`CASE-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`);
                setNewCasePin(generateAlphanumericPin(6));
                setNewCaseOpponent('');
                await loadAllDashboardData();
            } else {
                throw new Error(res?.error || 'فشل إنشاء القضية');
            }
        } catch (err: any) {
            Swal.fire('خطأ', err.message, 'error');
        } finally {
            setSavingNewCase(false);
        }
    };

    // إضافة موكل جديد + مسح الهوية بالكاميرا (OCR)
    const handleScanClientOcr = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const data = await AIHandler.scanIDCard(file);
        if (data) {
            if (data.full_name || data['الاسم']) setNewClientName(data.full_name || data['الاسم']);
            if (data.national_id || data['الرقم الوطني'])
                setNewClientNatId(data.national_id || data['الرقم الوطني']);
            if (data.address || data['العنوان']) setNewClientAddress(data.address || data['العنوان']);
        }
        e.target.value = '';
    };

    const handleCreateClient = async (e: React.FormEvent) => {
        e.preventDefault();
        setSavingNewClient(true);
        try {
            const res = await MoakkilAPI.addClient({
                full_name: newClientName.trim(),
                phone: newClientPhone.trim(),
                national_id: newClientNatId.trim() || null,
                address: newClientAddress.trim() || null,
                client_portal_active: true,
            });
            if (res && !res.error) {
                Swal.fire({
                    toast: true,
                    position: 'top-end',
                    icon: 'success',
                    title: 'تم تسجيل الموكل بنجاح',
                    showConfirmButton: false,
                    timer: 2000,
                });
                setShowAddClientModal(false);
                setNewClientName('');
                setNewClientPhone('');
                setNewClientNatId('');
                setNewClientAddress('');
                await loadAllDashboardData();
            } else {
                throw new Error(res?.error || 'فشل إضافة الموكل');
            }
        } catch (err: any) {
            Swal.fire('خطأ', err.message, 'error');
        } finally {
            setSavingNewClient(false);
        }
    };

    // إضافة موعد للأجندة بتوقيت الأردن (+03:00)
    const handleCreateAppointment = async (e: React.FormEvent) => {
        e.preventDefault();
        setSavingNewAppt(true);
        try {
            const isoJordan = `${newApptDate}T${newApptTime}:00+03:00`;
            const res = await MoakkilAPI.addAppointment({
                title: newApptTitle.trim(),
                appt_date: isoJordan,
                type: newApptType,
                status: 'مجدول',
                client_id: newApptClientId || null,
                related_case_id: newApptCaseId || null,
                notes: newApptNotes.trim() || null,
            });
            if (res && !res.error) {
                Swal.fire({
                    toast: true,
                    position: 'top-end',
                    icon: 'success',
                    title: 'تمت جدولة الموعد في الأجندة',
                    showConfirmButton: false,
                    timer: 2000,
                });
                setShowAddApptModal(false);
                setNewApptTitle('');
                setNewApptNotes('');
                await loadAllDashboardData();
            } else {
                throw new Error(res?.error || 'فشل حفظ الموعد');
            }
        } catch (err: any) {
            Swal.fire('خطأ', err.message, 'error');
        } finally {
            setSavingNewAppt(false);
        }
    };

    const handleUpdateApptStatus = async (apptId: string, nextStatus: string) => {
        const res = await MoakkilAPI.updateAppointment(apptId, { status: nextStatus });
        if (res && !res.error) {
            await loadAllDashboardData();
        }
    };

    // تصدير موعد إلى تقويم الهاتف (.ics)
    const exportApptToIcs = (appt: any) => {
        const dt = new Date(appt.appt_date || Date.now());
        const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
        const endDt = new Date(dt.getTime() + 60 * 60 * 1000);
        const icsContent = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'BEGIN:VEVENT',
            `DTSTART:${fmt(dt)}`,
            `DTEND:${fmt(endDt)}`,
            `SUMMARY:${appt.title || 'موعد قضائي'}`,
            `DESCRIPTION:${appt.notes || ''}`,
            'END:VEVENT',
            'END:VCALENDAR',
        ].join('\r\n');

        const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `appointment_${appt.id}.ics`;
        a.click();
    };

    // فتح السجل الأمني الموضح بالذكاء الاصطناعي (Cloudflare AI Audit Logs)
    const openAuditTrailModal = async () => {
        setShowAuditModal(true);
        setLoadingAudit(true);
        try {
            const logs = await MoakkilAPI.getHistory();
            setAuditLogs(Array.isArray(logs) ? logs : []);
        } catch {
            setAuditLogs([]);
        } finally {
            setLoadingAudit(false);
        }
    };

    // استرجاع البيانات السابقة (Time Machine Rollback) من سجل الرقابة
    const handleRollbackAuditLog = async (log: any) => {
        if (!log.old_data || !log.entity_type || !log.entity_id) return;
        const confirm = await Swal.fire({
            title: 'آلة الزمن (Time Machine Rollback)',
            text: 'هل تريد استعادة النسخة السابقة من هذا السجل قبل التعديل؟',
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'نعم، استرجاع النسخة السابقة',
            cancelButtonText: 'إلغاء',
        });
        if (!confirm.isConfirmed) return;

        try {
            const cleanOld = { ...log.old_data };
            delete cleanOld.id;
            delete cleanOld.firm_id;
            delete cleanOld.created_at;
            delete cleanOld._human_log;
            delete cleanOld._changes_list;

            let res: any;
            if (log.entity_type === 'mo_cases') {
                res = await MoakkilAPI.updateCase(log.entity_id, cleanOld);
            } else if (log.entity_type === 'mo_clients') {
                res = await MoakkilAPI.updateClient(log.entity_id, cleanOld);
            } else if (log.entity_type === 'mo_appointments') {
                res = await MoakkilAPI.updateAppointment(log.entity_id, cleanOld);
            }
            if (res && !res.error) {
                Swal.fire('تمت الاستعادة', 'تمت استعادة البيانات السابقة بنجاح.', 'success');
                setSelectedDiffLog(null);
                await openAuditTrailModal();
                await loadAllDashboardData();
            }
        } catch (err: any) {
            Swal.fire('خطأ', err.message, 'error');
        }
    };

    // توليد عقد ذكي بالذكاء الاصطناعي
    const handleGenerateSmartContract = async (e: React.FormEvent) => {
        e.preventDefault();
        setGeneratingSc(true);
        try {
            const res = await MoakkilAPI.generateSmartContract({
                contract_type: scType,
                first_party: scFirstParty,
                second_party: scSecondParty,
                terms: scTerms,
            });
            if (res && (res.contract || res.reply || res.draft)) {
                setScOutput(res.contract || res.reply || res.draft);
            } else {
                throw new Error(res?.error || 'تعذر صياغة العقد');
            }
        } catch (err: any) {
            Swal.fire('خطأ', err.message, 'error');
        } finally {
            setGeneratingSc(false);
        }
    };

    // حفظ إعدادات هوية المكتب (White-Labeling)
    const handleSaveFirmSettings = async (e: React.FormEvent) => {
        e.preventDefault();
        setSavingSettings(true);
        try {
            const payload = {
                firm_name: firmNameInput.trim(),
                primary_color: primaryColorInput,
                accent_color: accentColorInput,
            };
            await MoakkilAPI.updateFirmSettings(payload);
            updateFirmBranding(payload);
            Swal.fire('تم الحفظ', 'تم تحديث الهوية البصرية للمكتب بنجاح.', 'success');
            setShowSettingsModal(false);
        } catch (err: any) {
            Swal.fire('خطأ', err.message, 'error');
        } finally {
            setSavingSettings(false);
        }
    };

    // حساب الإيجاز الصباحي العاجل
    const todayIso = new Date().toISOString().split('T')[0];
    const todayAppts = appointments.filter((a) => (a.appt_date || '').startsWith(todayIso));

    const filteredCases = cases.filter((c) => {
        const matchesStatus = caseStatusFilter === 'all' || c.status === caseStatusFilter;
        const q = caseSearch.toLowerCase();
        const matchesSearch =
            !q ||
            (c.case_internal_id || '').toLowerCase().includes(q) ||
            (c.opponent_name || '').toLowerCase().includes(q) ||
            (c.court_case_number || '').toLowerCase().includes(q) ||
            (c.mo_clients?.full_name || '').toLowerCase().includes(q);
        return matchesStatus && matchesSearch;
    });

    const filteredClients = clients.filter((cl) => {
        const q = clientSearch.toLowerCase();
        return (
            !q ||
            (cl.full_name || '').toLowerCase().includes(q) ||
            (cl.phone || '').includes(q) ||
            (cl.national_id || '').includes(q)
        );
    });

    return (
        <div className="min-vh-100 pb-5 mb-5">
            {/* شريط التنقل العلوي الموحد */}
            <header className="top-nav px-3 py-3 d-flex justify-content-between align-items-center">
                <div className="d-flex align-items-center gap-2">
                    <div
                        className="rounded-circle d-flex align-items-center justify-content-center shadow-sm"
                        style={{
                            width: 40,
                            height: 40,
                            background: 'rgba(212, 175, 55, 0.15)',
                            border: '2px solid #D4AF37',
                        }}
                    >
                        <i className="fas fa-balance-scale" style={{ color: '#D4AF37' }}></i>
                    </div>
                    <div>
                        <h6 className="mb-0 fw-bold text-white">
                            {user?.firm_name || 'نظام موكّل ERP'}
                        </h6>
                        <small className="text-white-50 fw-bold" style={{ fontSize: '0.72rem' }}>
                            أهلاً، {user?.full_name || 'أستاذ'}
                        </small>
                    </div>
                </div>

                <div className="d-flex align-items-center gap-2">
                    {!isOnline && (
                        <span className="badge bg-warning text-dark fw-bold">
                            Offline ({queueLength})
                        </span>
                    )}
                    <button
                        className="btn btn-sm btn-outline-light rounded-3 px-2"
                        onClick={toggleDarkMode}
                        title="تبديل الوضع الليلي"
                    >
                        <i className={`fas ${isDark ? 'fa-sun text-warning' : 'fa-moon'}`}></i>
                    </button>
                    <button
                        className="btn btn-sm btn-outline-light rounded-3 px-2"
                        onClick={loadAllDashboardData}
                        title="تحديث البيانات"
                    >
                        <i className={`fas fa-sync-alt ${loadingData ? 'fa-spin' : ''}`}></i>
                    </button>
                    <button
                        className="btn btn-sm btn-danger rounded-3 px-2 fw-bold"
                        onClick={() => logout()}
                        title="تسجيل الخروج الآمن"
                    >
                        <i className="fas fa-power-off"></i>
                    </button>
                </div>
            </header>

            <main className="container mt-4">
                {/* =========================================================
                    1. واجهة لوحة القيادة الرئيسية (Dashboard View)
                   ========================================================= */}
                {activeView === 'dashboard' && (
                    <div className="fade-in">
                        {/* شريط البحث الذكي الشامل */}
                        <form onSubmit={handleGlobalSearch} className="mb-4">
                            <div className="input-group input-group-lg shadow-sm rounded-4 overflow-hidden">
                                <input
                                    type="text"
                                    className="form-control border-0 fw-bold"
                                    placeholder="ابحث في القضايا، الموكلين، المحاكم، أو اسأل المستشار الذكي..."
                                    value={globalSearchQuery}
                                    onChange={(e) => setGlobalSearchQuery(e.target.value)}
                                />
                                <button
                                    type="submit"
                                    className="btn fw-bold px-4"
                                    style={{ background: '#0B132B', color: '#D4AF37' }}
                                >
                                    <i className="fas fa-search"></i>
                                </button>
                                {globalSearchQuery.trim() && (
                                    <button
                                        type="button"
                                        className="btn btn-warning fw-bold"
                                        onClick={() =>
                                            navigate(
                                                `/ai-chat.html?q=${encodeURIComponent(globalSearchQuery.trim())}`
                                            )
                                        }
                                    >
                                        <i className="fas fa-robot me-1"></i> اسأل AI
                                    </button>
                                )}
                            </div>
                        </form>

                        {searchResults && (
                            <div className="card border-0 shadow-sm rounded-4 p-3 mb-4">
                                <div className="d-flex justify-content-between align-items-center mb-2">
                                    <h6 className="fw-bold text-navy mb-0">نتائج البحث الشامل</h6>
                                    <button
                                        className="btn btn-sm btn-close"
                                        onClick={() => setSearchResults(null)}
                                    ></button>
                                </div>
                                <div className="small fw-bold">
                                    {Array.isArray(searchResults.cases) &&
                                        searchResults.cases.map((c: any) => (
                                            <div
                                                key={c.id}
                                                className="p-2 border-bottom"
                                                style={{ cursor: 'pointer' }}
                                                onClick={() => navigate(`/case-details.html?id=${c.id}`)}
                                            >
                                                <i className="fas fa-gavel text-warning me-2"></i>
                                                قضية: {c.case_internal_id} — ضد {c.opponent_name}
                                            </div>
                                        ))}
                                    {Array.isArray(searchResults.clients) &&
                                        searchResults.clients.map((cl: any) => (
                                            <div
                                                key={cl.id}
                                                className="p-2 border-bottom"
                                                style={{ cursor: 'pointer' }}
                                                onClick={() => navigate(`/client-details.html?id=${cl.id}`)}
                                            >
                                                <i className="fas fa-user text-primary me-2"></i>
                                                موكل: {cl.full_name} ({cl.phone})
                                            </div>
                                        ))}
                                </div>
                            </div>
                        )}

                        {/* الإيجاز الصباحي العاجل */}
                        <div
                            className="card border-0 shadow-sm rounded-4 p-4 mb-4 text-white"
                            style={{ background: 'linear-gradient(135deg, #0B132B, #1C2541)' }}
                        >
                            <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
                                <div>
                                    <h5 className="fw-bold mb-1" style={{ color: '#D4AF37' }}>
                                        <i className="fas fa-sun me-2"></i> الإيجاز القضائي اليومي
                                    </h5>
                                    <p className="mb-0 small fw-bold text-white-50">
                                        لديك اليوم ({todayAppts.length}) جلسات ومواعيد مجدولة، وإجمالي ({cases.length})
                                        ملفات قضائية نشطة.
                                    </p>
                                </div>
                                <div className="d-flex gap-2">
                                    <button
                                        className="btn btn-sm btn-gold fw-bold"
                                        onClick={() => setShowAddCaseModal(true)}
                                    >
                                        <i className="fas fa-plus me-1"></i> قضية جديدة
                                    </button>
                                    <button
                                        className="btn btn-sm btn-outline-light fw-bold"
                                        onClick={() => setShowAddClientModal(true)}
                                    >
                                        <i className="fas fa-user-plus me-1"></i> موكل جديد
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* بطاقات الإحصائيات السريعة */}
                        <div className="row g-3 mb-4">
                            <div className="col-6 col-md-3">
                                <div
                                    className="card border-0 shadow-sm rounded-4 p-3 text-center h-100"
                                    style={{ cursor: 'pointer' }}
                                    onClick={() => switchView('cases')}
                                >
                                    <i className="fas fa-gavel fa-2x mb-2" style={{ color: '#D4AF37' }}></i>
                                    <h3 className="fw-bold text-navy font-monospace mb-0">{cases.length}</h3>
                                    <small className="text-muted fw-bold">إجمالي القضايا</small>
                                </div>
                            </div>
                            <div className="col-6 col-md-3">
                                <div
                                    className="card border-0 shadow-sm rounded-4 p-3 text-center h-100"
                                    style={{ cursor: 'pointer' }}
                                    onClick={() => switchView('clients')}
                                >
                                    <i className="fas fa-users fa-2x mb-2 text-primary"></i>
                                    <h3 className="fw-bold text-navy font-monospace mb-0">{clients.length}</h3>
                                    <small className="text-muted fw-bold">الموكلون المسجلون</small>
                                </div>
                            </div>
                            <div className="col-6 col-md-3">
                                <div
                                    className="card border-0 shadow-sm rounded-4 p-3 text-center h-100"
                                    style={{ cursor: 'pointer' }}
                                    onClick={() => switchView('agenda')}
                                >
                                    <i className="fas fa-calendar-day fa-2x mb-2 text-success"></i>
                                    <h3 className="fw-bold text-navy font-monospace mb-0">{appointments.length}</h3>
                                    <small className="text-muted fw-bold">الجلسات والمواعيد</small>
                                </div>
                            </div>
                            <div className="col-6 col-md-3">
                                <div
                                    className="card border-0 shadow-sm rounded-4 p-3 text-center h-100"
                                    style={{ cursor: 'pointer' }}
                                    onClick={openAuditTrailModal}
                                >
                                    <i className="fas fa-shield-alt fa-2x mb-2 text-danger"></i>
                                    <h3 className="fw-bold text-navy font-monospace mb-0">
                                        {onlineUsers.length || 1}
                                    </h3>
                                    <small className="text-muted fw-bold">متصلون الآن / الرقابة</small>
                                </div>
                            </div>
                        </div>

                        {/* أحدث القضايا والجلسات القادمة */}
                        <div className="row g-4">
                            <div className="col-md-6">
                                <div className="card border-0 shadow-sm rounded-4 p-4 h-100">
                                    <div className="d-flex justify-content-between align-items-center mb-3">
                                        <h6 className="fw-bold text-navy mb-0">
                                            <i className="fas fa-folder-open me-2 text-warning"></i> أحدث الملفات القضائية
                                        </h6>
                                        <button
                                            className="btn btn-sm btn-link fw-bold text-decoration-none"
                                            onClick={() => switchView('cases')}
                                        >
                                            عرض الكل
                                        </button>
                                    </div>
                                    {cases.slice(0, 5).map((c) => (
                                        <div
                                            key={c.id}
                                            className="p-3 mb-2 border rounded-3 d-flex justify-content-between align-items-center"
                                            style={{ cursor: 'pointer' }}
                                            onClick={() => navigate(`/case-details.html?id=${c.id}`)}
                                        >
                                            <div>
                                                <strong className="text-navy d-block">
                                                    {c.case_internal_id} — ضد: {c.opponent_name || '--'}
                                                </strong>
                                                <small className="text-muted fw-bold">
                                                    الموكل: {c.mo_clients?.full_name || '--'} | {c.current_court || '--'}
                                                </small>
                                            </div>
                                            <span className="badge bg-success">{c.status || 'نشطة'}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="col-md-6">
                                <div className="card border-0 shadow-sm rounded-4 p-4 h-100">
                                    <div className="d-flex justify-content-between align-items-center mb-3">
                                        <h6 className="fw-bold text-navy mb-0">
                                            <i className="fas fa-calendar-check me-2 text-success"></i> الجلسات والمهام القادمة
                                        </h6>
                                        <button
                                            className="btn btn-sm btn-gold fw-bold"
                                            onClick={() => setShowAddApptModal(true)}
                                        >
                                            <i className="fas fa-plus"></i> موعد
                                        </button>
                                    </div>
                                    {appointments.slice(0, 5).map((a) => (
                                        <div
                                            key={a.id}
                                            className="p-3 mb-2 border rounded-3 d-flex justify-content-between align-items-center"
                                        >
                                            <div>
                                                <strong className="text-navy d-block">{a.title}</strong>
                                                <small className="text-muted font-monospace fw-bold">
                                                    {a.appt_date
                                                        ? new Date(a.appt_date).toLocaleString('ar-JO')
                                                        : '--'}
                                                </small>
                                            </div>
                                            <span className="badge bg-primary">{a.status || 'مجدول'}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* =========================================================
                    2. واجهة إدارة القضايا (Cases View)
                   ========================================================= */}
                {activeView === 'cases' && (
                    <div className="fade-in">
                        <div className="d-flex justify-content-between align-items-center mb-3">
                            <h5 className="fw-bold text-navy mb-0">
                                <i className="fas fa-gavel me-2 text-warning"></i> سجل القضايا والملفات ({filteredCases.length})
                            </h5>
                            <button className="btn btn-gold fw-bold" onClick={() => setShowAddCaseModal(true)}>
                                <i className="fas fa-plus me-1"></i> فتح ملف قضية
                            </button>
                        </div>

                        <div className="row g-2 mb-4">
                            <div className="col-md-8">
                                <input
                                    type="text"
                                    className="form-control form-control-lg rounded-4 fw-bold"
                                    placeholder="ابحث برقم الملف، اسم الموكل، الخصم، أو رقم الدعوى..."
                                    value={caseSearch}
                                    onChange={(e) => setCaseSearch(e.target.value)}
                                />
                            </div>
                            <div className="col-md-4">
                                <select
                                    className="form-select form-select-lg rounded-4 fw-bold"
                                    value={caseStatusFilter}
                                    onChange={(e) => setCaseStatusFilter(e.target.value)}
                                >
                                    <option value="all">جميع الحالات</option>
                                    <option value="نشطة">نشطة</option>
                                    <option value="مؤجلة">مؤجلة</option>
                                    <option value="مكتملة">مكتملة</option>
                                    <option value="مغلقة">مغلقة</option>
                                </select>
                            </div>
                        </div>

                        <div className="row g-3">
                            {filteredCases.map((c) => (
                                <div key={c.id} className="col-md-6 col-lg-4">
                                    <div
                                        className="card border-0 shadow-sm rounded-4 p-4 h-100 d-flex flex-column"
                                        style={{ borderRight: '4px solid #D4AF37', cursor: 'pointer' }}
                                        onClick={() => navigate(`/case-details.html?id=${c.id}`)}
                                    >
                                        <div className="d-flex justify-content-between align-items-center mb-2">
                                            <span className="badge bg-navy text-warning font-monospace">
                                                {c.case_internal_id}
                                            </span>
                                            <span className="badge bg-success bg-opacity-10 text-success">
                                                {c.status || 'نشطة'}
                                            </span>
                                        </div>
                                        <h6 className="fw-bold text-navy mb-1">
                                            ضد: {c.opponent_name || 'غير محدد'}
                                        </h6>
                                        <small className="text-muted fw-bold d-block mb-2">
                                            الموكل: {c.mo_clients?.full_name || '--'} | {c.current_court || '--'}
                                        </small>
                                        <div className="mt-auto pt-2 border-top d-flex justify-content-between align-items-center small fw-bold">
                                            <span>
                                                PIN البوابة: <code className="fs-6">{c.access_pin || '--'}</code>
                                            </span>
                                            <span className="text-primary">فتح الغرفة &larr;</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* =========================================================
                    3. واجهة إدارة الموكلين (Clients View)
                   ========================================================= */}
                {activeView === 'clients' && (
                    <div className="fade-in">
                        <div className="d-flex justify-content-between align-items-center mb-3">
                            <h5 className="fw-bold text-navy mb-0">
                                <i className="fas fa-users me-2 text-warning"></i> سجل الموكلين ({filteredClients.length})
                            </h5>
                            <button className="btn btn-gold fw-bold" onClick={() => setShowAddClientModal(true)}>
                                <i className="fas fa-user-plus me-1"></i> تسجيل موكل جديد
                            </button>
                        </div>

                        <div className="mb-4">
                            <input
                                type="text"
                                className="form-control form-control-lg rounded-4 fw-bold"
                                placeholder="ابحث باسم الموكل، رقم الهاتف، أو الرقم الوطني..."
                                value={clientSearch}
                                onChange={(e) => setClientSearch(e.target.value)}
                            />
                        </div>

                        <div className="row g-3">
                            {filteredClients.map((cl) => (
                                <div key={cl.id} className="col-md-6 col-lg-4">
                                    <div
                                        className="card border-0 shadow-sm rounded-4 p-4 h-100"
                                        style={{ cursor: 'pointer' }}
                                        onClick={() => navigate(`/client-details.html?id=${cl.id}`)}
                                    >
                                        <h6 className="fw-bold text-navy mb-1">{cl.full_name}</h6>
                                        <div className="small fw-bold text-muted mb-2" dir="ltr">
                                            <i className="fas fa-phone-alt text-success me-1"></i> {cl.phone}
                                        </div>
                                        <div className="small fw-bold text-muted">
                                            الرقم الوطني: <span className="font-monospace">{cl.national_id || '--'}</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* =========================================================
                    4. واجهة الأجندة القضائية ولوحة كانبان (Agenda View)
                   ========================================================= */}
                {activeView === 'agenda' && (
                    <div className="fade-in">
                        <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-4">
                            <h5 className="fw-bold text-navy mb-0">
                                <i className="fas fa-calendar-alt me-2 text-warning"></i> الأجندة القضائية والمهام
                            </h5>
                            <div className="d-flex gap-2">
                                <button
                                    className={`btn btn-sm fw-bold ${
                                        agendaViewMode === 'list' ? 'btn-dark' : 'btn-outline-dark'
                                    }`}
                                    onClick={() => setAgendaViewMode('list')}
                                >
                                    <i className="fas fa-list me-1"></i> قائمة
                                </button>
                                <button
                                    className={`btn btn-sm fw-bold ${
                                        agendaViewMode === 'kanban' ? 'btn-dark' : 'btn-outline-dark'
                                    }`}
                                    onClick={() => setAgendaViewMode('kanban')}
                                >
                                    <i className="fas fa-columns me-1"></i> كانبان (Kanban)
                                </button>
                                <button
                                    className="btn btn-sm btn-gold fw-bold"
                                    onClick={() => setShowAddApptModal(true)}
                                >
                                    <i className="fas fa-plus me-1"></i> موعد جديد
                                </button>
                            </div>
                        </div>

                        {agendaViewMode === 'list' ? (
                            <div className="card border-0 shadow-sm rounded-4 p-4">
                                {appointments.map((a) => (
                                    <div
                                        key={a.id}
                                        className="p-3 mb-2 border rounded-3 d-flex justify-content-between align-items-center flex-wrap gap-2"
                                    >
                                        <div>
                                            <h6 className="fw-bold text-navy mb-1">{a.title}</h6>
                                            <small className="text-muted font-monospace fw-bold">
                                                {a.appt_date ? new Date(a.appt_date).toLocaleString('ar-JO') : '--'} |{' '}
                                                {a.type || 'موعد'}
                                            </small>
                                        </div>
                                        <div className="d-flex gap-2 align-items-center">
                                            <select
                                                className="form-select form-select-sm fw-bold w-auto"
                                                value={a.status || 'مجدول'}
                                                onChange={(e) => handleUpdateApptStatus(a.id, e.target.value)}
                                            >
                                                <option value="مجدول">مجدول</option>
                                                <option value="مؤجل">مؤجل</option>
                                                <option value="تم">تم الإنجاز</option>
                                            </select>
                                            <button
                                                className="btn btn-sm btn-outline-secondary"
                                                onClick={() => exportApptToIcs(a)}
                                                title="إضافة لتقويم الهاتف (.ics)"
                                            >
                                                <i className="fas fa-calendar-plus"></i>
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="row g-3">
                                {(['مجدول', 'مؤجل', 'تم'] as const).map((colStatus) => (
                                    <div key={colStatus} className="col-md-4">
                                        <div className="card border-0 shadow-sm rounded-4 p-3 h-100">
                                            <h6 className="fw-bold text-navy border-bottom pb-2 mb-3">
                                                {colStatus === 'تم' ? 'منجز (تم)' : colStatus}
                                            </h6>
                                            {appointments
                                                .filter((a) => (a.status || 'مجدول') === colStatus)
                                                .map((a) => (
                                                    <div key={a.id} className="p-3 mb-2 border rounded-3 bg-light">
                                                        <strong className="d-block text-navy small mb-1">
                                                            {a.title}
                                                        </strong>
                                                        <small className="text-muted font-monospace d-block mb-2">
                                                            {a.appt_date
                                                                ? new Date(a.appt_date).toLocaleDateString('ar-JO')
                                                                : ''}
                                                        </small>
                                                        <div className="d-flex gap-1">
                                                            {colStatus !== 'تم' && (
                                                                <button
                                                                    className="btn btn-sm btn-success py-0 px-2"
                                                                    onClick={() => handleUpdateApptStatus(a.id, 'تم')}
                                                                >
                                                                    إنجاز
                                                                </button>
                                                            )}
                                                            {colStatus === 'مجدول' && (
                                                                <button
                                                                    className="btn btn-sm btn-warning py-0 px-2"
                                                                    onClick={() =>
                                                                        handleUpdateApptStatus(a.id, 'مؤجل')
                                                                    }
                                                                >
                                                                    تأجيل
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* =========================================================
                    5. واجهة الأدوات والإعدادات والذكاء الاصطناعي (Tools Hub)
                   ========================================================= */}
                {activeView === 'tools' && (
                    <div className="fade-in">
                        <h5 className="fw-bold text-navy mb-4">
                            <i className="fas fa-toolbox me-2 text-warning"></i> منظومة الأدوات الذكية والإدارة
                        </h5>

                        <div className="row g-3">
                            <div className="col-md-4 col-6">
                                <Link
                                    to="/ai-chat.html"
                                    className="card border-0 shadow-sm rounded-4 p-4 text-center text-decoration-none h-100"
                                >
                                    <i className="fas fa-robot fa-2x mb-2 text-primary"></i>
                                    <h6 className="fw-bold text-navy mb-1">المستشار القانوني الذكي</h6>
                                    <small className="text-muted fw-bold">محرك التشريعات الأردنية (RAG)</small>
                                </Link>
                            </div>

                            <div className="col-md-4 col-6">
                                <Link
                                    to="/library.html"
                                    className="card border-0 shadow-sm rounded-4 p-4 text-center text-decoration-none h-100"
                                >
                                    <i className="fas fa-book fa-2x mb-2 text-warning"></i>
                                    <h6 className="fw-bold text-navy mb-1">المكتبة والنماذج السحابية</h6>
                                    <small className="text-muted fw-bold">محرر العقود والتوقيع الحي</small>
                                </Link>
                            </div>

                            <div className="col-md-4 col-6">
                                <Link
                                    to="/calculators.html"
                                    className="card border-0 shadow-sm rounded-4 p-4 text-center text-decoration-none h-100"
                                >
                                    <i className="fas fa-calculator fa-2x mb-2 text-success"></i>
                                    <h6 className="fw-bold text-navy mb-1">الحاسبات الشرعية والمالية</h6>
                                    <small className="text-muted fw-bold">المواريث، الفائدة 9%، الحصص</small>
                                </Link>
                            </div>

                            <div className="col-md-4 col-6">
                                <Link
                                    to="/reports.html"
                                    className="card border-0 shadow-sm rounded-4 p-4 text-center text-decoration-none h-100"
                                >
                                    <i className="fas fa-chart-line fa-2x mb-2 text-info"></i>
                                    <h6 className="fw-bold text-navy mb-1">التقارير والمؤشرات المالية</h6>
                                    <small className="text-muted fw-bold">تحليل الأتعاب وأداء المحامين</small>
                                </Link>
                            </div>

                            <div className="col-md-4 col-6">
                                <Link
                                    to="/staff.html"
                                    className="card border-0 shadow-sm rounded-4 p-4 text-center text-decoration-none h-100"
                                >
                                    <i className="fas fa-users-tie fa-2x mb-2 text-danger"></i>
                                    <h6 className="fw-bold text-navy mb-1">الموارد البشرية والبصمة</h6>
                                    <small className="text-muted fw-bold">إدارة الكوادر والرواتب وWebAuthn</small>
                                </Link>
                            </div>

                            <div className="col-md-4 col-6">
                                <div
                                    className="card border-0 shadow-sm rounded-4 p-4 text-center h-100"
                                    style={{ cursor: 'pointer' }}
                                    onClick={openAuditTrailModal}
                                >
                                    <i className="fas fa-shield-alt fa-2x mb-2 text-dark"></i>
                                    <h6 className="fw-bold text-navy mb-1">السجل الأمني الذكي (AI Audit)</h6>
                                    <small className="text-muted fw-bold">توضيح التعديلات وآلة الزمن</small>
                                </div>
                            </div>

                            <div className="col-md-4 col-6">
                                <div
                                    className="card border-0 shadow-sm rounded-4 p-4 text-center h-100"
                                    style={{ cursor: 'pointer' }}
                                    onClick={() => setShowSmartContractModal(true)}
                                >
                                    <i className="fas fa-file-signature fa-2x mb-2 text-primary"></i>
                                    <h6 className="fw-bold text-navy mb-1">مولد العقود الذكي (AI)</h6>
                                    <small className="text-muted fw-bold">صياغة العقود والاتفاقيات فوراً</small>
                                </div>
                            </div>

                            <div className="col-md-4 col-6">
                                <div
                                    className="card border-0 shadow-sm rounded-4 p-4 text-center h-100"
                                    style={{ cursor: 'pointer' }}
                                    onClick={() => {
                                        const fw = JSON.parse(localStorage.getItem(STORAGE_KEYS.FIRM_SETTINGS) || '{}');
                                        setFirmNameInput(fw.firm_name || user?.firm_name || '');
                                        setPrimaryColorInput(fw.primary_color || '#0B132B');
                                        setAccentColorInput(fw.accent_color || '#D4AF37');
                                        setShowSettingsModal(true);
                                    }}
                                >
                                    <i className="fas fa-palette fa-2x mb-2 text-warning"></i>
                                    <h6 className="fw-bold text-navy mb-1">هوية المكتب (White-Label)</h6>
                                    <small className="text-muted fw-bold">تخصيص الاسم والألوان الملكية</small>
                                </div>
                            </div>

                            <div className="col-md-4 col-6">
                                <div
                                    className="card border-0 shadow-sm rounded-4 p-4 text-center h-100"
                                    style={{ cursor: 'pointer' }}
                                    onClick={() => setShowVCardModal(true)}
                                >
                                    <i className="fas fa-qrcode fa-2x mb-2 text-success"></i>
                                    <h6 className="fw-bold text-navy mb-1">بطاقة الأعمال الرقمية (vCard)</h6>
                                    <small className="text-muted fw-bold">مشاركة جهة اتصالك عبر QR</small>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </main>

            {/* =========================================================
                النوافذ المنبثقة (Modals)
               ========================================================= */}

            {/* 1. نافذة فتح ملف قضية جديدة + فحص تعارض المصالح */}
            {showAddCaseModal && (
                <div
                    className="modal fade show d-block"
                    style={{ background: 'rgba(11,19,43,0.65)', zIndex: 1055 }}
                >
                    <div className="modal-dialog modal-dialog-centered">
                        <div className="modal-content rounded-4 border-0 shadow-lg">
                            <div className="modal-header bg-navy text-white">
                                <h5 className="modal-title fw-bold">فتح ملف قضية جديدة</h5>
                                <button
                                    type="button"
                                    className="btn-close btn-close-white"
                                    onClick={() => setShowAddCaseModal(false)}
                                ></button>
                            </div>
                            <div className="modal-body p-4">
                                <form onSubmit={handleCreateCase}>
                                    <div className="row g-3">
                                        <div className="col-md-6">
                                            <label className="form-label fw-bold">رقم الملف الداخلي *</label>
                                            <input
                                                type="text"
                                                className="form-control font-monospace"
                                                value={newCaseInternalId}
                                                onChange={(e) => setNewCaseInternalId(e.target.value)}
                                                required
                                            />
                                        </div>
                                        <div className="col-md-6">
                                            <label className="form-label fw-bold text-primary">
                                                رمز بوابة الموكل (PIN) *
                                            </label>
                                            <input
                                                type="text"
                                                className="form-control font-monospace text-center fw-bold"
                                                value={newCasePin}
                                                onChange={(e) => setNewCasePin(e.target.value.toUpperCase())}
                                                required
                                            />
                                        </div>
                                        <div className="col-12">
                                            <label className="form-label fw-bold">الموكل *</label>
                                            <select
                                                className="form-select fw-bold"
                                                value={newCaseClientId}
                                                onChange={(e) => setNewCaseClientId(e.target.value)}
                                                required
                                            >
                                                <option value="">-- اختر الموكل --</option>
                                                {clients.map((cl) => (
                                                    <option key={cl.id} value={cl.id}>
                                                        {cl.full_name} ({cl.phone})
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="col-12">
                                            <label className="form-label fw-bold">اسم الخصم (مع فحص تعارض المصالح)</label>
                                            <input
                                                type="text"
                                                className="form-control"
                                                value={newCaseOpponent}
                                                onChange={(e) => handleCheckConflict(e.target.value)}
                                                placeholder="اكتب اسم الخصم..."
                                            />
                                            {conflictWarning && (
                                                <div className="alert alert-danger small fw-bold mt-2 mb-0 py-2">
                                                    <i className="fas fa-exclamation-triangle me-1"></i>{' '}
                                                    {conflictWarning}
                                                </div>
                                            )}
                                        </div>
                                        <div className="col-md-6">
                                            <label className="form-label fw-bold">المحكمة</label>
                                            <input
                                                type="text"
                                                className="form-control"
                                                value={newCaseCourt}
                                                onChange={(e) => setNewCaseCourt(e.target.value)}
                                            />
                                        </div>
                                        <div className="col-md-6">
                                            <label className="form-label fw-bold">الأتعاب المتفق عليها (د.أ)</label>
                                            <input
                                                type="number"
                                                className="form-control"
                                                value={newCaseFees}
                                                onChange={(e) => setNewCaseFees(e.target.value)}
                                            />
                                        </div>
                                    </div>
                                    <button
                                        type="submit"
                                        className="btn btn-gold w-100 py-2 mt-4 fw-bold"
                                        disabled={savingNewCase}
                                    >
                                        {savingNewCase ? 'جاري الإنشاء...' : 'اعتماد وفتح ملف القضية'}
                                    </button>
                                </form>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* 2. نافذة تسجيل موكل جديد + OCR */}
            {showAddClientModal && (
                <div
                    className="modal fade show d-block"
                    style={{ background: 'rgba(11,19,43,0.65)', zIndex: 1055 }}
                >
                    <div className="modal-dialog modal-dialog-centered">
                        <div className="modal-content rounded-4 border-0 shadow-lg">
                            <div className="modal-header bg-navy text-white">
                                <h5 className="modal-title fw-bold">تسجيل موكل جديد</h5>
                                <button
                                    type="button"
                                    className="btn-close btn-close-white"
                                    onClick={() => setShowAddClientModal(false)}
                                ></button>
                            </div>
                            <div className="modal-body p-4">
                                <div className="mb-3">
                                    <label className="btn btn-outline-primary w-100 fw-bold">
                                        <i className="fas fa-camera me-2"></i> قراءة الهوية المدنية بالذكاء الاصطناعي (OCR)
                                        <input
                                            type="file"
                                            accept="image/*"
                                            className="d-none"
                                            onChange={handleScanClientOcr}
                                        />
                                    </label>
                                </div>
                                <form onSubmit={handleCreateClient}>
                                    <div className="mb-3">
                                        <label className="form-label fw-bold">الاسم الكامل *</label>
                                        <input
                                            type="text"
                                            className="form-control"
                                            value={newClientName}
                                            onChange={(e) => setNewClientName(e.target.value)}
                                            required
                                        />
                                    </div>
                                    <div className="mb-3">
                                        <label className="form-label fw-bold">رقم الهاتف *</label>
                                        <input
                                            type="tel"
                                            className="form-control font-monospace text-start"
                                            dir="ltr"
                                            value={newClientPhone}
                                            onChange={(e) => setNewClientPhone(e.target.value)}
                                            required
                                        />
                                    </div>
                                    <div className="mb-3">
                                        <label className="form-label fw-bold">الرقم الوطني</label>
                                        <input
                                            type="text"
                                            className="form-control font-monospace text-start"
                                            dir="ltr"
                                            value={newClientNatId}
                                            onChange={(e) => setNewClientNatId(e.target.value)}
                                        />
                                    </div>
                                    <div className="mb-3">
                                        <label className="form-label fw-bold">العنوان</label>
                                        <input
                                            type="text"
                                            className="form-control"
                                            value={newClientAddress}
                                            onChange={(e) => setNewClientAddress(e.target.value)}
                                        />
                                    </div>
                                    <button
                                        type="submit"
                                        className="btn btn-gold w-100 py-2 fw-bold"
                                        disabled={savingNewClient}
                                    >
                                        {savingNewClient ? 'جاري الحفظ...' : 'حفظ بيانات الموكل'}
                                    </button>
                                </form>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* 3. نافذة إضافة موعد جديد */}
            {showAddApptModal && (
                <div
                    className="modal fade show d-block"
                    style={{ background: 'rgba(11,19,43,0.65)', zIndex: 1055 }}
                >
                    <div className="modal-dialog modal-dialog-centered">
                        <div className="modal-content rounded-4 border-0 shadow-lg">
                            <div className="modal-header bg-navy text-white">
                                <h5 className="modal-title fw-bold">جدولة جلسة / موعد جديد</h5>
                                <button
                                    type="button"
                                    className="btn-close btn-close-white"
                                    onClick={() => setShowAddApptModal(false)}
                                ></button>
                            </div>
                            <div className="modal-body p-4">
                                <form onSubmit={handleCreateAppointment}>
                                    <div className="mb-3">
                                        <label className="form-label fw-bold">عنوان الموعد / الجلسة *</label>
                                        <input
                                            type="text"
                                            className="form-control"
                                            value={newApptTitle}
                                            onChange={(e) => setNewApptTitle(e.target.value)}
                                            required
                                        />
                                    </div>
                                    <div className="row g-2 mb-3">
                                        <div className="col-6">
                                            <label className="form-label fw-bold">التاريخ *</label>
                                            <input
                                                type="date"
                                                className="form-control"
                                                value={newApptDate}
                                                onChange={(e) => setNewApptDate(e.target.value)}
                                                required
                                            />
                                        </div>
                                        <div className="col-6">
                                            <label className="form-label fw-bold">الوقت *</label>
                                            <input
                                                type="time"
                                                className="form-control"
                                                value={newApptTime}
                                                onChange={(e) => setNewApptTime(e.target.value)}
                                                required
                                            />
                                        </div>
                                    </div>
                                    <div className="mb-3">
                                        <label className="form-label fw-bold">ربط بقضية (اختياري)</label>
                                        <select
                                            className="form-select"
                                            value={newApptCaseId}
                                            onChange={(e) => setNewApptCaseId(e.target.value)}
                                        >
                                            <option value="">-- بدون قضية --</option>
                                            {cases.map((c) => (
                                                <option key={c.id} value={c.id}>
                                                    {c.case_internal_id} - ضد {c.opponent_name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <button
                                        type="submit"
                                        className="btn btn-gold w-100 py-2 fw-bold"
                                        disabled={savingNewAppt}
                                    >
                                        {savingNewAppt ? 'جاري الجدولة...' : 'حفظ الموعد في الأجندة'}
                                    </button>
                                </form>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* 4. نافذة السجل الأمني الذكي (AI Human Audit Logs + Time Machine) */}
            {showAuditModal && (
                <div
                    className="modal fade show d-block"
                    style={{ background: 'rgba(11,19,43,0.65)', zIndex: 1055 }}
                >
                    <div className="modal-dialog modal-dialog-centered modal-lg modal-dialog-scrollable">
                        <div className="modal-content rounded-4 border-0 shadow-lg">
                            <div className="modal-header bg-navy text-white">
                                <h5 className="modal-title fw-bold">
                                    <i className="fas fa-shield-alt me-2 text-warning"></i> السجل الأمني الذكي وآلة الزمن (Audit Trail)
                                </h5>
                                <button
                                    type="button"
                                    className="btn-close btn-close-white"
                                    onClick={() => {
                                        setShowAuditModal(false);
                                        setSelectedDiffLog(null);
                                    }}
                                ></button>
                            </div>
                            <div className="modal-body p-4">
                                {loadingAudit ? (
                                    <div className="text-center p-5">
                                        <i className="fas fa-spinner fa-spin fa-2x text-warning"></i>
                                    </div>
                                ) : selectedDiffLog ? (
                                    <div>
                                        <button
                                            className="btn btn-sm btn-outline-secondary mb-3 fw-bold"
                                            onClick={() => setSelectedDiffLog(null)}
                                        >
                                            &rarr; عودة للسجل العام
                                        </button>
                                        <h6 className="fw-bold text-navy mb-2">
                                            تفاصيل الفروقات الدقيقة للعملية ({selectedDiffLog.action_type})
                                        </h6>
                                        {selectedDiffLog.new_data?._human_log && (
                                            <div className="alert alert-info fw-bold">
                                                <i className="fas fa-robot me-2"></i>
                                                {selectedDiffLog.new_data._human_log}
                                            </div>
                                        )}
                                        {Array.isArray(selectedDiffLog.new_data?._changes_list) &&
                                            selectedDiffLog.new_data._changes_list.length > 0 && (
                                                <ul className="list-group mb-3 fw-bold small">
                                                    {selectedDiffLog.new_data._changes_list.map(
                                                        (chg: string, i: number) => (
                                                            <li key={i} className="list-group-item">
                                                                {chg}
                                                            </li>
                                                        )
                                                    )}
                                                </ul>
                                            )}
                                        {selectedDiffLog.action_type === 'UPDATE' && selectedDiffLog.old_data && (
                                            <button
                                                className="btn btn-warning fw-bold w-100"
                                                onClick={() => handleRollbackAuditLog(selectedDiffLog)}
                                            >
                                                <i className="fas fa-undo me-2"></i> استرجاع النسخة السابقة (Time Machine Rollback)
                                            </button>
                                        )}
                                    </div>
                                ) : auditLogs.length === 0 ? (
                                    <div className="text-center p-4 text-muted fw-bold">لا توجد حركات مسجلة.</div>
                                ) : (
                                    auditLogs.map((log) => {
                                        const actorName = log.mo_users?.full_name || 'مستخدم النظام';
                                        const dateStr = log.created_at
                                            ? new Date(log.created_at).toLocaleString('ar-JO')
                                            : '';
                                        const humanSummary =
                                            log.new_data?._human_log ||
                                            `قام (${actorName}) بإجراء (${log.action_type}) على جدول (${log.entity_type})`;
                                        const changesList: string[] = Array.isArray(log.new_data?._changes_list)
                                            ? log.new_data._changes_list
                                            : [];

                                        return (
                                            <div key={log.id} className="p-3 mb-3 border rounded-4 bg-light">
                                                <div className="d-flex justify-content-between align-items-center mb-1">
                                                    <span className="badge bg-navy text-warning">
                                                        {log.action_type} — {actorName}
                                                    </span>
                                                    <small className="text-muted font-monospace fw-bold">
                                                        {dateStr}
                                                    </small>
                                                </div>
                                                <p className="fw-bold text-navy mb-2 mt-2">{humanSummary}</p>
                                                {changesList.length > 0 && (
                                                    <div className="small text-muted fw-bold mb-2">
                                                        {changesList.slice(0, 3).map((item, idx) => (
                                                            <div key={idx}>• {item}</div>
                                                        ))}
                                                    </div>
                                                )}
                                                <button
                                                    className="btn btn-sm btn-outline-primary fw-bold"
                                                    onClick={() => setSelectedDiffLog(log)}
                                                >
                                                    <i className="fas fa-search-plus me-1"></i> فحص الفروقات / استرجاع
                                                </button>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* 5. نافذة مولد العقود الذكي */}
            {showSmartContractModal && (
                <div
                    className="modal fade show d-block"
                    style={{ background: 'rgba(11,19,43,0.65)', zIndex: 1055 }}
                >
                    <div className="modal-dialog modal-dialog-centered modal-lg">
                        <div className="modal-content rounded-4 border-0 shadow-lg">
                            <div className="modal-header bg-navy text-white">
                                <h5 className="modal-title fw-bold">مولد العقود والاتفاقيات الذكي (AI)</h5>
                                <button
                                    type="button"
                                    className="btn-close btn-close-white"
                                    onClick={() => setShowSmartContractModal(false)}
                                ></button>
                            </div>
                            <div className="modal-body p-4">
                                <form onSubmit={handleGenerateSmartContract} className="row g-3 mb-3">
                                    <div className="col-md-4">
                                        <label className="form-label fw-bold">نوع العقد</label>
                                        <input
                                            type="text"
                                            className="form-control"
                                            value={scType}
                                            onChange={(e) => setScType(e.target.value)}
                                        />
                                    </div>
                                    <div className="col-md-4">
                                        <label className="form-label fw-bold">الطرف الأول</label>
                                        <input
                                            type="text"
                                            className="form-control"
                                            value={scFirstParty}
                                            onChange={(e) => setScFirstParty(e.target.value)}
                                            required
                                        />
                                    </div>
                                    <div className="col-md-4">
                                        <label className="form-label fw-bold">الطرف الثاني</label>
                                        <input
                                            type="text"
                                            className="form-control"
                                            value={scSecondParty}
                                            onChange={(e) => setScSecondParty(e.target.value)}
                                            required
                                        />
                                    </div>
                                    <div className="col-12">
                                        <label className="form-label fw-bold">الشروط والبنود الأساسية</label>
                                        <textarea
                                            className="form-control"
                                            rows={3}
                                            value={scTerms}
                                            onChange={(e) => setScTerms(e.target.value)}
                                            required
                                        />
                                    </div>
                                    <div className="col-12">
                                        <button
                                            type="submit"
                                            className="btn btn-gold w-100 py-2 fw-bold"
                                            disabled={generatingSc}
                                        >
                                            {generatingSc ? 'جاري صياغة العقد...' : 'توليد العقد القانوني'}
                                        </button>
                                    </div>
                                </form>
                                {scOutput && (
                                    <textarea
                                        className="form-control fw-semibold"
                                        rows={9}
                                        value={scOutput}
                                        onChange={(e) => setScOutput(e.target.value)}
                                    />
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* 6. نافذة إعدادات هوية المكتب (White-Labeling) */}
            {showSettingsModal && (
                <div
                    className="modal fade show d-block"
                    style={{ background: 'rgba(11,19,43,0.65)', zIndex: 1055 }}
                >
                    <div className="modal-dialog modal-dialog-centered">
                        <div className="modal-content rounded-4 border-0 shadow-lg">
                            <div className="modal-header bg-navy text-white">
                                <h5 className="modal-title fw-bold">تخصيص الهوية البصرية للمكتب (White-Label)</h5>
                                <button
                                    type="button"
                                    className="btn-close btn-close-white"
                                    onClick={() => setShowSettingsModal(false)}
                                ></button>
                            </div>
                            <div className="modal-body p-4">
                                <form onSubmit={handleSaveFirmSettings}>
                                    <div className="mb-3">
                                        <label className="form-label fw-bold">اسم المكتب الرسمي</label>
                                        <input
                                            type="text"
                                            className="form-control"
                                            value={firmNameInput}
                                            onChange={(e) => setFirmNameInput(e.target.value)}
                                        />
                                    </div>
                                    <div className="row g-3 mb-4">
                                        <div className="col-6">
                                            <label className="form-label fw-bold">اللون الأساسي (Navy)</label>
                                            <input
                                                type="color"
                                                className="form-control form-control-color w-100"
                                                value={primaryColorInput}
                                                onChange={(e) => setPrimaryColorInput(e.target.value)}
                                            />
                                        </div>
                                        <div className="col-6">
                                            <label className="form-label fw-bold">اللون الذهبي (Accent)</label>
                                            <input
                                                type="color"
                                                className="form-control form-control-color w-100"
                                                value={accentColorInput}
                                                onChange={(e) => setAccentColorInput(e.target.value)}
                                            />
                                        </div>
                                    </div>
                                    <button
                                        type="submit"
                                        className="btn btn-gold w-100 py-2 fw-bold"
                                        disabled={savingSettings}
                                    >
                                        {savingSettings ? 'جاري الحفظ...' : 'حفظ الهوية البصرية'}
                                    </button>
                                </form>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* 7. نافذة بطاقة الأعمال الرقمية (vCard QR) */}
            {showVCardModal && (
                <div
                    className="modal fade show d-block"
                    style={{ background: 'rgba(11,19,43,0.65)', zIndex: 1055 }}
                >
                    <div className="modal-dialog modal-dialog-centered">
                        <div className="modal-content rounded-4 border-0 shadow-lg text-center">
                            <div className="modal-header bg-navy text-white">
                                <h5 className="modal-title fw-bold">بطاقة المحامي الرقمية (vCard QR)</h5>
                                <button
                                    type="button"
                                    className="btn-close btn-close-white"
                                    onClick={() => setShowVCardModal(false)}
                                ></button>
                            </div>
                            <div className="modal-body p-4 d-flex flex-column align-items-center">
                                <h5 className="fw-bold text-navy mb-1">{user?.full_name}</h5>
                                <p className="text-muted small fw-bold mb-3">{user?.phone}</p>
                                <div ref={vcardQrRef} className="p-3 bg-white border rounded-4 shadow-sm"></div>
                                <small className="text-muted fw-bold mt-3">
                                    امسح الرمز بكاميرا الهاتف لحفظ جهة الاتصال مباشرة
                                </small>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <BottomNav activeTab={activeView} onSelectTab={switchView} />
        </div>
    );
};
