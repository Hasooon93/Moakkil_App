/**
 * ============================================================================
 * نظام موكّل (Moakkil System) - 2026
 * الملف: src/features/cases/CaseDetailsPage.tsx
 * الوصف: غرفة العمليات المركزية للقضية (5 تبويبات رئيسية، 5 تبويبات تعديل شامل،
 *        الذكاء الاصطناعي التراكمي، السوابق القضائية، صائغ المذكرات، قارئ الوثائق،
 *        تقسيم الأتعاب، الفاتورة الضريبية مع QR، وبوابة الموكل)
 * مطابق 100% لملف case-details.html + js/case-details.js
 * ============================================================================
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Swal from 'sweetalert2';
import { MoakkilAPI } from '../../services/moakkilApi.service';
import { AuthService } from '../../services/auth.service';
import { AIHandler } from '../../services/aiHandler.service';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { BottomNav } from '../../components/layout/BottomNav';

export const CaseDetailsPage: React.FC = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const caseId = searchParams.get('id') || '';
    const { isOnline } = useAuth();
    const { isDark, toggleDarkMode } = useTheme();

    const [caseData, setCaseData] = useState<any | null>(null);
    const [updates, setUpdates] = useState<any[]>([]);
    const [installments, setInstallments] = useState<any[]>([]);
    const [expenses, setExpenses] = useState<any[]>([]);
    const [files, setFiles] = useState<any[]>([]);
    const [staffList, setStaffList] = useState<any[]>([]);
    const [similarCases, setSimilarCases] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const [activeTab, setActiveTab] = useState<'overview' | 'updates' | 'finance' | 'files' | 'notes'>('overview');

    // نافذة إضافة إجراء / جلسة جديدة
    const [showUpdateModal, setShowUpdateModal] = useState(false);
    const [updTitle, setUpdTitle] = useState('');
    const [updDetails, setUpdDetails] = useState('');
    const [updHearingDate, setUpdHearingDate] = useState('');
    const [updNextHearingDate, setUpdNextHearingDate] = useState('');
    const [updVisibleToClient, setUpdVisibleToClient] = useState(true);
    const [savingUpdate, setSavingUpdate] = useState(false);

    // نافذة إضافة دفعة مالية
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [payAmount, setPayAmount] = useState('');
    const [payDueDate, setPayDueDate] = useState(new Date().toISOString().split('T')[0]);
    const [payStatus, setPayStatus] = useState('مدفوعة');
    const [savingPay, setSavingPay] = useState(false);

    // نافذة إضافة مصروف قضائي
    const [showExpenseModal, setShowExpenseModal] = useState(false);
    const [expAmount, setExpAmount] = useState('');
    const [expDesc, setExpDesc] = useState('');
    const [expDate, setExpDate] = useState(new Date().toISOString().split('T')[0]);
    const [savingExp, setSavingExp] = useState(false);

    // نافذة حاسبة تقسيم الأتعاب بين الشركاء
    const [showFeeSplitModal, setShowFeeSplitModal] = useState(false);
    const [splitOfficePct, setSplitOfficePct] = useState('40');
    const [splitLeadLawyerPct, setSplitLeadLawyerPct] = useState('40');
    const [splitAssistantPct, setSplitAssistantPct] = useState('20');

    // نافذة رفع ملف سحابي (R2)
    const [showFileModal, setShowFileModal] = useState(false);
    const [fileTitle, setFileTitle] = useState('');
    const [fileCategory, setFileCategory] = useState('لوائح ومذكرات');
    const [fileVisibleToClient, setFileVisibleToClient] = useState(false);
    const [fileObj, setFileObj] = useState<File | null>(null);
    const [uploadingFile, setUploadingFile] = useState(false);

    // نافذة صائغ المذكرات واللوائح بالذكاء الاصطناعي
    const [showAiDraftModal, setShowAiDraftModal] = useState(false);
    const [draftType, setDraftType] = useState('لائحة دعوى');
    const [draftInstructions, setDraftInstructions] = useState('');
    const [generatedDraft, setGeneratedDraft] = useState('');
    const [generatingDraft, setGeneratingDraft] = useState(false);

    // نافذة قارئ الوثائق القضائية بالذكاء الاصطناعي (PDF.js / OCR)
    const [showAiReaderModal, setShowAiReaderModal] = useState(false);
    const [readerAnalysis, setReaderAnalysis] = useState('');
    const [analyzingDoc, setAnalyzingDoc] = useState(false);

    // نافذة التعديل الشامل لملف القضية (5 تبويبات)
    const [showEditCaseModal, setShowEditCaseModal] = useState(false);
    const [editCaseTab, setEditCaseTab] = useState<' judicial' | 'parties' | 'subject' | 'finance' | 'admin'>(' judicial');
    const [editForm, setEditForm] = useState<Record<string, any>>({});
    const [savingCase, setSavingCase] = useState(false);

    // مرجع رمز QR للفاتورة
    const qrContainerRef = useRef<HTMLDivElement>(null);

    const loadCaseWorkspace = useCallback(async () => {
        if (!caseId) {
            navigate('/app.html#cases');
            return;
        }
        setLoading(true);
        try {
            const [cData, updRes, instRes, expRes, filesRes, stRes] = await Promise.all([
                MoakkilAPI.getCaseById(caseId),
                MoakkilAPI.getUpdates(caseId),
                MoakkilAPI.getInstallments(caseId),
                MoakkilAPI.getExpenses(caseId),
                MoakkilAPI.getFiles(`case_id=eq.${encodeURIComponent(caseId)}`),
                MoakkilAPI.getStaff(),
            ]);

            if (!cData) {
                Swal.fire('تنبيه', 'لم يتم العثور على ملف القضية المطلوب.', 'warning').then(() =>
                    navigate('/app.html#cases')
                );
                return;
            }

            setCaseData(cData);
            setUpdates(Array.isArray(updRes) ? updRes : []);
            setInstallments(Array.isArray(instRes) ? instRes : []);
            setExpenses(Array.isArray(expRes) ? expRes : []);
            setFiles(Array.isArray(filesRes) ? filesRes : []);
            setStaffList(Array.isArray(stRes) ? stRes : []);

            // البحث الذكي عن السوابق القضائية المماثلة داخل المكتب
            if (cData.lawsuit_facts && navigator.onLine) {
                MoakkilAPI.findSimilarCases(cData.lawsuit_facts, caseId)
                    .then((simRes) => {
                        if (simRes && Array.isArray(simRes.similar_cases)) {
                            setSimilarCases(simRes.similar_cases);
                        }
                    })
                    .catch(() => {});
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [caseId, navigate]);

    useEffect(() => {
        loadCaseWorkspace();
    }, [loadCaseWorkspace]);

    // توليد QR لبوابة الموكل عند توفر بيانات القضية
    useEffect(() => {
        const QRCode = (window as any).QRCode;
        if (qrContainerRef.current && QRCode && caseData?.public_token) {
            qrContainerRef.current.innerHTML = '';
            const portalUrl = `${window.location.origin}/client.html?token=${caseData.public_token}`;
            new QRCode(qrContainerRef.current, {
                text: portalUrl,
                width: 110,
                height: 110,
            });
        }
    }, [caseData]);

    // فتح نافذة التعديل الشامل للقضية (5 تبويبات)
    const openEditCaseModal = () => {
        if (!caseData) return;
        setEditForm({
            case_internal_id: caseData.case_internal_id || '',
            case_type: caseData.case_type || '',
            current_court: caseData.current_court || '',
            court_room: caseData.court_room || '',
            court_case_number: caseData.court_case_number || '',
            case_year: caseData.case_year || new Date().getFullYear(),
            litigation_degree: caseData.litigation_degree || 'بداية',
            current_judge: caseData.current_judge || '',
            court_clerk: caseData.court_clerk || '',
            execution_file_number: caseData.execution_file_number || '',
            statute_of_limitations_date: caseData.statute_of_limitations_date || '',
            deadline_date: caseData.deadline_date || '',
            opponent_name: caseData.opponent_name || '',
            opponent_lawyer: caseData.opponent_lawyer || '',
            power_of_attorney_number: caseData.power_of_attorney_number || '',
            poa_details: caseData.poa_details || '',
            lawsuit_facts: caseData.lawsuit_facts || '',
            legal_basis: caseData.legal_basis || '',
            claim_amount: caseData.claim_amount || 0,
            total_agreed_fees: caseData.total_agreed_fees || 0,
            court_fees_paid: caseData.court_fees_paid || 0,
            success_probability: caseData.success_probability || 75,
            status: caseData.status || 'نشطة',
            current_stage: caseData.current_stage || 'قيد النظر',
            priority_level: caseData.priority_level || 'عادي',
            confidentiality_level: caseData.confidentiality_level || 'عادي',
            physical_archive_location: caseData.physical_archive_location || '',
            access_pin: caseData.access_pin || '',
            secret_notes: caseData.secret_notes || '',
        });
        setEditCaseTab(' judicial');
        setShowEditCaseModal(true);
    };

    const handleSaveCaseEdit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSavingCase(true);
        try {
            const payload = {
                ...editForm,
                access_pin: String(editForm.access_pin || '')
                    .trim()
                    .toUpperCase(),
                claim_amount: Number(editForm.claim_amount) || 0,
                total_agreed_fees: Number(editForm.total_agreed_fees) || 0,
                court_fees_paid: Number(editForm.court_fees_paid) || 0,
                success_probability: Number(editForm.success_probability) || 75,
            };
            const res = await MoakkilAPI.updateCase(caseId, payload);
            if (res && !res.error) {
                Swal.fire({
                    toast: true,
                    position: 'top-end',
                    icon: 'success',
                    title: 'تم تحديث بيانات ملف القضية بنجاح',
                    showConfirmButton: false,
                    timer: 2000,
                });
                setShowEditCaseModal(false);
                await loadCaseWorkspace();
            } else {
                throw new Error(res?.error || 'فشل التحديث');
            }
        } catch (err: any) {
            Swal.fire('خطأ', err.message, 'error');
        } finally {
            setSavingCase(false);
        }
    };

    // إضافة تحديث / جلسة جديدة + جدولة الجلسة القادمة تلقائياً + استخراج الكيانات بالذكاء الاصطناعي
    const handleAddUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!updDetails.trim()) return;
        setSavingUpdate(true);

        try {
            let extractedEntities = null;
            if (isOnline && updDetails.length > 15) {
                try {
                    const aiRes = await MoakkilAPI.extractLegalData(updDetails);
                    if (aiRes && aiRes.extracted_json) {
                        extractedEntities = aiRes.extracted_json;
                    }
                } catch {
                    // Continue even if AI entity extraction is skipped
                }
            }

            const payload = {
                case_id: caseId,
                update_title: updTitle.trim() || 'تحديث إجرائي / جلسة محكمة',
                update_details: updDetails.trim(),
                hearing_date: updHearingDate || new Date().toISOString().split('T')[0],
                next_hearing_date: updNextHearingDate || null,
                is_visible_to_client: updVisibleToClient,
                ai_extracted_entities: extractedEntities,
            };

            const res = await MoakkilAPI.addUpdate(payload);
            if (res && !res.error) {
                // إذا تم تحديد موعد الجلسة القادمة، ندرجها تلقائياً في الأجندة بتوقيت الأردن (+03:00)
                if (updNextHearingDate) {
                    await MoakkilAPI.addAppointment({
                        title: `جلسة محكمة: ملف (${caseData?.case_internal_id || ''}) ضد (${
                            caseData?.opponent_name || ''
                        })`,
                        appt_date: `${updNextHearingDate}T09:00:00+03:00`,
                        type: 'جلسة محكمة',
                        status: 'مجدول',
                        client_id: caseData?.client_id || null,
                        related_case_id: caseId,
                        notes: updDetails.trim(),
                    });
                }

                Swal.fire({
                    toast: true,
                    position: 'top-end',
                    icon: 'success',
                    title: 'تم توثيق الإجراء وتحديث الخط الزمني للقضية',
                    showConfirmButton: false,
                    timer: 2500,
                });
                setShowUpdateModal(false);
                setUpdTitle('');
                setUpdDetails('');
                setUpdNextHearingDate('');
                await loadCaseWorkspace();
            } else {
                throw new Error(res?.error || 'تعذر حفظ الإجراء');
            }
        } catch (err: any) {
            Swal.fire('خطأ', err.message, 'error');
        } finally {
            setSavingUpdate(false);
        }
    };

    const handleDeleteUpdate = async (upd: any) => {
        try {
            const token = await AuthService.requireActionMFA(
                `حذف تحديث القضية (${upd.update_title || 'إجراء'})`,
                'mo_case_updates',
                String(upd.id)
            );
            if (!token) return;
            const res = await MoakkilAPI.deleteUpdate(String(upd.id), token);
            if (res && !res.error) {
                Swal.fire('تم الحذف', 'تم حذف الإجراء بنجاح.', 'success');
                await loadCaseWorkspace();
            }
        } catch (err: any) {
            if (!err.message?.includes('إلغاء')) Swal.fire('خطأ', err.message, 'error');
        }
    };

    // إضافة دفعة مالية وتحديث إجمالي المدفوع في القضية
    const handleAddPayment = async (e: React.FormEvent) => {
        e.preventDefault();
        const amt = parseFloat(payAmount);
        if (!amt || amt <= 0) return;

        setSavingPay(true);
        try {
            const res = await MoakkilAPI.addInstallment({
                case_id: caseId,
                amount: amt,
                due_date: payDueDate || new Date().toISOString().split('T')[0],
                status: payStatus,
            });
            if (res && !res.error) {
                if (payStatus === 'مدفوعة') {
                    const newPaid =
                        installments
                            .filter((i) => i.status === 'مدفوعة')
                            .reduce((s, i) => s + (Number(i.amount) || 0), 0) + amt;
                    await MoakkilAPI.updateCase(caseId, { total_paid: newPaid });
                }
                Swal.fire({
                    toast: true,
                    position: 'top-end',
                    icon: 'success',
                    title: 'تم تسجيل الدفعة المالية بنجاح',
                    showConfirmButton: false,
                    timer: 2000,
                });
                setShowPaymentModal(false);
                setPayAmount('');
                await loadCaseWorkspace();
            } else {
                throw new Error(res?.error || 'تعذر تسجيل الدفعة');
            }
        } catch (err: any) {
            Swal.fire('خطأ', err.message, 'error');
        } finally {
            setSavingPay(false);
        }
    };

    const handleDeleteInstallment = async (inst: any) => {
        try {
            const token = await AuthService.requireActionMFA(
                `حذف دفعة مالية بقيمة (${inst.amount} د.أ)`,
                'mo_installments',
                String(inst.id)
            );
            if (!token) return;
            const res = await MoakkilAPI.deleteInstallment(String(inst.id), token);
            if (res && !res.error) {
                const remainingPaid = installments
                    .filter((i) => i.id !== inst.id && i.status === 'مدفوعة')
                    .reduce((s, i) => s + (Number(i.amount) || 0), 0);
                await MoakkilAPI.updateCase(caseId, { total_paid: remainingPaid });
                Swal.fire('تم الحذف', 'تم حذف الدفعة المالية وتحديث الرصيد.', 'success');
                await loadCaseWorkspace();
            }
        } catch (err: any) {
            if (!err.message?.includes('إلغاء')) Swal.fire('خطأ', err.message, 'error');
        }
    };

    // إضافة مصروف قضائي
    const handleAddExpense = async (e: React.FormEvent) => {
        e.preventDefault();
        const amt = parseFloat(expAmount);
        if (!amt || amt <= 0) return;

        setSavingExp(true);
        try {
            const res = await MoakkilAPI.addExpense({
                case_id: caseId,
                amount: amt,
                description: expDesc.trim(),
                expense_date: expDate || new Date().toISOString().split('T')[0],
            });
            if (res && !res.error) {
                Swal.fire({
                    toast: true,
                    position: 'top-end',
                    icon: 'success',
                    title: 'تم تسجيل المصروف القضائي',
                    showConfirmButton: false,
                    timer: 2000,
                });
                setShowExpenseModal(false);
                setExpAmount('');
                setExpDesc('');
                await loadCaseWorkspace();
            } else {
                throw new Error(res?.error || 'تعذر تسجيل المصروف');
            }
        } catch (err: any) {
            Swal.fire('خطأ', err.message, 'error');
        } finally {
            setSavingExp(false);
        }
    };

    const handleDeleteExpense = async (exp: any) => {
        try {
            const token = await AuthService.requireActionMFA(
                `حذف مصروف قضائي (${exp.description})`,
                'mo_expenses',
                String(exp.id)
            );
            if (!token) return;
            const res = await MoakkilAPI.deleteExpense(String(exp.id), token);
            if (res && !res.error) {
                Swal.fire('تم الحذف', 'تم حذف المصروف بنجاح.', 'success');
                await loadCaseWorkspace();
            }
        } catch (err: any) {
            if (!err.message?.includes('إلغاء')) Swal.fire('خطأ', err.message, 'error');
        }
    };

    // رفع وثيقة سحابية إلى Cloudflare R2
    const handleUploadCaseFile = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!fileObj) return;
        setUploadingFile(true);
        try {
            const r2Res = await MoakkilAPI.uploadFileToR2(fileObj, caseId, fileCategory);
            if (r2Res && r2Res.r2_key) {
                const record = {
                    case_id: caseId,
                    client_id: caseData?.client_id || null,
                    file_name: fileTitle.trim() || fileObj.name,
                    file_type: fileObj.type || 'application/octet-stream',
                    file_extension: fileObj.name.split('.').pop()?.toLowerCase() || '',
                    file_category: fileCategory,
                    file_url: r2Res.r2_key,
                    drive_file_id: r2Res.r2_key,
                    is_visible_to_client: fileVisibleToClient,
                };
                const dbRes = await MoakkilAPI.addFileRecord(record);
                if (dbRes && !dbRes.error) {
                    Swal.fire({
                        toast: true,
                        position: 'top-end',
                        icon: 'success',
                        title: 'تم تشفير ورفع الوثيقة إلى أرشيف القضية (R2)',
                        showConfirmButton: false,
                        timer: 2500,
                    });
                    setShowFileModal(false);
                    setFileTitle('');
                    setFileObj(null);
                    await loadCaseWorkspace();
                } else {
                    await MoakkilAPI.cleanupOrphanR2File(r2Res.r2_key);
                    throw new Error(dbRes?.error || 'فشل توثيق الملف');
                }
            }
        } catch (err: any) {
            Swal.fire('خطأ', err.message, 'error');
        } finally {
            setUploadingFile(false);
        }
    };

    const handleDeleteCaseFile = async (f: any) => {
        try {
            const token = await AuthService.requireActionMFA(
                `حذف وثيقة القضية (${f.file_name})`,
                'mo_files',
                String(f.id)
            );
            if (!token) return;
            const res = await MoakkilAPI.deleteFile(String(f.id), token);
            if (res && !res.error) {
                Swal.fire('تم الحذف', 'تم حذف الوثيقة نهائياً.', 'success');
                await loadCaseWorkspace();
            }
        } catch (err: any) {
            if (!err.message?.includes('إلغاء')) Swal.fire('خطأ', err.message, 'error');
        }
    };

    // توليد مسودة مذكرة قانونية بالذكاء الاصطناعي
    const handleGenerateAiDraft = async () => {
        if (!caseData) return;
        setGeneratingDraft(true);
        try {
            const res = await MoakkilAPI.generateLegalDraft(draftType, caseData, draftInstructions);
            if (res && (res.draft || res.reply)) {
                setGeneratedDraft(res.draft || res.reply);
            } else {
                throw new Error(res?.error || 'تعذر توليد المذكرة');
            }
        } catch (err: any) {
            Swal.fire('خطأ', err.message, 'error');
        } finally {
            setGeneratingDraft(false);
        }
    };

    // قراءة وتحليل وثيقة قضائية بالذكاء الاصطناعي (PDF.js / OCR)
    const handleAnalyzeDocFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setAnalyzingDoc(true);
        setReaderAnalysis('');
        try {
            const text = await AIHandler.extractTextFromFile(file);
            const aiRes = await MoakkilAPI.askAI(
                `قم بتحليل هذه الوثيقة القضائية واستخراج: 1. ملخص المضمون، 2. الدفوع والثغرات القانونية، 3. المواعيد والمدد القانونية المذكورة:\n\n${text}`,
                [],
                true
            );
            if (aiRes && (aiRes.reply || aiRes.draft)) {
                setReaderAnalysis(aiRes.reply || aiRes.draft);
            } else {
                throw new Error(aiRes?.error || 'تعذر تحليل الوثيقة');
            }
        } catch (err: any) {
            Swal.fire('خطأ في قراءة الوثيقة', err.message, 'error');
        } finally {
            setAnalyzingDoc(false);
            e.target.value = '';
        }
    };

    // مشاركة بوابة الموكل عبر واتساب مع رمز الـ PIN (الأرقام أو الحروف)
    const handleSharePortalWhatsApp = () => {
        if (!caseData) return;
        const portalUrl = `${window.location.origin}/client.html?token=${caseData.public_token || ''}`;
        const pin = caseData.access_pin || 'غير محدد';
        const clientPhone = caseData.mo_clients?.phone || '';
        const msg = `تحية طيبة من مكتب المحاماة،\nيمكنكم متابعة مستجدات قضيتكم رقم (${
            caseData.case_internal_id || ''
        }) عبر البوابة الرقمية المشفرة:\nالرابط: ${portalUrl}\nرمز الدخول السري (PIN): ${pin}`;

        if (clientPhone) {
            let p = String(clientPhone).replace(/[^0-9+]/g, '');
            if (p.startsWith('0')) p = '962' + p.substring(1);
            window.open(`https://wa.me/${p}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer');
        } else {
            navigator.clipboard?.writeText(msg);
            Swal.fire('تم النسخ', 'تم نسخ بيانات الدخول لبوابة الموكل إلى الحافظة.', 'success');
        }
    };

    const totalAgreed = Number(caseData?.total_agreed_fees || 0);
    const totalPaid = installments
        .filter((i) => i.status === 'مدفوعة')
        .reduce((s, i) => s + (Number(i.amount) || 0), 0);
    const totalExpensesSum = expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const remainingFees = Math.max(0, totalAgreed - totalPaid);

    return (
        <div className="min-vh-100 pb-5 mb-5">
            {/* الترويسة العلوية */}
            <div className="top-nav d-flex justify-content-between align-items-center px-3 py-3 d-print-none">
                <div className="d-flex align-items-center gap-2">
                    <button
                        className="btn btn-link text-white p-0 text-decoration-none"
                        onClick={() => navigate('/app.html#cases')}
                    >
                        <i className="fas fa-arrow-right fs-4"></i>
                    </button>
                    <h5 className="mb-0 fw-bold text-white">
                        <i className="fas fa-gavel me-2" style={{ color: '#D4AF37' }}></i> غرفة عمليات القضية
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
                    <button className="btn btn-sm btn-gold fw-bold" onClick={openEditCaseModal}>
                        <i className="fas fa-edit me-1"></i> تحرير شامل
                    </button>
                </div>
            </div>

            {loading || !caseData ? (
                <div className="container mt-5 text-center">
                    <i className="fas fa-spinner fa-spin fa-3x text-warning mb-3"></i>
                    <h5 className="fw-bold">جاري تحميل ملف القضية...</h5>
                </div>
            ) : (
                <div className="container mt-4 fade-in">
                    {/* بطاقة ملخص القضية وأزرار الذكاء الاصطناعي */}
                    <div className="card border-0 shadow-sm rounded-4 p-4 mb-4 d-print-none">
                        <div className="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-3">
                            <div>
                                <div className="d-flex align-items-center gap-2 mb-2">
                                    <span className="badge bg-navy text-warning font-monospace px-3 py-2">
                                        {caseData.case_internal_id || 'ملف قضائي'}
                                    </span>
                                    <span className="badge bg-success px-3 py-2">{caseData.status || 'نشطة'}</span>
                                    <span className="badge bg-info text-dark px-3 py-2">
                                        PIN البوابة: <strong className="font-monospace">{caseData.access_pin || '--'}</strong>
                                    </span>
                                </div>
                                <h4 className="fw-bold text-navy mb-1">
                                    {caseData.case_type || 'دعوى حقوقية'} — ضد: {caseData.opponent_name || 'غير محدد'}
                                </h4>
                                <small className="text-muted fw-bold">
                                    الموكل:{' '}
                                    <span
                                        className="text-primary text-decoration-underline"
                                        style={{ cursor: 'pointer' }}
                                        onClick={() =>
                                            caseData.client_id &&
                                            navigate(`/client-details.html?id=${caseData.client_id}`)
                                        }
                                    >
                                        {caseData.mo_clients?.full_name || 'موكل المكتب'}
                                    </span>{' '}
                                    | المحكمة: {caseData.current_court || '--'} | رقم الدعوى:{' '}
                                    <span className="font-monospace">{caseData.court_case_number || '--'}</span>
                                </small>
                            </div>

                            <div className="d-flex flex-wrap gap-2">
                                <button
                                    className="btn btn-sm btn-primary fw-bold px-3 py-2 rounded-3"
                                    onClick={() => setShowAiDraftModal(true)}
                                >
                                    <i className="fas fa-feather-alt me-1"></i> صائغ المذكرات (AI)
                                </button>
                                <button
                                    className="btn btn-sm btn-info fw-bold px-3 py-2 rounded-3 text-dark"
                                    onClick={() => setShowAiReaderModal(true)}
                                >
                                    <i className="fas fa-file-medical-alt me-1"></i> قارئ الوثائق (AI)
                                </button>
                                <button
                                    className="btn btn-sm btn-success fw-bold px-3 py-2 rounded-3"
                                    onClick={handleSharePortalWhatsApp}
                                >
                                    <i className="fab fa-whatsapp me-1"></i> مشاركة بوابة الموكل
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* التبويبات الـ 5 لغرفة عمليات القضية */}
                    <ul className="nav nav-pills mb-4 gap-2 d-print-none">
                        <li className="nav-item">
                            <button
                                className={`nav-link fw-bold ${activeTab === 'overview' ? 'active' : 'bg-white border'}`}
                                onClick={() => setActiveTab('overview')}
                            >
                                <i className="fas fa-info-circle me-1"></i> نظرة عامة والذكاء الاصطناعي
                            </button>
                        </li>
                        <li className="nav-item">
                            <button
                                className={`nav-link fw-bold ${activeTab === 'updates' ? 'active' : 'bg-white border'}`}
                                onClick={() => setActiveTab('updates')}
                            >
                                <i className="fas fa-stream me-1"></i> سجل الجلسات والإجراءات ({updates.length})
                            </button>
                        </li>
                        <li className="nav-item">
                            <button
                                className={`nav-link fw-bold ${activeTab === 'finance' ? 'active' : 'bg-white border'}`}
                                onClick={() => setActiveTab('finance')}
                            >
                                <i className="fas fa-coins me-1"></i> المالية والفواتير
                            </button>
                        </li>
                        <li className="nav-item">
                            <button
                                className={`nav-link fw-bold ${activeTab === 'files' ? 'active' : 'bg-white border'}`}
                                onClick={() => setActiveTab('files')}
                            >
                                <i className="fas fa-cloud me-1"></i> خزنة الوثائق R2 ({files.length})
                            </button>
                        </li>
                        <li className="nav-item">
                            <button
                                className={`nav-link fw-bold ${activeTab === 'notes' ? 'active' : 'bg-white border'}`}
                                onClick={() => setActiveTab('notes')}
                            >
                                <i className="fas fa-user-secret me-1"></i> الملاحظات السرية والإنابة
                            </button>
                        </li>
                    </ul>

                    {/* التبويب 1: نظرة عامة والذكاء الاصطناعي */}
                    {activeTab === 'overview' && (
                        <div className="row g-4 d-print-none">
                            <div className="col-md-8">
                                <div className="card border-0 shadow-sm rounded-4 p-4 mb-4">
                                    <h6 className="fw-bold text-navy border-bottom pb-2 mb-3">
                                        <i className="fas fa-align-right me-2 text-warning"></i> وقائع الدعوى والأساس القانوني
                                    </h6>
                                    <p className="fw-semibold mb-3" style={{ whiteSpace: 'pre-line' }}>
                                        {caseData.lawsuit_facts || 'لم يتم إدخال وقائع تفصيلية للدعوى بعد.'}
                                    </p>
                                    {caseData.legal_basis && (
                                        <div className="p-3 rounded-3 bg-light border-start border-4 border-primary">
                                            <strong className="d-block small text-primary mb-1">المواد القانونية المستند إليها:</strong>
                                            <span className="fw-bold small">{caseData.legal_basis}</span>
                                        </div>
                                    )}
                                </div>

                                {caseData.ai_cumulative_summary && (
                                    <div className="card border-0 shadow-sm rounded-4 p-4 mb-4 border-top border-4 border-info">
                                        <h6 className="fw-bold text-navy mb-2">
                                            <i className="fas fa-brain me-2 text-info"></i> الملخص التراكمي الذكي للقضية (Cloudflare AI)
                                        </h6>
                                        <p className="mb-0 fw-semibold">{caseData.ai_cumulative_summary}</p>
                                    </div>
                                )}

                                {similarCases.length > 0 && (
                                    <div className="card border-0 shadow-sm rounded-4 p-4">
                                        <h6 className="fw-bold text-navy mb-3">
                                            <i className="fas fa-project-diagram me-2 text-success"></i> سوابق وقضايا مشابهة في المكتب (Vectorize RAG)
                                        </h6>
                                        {similarCases.map((sc: any) => (
                                            <div
                                                key={sc.id}
                                                className="p-2 mb-2 border rounded-3 d-flex justify-content-between align-items-center"
                                            >
                                                <span className="fw-bold small">
                                                    {sc.case_internal_id} — {sc.case_type}
                                                </span>
                                                <button
                                                    className="btn btn-sm btn-outline-primary"
                                                    onClick={() => navigate(`/case-details.html?id=${sc.id}`)}
                                                >
                                                    فتح الملف
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="col-md-4">
                                <div className="card border-0 shadow-sm rounded-4 p-4 mb-4">
                                    <h6 className="fw-bold text-navy border-bottom pb-2 mb-3">بطاقة البيانات القضائية</h6>
                                    <div className="small fw-bold d-flex flex-column gap-2">
                                        <div className="d-flex justify-content-between">
                                            <span className="text-muted">القاضي:</span>
                                            <span>{caseData.current_judge || '--'}</span>
                                        </div>
                                        <div className="d-flex justify-content-between">
                                            <span className="text-muted">قلم المحكمة / القاعة:</span>
                                            <span>{caseData.court_room || caseData.court_clerk || '--'}</span>
                                        </div>
                                        <div className="d-flex justify-content-between">
                                            <span className="text-muted">وكيل الخصم:</span>
                                            <span>{caseData.opponent_lawyer || '--'}</span>
                                        </div>
                                        <div className="d-flex justify-content-between">
                                            <span className="text-muted">رقم الوكالة:</span>
                                            <span className="font-monospace">
                                                {caseData.power_of_attorney_number || '--'}
                                            </span>
                                        </div>
                                        <div className="d-flex justify-content-between">
                                            <span className="text-muted">الملف التنفيذي:</span>
                                            <span className="font-monospace">
                                                {caseData.execution_file_number || '--'}
                                            </span>
                                        </div>
                                        <div className="d-flex justify-content-between">
                                            <span className="text-muted">احتمالية النجاح:</span>
                                            <span className="text-success font-monospace">
                                                {caseData.success_probability ?? 75}%
                                            </span>
                                        </div>
                                        <div className="d-flex justify-content-between">
                                            <span className="text-muted">الأرشيف الورقي:</span>
                                            <span>{caseData.physical_archive_location || '--'}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* التبويب 2: سجل الجلسات والإجراءات */}
                    {activeTab === 'updates' && (
                        <div className="card border-0 shadow-sm rounded-4 p-4 d-print-none">
                            <div className="d-flex justify-content-between align-items-center mb-4">
                                <h6 className="fw-bold text-navy mb-0">الخط الزمني للجلسات والقرارات الإجرائية</h6>
                                <button
                                    className="btn btn-gold btn-sm fw-bold"
                                    onClick={() => setShowUpdateModal(true)}
                                >
                                    <i className="fas fa-plus me-1"></i> تسجيل محضر جلسة / إجراء
                                </button>
                            </div>

                            {updates.length === 0 ? (
                                <div className="text-center p-4 text-muted fw-bold">
                                    لا توجد جلسات أو إجراءات مسجلة بعد.
                                </div>
                            ) : (
                                updates.map((u) => (
                                    <div key={u.id} className="p-3 mb-3 border rounded-4 bg-light">
                                        <div className="d-flex justify-content-between align-items-center mb-2">
                                            <div>
                                                <strong className="text-navy">{u.update_title || 'إجراء قضائي'}</strong>
                                                {u.is_visible_to_client && (
                                                    <span className="badge bg-info text-dark ms-2">مرئي للموكل</span>
                                                )}
                                            </div>
                                            <div className="d-flex align-items-center gap-2">
                                                <small className="font-monospace text-muted fw-bold">
                                                    {u.hearing_date ||
                                                        (u.created_at
                                                            ? new Date(u.created_at).toLocaleDateString('ar-JO')
                                                            : '')}
                                                </small>
                                                <button
                                                    className="btn btn-sm btn-outline-danger py-0 px-2"
                                                    onClick={() => handleDeleteUpdate(u)}
                                                >
                                                    <i className="fas fa-trash"></i>
                                                </button>
                                            </div>
                                        </div>
                                        <p className="mb-1 fw-semibold" style={{ whiteSpace: 'pre-line' }}>
                                            {u.update_details}
                                        </p>
                                        {u.next_hearing_date && (
                                            <small className="text-danger fw-bold d-block mt-2">
                                                <i className="fas fa-calendar-day me-1"></i> موعد الجلسة القادمة:{' '}
                                                {u.next_hearing_date}
                                            </small>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    )}

                    {/* التبويب 3: المالية والفواتير وحاسبة تقسيم الأتعاب */}
                    {activeTab === 'finance' && (
                        <div>
                            <div className="row g-3 mb-4 d-print-none">
                                <div className="col-md-3 col-6">
                                    <div className="card border-0 shadow-sm rounded-4 p-3 text-center">
                                        <small className="text-muted fw-bold">الأتعاب المتفق عليها</small>
                                        <h4 className="fw-bold text-navy font-monospace mt-1 mb-0">
                                            {totalAgreed.toLocaleString()} د.أ
                                        </h4>
                                    </div>
                                </div>
                                <div className="col-md-3 col-6">
                                    <div className="card border-0 shadow-sm rounded-4 p-3 text-center">
                                        <small className="text-muted fw-bold">إجمالي المقبوضات</small>
                                        <h4 className="fw-bold text-success font-monospace mt-1 mb-0">
                                            {totalPaid.toLocaleString()} د.أ
                                        </h4>
                                    </div>
                                </div>
                                <div className="col-md-3 col-6">
                                    <div className="card border-0 shadow-sm rounded-4 p-3 text-center">
                                        <small className="text-muted fw-bold">الرصيد المتبقي</small>
                                        <h4 className="fw-bold text-warning font-monospace mt-1 mb-0">
                                            {remainingFees.toLocaleString()} د.أ
                                        </h4>
                                    </div>
                                </div>
                                <div className="col-md-3 col-6">
                                    <div className="card border-0 shadow-sm rounded-4 p-3 text-center">
                                        <small className="text-muted fw-bold">المصاريف القضائية</small>
                                        <h4 className="fw-bold text-danger font-monospace mt-1 mb-0">
                                            {totalExpensesSum.toLocaleString()} د.أ
                                        </h4>
                                    </div>
                                </div>
                            </div>

                            <div className="d-flex flex-wrap gap-2 mb-4 d-print-none">
                                <button
                                    className="btn btn-success fw-bold"
                                    onClick={() => setShowPaymentModal(true)}
                                >
                                    <i className="fas fa-plus-circle me-1"></i> قبض دفعة أتعاب
                                </button>
                                <button
                                    className="btn btn-danger fw-bold"
                                    onClick={() => setShowExpenseModal(true)}
                                >
                                    <i className="fas fa-minus-circle me-1"></i> تسجيل مصروف رسوم
                                </button>
                                <button
                                    className="btn btn-outline-primary fw-bold"
                                    onClick={() => setShowFeeSplitModal(true)}
                                >
                                    <i className="fas fa-chart-pie me-1"></i> حاسبة تقسيم الأتعاب
                                </button>
                                <button className="btn btn-dark fw-bold ms-auto" onClick={() => window.print()}>
                                    <i className="fas fa-print me-1"></i> طباعة كشف حساب رسمي + QR
                                </button>
                            </div>

                            <div className="row g-4">
                                <div className="col-md-6">
                                    <div className="card border-0 shadow-sm rounded-4 p-4 h-100">
                                        <h6 className="fw-bold text-success mb-3">سجل الدفعات والأقساط</h6>
                                        {installments.length === 0 ? (
                                            <p className="text-muted small fw-bold">لا توجد دفعات مسجلة.</p>
                                        ) : (
                                            installments.map((inst) => (
                                                <div
                                                    key={inst.id}
                                                    className="d-flex justify-content-between align-items-center p-2 mb-2 border rounded-3"
                                                >
                                                    <div>
                                                        <strong className="font-monospace text-success">
                                                            {Number(inst.amount).toLocaleString()} د.أ
                                                        </strong>
                                                        <small className="d-block text-muted font-monospace">
                                                            {inst.due_date} ({inst.status})
                                                        </small>
                                                    </div>
                                                    <button
                                                        className="btn btn-sm btn-outline-danger d-print-none"
                                                        onClick={() => handleDeleteInstallment(inst)}
                                                    >
                                                        <i className="fas fa-trash"></i>
                                                    </button>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>

                                <div className="col-md-6">
                                    <div className="card border-0 shadow-sm rounded-4 p-4 h-100">
                                        <h6 className="fw-bold text-danger mb-3">سجل المصاريف والرسوم القضائية</h6>
                                        {expenses.length === 0 ? (
                                            <p className="text-muted small fw-bold">لا توجد مصاريف مسجلة.</p>
                                        ) : (
                                            expenses.map((exp) => (
                                                <div
                                                    key={exp.id}
                                                    className="d-flex justify-content-between align-items-center p-2 mb-2 border rounded-3"
                                                >
                                                    <div>
                                                        <strong className="font-monospace text-danger">
                                                            {Number(exp.amount).toLocaleString()} د.أ
                                                        </strong>
                                                        <small className="d-block text-muted fw-bold">
                                                            {exp.description} ({exp.expense_date})
                                                        </small>
                                                    </div>
                                                    <button
                                                        className="btn btn-sm btn-outline-danger d-print-none"
                                                        onClick={() => handleDeleteExpense(exp)}
                                                    >
                                                        <i className="fas fa-trash"></i>
                                                    </button>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* ترويسة الطباعة ورمز QR للبوابة */}
                            <div className="card border-0 shadow-sm rounded-4 p-4 mt-4 d-flex flex-row justify-content-between align-items-center">
                                <div>
                                    <h6 className="fw-bold text-navy mb-1">رمز الاستجابة السريع لبوابة الموكل (QR)</h6>
                                    <p className="text-muted small fw-bold mb-0">
                                        امسح الرمز لفتح بوابة القضية المشفرة باستخدام الرمز السري:{' '}
                                        <code className="fs-6">{caseData.access_pin || '--'}</code>
                                    </p>
                                </div>
                                <div ref={qrContainerRef}></div>
                            </div>
                        </div>
                    )}

                    {/* التبويب 4: خزنة الوثائق السحابية R2 */}
                    {activeTab === 'files' && (
                        <div className="card border-0 shadow-sm rounded-4 p-4 d-print-none">
                            <div className="d-flex justify-content-between align-items-center mb-3">
                                <h6 className="fw-bold text-navy mb-0">أرشيف وثائق القضية المشفر (Cloudflare R2)</h6>
                                <button
                                    className="btn btn-gold btn-sm fw-bold"
                                    onClick={() => setShowFileModal(true)}
                                >
                                    <i className="fas fa-cloud-upload-alt me-1"></i> رفع مستند للقضية
                                </button>
                            </div>

                            {files.length === 0 ? (
                                <div className="text-center p-4 text-muted fw-bold">
                                    لا توجد وثائق مرفوعة في هذه القضية.
                                </div>
                            ) : (
                                files.map((f) => (
                                    <div
                                        key={f.id}
                                        className="d-flex justify-content-between align-items-center p-3 mb-2 border rounded-3"
                                    >
                                        <div>
                                            <strong className="text-navy d-block">{f.file_name}</strong>
                                            <small className="text-muted fw-bold">
                                                {f.file_category || 'مستند'} |{' '}
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
                                                <i className="fas fa-download me-1"></i> تحميل آمن
                                            </button>
                                            <button
                                                className="btn btn-sm btn-outline-danger"
                                                onClick={() => handleDeleteCaseFile(f)}
                                            >
                                                <i className="fas fa-trash"></i>
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}

                    {/* التبويب 5: الملاحظات السرية للمحامي والإنابة */}
                    {activeTab === 'notes' && (
                        <div className="card border-0 shadow-sm rounded-4 p-4 d-print-none">
                            <h6 className="fw-bold text-danger mb-2">
                                <i className="fas fa-lock me-2"></i> الملاحظات الاستراتيجية السرية (لا تظهر للموكل أبداً)
                            </h6>
                            <textarea
                                className="form-control mb-3 fw-bold"
                                rows={5}
                                value={caseData.secret_notes || ''}
                                onChange={(e) => setCaseData({ ...caseData, secret_notes: e.target.value })}
                                placeholder="دون استراتيجية الدفاع أو نقاط الضعف السرية هنا..."
                            />
                            <button
                                className="btn btn-gold fw-bold align-self-start px-4"
                                onClick={async () => {
                                    const res = await MoakkilAPI.updateCase(caseId, {
                                        secret_notes: caseData.secret_notes || null,
                                    });
                                    if (res && !res.error) {
                                        Swal.fire('تم الحفظ', 'تم حفظ الملاحظات السرية بنجاح.', 'success');
                                    }
                                }}
                            >
                                <i className="fas fa-save me-1"></i> حفظ الملاحظات السرية
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* نافذة إضافة إجراء / جلسة */}
            {showUpdateModal && (
                <div
                    className="modal fade show d-block"
                    style={{ background: 'rgba(11,19,43,0.65)', zIndex: 1055 }}
                >
                    <div className="modal-dialog modal-dialog-centered">
                        <div className="modal-content rounded-4 border-0 shadow-lg">
                            <div className="modal-header bg-navy text-white">
                                <h5 className="modal-title fw-bold">تسجيل محضر جلسة / إجراء قضائي</h5>
                                <button
                                    type="button"
                                    className="btn-close btn-close-white"
                                    onClick={() => setShowUpdateModal(false)}
                                ></button>
                            </div>
                            <div className="modal-body p-4">
                                <form onSubmit={handleAddUpdate}>
                                    <div className="mb-3">
                                        <label className="form-label fw-bold">عنوان الإجراء / الجلسة</label>
                                        <input
                                            type="text"
                                            className="form-control"
                                            placeholder="مثال: جلسة تقديم بينات دفاع..."
                                            value={updTitle}
                                            onChange={(e) => setUpdTitle(e.target.value)}
                                        />
                                    </div>
                                    <div className="mb-3">
                                        <label className="form-label fw-bold">تفاصيل القرار / ما جرى في الجلسة *</label>
                                        <textarea
                                            className="form-control"
                                            rows={4}
                                            value={updDetails}
                                            onChange={(e) => setUpdDetails(e.target.value)}
                                            required
                                        />
                                    </div>
                                    <div className="row g-2 mb-3">
                                        <div className="col-6">
                                            <label className="form-label fw-bold small">تاريخ الجلسة الحالية</label>
                                            <input
                                                type="date"
                                                className="form-control"
                                                value={updHearingDate}
                                                onChange={(e) => setUpdHearingDate(e.target.value)}
                                            />
                                        </div>
                                        <div className="col-6">
                                            <label className="form-label fw-bold small text-danger">
                                                تاريخ الجلسة القادمة (تجدول آلياً)
                                            </label>
                                            <input
                                                type="date"
                                                className="form-control"
                                                value={updNextHearingDate}
                                                onChange={(e) => setUpdNextHearingDate(e.target.value)}
                                            />
                                        </div>
                                    </div>
                                    <div className="form-check form-switch mb-3">
                                        <input
                                            className="form-check-input"
                                            type="checkbox"
                                            id="vis_upd"
                                            checked={updVisibleToClient}
                                            onChange={(e) => setUpdVisibleToClient(e.target.checked)}
                                        />
                                        <label className="form-check-label fw-bold" htmlFor="vis_upd">
                                            إظهار هذا التحديث في بوابة الموكل
                                        </label>
                                    </div>
                                    <button
                                        type="submit"
                                        className="btn btn-gold w-100 py-2 fw-bold"
                                        disabled={savingUpdate}
                                    >
                                        {savingUpdate ? 'جاري التوثيق...' : 'حفظ الإجراء وجدولة الموعد'}
                                    </button>
                                </form>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* نافذة قبض دفعة أتعاب */}
            {showPaymentModal && (
                <div
                    className="modal fade show d-block"
                    style={{ background: 'rgba(11,19,43,0.65)', zIndex: 1055 }}
                >
                    <div className="modal-dialog modal-dialog-centered">
                        <div className="modal-content rounded-4 border-0 shadow-lg">
                            <div className="modal-header bg-success text-white">
                                <h5 className="modal-title fw-bold">تسجيل دفعة أتعاب مالية</h5>
                                <button
                                    type="button"
                                    className="btn-close btn-close-white"
                                    onClick={() => setShowPaymentModal(false)}
                                ></button>
                            </div>
                            <div className="modal-body p-4">
                                <form onSubmit={handleAddPayment}>
                                    <div className="mb-3">
                                        <label className="form-label fw-bold">المبلغ (د.أ) *</label>
                                        <input
                                            type="number"
                                            className="form-control"
                                            value={payAmount}
                                            onChange={(e) => setPayAmount(e.target.value)}
                                            required
                                        />
                                    </div>
                                    <div className="mb-3">
                                        <label className="form-label fw-bold">التاريخ</label>
                                        <input
                                            type="date"
                                            className="form-control"
                                            value={payDueDate}
                                            onChange={(e) => setPayDueDate(e.target.value)}
                                        />
                                    </div>
                                    <div className="mb-3">
                                        <label className="form-label fw-bold">الحالة</label>
                                        <select
                                            className="form-select fw-bold"
                                            value={payStatus}
                                            onChange={(e) => setPayStatus(e.target.value)}
                                        >
                                            <option value="مدفوعة">مدفوعة (مقبوضة فعلياً)</option>
                                            <option value="مستحقة">قسط مستحق مستقبلاً</option>
                                        </select>
                                    </div>
                                    <button
                                        type="submit"
                                        className="btn btn-success w-100 py-2 fw-bold"
                                        disabled={savingPay}
                                    >
                                        {savingPay ? 'جاري الحفظ...' : 'اعتماد الدفعة'}
                                    </button>
                                </form>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* نافذة تسجيل مصروف قضائي */}
            {showExpenseModal && (
                <div
                    className="modal fade show d-block"
                    style={{ background: 'rgba(11,19,43,0.65)', zIndex: 1055 }}
                >
                    <div className="modal-dialog modal-dialog-centered">
                        <div className="modal-content rounded-4 border-0 shadow-lg">
                            <div className="modal-header bg-danger text-white">
                                <h5 className="modal-title fw-bold">تسجيل مصروف / رسوم محكمة</h5>
                                <button
                                    type="button"
                                    className="btn-close btn-close-white"
                                    onClick={() => setShowExpenseModal(false)}
                                ></button>
                            </div>
                            <div className="modal-body p-4">
                                <form onSubmit={handleAddExpense}>
                                    <div className="mb-3">
                                        <label className="form-label fw-bold">المبلغ (د.أ) *</label>
                                        <input
                                            type="number"
                                            className="form-control"
                                            value={expAmount}
                                            onChange={(e) => setExpAmount(e.target.value)}
                                            required
                                        />
                                    </div>
                                    <div className="mb-3">
                                        <label className="form-label fw-bold">البيان / سبب الصرف *</label>
                                        <input
                                            type="text"
                                            className="form-control"
                                            placeholder="مثال: رسوم قيد دعوى وطوابع مرافعة..."
                                            value={expDesc}
                                            onChange={(e) => setExpDesc(e.target.value)}
                                            required
                                        />
                                    </div>
                                    <div className="mb-3">
                                        <label className="form-label fw-bold">التاريخ</label>
                                        <input
                                            type="date"
                                            className="form-control"
                                            value={expDate}
                                            onChange={(e) => setExpDate(e.target.value)}
                                        />
                                    </div>
                                    <button
                                        type="submit"
                                        className="btn btn-danger w-100 py-2 fw-bold"
                                        disabled={savingExp}
                                    >
                                        {savingExp ? 'جاري الحفظ...' : 'تسجيل المصروف'}
                                    </button>
                                </form>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* نافذة حاسبة تقسيم الأتعاب */}
            {showFeeSplitModal && (
                <div
                    className="modal fade show d-block"
                    style={{ background: 'rgba(11,19,43,0.65)', zIndex: 1055 }}
                >
                    <div className="modal-dialog modal-dialog-centered">
                        <div className="modal-content rounded-4 border-0 shadow-lg">
                            <div className="modal-header bg-navy text-white">
                                <h5 className="modal-title fw-bold">حاسبة توزيع أتعاب القضية</h5>
                                <button
                                    type="button"
                                    className="btn-close btn-close-white"
                                    onClick={() => setShowFeeSplitModal(false)}
                                ></button>
                            </div>
                            <div className="modal-body p-4">
                                <div className="row g-2 mb-3">
                                    <div className="col-4">
                                        <label className="form-label small fw-bold">حصة المكتب (%)</label>
                                        <input
                                            type="number"
                                            className="form-control"
                                            value={splitOfficePct}
                                            onChange={(e) => setSplitOfficePct(e.target.value)}
                                        />
                                    </div>
                                    <div className="col-4">
                                        <label className="form-label small fw-bold">المحامي الرئيسي (%)</label>
                                        <input
                                            type="number"
                                            className="form-control"
                                            value={splitLeadLawyerPct}
                                            onChange={(e) => setSplitLeadLawyerPct(e.target.value)}
                                        />
                                    </div>
                                    <div className="col-4">
                                        <label className="form-label small fw-bold">المحامي المساند (%)</label>
                                        <input
                                            type="number"
                                            className="form-control"
                                            value={splitAssistantPct}
                                            onChange={(e) => setSplitAssistantPct(e.target.value)}
                                        />
                                    </div>
                                </div>
                                <div className="p-3 rounded-3 bg-light fw-bold">
                                    <div className="d-flex justify-content-between mb-2">
                                        <span>حصة المكتب (من المقبوض الفعلي):</span>
                                        <span className="font-monospace text-navy">
                                            {((totalPaid * (Number(splitOfficePct) || 0)) / 100).toLocaleString()} د.أ
                                        </span>
                                    </div>
                                    <div className="d-flex justify-content-between mb-2">
                                        <span>حصة المحامي الرئيسي:</span>
                                        <span className="font-monospace text-success">
                                            {((totalPaid * (Number(splitLeadLawyerPct) || 0)) / 100).toLocaleString()}{' '}
                                            د.أ
                                        </span>
                                    </div>
                                    <div className="d-flex justify-content-between">
                                        <span>حصة المحامي المساند:</span>
                                        <span className="font-monospace text-primary">
                                            {((totalPaid * (Number(splitAssistantPct) || 0)) / 100).toLocaleString()}{' '}
                                            د.أ
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* نافذة رفع ملف سحابي (R2) */}
            {showFileModal && (
                <div
                    className="modal fade show d-block"
                    style={{ background: 'rgba(11,19,43,0.65)', zIndex: 1055 }}
                >
                    <div className="modal-dialog modal-dialog-centered">
                        <div className="modal-content rounded-4 border-0 shadow-lg">
                            <div className="modal-header bg-navy text-white">
                                <h5 className="modal-title fw-bold">رفع مستند لخزنة القضية (Cloudflare R2)</h5>
                                <button
                                    type="button"
                                    className="btn-close btn-close-white"
                                    onClick={() => setShowFileModal(false)}
                                ></button>
                            </div>
                            <div className="modal-body p-4">
                                <form onSubmit={handleUploadCaseFile}>
                                    <div className="mb-3">
                                        <label className="form-label fw-bold">عنوان المستند</label>
                                        <input
                                            type="text"
                                            className="form-control"
                                            value={fileTitle}
                                            onChange={(e) => setFileTitle(e.target.value)}
                                        />
                                    </div>
                                    <div className="mb-3">
                                        <label className="form-label fw-bold">التصنيف</label>
                                        <select
                                            className="form-select"
                                            value={fileCategory}
                                            onChange={(e) => setFileCategory(e.target.value)}
                                        >
                                            <option value="لوائح ومذكرات">لوائح ومذكرات</option>
                                            <option value="بينات ومستندات">بينات ومستندات</option>
                                            <option value="أحكام وقرارات">أحكام وقرارات قضائية</option>
                                            <option value="تباليغ">محاضر وتباليغ</option>
                                        </select>
                                    </div>
                                    <div className="mb-3">
                                        <label className="form-label fw-bold">الملف *</label>
                                        <input
                                            type="file"
                                            className="form-control"
                                            onChange={(e) => setFileObj(e.target.files?.[0] || null)}
                                            required
                                        />
                                    </div>
                                    <div className="form-check form-switch mb-3">
                                        <input
                                            className="form-check-input"
                                            type="checkbox"
                                            id="vis_f"
                                            checked={fileVisibleToClient}
                                            onChange={(e) => setFileVisibleToClient(e.target.checked)}
                                        />
                                        <label className="form-check-label fw-bold" htmlFor="vis_f">
                                            إتاحة هذا المستند للموكل في بوابته
                                        </label>
                                    </div>
                                    <button
                                        type="submit"
                                        className="btn btn-gold w-100 py-2 fw-bold"
                                        disabled={uploadingFile}
                                    >
                                        {uploadingFile ? 'جاري الرفع والتشفير...' : 'رفع وحفظ في R2'}
                                    </button>
                                </form>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* نافذة صائغ المذكرات واللوائح بالذكاء الاصطناعي */}
            {showAiDraftModal && (
                <div
                    className="modal fade show d-block"
                    style={{ background: 'rgba(11,19,43,0.65)', zIndex: 1055 }}
                >
                    <div className="modal-dialog modal-dialog-centered modal-lg">
                        <div className="modal-content rounded-4 border-0 shadow-lg">
                            <div className="modal-header bg-primary text-white">
                                <h5 className="modal-title fw-bold">
                                    <i className="fas fa-feather-alt me-2 text-warning"></i> صائغ المذكرات القانونية الذكي
                                </h5>
                                <button
                                    type="button"
                                    className="btn-close btn-close-white"
                                    onClick={() => setShowAiDraftModal(false)}
                                ></button>
                            </div>
                            <div className="modal-body p-4">
                                <div className="row g-3 mb-3">
                                    <div className="col-md-5">
                                        <label className="form-label fw-bold">نوع اللوائح / المذكرة</label>
                                        <select
                                            className="form-select fw-bold"
                                            value={draftType}
                                            onChange={(e) => setDraftType(e.target.value)}
                                        >
                                            <option value="لائحة دعوى">لائحة دعوى</option>
                                            <option value="لائحة جوابية">لائحة جوابية (مذكرة دفاع)</option>
                                            <option value="مذكرة دفوع شكلية">مذكرة دفوع شكلية وموضوعية</option>
                                            <option value="مرافعة ختامية">مرافعة ختامية</option>
                                            <option value="لائحة استئناف">لائحة استئناف</option>
                                        </select>
                                    </div>
                                    <div className="col-md-7">
                                        <label className="form-label fw-bold">توجيهات خاصة للمستشار الذكي</label>
                                        <input
                                            type="text"
                                            className="form-control"
                                            placeholder="مثال: التركيز على الدفع بالتقادم المسقط..."
                                            value={draftInstructions}
                                            onChange={(e) => setDraftInstructions(e.target.value)}
                                        />
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    className="btn btn-gold w-100 py-2 fw-bold mb-3"
                                    onClick={handleGenerateAiDraft}
                                    disabled={generatingDraft}
                                >
                                    {generatingDraft ? 'جاري الصياغة القانونية...' : 'توليد المسودة استناداً لبيانات القضية'}
                                </button>
                                {generatedDraft && (
                                    <textarea
                                        className="form-control fw-semibold"
                                        rows={10}
                                        value={generatedDraft}
                                        onChange={(e) => setGeneratedDraft(e.target.value)}
                                    />
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* نافذة قارئ الوثائق القضائية بالذكاء الاصطناعي */}
            {showAiReaderModal && (
                <div
                    className="modal fade show d-block"
                    style={{ background: 'rgba(11,19,43,0.65)', zIndex: 1055 }}
                >
                    <div className="modal-dialog modal-dialog-centered modal-lg">
                        <div className="modal-content rounded-4 border-0 shadow-lg">
                            <div className="modal-header bg-info text-dark">
                                <h5 className="modal-title fw-bold">
                                    <i className="fas fa-file-medical-alt me-2"></i> قارئ ومحلل الوثائق القضائية (PDF / OCR)
                                </h5>
                                <button
                                    type="button"
                                    className="btn-close"
                                    onClick={() => setShowAiReaderModal(false)}
                                ></button>
                            </div>
                            <div className="modal-body p-4">
                                <div className="mb-3">
                                    <label className="form-label fw-bold">
                                        ارفع ملف PDF أو صورة قرار محكمة / لائحة خصم لتحليلها فوراً:
                                    </label>
                                    <input
                                        type="file"
                                        className="form-control"
                                        accept=".pdf,.txt,image/*"
                                        onChange={handleAnalyzeDocFile}
                                    />
                                </div>
                                {analyzingDoc && (
                                    <div className="text-center p-4">
                                        <i className="fas fa-spinner fa-spin fa-2x text-primary mb-2"></i>
                                        <p className="fw-bold mb-0">جاري قراءة المستند واستخراج الثغرات والدفوع...</p>
                                    </div>
                                )}
                                {readerAnalysis && (
                                    <textarea
                                        className="form-control fw-semibold"
                                        rows={10}
                                        readOnly
                                        value={readerAnalysis}
                                    />
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* نافذة التعديل الشامل للقضية (5 تبويبات) */}
            {showEditCaseModal && (
                <div
                    className="modal fade show d-block"
                    style={{ background: 'rgba(11,19,43,0.65)', zIndex: 1055 }}
                >
                    <div className="modal-dialog modal-dialog-centered modal-lg modal-dialog-scrollable">
                        <div className="modal-content rounded-4 border-0 shadow-lg">
                            <div className="modal-header bg-navy text-white">
                                <h5 className="modal-title fw-bold">التحرير الشامل لملف القضية</h5>
                                <button
                                    type="button"
                                    className="btn-close btn-close-white"
                                    onClick={() => setShowEditCaseModal(false)}
                                ></button>
                            </div>
                            <div className="modal-body p-4">
                                <ul className="nav nav-pills mb-3 gap-2">
                                    <li className="nav-item">
                                        <button
                                            type="button"
                                            className={`nav-link fw-bold ${
                                                editCaseTab === ' judicial' ? 'active' : 'border'
                                            }`}
                                            onClick={() => setEditCaseTab(' judicial')}
                                        >
                                            1. القضائية
                                        </button>
                                    </li>
                                    <li className="nav-item">
                                        <button
                                            type="button"
                                            className={`nav-link fw-bold ${
                                                editCaseTab === 'parties' ? 'active' : 'border'
                                            }`}
                                            onClick={() => setEditCaseTab('parties')}
                                        >
                                            2. الأطراف والوكالة
                                        </button>
                                    </li>
                                    <li className="nav-item">
                                        <button
                                            type="button"
                                            className={`nav-link fw-bold ${
                                                editCaseTab === 'subject' ? 'active' : 'border'
                                            }`}
                                            onClick={() => setEditCaseTab('subject')}
                                        >
                                            3. الوقائع والأساس
                                        </button>
                                    </li>
                                    <li className="nav-item">
                                        <button
                                            type="button"
                                            className={`nav-link fw-bold ${
                                                editCaseTab === 'finance' ? 'active' : 'border'
                                            }`}
                                            onClick={() => setEditCaseTab('finance')}
                                        >
                                            4. المالية
                                        </button>
                                    </li>
                                    <li className="nav-item">
                                        <button
                                            type="button"
                                            className={`nav-link fw-bold ${
                                                editCaseTab === 'admin' ? 'active' : 'border'
                                            }`}
                                            onClick={() => setEditCaseTab('admin')}
                                        >
                                            5. الإدارية والـ PIN
                                        </button>
                                    </li>
                                </ul>

                                <form onSubmit={handleSaveCaseEdit}>
                                    {editCaseTab === ' judicial' && (
                                        <div className="row g-3">
                                            <div className="col-md-6">
                                                <label className="form-label fw-bold">رقم الملف الداخلي</label>
                                                <input
                                                    type="text"
                                                    className="form-control"
                                                    value={editForm.case_internal_id}
                                                    onChange={(e) =>
                                                        setEditForm({ ...editForm, case_internal_id: e.target.value })
                                                    }
                                                />
                                            </div>
                                            <div className="col-md-6">
                                                <label className="form-label fw-bold">نوع القضية</label>
                                                <input
                                                    type="text"
                                                    className="form-control"
                                                    value={editForm.case_type}
                                                    onChange={(e) =>
                                                        setEditForm({ ...editForm, case_type: e.target.value })
                                                    }
                                                />
                                            </div>
                                            <div className="col-md-6">
                                                <label className="form-label fw-bold">المحكمة</label>
                                                <input
                                                    type="text"
                                                    className="form-control"
                                                    value={editForm.current_court}
                                                    onChange={(e) =>
                                                        setEditForm({ ...editForm, current_court: e.target.value })
                                                    }
                                                />
                                            </div>
                                            <div className="col-md-6">
                                                <label className="form-label fw-bold">رقم الدعوى في المحكمة</label>
                                                <input
                                                    type="text"
                                                    className="form-control"
                                                    value={editForm.court_case_number}
                                                    onChange={(e) =>
                                                        setEditForm({
                                                            ...editForm,
                                                            court_case_number: e.target.value,
                                                        })
                                                    }
                                                />
                                            </div>
                                            <div className="col-md-6">
                                                <label className="form-label fw-bold">الهيئة / القاضي</label>
                                                <input
                                                    type="text"
                                                    className="form-control"
                                                    value={editForm.current_judge}
                                                    onChange={(e) =>
                                                        setEditForm({ ...editForm, current_judge: e.target.value })
                                                    }
                                                />
                                            </div>
                                            <div className="col-md-6">
                                                <label className="form-label fw-bold">درجة التقاضي</label>
                                                <select
                                                    className="form-select"
                                                    value={editForm.litigation_degree}
                                                    onChange={(e) =>
                                                        setEditForm({
                                                            ...editForm,
                                                            litigation_degree: e.target.value,
                                                        })
                                                    }
                                                >
                                                    <option value="صلح">صلح</option>
                                                    <option value="بداية">بداية</option>
                                                    <option value="استئناف">استئناف</option>
                                                    <option value="تمييز">تمييز</option>
                                                    <option value="تنفيذ">تنفيذ</option>
                                                </select>
                                            </div>
                                        </div>
                                    )}

                                    {editCaseTab === 'parties' && (
                                        <div className="row g-3">
                                            <div className="col-md-6">
                                                <label className="form-label fw-bold">اسم الخصم</label>
                                                <input
                                                    type="text"
                                                    className="form-control"
                                                    value={editForm.opponent_name}
                                                    onChange={(e) =>
                                                        setEditForm({ ...editForm, opponent_name: e.target.value })
                                                    }
                                                />
                                            </div>
                                            <div className="col-md-6">
                                                <label className="form-label fw-bold">وكيل الخصم</label>
                                                <input
                                                    type="text"
                                                    className="form-control"
                                                    value={editForm.opponent_lawyer}
                                                    onChange={(e) =>
                                                        setEditForm({ ...editForm, opponent_lawyer: e.target.value })
                                                    }
                                                />
                                            </div>
                                            <div className="col-md-6">
                                                <label className="form-label fw-bold">رقم الوكالة العدلية</label>
                                                <input
                                                    type="text"
                                                    className="form-control"
                                                    value={editForm.power_of_attorney_number}
                                                    onChange={(e) =>
                                                        setEditForm({
                                                            ...editForm,
                                                            power_of_attorney_number: e.target.value,
                                                        })
                                                    }
                                                />
                                            </div>
                                            <div className="col-md-6">
                                                <label className="form-label fw-bold">رقم الملف التنفيذي</label>
                                                <input
                                                    type="text"
                                                    className="form-control"
                                                    value={editForm.execution_file_number}
                                                    onChange={(e) =>
                                                        setEditForm({
                                                            ...editForm,
                                                            execution_file_number: e.target.value,
                                                        })
                                                    }
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {editCaseTab === 'subject' && (
                                        <div className="row g-3">
                                            <div className="col-12">
                                                <label className="form-label fw-bold">وقائع الدعوى</label>
                                                <textarea
                                                    className="form-control"
                                                    rows={4}
                                                    value={editForm.lawsuit_facts}
                                                    onChange={(e) =>
                                                        setEditForm({ ...editForm, lawsuit_facts: e.target.value })
                                                    }
                                                />
                                            </div>
                                            <div className="col-12">
                                                <label className="form-label fw-bold">الأساس القانوني</label>
                                                <textarea
                                                    className="form-control"
                                                    rows={3}
                                                    value={editForm.legal_basis}
                                                    onChange={(e) =>
                                                        setEditForm({ ...editForm, legal_basis: e.target.value })
                                                    }
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {editCaseTab === 'finance' && (
                                        <div className="row g-3">
                                            <div className="col-md-4">
                                                <label className="form-label fw-bold">قيمة المطالبة (د.أ)</label>
                                                <input
                                                    type="number"
                                                    className="form-control"
                                                    value={editForm.claim_amount}
                                                    onChange={(e) =>
                                                        setEditForm({ ...editForm, claim_amount: e.target.value })
                                                    }
                                                />
                                            </div>
                                            <div className="col-md-4">
                                                <label className="form-label fw-bold">الأتعاب المتفق عليها (د.أ)</label>
                                                <input
                                                    type="number"
                                                    className="form-control"
                                                    value={editForm.total_agreed_fees}
                                                    onChange={(e) =>
                                                        setEditForm({
                                                            ...editForm,
                                                            total_agreed_fees: e.target.value,
                                                        })
                                                    }
                                                />
                                            </div>
                                            <div className="col-md-4">
                                                <label className="form-label fw-bold">احتمالية النجاح (%)</label>
                                                <input
                                                    type="number"
                                                    min={0}
                                                    max={100}
                                                    className="form-control"
                                                    value={editForm.success_probability}
                                                    onChange={(e) =>
                                                        setEditForm({
                                                            ...editForm,
                                                            success_probability: e.target.value,
                                                        })
                                                    }
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {editCaseTab === 'admin' && (
                                        <div className="row g-3">
                                            <div className="col-md-6">
                                                <label className="form-label fw-bold">حالة القضية</label>
                                                <select
                                                    className="form-select"
                                                    value={editForm.status}
                                                    onChange={(e) =>
                                                        setEditForm({ ...editForm, status: e.target.value })
                                                    }
                                                >
                                                    <option value="نشطة">نشطة</option>
                                                    <option value="مؤجلة">مؤجلة</option>
                                                    <option value="مكتملة">مكتملة</option>
                                                    <option value="مغلقة">مغلقة</option>
                                                </select>
                                            </div>
                                            <div className="col-md-6">
                                                <label className="form-label fw-bold text-primary">
                                                    رمز دخول بوابة الموكل (PIN — أرقام أو أحرف)
                                                </label>
                                                <input
                                                    type="text"
                                                    className="form-control font-monospace text-center fw-bold"
                                                    dir="ltr"
                                                    value={editForm.access_pin}
                                                    onChange={(e) =>
                                                        setEditForm({
                                                            ...editForm,
                                                            access_pin: e.target.value.toUpperCase(),
                                                        })
                                                    }
                                                />
                                            </div>
                                            <div className="col-12">
                                                <label className="form-label fw-bold">موقع الحفظ الورقي في الأرشيف</label>
                                                <input
                                                    type="text"
                                                    className="form-control"
                                                    value={editForm.physical_archive_location}
                                                    onChange={(e) =>
                                                        setEditForm({
                                                            ...editForm,
                                                            physical_archive_location: e.target.value,
                                                        })
                                                    }
                                                />
                                            </div>
                                        </div>
                                    )}

                                    <button
                                        type="submit"
                                        className="btn btn-gold w-100 py-2 mt-4 fw-bold"
                                        disabled={savingCase}
                                    >
                                        {savingCase ? 'جاري الحفظ...' : 'حفظ التعديلات الشاملة'}
                                    </button>
                                </form>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <BottomNav activeTab="cases" />
        </div>
    );
};
