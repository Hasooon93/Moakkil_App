/**
 * ============================================================================
 * نظام موكّل (Moakkil System) - 2026
 * الملف: src/features/clients/ClientDetailsPage.tsx
 * الوصف: ملف الموكل الشامل (القضايا، المواعيد، الوثائق السحابية R2، بطاقة KYC،
 *        طلب النواقص لبوابة الموكل، وتوليد التقرير الشهري بالذكاء الاصطناعي)
 * مطابق 100% لملف client-details.html + js/client-details.js
 * ============================================================================
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Swal from 'sweetalert2';
import { MoakkilAPI } from '../../services/moakkilApi.service';
import { AuthService } from '../../services/auth.service';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { ProtectedImage } from '../../components/common/ProtectedImage';
import { BottomNav } from '../../components/layout/BottomNav';

export const ClientDetailsPage: React.FC = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const clientId = searchParams.get('id') || '';
    const { isOnline } = useAuth();
    const { isDark, toggleDarkMode } = useTheme();

    const [clientObj, setClientObj] = useState<any | null>(null);
    const [clientCases, setClientCases] = useState<any[]>([]);
    const [clientAppts, setClientAppts] = useState<any[]>([]);
    const [clientFiles, setClientFiles] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'cases' | 'appts' | 'files' | 'kyc'>('cases');
    const [generatingReport, setGeneratingReport] = useState(false);

    // نافذة تعديل بيانات الموكل
    const [showEditModal, setShowEditModal] = useState(false);
    const [editName, setEditName] = useState('');
    const [editPhone, setEditPhone] = useState('');
    const [editNationalId, setEditNationalId] = useState('');
    const [editMotherName, setEditMotherName] = useState('');
    const [editDob, setEditDob] = useState('');
    const [editPlaceOfBirth, setEditPlaceOfBirth] = useState('');
    const [editNationality, setEditNationality] = useState('أردني');
    const [editMaritalStatus, setEditMaritalStatus] = useState('');
    const [editProfession, setEditProfession] = useState('');
    const [editAddress, setEditAddress] = useState('');
    const [editEmail, setEditEmail] = useState('');
    const [editClientType, setEditClientType] = useState('فرد');
    const [editConfidentiality, setEditConfidentiality] = useState('عادي');
    const [editPortalActive, setEditPortalActive] = useState(true);
    const [editAvatarUrl, setEditAvatarUrl] = useState('');
    const [savingClient, setSavingClient] = useState(false);

    // نافذة رفع ملف سحابي (R2) للموكل
    const [showUploadModal, setShowUploadModal] = useState(false);
    const [uploadTitle, setUploadTitle] = useState('');
    const [uploadCategory, setUploadCategory] = useState('هوية رسمية');
    const [uploadVisibleToClient, setUploadVisibleToClient] = useState(false);
    const [uploadFileObj, setUploadFileObj] = useState<File | null>(null);
    const [uploadingFile, setUploadingFile] = useState(false);

    // نافذة طلب النواقص من الموكل عبر البوابة
    const [showMissingDocsModal, setShowMissingDocsModal] = useState(false);
    const [missingDocCaseId, setMissingDocCaseId] = useState('');
    const [missingDocText, setMissingDocText] = useState('');
    const [savingMissingDoc, setSavingMissingDoc] = useState(false);

    const loadAllClientData = useCallback(async () => {
        if (!clientId) {
            navigate('/app.html#clients');
            return;
        }
        setLoading(true);
        try {
            const [cl, casesRes, apptsRes, filesRes] = await Promise.all([
                MoakkilAPI.getClientById(clientId),
                MoakkilAPI.getCases(`client_id=eq.${encodeURIComponent(clientId)}`),
                MoakkilAPI.getAppointments(`client_id=eq.${encodeURIComponent(clientId)}`),
                MoakkilAPI.getFiles(`client_id=eq.${encodeURIComponent(clientId)}`),
            ]);

            if (!cl) {
                Swal.fire('تنبيه', 'لم يتم العثور على سجل الموكل المطلوب.', 'warning').then(() =>
                    navigate('/app.html#clients')
                );
                return;
            }
            setClientObj(cl);
            setClientCases(Array.isArray(casesRes) ? casesRes : []);
            setClientAppts(Array.isArray(apptsRes) ? apptsRes : []);
            setClientFiles(Array.isArray(filesRes) ? filesRes : []);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [clientId, navigate]);

    useEffect(() => {
        loadAllClientData();
    }, [loadAllClientData]);

    const openEditClientModal = () => {
        if (!clientObj) return;
        setEditName(clientObj.full_name || '');
        setEditPhone(clientObj.phone || '');
        setEditNationalId(clientObj.national_id || '');
        setEditMotherName(clientObj.mother_name || '');
        setEditDob(clientObj.date_of_birth || '');
        setEditPlaceOfBirth(clientObj.place_of_birth || '');
        setEditNationality(clientObj.nationality || 'أردني');
        setEditMaritalStatus(clientObj.marital_status || '');
        setEditProfession(clientObj.profession || '');
        setEditAddress(clientObj.address || '');
        setEditEmail(clientObj.email || '');
        setEditClientType(clientObj.client_type || 'فرد');
        setEditConfidentiality(clientObj.confidentiality_level || 'عادي');
        setEditPortalActive(clientObj.client_portal_active !== false);
        setEditAvatarUrl(clientObj.avatar_url || '');
        setShowEditModal(true);
    };

    const handleSaveClient = async (e: React.FormEvent) => {
        e.preventDefault();
        setSavingClient(true);
        try {
            const payload = {
                full_name: editName.trim(),
                phone: editPhone.trim(),
                national_id: editNationalId.trim() || null,
                mother_name: editMotherName.trim() || null,
                date_of_birth: editDob || null,
                place_of_birth: editPlaceOfBirth.trim() || null,
                nationality: editNationality.trim() || 'أردني',
                marital_status: editMaritalStatus || null,
                profession: editProfession.trim() || null,
                address: editAddress.trim() || null,
                email: editEmail.trim() || null,
                client_type: editClientType,
                confidentiality_level: editConfidentiality,
                client_portal_active: editPortalActive,
                avatar_url: editAvatarUrl.trim() || null,
            };

            const res = await MoakkilAPI.updateClient(clientId, payload);
            if (res && !res.error) {
                Swal.fire({
                    toast: true,
                    position: 'top-end',
                    icon: 'success',
                    title: 'تم تحديث بيانات الموكل بنجاح',
                    showConfirmButton: false,
                    timer: 2000,
                });
                setShowEditModal(false);
                await loadAllClientData();
            } else {
                throw new Error(res?.error || 'تعذر حفظ التعديلات');
            }
        } catch (err: any) {
            Swal.fire('خطأ', err.message, 'error');
        } finally {
            setSavingClient(false);
        }
    };

    const handleDeleteClient = async () => {
        if (!isOnline) {
            Swal.fire('تنبيه', 'لا يمكن حذف سجل الموكل في وضع عدم الاتصال.', 'warning');
            return;
        }
        const confirm = await Swal.fire({
            title: 'حذف ملف الموكل نهائياً؟',
            text: 'يتطلب هذا الإجراء تذكرة تحقق إجرائي (Scoped Action MFA) عبر التيليغرام.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            confirmButtonText: 'نعم، متابعة للتحقق الأمني',
            cancelButtonText: 'إلغاء',
        });
        if (!confirm.isConfirmed) return;

        try {
            const actionToken = await AuthService.requireActionMFA(
                `حذف سجل الموكل (${clientObj?.full_name || ''})`,
                'mo_clients',
                clientId
            );
            if (!actionToken) return;

            const res = await MoakkilAPI.deleteClient(clientId, actionToken);
            if (res && !res.error) {
                Swal.fire('تم الحذف', 'تم حذف سجل الموكل بنجاح.', 'success').then(() =>
                    navigate('/app.html#clients')
                );
            } else {
                throw new Error(res?.error || 'فشل الحذف');
            }
        } catch (err: any) {
            if (err.message?.includes('إلغاء')) return;
            Swal.fire('مرفوض أمنياً', err.message, 'error');
        }
    };

    const handleUploadClientFile = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!uploadFileObj) {
            Swal.fire('تنبيه', 'يرجى اختيار ملف أولاً', 'warning');
            return;
        }
        setUploadingFile(true);
        try {
            const r2Res = await MoakkilAPI.uploadFileToR2(uploadFileObj, 'general', uploadCategory);
            if (r2Res && r2Res.r2_key) {
                const record = {
                    client_id: clientId,
                    case_id: null,
                    file_name: uploadTitle.trim() || uploadFileObj.name,
                    file_type: uploadFileObj.type || 'application/octet-stream',
                    file_extension: uploadFileObj.name.split('.').pop()?.toLowerCase() || '',
                    file_category: uploadCategory,
                    file_url: r2Res.r2_key,
                    drive_file_id: r2Res.r2_key,
                    is_visible_to_client: uploadVisibleToClient,
                };
                const dbRes = await MoakkilAPI.addFileRecord(record);
                if (dbRes && !dbRes.error) {
                    Swal.fire({
                        toast: true,
                        position: 'top-end',
                        icon: 'success',
                        title: 'تم رفع وحفظ الوثيقة في أرشيف الموكل',
                        showConfirmButton: false,
                        timer: 2000,
                    });
                    setShowUploadModal(false);
                    setUploadTitle('');
                    setUploadFileObj(null);
                    await loadAllClientData();
                } else {
                    await MoakkilAPI.cleanupOrphanR2File(r2Res.r2_key);
                    throw new Error(dbRes?.error || 'فشل حفظ السجل');
                }
            }
        } catch (err: any) {
            Swal.fire('خطأ', err.message, 'error');
        } finally {
            setUploadingFile(false);
        }
    };

    const handleDeleteClientFile = async (file: any) => {
        try {
            const token = await AuthService.requireActionMFA(
                `حذف وثيقة الموكل (${file.file_name})`,
                'mo_files',
                String(file.id)
            );
            if (!token) return;
            const res = await MoakkilAPI.deleteFile(String(file.id), token);
            if (res && !res.error) {
                Swal.fire('تم الحذف', 'تم حذف الوثيقة بنجاح.', 'success');
                await loadAllClientData();
            }
        } catch (err: any) {
            if (!err.message?.includes('إلغاء')) Swal.fire('خطأ', err.message, 'error');
        }
    };

    const handleSaveMissingDocRequest = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!missingDocCaseId) {
            Swal.fire('تنبيه', 'يرجى اختيار القضية المرتبطة بطلب النواقص', 'warning');
            return;
        }
        setSavingMissingDoc(true);
        try {
            const res = await MoakkilAPI.updateCase(missingDocCaseId, {
                missing_docs_request: missingDocText.trim() || null,
            });
            if (res && !res.error) {
                Swal.fire(
                    'تم التعميم',
                    'تم إرسال طلب النواقص ليظهر فوراً في بوابة الموكل الخاصة بهذه القضية.',
                    'success'
                );
                setShowMissingDocsModal(false);
                setMissingDocText('');
                await loadAllClientData();
            } else {
                throw new Error(res?.error || 'فشل الإرسال');
            }
        } catch (err: any) {
            Swal.fire('خطأ', err.message, 'error');
        } finally {
            setSavingMissingDoc(false);
        }
    };

    // توليد تقرير الإنجاز الشهري الذكي للموكل وإرساله عبر واتساب (مطابق لـ js/client-details.js)
    const handleGenerateMonthlyReport = async () => {
        if (!clientObj) return;
        if (!isOnline) {
            Swal.fire('تنبيه', 'يتطلب توليد التقرير الذكي اتصالاً بالإنترنت.', 'warning');
            return;
        }

        setGeneratingReport(true);
        try {
            const totalAgreed = clientCases.reduce((s, c) => s + (Number(c.total_agreed_fees) || 0), 0);
            const totalPaid = clientCases.reduce((s, c) => s + (Number(c.total_paid) || 0), 0);
            const remainingBalance = Math.max(0, totalAgreed - totalPaid);

            const caseSummaries =
                clientCases
                    .map(
                        (c) =>
                            `- قضية رقم (${c.case_internal_id || c.court_case_number || '--'}) لدى ${
                                c.current_court || 'المحكمة'
                            } ضد (${c.opponent_name || '--'}): المرحلة الحالية (${
                                c.current_stage || c.status || 'قيد النظر'
                            })`
                    )
                    .join('\n') || 'لا توجد قضايا مسجلة حالياً.';

            const recentAppts = clientAppts
                .slice(0, 5)
                .map((a) => `- ${a.title} بتاريخ ${new Date(a.appt_date).toLocaleDateString('ar-JO')} (${a.status})`)
                .join('\n');

            const promptText = `أنت محامي أردني خبير ومحترف ومدير مكتب محاماة. قم بصياغة "تقرير إنجاز شهري" رسمي وموجز لتقديمه للموكل: ${
                clientObj.full_name
            }.
البيانات المتوفرة عن قضاياه:
${caseSummaries}

أهم المواعيد/الإجراءات التي تمت خلال آخر 30 يوماً:
${recentAppts || 'لا توجد إجراءات مسجلة هذا الشهر، جاري متابعة الملفات.'}

الرصيد المالي المتبقي على الموكل: ${remainingBalance} دينار أردني.

التعليمات:
صغ التقرير بأسلوب رسمي واحترافي، يبدأ بالترحيب، ثم يلخص حالة القضايا والإنجازات التي تمت، ويذكر الرصيد المتبقي بلباقة، ويختم بشكره على ثقته بالمكتب. لا تكتب أي مقدمات أو شروحات خارج نص التقرير الفعلي.`;

            const res = await MoakkilAPI.askAI(promptText);
            if (res && res.reply) {
                const { isConfirmed } = await Swal.fire({
                    title: 'التقرير الشهري للموكل',
                    input: 'textarea',
                    inputValue: res.reply,
                    inputAttributes: { rows: '10' },
                    showCancelButton: true,
                    confirmButtonText: '<i class="fab fa-whatsapp me-1"></i> إرسال عبر واتساب',
                    cancelButtonText: 'إغلاق',
                    confirmButtonColor: '#10b981',
                    width: 680,
                });

                if (isConfirmed && clientObj.phone) {
                    let p = String(clientObj.phone).replace(/[^0-9+]/g, '');
                    if (p.startsWith('0')) p = '962' + p.substring(1);
                    window.open(
                        `https://wa.me/${p}?text=${encodeURIComponent(res.reply)}`,
                        '_blank',
                        'noopener,noreferrer'
                    );
                }
            } else {
                throw new Error(res?.error || 'حدث خطأ في توليد التقرير');
            }
        } catch (err: any) {
            Swal.fire('خطأ تقني', err.message, 'error');
        } finally {
            setGeneratingReport(false);
        }
    };

    const totalAgreedFees = clientCases.reduce((s, c) => s + (Number(c.total_agreed_fees) || 0), 0);
    const totalPaidFees = clientCases.reduce((s, c) => s + (Number(c.total_paid) || 0), 0);
    const totalRemaining = Math.max(0, totalAgreedFees - totalPaidFees);

    return (
        <div className="min-vh-100 pb-5 mb-5">
            <div className="top-nav d-flex justify-content-between align-items-center px-3 py-3">
                <div className="d-flex align-items-center gap-2">
                    <button
                        className="btn btn-link text-white p-0 text-decoration-none"
                        onClick={() => navigate('/app.html#clients')}
                    >
                        <i className="fas fa-arrow-right fs-4"></i>
                    </button>
                    <h5 className="mb-0 fw-bold text-white">
                        <i className="fas fa-user-tie me-2" style={{ color: '#D4AF37' }}></i> ملف الموكل الشامل
                    </h5>
                </div>
                <div className="d-flex gap-2">
                    <button
                        className="btn btn-sm btn-outline-light rounded-3 px-3"
                        onClick={toggleDarkMode}
                        title="تبديل الوضع الليلي"
                    >
                        <i className={`fas ${isDark ? 'fa-sun text-warning' : 'fa-moon'}`}></i>
                    </button>
                    <button
                        className="btn btn-sm btn-gold fw-bold"
                        onClick={openEditClientModal}
                    >
                        <i className="fas fa-edit me-1"></i> تعديل
                    </button>
                </div>
            </div>

            {loading || !clientObj ? (
                <div className="container mt-5 text-center">
                    <i className="fas fa-spinner fa-spin fa-3x text-warning mb-3"></i>
                    <h5 className="fw-bold">جاري تحميل ملف الموكل...</h5>
                </div>
            ) : (
                <div className="container mt-4 fade-in">
                    {/* بطاقة تعريف الموكل */}
                    <div className="card border-0 shadow-sm rounded-4 p-4 mb-4">
                        <div className="d-flex flex-wrap justify-content-between align-items-center gap-3">
                            <div className="d-flex align-items-center gap-3">
                                {clientObj.avatar_url ? (
                                    <ProtectedImage
                                        r2KeyOrUrl={clientObj.avatar_url}
                                        alt={clientObj.full_name}
                                        style={{ width: 72, height: 72, borderRadius: '50%', objectFit: 'cover' }}
                                    />
                                ) : (
                                    <div
                                        className="rounded-circle d-flex align-items-center justify-content-center fw-bold fs-2"
                                        style={{
                                            width: 72,
                                            height: 72,
                                            background: '#0B132B',
                                            color: '#D4AF37',
                                        }}
                                    >
                                        {(clientObj.full_name || 'م').charAt(0)}
                                    </div>
                                )}
                                <div>
                                    <h4 className="fw-bold text-navy mb-1">{clientObj.full_name}</h4>
                                    <div className="d-flex flex-wrap gap-2 small fw-bold text-muted">
                                        <span dir="ltr">
                                            <i className="fas fa-phone-alt text-success me-1"></i>
                                            {clientObj.phone || '--'}
                                        </span>
                                        <span>|</span>
                                        <span>
                                            <i className="fas fa-id-card text-primary me-1"></i>
                                            الرقم الوطني: {clientObj.national_id || '--'}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="d-flex flex-wrap gap-2">
                                <button
                                    className="btn btn-sm btn-success fw-bold px-3 py-2 rounded-3"
                                    onClick={handleGenerateMonthlyReport}
                                    disabled={generatingReport}
                                >
                                    {generatingReport ? (
                                        <i className="fas fa-spinner fa-spin me-1"></i>
                                    ) : (
                                        <i className="fas fa-magic me-1"></i>
                                    )}{' '}
                                    تقرير الإنجاز الشهري (AI)
                                </button>
                                <button
                                    className="btn btn-sm btn-warning fw-bold px-3 py-2 rounded-3"
                                    onClick={() => {
                                        if (clientCases.length > 0) setMissingDocCaseId(clientCases[0].id);
                                        setShowMissingDocsModal(true);
                                    }}
                                >
                                    <i className="fas fa-bell me-1"></i> طلب نواقص من الموكل
                                </button>
                                <button
                                    className="btn btn-sm btn-outline-danger fw-bold px-3 py-2 rounded-3"
                                    onClick={handleDeleteClient}
                                >
                                    <i className="fas fa-trash"></i>
                                </button>
                            </div>
                        </div>

                        <hr className="my-3" />

                        {/* الملخص المالي للموكل */}
                        <div className="row g-3 text-center">
                            <div className="col-4">
                                <div className="p-2 rounded-3 bg-light">
                                    <small className="text-muted fw-bold d-block">إجمالي الأتعاب المتفق عليها</small>
                                    <strong className="fs-5 text-navy font-monospace">
                                        {totalAgreedFees.toLocaleString()} د.أ
                                    </strong>
                                </div>
                            </div>
                            <div className="col-4">
                                <div className="p-2 rounded-3 bg-light">
                                    <small className="text-muted fw-bold d-block">إجمالي المدفوع</small>
                                    <strong className="fs-5 text-success font-monospace">
                                        {totalPaidFees.toLocaleString()} د.أ
                                    </strong>
                                </div>
                            </div>
                            <div className="col-4">
                                <div className="p-2 rounded-3 bg-light">
                                    <small className="text-muted fw-bold d-block">الرصيد المتبقي للتحصيل</small>
                                    <strong className="fs-5 text-danger font-monospace">
                                        {totalRemaining.toLocaleString()} د.أ
                                    </strong>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* تبويبات ملف الموكل */}
                    <ul className="nav nav-pills mb-4 gap-2">
                        <li className="nav-item">
                            <button
                                className={`nav-link fw-bold ${activeTab === 'cases' ? 'active' : 'bg-white border'}`}
                                onClick={() => setActiveTab('cases')}
                            >
                                <i className="fas fa-gavel me-1"></i> القضايا ({clientCases.length})
                            </button>
                        </li>
                        <li className="nav-item">
                            <button
                                className={`nav-link fw-bold ${activeTab === 'appts' ? 'active' : 'bg-white border'}`}
                                onClick={() => setActiveTab('appts')}
                            >
                                <i className="fas fa-calendar-alt me-1"></i> المواعيد والجلسات ({clientAppts.length})
                            </button>
                        </li>
                        <li className="nav-item">
                            <button
                                className={`nav-link fw-bold ${activeTab === 'files' ? 'active' : 'bg-white border'}`}
                                onClick={() => setActiveTab('files')}
                            >
                                <i className="fas fa-folder-open me-1"></i> الوثائق السحابية ({clientFiles.length})
                            </button>
                        </li>
                        <li className="nav-item">
                            <button
                                className={`nav-link fw-bold ${activeTab === 'kyc' ? 'active' : 'bg-white border'}`}
                                onClick={() => setActiveTab('kyc')}
                            >
                                <i className="fas fa-address-card me-1"></i> البيانات التفصيلية (KYC)
                            </button>
                        </li>
                    </ul>

                    {activeTab === 'cases' && (
                        <div className="row g-3">
                            {clientCases.length === 0 ? (
                                <div className="col-12 text-center p-5 bg-white rounded-4 border text-muted fw-bold">
                                    لا توجد قضايا مسجلة لهذا الموكل.
                                </div>
                            ) : (
                                clientCases.map((c) => (
                                    <div key={c.id} className="col-md-6">
                                        <div
                                            className="card border-0 shadow-sm rounded-4 p-4 h-100"
                                            style={{ cursor: 'pointer', borderRight: '4px solid #D4AF37' }}
                                            onClick={() => navigate(`/case-details.html?id=${c.id}`)}
                                        >
                                            <div className="d-flex justify-content-between align-items-center mb-2">
                                                <span className="badge bg-navy text-warning font-monospace">
                                                    {c.case_internal_id || 'ملف قضائي'}
                                                </span>
                                                <span className="badge bg-success bg-opacity-10 text-success">
                                                    {c.status || 'نشطة'}
                                                </span>
                                            </div>
                                            <h6 className="fw-bold text-navy mb-1">
                                                ضد: {c.opponent_name || 'غير محدد'}
                                            </h6>
                                            <small className="text-muted fw-bold d-block mb-2">
                                                {c.current_court || '--'} | دعوى رقم: {c.court_case_number || '--'}
                                            </small>
                                            <div className="d-flex justify-content-between small fw-bold border-top pt-2 mt-auto">
                                                <span>الأتعاب: {Number(c.total_agreed_fees || 0).toLocaleString()} د.أ</span>
                                                <span className="text-success">
                                                    المدفوع: {Number(c.total_paid || 0).toLocaleString()} د.أ
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}

                    {activeTab === 'appts' && (
                        <div className="card border-0 shadow-sm rounded-4 p-4">
                            {clientAppts.length === 0 ? (
                                <div className="text-center p-4 text-muted fw-bold">
                                    لا توجد مواعيد مرتبطة بهذا الموكل.
                                </div>
                            ) : (
                                clientAppts.map((a) => (
                                    <div
                                        key={a.id}
                                        className="d-flex justify-content-between align-items-center p-3 mb-2 border rounded-3"
                                    >
                                        <div>
                                            <h6 className="fw-bold text-navy mb-1">{a.title}</h6>
                                            <small className="text-muted fw-bold font-monospace">
                                                {a.appt_date ? new Date(a.appt_date).toLocaleString('ar-JO') : '--'}
                                            </small>
                                        </div>
                                        <span className="badge bg-primary">{a.status || 'مجدول'}</span>
                                    </div>
                                ))
                            )}
                        </div>
                    )}

                    {activeTab === 'files' && (
                        <div className="card border-0 shadow-sm rounded-4 p-4">
                            <div className="d-flex justify-content-between align-items-center mb-3">
                                <h6 className="fw-bold text-navy mb-0">أرشيف وثائق الموكل (Cloudflare R2)</h6>
                                <button
                                    className="btn btn-sm btn-gold fw-bold"
                                    onClick={() => setShowUploadModal(true)}
                                >
                                    <i className="fas fa-cloud-upload-alt me-1"></i> رفع وثيقة جديدة
                                </button>
                            </div>
                            {clientFiles.length === 0 ? (
                                <div className="text-center p-4 text-muted fw-bold">
                                    لا توجد وثائق مرفوعة لهذا الموكل.
                                </div>
                            ) : (
                                clientFiles.map((f) => (
                                    <div
                                        key={f.id}
                                        className="d-flex justify-content-between align-items-center p-3 mb-2 border rounded-3"
                                    >
                                        <div>
                                            <strong className="d-block text-navy">{f.file_name}</strong>
                                            <small className="text-muted fw-bold">
                                                {f.file_category || 'وثيقة'} |{' '}
                                                {f.created_at
                                                    ? new Date(f.created_at).toLocaleDateString('ar-EG')
                                                    : ''}
                                            </small>
                                        </div>
                                        <div className="d-flex gap-2">
                                            <button
                                                className="btn btn-sm btn-outline-primary fw-bold"
                                                onClick={() =>
                                                    MoakkilAPI.downloadR2File(
                                                        f.file_url || f.drive_file_id,
                                                        f.file_name
                                                    )
                                                }
                                            >
                                                <i className="fas fa-download me-1"></i> تحميل
                                            </button>
                                            <button
                                                className="btn btn-sm btn-outline-danger"
                                                onClick={() => handleDeleteClientFile(f)}
                                            >
                                                <i className="fas fa-trash"></i>
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}

                    {activeTab === 'kyc' && (
                        <div className="card border-0 shadow-sm rounded-4 p-4">
                            <div className="row g-3 fw-bold">
                                <div className="col-md-4">
                                    <small className="text-muted d-block">نوع الموكل</small>
                                    <span>{clientObj.client_type || 'فرد'}</span>
                                </div>
                                <div className="col-md-4">
                                    <small className="text-muted d-block">الجنسية</small>
                                    <span>{clientObj.nationality || 'أردني'}</span>
                                </div>
                                <div className="col-md-4">
                                    <small className="text-muted d-block">اسم الأم</small>
                                    <span>{clientObj.mother_name || '--'}</span>
                                </div>
                                <div className="col-md-4">
                                    <small className="text-muted d-block">تاريخ الميلاد</small>
                                    <span>{clientObj.date_of_birth || '--'}</span>
                                </div>
                                <div className="col-md-4">
                                    <small className="text-muted d-block">مكان الولادة</small>
                                    <span>{clientObj.place_of_birth || '--'}</span>
                                </div>
                                <div className="col-md-4">
                                    <small className="text-muted d-block">الحالة الاجتماعية</small>
                                    <span>{clientObj.marital_status || '--'}</span>
                                </div>
                                <div className="col-md-4">
                                    <small className="text-muted d-block">المهنة / العمل</small>
                                    <span>{clientObj.profession || '--'}</span>
                                </div>
                                <div className="col-md-4">
                                    <small className="text-muted d-block">البريد الإلكتروني</small>
                                    <span>{clientObj.email || '--'}</span>
                                </div>
                                <div className="col-md-4">
                                    <small className="text-muted d-block">درجة السرية</small>
                                    <span>{clientObj.confidentiality_level || 'عادي'}</span>
                                </div>
                                <div className="col-12">
                                    <small className="text-muted d-block">العنوان التفصيلي</small>
                                    <span>{clientObj.address || '--'}</span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* نافذة تعديل بيانات الموكل */}
            {showEditModal && (
                <div
                    className="modal fade show d-block"
                    style={{ background: 'rgba(11,19,43,0.65)', zIndex: 1055 }}
                >
                    <div className="modal-dialog modal-dialog-centered modal-lg modal-dialog-scrollable">
                        <div className="modal-content rounded-4 border-0 shadow-lg">
                            <div className="modal-header bg-navy text-white">
                                <h5 className="modal-title fw-bold">تعديل بيانات الموكل</h5>
                                <button
                                    type="button"
                                    className="btn-close btn-close-white"
                                    onClick={() => setShowEditModal(false)}
                                ></button>
                            </div>
                            <div className="modal-body p-4">
                                <form onSubmit={handleSaveClient} className="row g-3">
                                    <div className="col-md-6">
                                        <label className="form-label fw-bold">الاسم الكامل *</label>
                                        <input
                                            type="text"
                                            className="form-control"
                                            value={editName}
                                            onChange={(e) => setEditName(e.target.value)}
                                            required
                                        />
                                    </div>
                                    <div className="col-md-6">
                                        <label className="form-label fw-bold">رقم الهاتف *</label>
                                        <input
                                            type="tel"
                                            className="form-control font-monospace text-start"
                                            dir="ltr"
                                            value={editPhone}
                                            onChange={(e) => setEditPhone(e.target.value)}
                                            required
                                        />
                                    </div>
                                    <div className="col-md-6">
                                        <label className="form-label fw-bold">الرقم الوطني</label>
                                        <input
                                            type="text"
                                            className="form-control font-monospace text-start"
                                            dir="ltr"
                                            value={editNationalId}
                                            onChange={(e) => setEditNationalId(e.target.value)}
                                        />
                                    </div>
                                    <div className="col-md-6">
                                        <label className="form-label fw-bold">اسم الأم</label>
                                        <input
                                            type="text"
                                            className="form-control"
                                            value={editMotherName}
                                            onChange={(e) => setEditMotherName(e.target.value)}
                                        />
                                    </div>
                                    <div className="col-md-4">
                                        <label className="form-label fw-bold">تاريخ الميلاد</label>
                                        <input
                                            type="date"
                                            className="form-control"
                                            value={editDob}
                                            onChange={(e) => setEditDob(e.target.value)}
                                        />
                                    </div>
                                    <div className="col-md-4">
                                        <label className="form-label fw-bold">الجنسية</label>
                                        <input
                                            type="text"
                                            className="form-control"
                                            value={editNationality}
                                            onChange={(e) => setEditNationality(e.target.value)}
                                        />
                                    </div>
                                    <div className="col-md-4">
                                        <label className="form-label fw-bold">نوع الموكل</label>
                                        <select
                                            className="form-select"
                                            value={editClientType}
                                            onChange={(e) => setEditClientType(e.target.value)}
                                        >
                                            <option value="فرد">فرد</option>
                                            <option value="شركة">شركة / مؤسسة</option>
                                        </select>
                                    </div>
                                    <div className="col-md-6">
                                        <label className="form-label fw-bold">المهنة</label>
                                        <input
                                            type="text"
                                            className="form-control"
                                            value={editProfession}
                                            onChange={(e) => setEditProfession(e.target.value)}
                                        />
                                    </div>
                                    <div className="col-md-6">
                                        <label className="form-label fw-bold">البريد الإلكتروني</label>
                                        <input
                                            type="email"
                                            className="form-control text-start"
                                            dir="ltr"
                                            value={editEmail}
                                            onChange={(e) => setEditEmail(e.target.value)}
                                        />
                                    </div>
                                    <div className="col-12">
                                        <label className="form-label fw-bold">العنوان</label>
                                        <input
                                            type="text"
                                            className="form-control"
                                            value={editAddress}
                                            onChange={(e) => setEditAddress(e.target.value)}
                                        />
                                    </div>
                                    <div className="col-12">
                                        <button
                                            type="submit"
                                            className="btn btn-gold w-100 py-2 fw-bold"
                                            disabled={savingClient}
                                        >
                                            {savingClient ? 'جاري الحفظ...' : 'حفظ التعديلات'}
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* نافذة رفع ملف للموكل */}
            {showUploadModal && (
                <div
                    className="modal fade show d-block"
                    style={{ background: 'rgba(11,19,43,0.65)', zIndex: 1055 }}
                >
                    <div className="modal-dialog modal-dialog-centered">
                        <div className="modal-content rounded-4 border-0 shadow-lg">
                            <div className="modal-header bg-navy text-white">
                                <h5 className="modal-title fw-bold">رفع وثيقة لأرشيف الموكل (R2)</h5>
                                <button
                                    type="button"
                                    className="btn-close btn-close-white"
                                    onClick={() => setShowUploadModal(false)}
                                ></button>
                            </div>
                            <div className="modal-body p-4">
                                <form onSubmit={handleUploadClientFile}>
                                    <div className="mb-3">
                                        <label className="form-label fw-bold">عنوان الوثيقة</label>
                                        <input
                                            type="text"
                                            className="form-control"
                                            value={uploadTitle}
                                            onChange={(e) => setUploadTitle(e.target.value)}
                                            placeholder="مثال: صورة الهوية المدنية..."
                                        />
                                    </div>
                                    <div className="mb-3">
                                        <label className="form-label fw-bold">التصنيف</label>
                                        <select
                                            className="form-select"
                                            value={uploadCategory}
                                            onChange={(e) => setUploadCategory(e.target.value)}
                                        >
                                            <option value="هوية رسمية">هوية رسمية / جواز سفر</option>
                                            <option value="وكالة">وكالة عدلية</option>
                                            <option value="عقد أتعاب">عقد أتعاب</option>
                                            <option value="سجل تجاري">سجل تجاري</option>
                                        </select>
                                    </div>
                                    <div className="mb-3">
                                        <label className="form-label fw-bold">الملف *</label>
                                        <input
                                            type="file"
                                            className="form-control"
                                            onChange={(e) => setUploadFileObj(e.target.files?.[0] || null)}
                                            required
                                        />
                                    </div>
                                    <div className="form-check form-switch mb-3">
                                        <input
                                            className="form-check-input"
                                            type="checkbox"
                                            id="vis_cl"
                                            checked={uploadVisibleToClient}
                                            onChange={(e) => setUploadVisibleToClient(e.target.checked)}
                                        />
                                        <label className="form-check-label fw-bold" htmlFor="vis_cl">
                                            إتاحة الوثيقة للموكل في بوابته الإلكترونية
                                        </label>
                                    </div>
                                    <button
                                        type="submit"
                                        className="btn btn-gold w-100 py-2 fw-bold"
                                        disabled={uploadingFile}
                                    >
                                        {uploadingFile ? 'جاري الرفع...' : 'رفع وحفظ'}
                                    </button>
                                </form>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* نافذة طلب النواقص من الموكل */}
            {showMissingDocsModal && (
                <div
                    className="modal fade show d-block"
                    style={{ background: 'rgba(11,19,43,0.65)', zIndex: 1055 }}
                >
                    <div className="modal-dialog modal-dialog-centered">
                        <div className="modal-content rounded-4 border-0 shadow-lg">
                            <div className="modal-header bg-warning text-dark">
                                <h5 className="modal-title fw-bold">
                                    <i className="fas fa-bell me-2"></i> طلب وثائق ناقصة من الموكل
                                </h5>
                                <button
                                    type="button"
                                    className="btn-close"
                                    onClick={() => setShowMissingDocsModal(false)}
                                ></button>
                            </div>
                            <div className="modal-body p-4">
                                <form onSubmit={handleSaveMissingDocRequest}>
                                    <div className="mb-3">
                                        <label className="form-label fw-bold">اختر القضية *</label>
                                        <select
                                            className="form-select fw-bold"
                                            value={missingDocCaseId}
                                            onChange={(e) => setMissingDocCaseId(e.target.value)}
                                            required
                                        >
                                            <option value="">-- اختر القضية --</option>
                                            {clientCases.map((c) => (
                                                <option key={c.id} value={c.id}>
                                                    {c.case_internal_id} - ضد {c.opponent_name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="mb-3">
                                        <label className="form-label fw-bold">تفاصيل المستندات المطلوبة</label>
                                        <textarea
                                            className="form-control"
                                            rows={4}
                                            placeholder="اكتب للموكل ما يجب عليه رفعه في البوابة (اتركه فارغاً لإلغاء الطلب)..."
                                            value={missingDocText}
                                            onChange={(e) => setMissingDocText(e.target.value)}
                                        />
                                    </div>
                                    <button
                                        type="submit"
                                        className="btn btn-gold w-100 py-2 fw-bold"
                                        disabled={savingMissingDoc}
                                    >
                                        {savingMissingDoc ? 'جاري الإرسال...' : 'إرسال الطلب لبوابة الموكل'}
                                    </button>
                                </form>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <BottomNav activeTab="clients" />
        </div>
    );
};
