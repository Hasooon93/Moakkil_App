/**
 * ============================================================================
 * نظام موكّل (Moakkil System) - 2026
 * الملف: src/features/staff/StaffPage.tsx
 * الوصف: محرك إدارة الموارد البشرية والموظفين (HR Engine - R2 & Offline Edition)
 * مطابق 100% لملف staff.html + js/staff.js
 * ============================================================================
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import { MoakkilAPI } from '../../services/moakkilApi.service';
import { AuthService } from '../../services/auth.service';
import { AIHandler } from '../../services/aiHandler.service';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { ProtectedImage } from '../../components/common/ProtectedImage';
import { BottomNav } from '../../components/layout/BottomNav';

export const StaffPage: React.FC = () => {
    const navigate = useNavigate();
    const { user, isOnline } = useAuth();
    const { isDark, toggleDarkMode } = useTheme();

    const [staffList, setStaffList] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');

    // حالة نافذة عرض الملف الشخصي
    const [viewingStaff, setViewingStaff] = useState<any | null>(null);
    const [viewTab, setViewTab] = useState<'personal' | 'professional' | 'financial' | 'documents'>('personal');

    // حالة نافذة الإضافة / التعديل
    const [showEditModal, setShowEditModal] = useState(false);
    const [editTab, setEditTab] = useState<'personal' | 'professional' | 'financial' | 'documents'>('personal');
    const [editingStaff, setEditingStaff] = useState<any | null>(null);
    const [saving, setSaving] = useState(false);

    // حقول النموذج
    const [fullName, setFullName] = useState('');
    const [phone, setPhone] = useState('');
    const [nationalId, setNationalId] = useState('');
    const [gender, setGender] = useState('');
    const [dob, setDob] = useState('');
    const [avatarUrl, setAvatarUrl] = useState('');
    const [telegramId, setTelegramId] = useState('');
    const [address, setAddress] = useState('');
    const [role, setRole] = useState('lawyer');
    const [specialization, setSpecialization] = useState('');
    const [joinDate, setJoinDate] = useState('');
    const [experienceYears, setExperienceYears] = useState('0');
    const [permDelete, setPermDelete] = useState(false);
    const [permFinance, setPermFinance] = useState(false);
    const [permReports, setPermReports] = useState(false);
    const [isActive, setIsActive] = useState(true);
    const [canLogin, setCanLogin] = useState(true);
    const [syndicateNum, setSyndicateNum] = useState('');
    const [syndicateExpiry, setSyndicateExpiry] = useState('');
    const [salaryBasic, setSalaryBasic] = useState('');
    const [salaryAllowance, setSalaryAllowance] = useState('');
    const [salaryCommission, setSalaryCommission] = useState('');
    const [bankName, setBankName] = useState('');
    const [bankIban, setBankIban] = useState('');
    const [emName, setEmName] = useState('');
    const [emPhone, setEmPhone] = useState('');
    const [emRelation, setEmRelation] = useState('');

    // وثائق الموظف (R2)
    const [docName, setDocName] = useState('');
    const [docFile, setDocFile] = useState<File | null>(null);
    const [uploadingDoc, setUploadingDoc] = useState(false);

    // نافذة الاستخراج الذكي للهوية
    const [showAiIdModal, setShowAiIdModal] = useState(false);
    const [aiIdText, setAiIdText] = useState('');
    const [processingAiId, setProcessingAiId] = useState(false);

    // حارس المسار (Route Guard) — مدراء المكتب فقط
    useEffect(() => {
        if (user && user.role !== 'admin' && user.role !== 'مدير' && user.role !== 'super_admin') {
            Swal.fire({
                icon: 'error',
                title: 'مرفوض أمنياً',
                text: 'صلاحية الدخول لقسم الموارد البشرية مقتصرة على مدراء وشركاء المكتب فقط.',
            }).then(() => navigate('/app.html'));
        }
    }, [user, navigate]);

    const loadStaff = useCallback(async () => {
        setLoading(true);
        try {
            const res = await MoakkilAPI.getStaff();
            setStaffList(Array.isArray(res) ? res : []);
        } catch {
            setStaffList([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadStaff();
    }, [loadStaff]);

    const getRoleNameAr = (r: string) => {
        if (r === 'admin' || r === 'super_admin' || r === 'superadmin') return 'مدير / شريك';
        if (r === 'lawyer') return 'محامي / مستشار';
        if (r === 'secretary') return 'سكرتاريا / إداري';
        return r || 'موظف';
    };

    const handleRegisterBiometric = async () => {
        if (!isOnline) {
            Swal.fire('تنبيه', 'لا يمكن تفعيل البصمة أثناء انقطاع الإنترنت.', 'warning');
            return;
        }
        try {
            Swal.fire({
                title: 'جاري إعداد البصمة...',
                text: 'يرجى تأكيد هويتك عبر مستشعر جهازك',
                allowOutsideClick: false,
                didOpen: () => Swal.showLoading(),
            });
            const res = await AuthService.registerBiometric();
            Swal.fire('نجاح', res.message || 'تم تسجيل بصمة جهازك بنجاح', 'success');
        } catch (err: any) {
            Swal.fire('خطأ', err.message || 'فشل إعداد البصمة', 'error');
        }
    };

    const openEditModal = (staff?: any) => {
        setEditTab('personal');
        if (staff) {
            setEditingStaff(staff);
            setFullName(staff.full_name || '');
            setPhone(staff.phone || '');
            setNationalId(staff.national_id || '');
            setGender(staff.gender || '');
            setDob(staff.date_of_birth || '');
            setAvatarUrl(staff.avatar_url || '');
            setTelegramId(staff.telegram_id || '');
            setAddress(staff.address || '');
            setRole(staff.role || 'lawyer');
            setSpecialization(staff.specialization || '');
            setJoinDate(staff.join_date || '');
            setExperienceYears(String(staff.experience_years || 0));
            setIsActive(staff.is_active !== false);
            setCanLogin(staff.can_login !== false);
            setSyndicateNum(staff.syndicate_number || '');
            setSyndicateExpiry(staff.syndicate_expiry_date || '');
            setPermDelete(!!staff.permissions?.can_delete);
            setPermFinance(!!staff.permissions?.can_finance);
            setPermReports(!!staff.permissions?.can_reports);
            setSalaryBasic(String(staff.salary_details?.basic || staff.salary_details?.base_salary || ''));
            setSalaryAllowance(String(staff.salary_details?.allowance || ''));
            setSalaryCommission(String(staff.salary_details?.commission || ''));
            setBankName(staff.salary_details?.bank_name || '');
            setBankIban(staff.salary_details?.bank_iban || '');
            setEmName(staff.emergency_contact?.name || '');
            setEmPhone(staff.emergency_contact?.phone || '');
            setEmRelation(staff.emergency_contact?.relation || '');
        } else {
            setEditingStaff(null);
            setFullName('');
            setPhone('');
            setNationalId('');
            setGender('');
            setDob('');
            setAvatarUrl('');
            setTelegramId('');
            setAddress('');
            setRole('lawyer');
            setSpecialization('');
            setJoinDate(new Date().toISOString().split('T')[0]);
            setExperienceYears('0');
            setIsActive(true);
            setCanLogin(true);
            setSyndicateNum('');
            setSyndicateExpiry('');
            setPermDelete(false);
            setPermFinance(false);
            setPermReports(false);
            setSalaryBasic('');
            setSalaryAllowance('');
            setSalaryCommission('');
            setBankName('');
            setBankIban('');
            setEmName('');
            setEmPhone('');
            setEmRelation('');
        }
        setShowEditModal(true);
    };

    const handleSaveStaff = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);

        let finalAvatar = avatarUrl.trim() || null;
        const cleanName = fullName.trim();

        // كشط الصورة الخارجية وحفظها في R2 كما في js/staff.js
        if (
            isOnline &&
            finalAvatar &&
            finalAvatar.startsWith('http') &&
            !finalAvatar.includes('googleusercontent.com') &&
            !finalAvatar.includes('drive.google.com')
        ) {
            try {
                let imgRes: Response;
                try {
                    imgRes = await fetch(finalAvatar);
                } catch {
                    imgRes = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(finalAvatar)}`);
                }
                const blob = await imgRes.blob();
                const file = new File([blob], `avatar_${cleanName.replace(/\s+/g, '_')}.jpg`, {
                    type: blob.type || 'image/jpeg',
                });
                const uploadRes = await MoakkilAPI.uploadFileToR2(file, 'HR', 'Avatars');
                if (uploadRes && uploadRes.r2_key) {
                    finalAvatar = uploadRes.r2_key;
                }
            } catch {
                // الاحتفاظ بالرابط الأصلي عند تعذر الكشط
            }
        }

        const payload = {
            full_name: cleanName,
            phone: phone.trim(),
            telegram_id: telegramId || null,
            national_id: nationalId || null,
            gender: gender || null,
            date_of_birth: dob || null,
            avatar_url: finalAvatar,
            address: address || null,
            role,
            specialization: specialization || null,
            join_date: joinDate || null,
            experience_years: parseInt(experienceYears, 10) || 0,
            syndicate_number: syndicateNum || null,
            syndicate_expiry_date: syndicateExpiry || null,
            is_active: isActive,
            can_login: canLogin,
            permissions: {
                can_delete: permDelete,
                can_finance: permFinance,
                can_reports: permReports,
            },
            salary_details: {
                basic: salaryBasic || 0,
                commission: salaryCommission || 0,
                allowance: salaryAllowance || 0,
                bank_name: bankName || '',
                bank_iban: bankIban || '',
            },
            emergency_contact: {
                name: emName || '',
                phone: emPhone || '',
                relation: emRelation || '',
            },
        };

        try {
            let res: any;
            if (editingStaff?.id) {
                res = await MoakkilAPI.updateStaff(editingStaff.id, payload);
            } else {
                res = await MoakkilAPI.addStaff(payload);
            }
            if (res && res.error) throw new Error(res.error);

            Swal.fire({
                toast: true,
                position: 'top-end',
                icon: res?.offline ? 'warning' : 'success',
                title: res?.offline ? 'تم الحفظ محلياً (Offline)' : 'تم حفظ بيانات الموظف بنجاح',
                showConfirmButton: false,
                timer: 2500,
            });
            setShowEditModal(false);
            await loadStaff();
        } catch (err: any) {
            Swal.fire('خطأ في الحفظ', err.message || 'تعذر حفظ بيانات الموظف.', 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleToggleStaffStatus = async (staff: any) => {
        const currentActive = staff.is_active !== false;
        const actionName = currentActive ? 'إيقاف' : 'تفعيل';
        const newStatus = !currentActive;

        const confirm = await Swal.fire({
            title: `هل أنت متأكد من ${actionName} الموظف؟`,
            text: currentActive
                ? 'سيتم منعه من تسجيل الدخول للنظام نهائياً، مع الاحتفاظ ببياناته وسجلاته.'
                : 'سيتمكن من الدخول للنظام وممارسة مهامه مجدداً.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: currentActive ? '#EE5D50' : '#01B574',
            confirmButtonText: `نعم، قم بالـ ${actionName}`,
            cancelButtonText: 'إلغاء الأمر',
        });

        if (!confirm.isConfirmed) return;

        try {
            const res = await MoakkilAPI.updateStaff(staff.id, {
                is_active: newStatus,
                can_login: newStatus,
            });
            if (res && !res.error) {
                Swal.fire({
                    toast: true,
                    position: 'top-end',
                    icon: 'success',
                    title: `تم ${actionName} الموظف بنجاح`,
                    showConfirmButton: false,
                    timer: 2000,
                });
                await loadStaff();
            } else {
                throw new Error(res?.error || 'حدث خطأ');
            }
        } catch (err: any) {
            Swal.fire('فشل التحديث', err.message, 'error');
        }
    };

    const handleUploadStaffDoc = async () => {
        if (!editingStaff?.id || !docFile) {
            Swal.fire('تنبيه', 'يرجى اختيار ملف أولاً.', 'warning');
            return;
        }
        if (!isOnline) {
            Swal.fire('تنبيه', 'رفع الوثائق إلى الأرشيف السحابي يتطلب اتصالاً بالإنترنت.', 'warning');
            return;
        }

        setUploadingDoc(true);
        try {
            const r2Res = await MoakkilAPI.uploadFileToR2(docFile, 'HR', 'Docs');
            if (r2Res && r2Res.r2_key) {
                const currentDocs = Array.isArray(editingStaff.staff_documents)
                    ? [...editingStaff.staff_documents]
                    : [];
                currentDocs.push({
                    name: docName.trim() || docFile.name,
                    url: r2Res.r2_key,
                    date: new Date().toISOString(),
                });

                const res = await MoakkilAPI.updateStaff(editingStaff.id, { staff_documents: currentDocs });
                if (res && !res.error) {
                    setEditingStaff({ ...editingStaff, staff_documents: currentDocs });
                    setDocName('');
                    setDocFile(null);
                    await loadStaff();
                    Swal.fire({
                        toast: true,
                        position: 'top-end',
                        icon: 'success',
                        title: 'تمت إضافة الوثيقة للأرشيف بنجاح',
                        showConfirmButton: false,
                        timer: 2500,
                    });
                } else {
                    throw new Error(res?.error || 'فشل تحديث السجل');
                }
            }
        } catch (err: any) {
            Swal.fire('فشل الرفع', err.message, 'error');
        } finally {
            setUploadingDoc(false);
        }
    };

    const handleDeleteStaffDoc = async (idx: number) => {
        if (!editingStaff?.id) return;
        const confirm = await Swal.fire({
            title: 'تأكيد الحذف؟',
            text: 'هل أنت متأكد من حذف هذه الوثيقة من الأرشيف السحابي للموظف؟',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            confirmButtonText: 'نعم، احذف',
            cancelButtonText: 'إلغاء',
        });
        if (!confirm.isConfirmed) return;

        const currentDocs = [...(editingStaff.staff_documents || [])];
        currentDocs.splice(idx, 1);

        try {
            const res = await MoakkilAPI.updateStaff(editingStaff.id, { staff_documents: currentDocs });
            if (res && !res.error) {
                setEditingStaff({ ...editingStaff, staff_documents: currentDocs });
                await loadStaff();
                Swal.fire({
                    toast: true,
                    position: 'top-end',
                    icon: 'success',
                    title: 'تم حذف الوثيقة بنجاح',
                    showConfirmButton: false,
                    timer: 2000,
                });
            }
        } catch (err: any) {
            Swal.fire('خطأ', err.message, 'error');
        }
    };

    const handleProcessIdAI = async () => {
        if (!aiIdText.trim()) {
            Swal.fire('تنبيه', 'يرجى لصق النص المستخرج من الهوية أولاً', 'warning');
            return;
        }
        setProcessingAiId(true);
        try {
            const aiRes = await MoakkilAPI.extractDataAI(aiIdText.trim(), 'id_extractor');
            if (aiRes && aiRes.extracted_json) {
                const d = aiRes.extracted_json;
                if (d.full_name) setFullName(d.full_name);
                if (d.national_id) setNationalId(d.national_id);
                if (d.date_of_birth) setDob(d.date_of_birth);
                if (d.address) setAddress(d.address);
                if (d.syndicate_number) setSyndicateNum(d.syndicate_number);
                setShowAiIdModal(false);
                setAiIdText('');
                Swal.fire({
                    toast: true,
                    position: 'top-end',
                    icon: 'success',
                    title: 'تمت التعبئة الذكية بنجاح',
                    showConfirmButton: false,
                    timer: 2500,
                });
            } else {
                Swal.fire('تنبيه', 'لم يتمكن المحرك الذكي من استخراج بيانات واضحة.', 'warning');
            }
        } catch (err: any) {
            Swal.fire('خطأ', err.message, 'error');
        } finally {
            setProcessingAiId(false);
        }
    };

    const handleScanIdCamera = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const data = await AIHandler.scanIDCard(file);
        if (data) {
            if (data.full_name || data['الاسم']) setFullName(data.full_name || data['الاسم']);
            if (data.national_id || data['الرقم الوطني'])
                setNationalId(data.national_id || data['الرقم الوطني']);
            Swal.fire({
                toast: true,
                position: 'top-end',
                icon: 'success',
                title: 'تمت قراءة الهوية وتعبئة البيانات بنجاح!',
                showConfirmButton: false,
                timer: 3000,
            });
        }
        e.target.value = '';
    };

    const filteredStaff = staffList.filter((s) => {
        const q = searchQuery.toLowerCase();
        if (!q) return true;
        return (
            (s.full_name && s.full_name.toLowerCase().includes(q)) ||
            (s.specialization && s.specialization.toLowerCase().includes(q)) ||
            (s.phone && s.phone.includes(q))
        );
    });

    return (
        <div className="min-vh-100 pb-5 mb-5">
            <div className="top-nav d-flex align-items-center justify-content-between px-3 py-3">
                <button
                    className="btn btn-link text-white p-0 text-decoration-none"
                    onClick={() => navigate('/app.html')}
                >
                    <i className="fas fa-arrow-right fs-4"></i>
                </button>
                <h5 className="mb-0 fw-bold text-white text-truncate mx-2 d-flex align-items-center">
                    <i className="fas fa-users-tie me-2" style={{ color: '#D4AF37' }}></i> الموارد البشرية
                </h5>
                <div className="d-flex gap-2">
                    <button
                        className="btn btn-sm btn-outline-light text-white fw-bold rounded-3 px-3 shadow-sm"
                        onClick={toggleDarkMode}
                        title="تبديل الوضع الليلي"
                    >
                        <i className={`fas ${isDark ? 'fa-sun text-warning' : 'fa-moon'}`}></i>
                    </button>
                    <button
                        className="btn btn-sm btn-outline-light fw-bold rounded-3 px-3 shadow-sm"
                        onClick={handleRegisterBiometric}
                        title="تفعيل الدخول بالبصمة لجهازي الحالي"
                    >
                        <i className="fas fa-fingerprint" style={{ color: '#D4AF37' }}></i>{' '}
                        <span className="d-none d-sm-inline">بصمتي</span>
                    </button>
                    <button
                        className="btn btn-sm btn-light text-navy fw-bold shadow-sm rounded-3 px-3"
                        onClick={loadStaff}
                        title="تحديث البيانات"
                    >
                        <i className={`fas fa-sync-alt ${loading ? 'fa-spin' : ''}`}></i>
                    </button>
                </div>
            </div>

            <div className="container mt-4">
                <div className="d-flex justify-content-between align-items-center mb-4">
                    <h5 className="fw-bold mb-0 text-navy">
                        <i className="fas fa-sitemap me-2" style={{ color: '#D4AF37' }}></i> دليل الكوادر
                    </h5>
                    <button className="btn btn-gold shadow-sm fw-bold" onClick={() => openEditModal()}>
                        <i className="fas fa-user-plus me-1"></i> إضافة كادر جديد
                    </button>
                </div>

                <div className="mb-4 position-relative">
                    <input
                        type="text"
                        className="form-control form-control-lg shadow-sm rounded-4 pe-5 fw-bold"
                        placeholder="ابحث باسم الموظف، التخصص، أو الهاتف..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    <i
                        className="fas fa-search position-absolute top-50 translate-middle-y"
                        style={{ right: 20, color: '#D4AF37', fontSize: '1.2rem' }}
                    ></i>
                </div>

                {loading ? (
                    <div className="text-center p-5 bg-white rounded-4 border shadow-sm">
                        <i className="fas fa-spinner fa-spin fa-3x mb-3" style={{ color: '#D4AF37' }}></i>
                        <h5 className="fw-bold text-navy">جاري تحميل بيانات الفريق...</h5>
                    </div>
                ) : filteredStaff.length === 0 ? (
                    <div className="text-center p-5 bg-white rounded-4 border shadow-sm text-muted fw-bold">
                        <i className="fas fa-users-slash fa-3x mb-3 opacity-50"></i>
                        <p className="mb-0">لا يوجد موظفون مطابقون للبحث.</p>
                    </div>
                ) : (
                    <div className="row g-4">
                        {filteredStaff.map((staff) => {
                            const active = staff.is_active !== false;
                            const loginAllowed = staff.can_login !== false;
                            const salaryVal =
                                staff.salary_details && typeof staff.salary_details === 'object'
                                    ? `${Number(
                                          staff.salary_details.basic || staff.salary_details.base_salary || 0
                                      ).toLocaleString()} د.أ`
                                    : '--';

                            return (
                                <div key={staff.id} className="col-lg-4 col-md-6 col-sm-12">
                                    <div
                                        className={`compact-card p-4 text-center shadow-sm h-100 bg-white d-flex flex-column rounded-4 border ${
                                            !active ? 'opacity-75' : ''
                                        }`}
                                    >
                                        <div className="position-relative pb-3 border-bottom mb-3 d-flex flex-column align-items-center">
                                            {staff.avatar_url ? (
                                                <ProtectedImage
                                                    r2KeyOrUrl={staff.avatar_url}
                                                    alt={staff.full_name}
                                                    className="shadow-sm border border-3 border-white"
                                                    style={{
                                                        width: 75,
                                                        height: 75,
                                                        objectFit: 'cover',
                                                        borderRadius: '50%',
                                                    }}
                                                />
                                            ) : (
                                                <div
                                                    className="shadow-sm border border-3 border-white d-flex align-items-center justify-content-center fw-bold"
                                                    style={{
                                                        width: 75,
                                                        height: 75,
                                                        borderRadius: '50%',
                                                        fontSize: '2rem',
                                                        background: '#0B132B',
                                                        color: '#ffffff',
                                                    }}
                                                >
                                                    {(staff.full_name || '?').charAt(0)}
                                                </div>
                                            )}

                                            <h5 className="fw-bold text-navy mt-3 mb-1">{staff.full_name}</h5>
                                            <p className="text-muted small mb-3 fw-bold">
                                                {staff.specialization || getRoleNameAr(staff.role)}
                                            </p>
                                            <div className="d-flex justify-content-center gap-2">
                                                {active ? (
                                                    <span className="badge bg-success bg-opacity-10 text-success border border-success border-opacity-25 px-3 py-1 rounded-pill">
                                                        <i className="fas fa-check-circle me-1"></i> نشط
                                                    </span>
                                                ) : (
                                                    <span className="badge bg-danger bg-opacity-10 text-danger border border-danger border-opacity-25 px-3 py-1 rounded-pill">
                                                        <i className="fas fa-ban me-1"></i> موقوف
                                                    </span>
                                                )}
                                                {loginAllowed ? (
                                                    <span className="badge bg-primary bg-opacity-10 text-primary border border-primary border-opacity-25 px-3 py-1 rounded-pill">
                                                        <i className="fas fa-key me-1"></i> وصول
                                                    </span>
                                                ) : (
                                                    <span className="badge bg-secondary bg-opacity-10 text-dark border border-secondary border-opacity-25 px-3 py-1 rounded-pill">
                                                        <i className="fas fa-lock me-1"></i> محظور
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        <div className="text-start w-100 mb-3 small fw-bold">
                                            <div className="mb-2">
                                                <i className="fas fa-phone-alt text-success me-2"></i>
                                                <span className="font-monospace" dir="ltr">
                                                    {staff.phone}
                                                </span>
                                            </div>
                                            <div>
                                                <i className="fas fa-money-bill-wave text-danger me-2"></i>
                                                الراتب: <span className="font-monospace">{salaryVal}</span>
                                            </div>
                                        </div>

                                        <div className="mt-auto d-flex flex-column gap-2">
                                            <button
                                                className="btn btn-sm btn-outline-primary fw-bold w-100 rounded-pill py-2"
                                                onClick={() => {
                                                    setViewingStaff(staff);
                                                    setViewTab('personal');
                                                }}
                                            >
                                                <i className="fas fa-eye me-1"></i> عرض الملف بالكامل
                                            </button>
                                            <div className="d-flex gap-2">
                                                <button
                                                    className="btn btn-sm btn-light border text-navy fw-bold w-50 rounded-pill py-2"
                                                    onClick={() => openEditModal(staff)}
                                                >
                                                    <i className="fas fa-edit me-1"></i> تعديل
                                                </button>
                                                <button
                                                    className={`btn btn-sm ${
                                                        active ? 'btn-outline-danger' : 'btn-outline-success'
                                                    } fw-bold w-50 rounded-pill py-2`}
                                                    onClick={() => handleToggleStaffStatus(staff)}
                                                >
                                                    <i
                                                        className={`fas ${
                                                            active ? 'fa-user-slash' : 'fa-user-check'
                                                        } me-1`}
                                                    ></i>
                                                    {active ? 'إيقاف' : 'تفعيل'}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* نافذة عرض الملف الشخصي والوظيفي (Read-Only Modal) */}
            {viewingStaff && (
                <div
                    className="modal fade show d-block"
                    style={{ background: 'rgba(11,19,43,0.65)', zIndex: 1055 }}
                >
                    <div className="modal-dialog modal-dialog-centered modal-lg modal-dialog-scrollable">
                        <div className="modal-content rounded-4 border-0 shadow-lg">
                            <div
                                className="modal-header text-white"
                                style={{ background: '#0B132B', borderBottom: '3px solid #D4AF37' }}
                            >
                                <h5 className="modal-title fw-bold">
                                    <i className="fas fa-id-card me-2" style={{ color: '#D4AF37' }}></i> الملف الشخصي والوظيفي
                                </h5>
                                <button
                                    type="button"
                                    className="btn-close btn-close-white"
                                    onClick={() => setViewingStaff(null)}
                                ></button>
                            </div>
                            <div className="modal-body p-0">
                                <div className="text-center bg-white p-4 border-bottom">
                                    <h4 className="fw-bold mb-1 text-navy">{viewingStaff.full_name}</h4>
                                    <span className="badge bg-warning bg-opacity-10 text-dark border border-warning px-3 py-2 rounded-pill fw-bold">
                                        {getRoleNameAr(viewingStaff.role)}
                                    </span>
                                </div>

                                <ul className="nav nav-pills bg-white p-3 border-bottom gap-2">
                                    <li className="nav-item">
                                        <button
                                            className={`nav-link fw-bold ${viewTab === 'personal' ? 'active' : ''}`}
                                            onClick={() => setViewTab('personal')}
                                        >
                                            <i className="fas fa-user me-1"></i> الشخصية
                                        </button>
                                    </li>
                                    <li className="nav-item">
                                        <button
                                            className={`nav-link fw-bold ${viewTab === 'professional' ? 'active' : ''}`}
                                            onClick={() => setViewTab('professional')}
                                        >
                                            <i className="fas fa-briefcase me-1"></i> المهنية
                                        </button>
                                    </li>
                                    <li className="nav-item">
                                        <button
                                            className={`nav-link fw-bold ${viewTab === 'financial' ? 'active' : ''}`}
                                            onClick={() => setViewTab('financial')}
                                        >
                                            <i className="fas fa-money-check-alt me-1"></i> المالية
                                        </button>
                                    </li>
                                    <li className="nav-item">
                                        <button
                                            className={`nav-link fw-bold ${viewTab === 'documents' ? 'active' : ''}`}
                                            onClick={() => setViewTab('documents')}
                                        >
                                            <i className="fas fa-folder-open me-1"></i> الوثائق
                                        </button>
                                    </li>
                                </ul>

                                <div className="p-4">
                                    {viewTab === 'personal' && (
                                        <div className="row g-3 fw-bold">
                                            <div className="col-md-6">
                                                <small className="text-muted d-block">رقم الهاتف</small>
                                                <span dir="ltr">{viewingStaff.phone || '--'}</span>
                                            </div>
                                            <div className="col-md-6">
                                                <small className="text-muted d-block">الرقم الوطني</small>
                                                <span>{viewingStaff.national_id || '--'}</span>
                                            </div>
                                            <div className="col-md-6">
                                                <small className="text-muted d-block">الجنس</small>
                                                <span>{viewingStaff.gender || '--'}</span>
                                            </div>
                                            <div className="col-md-6">
                                                <small className="text-muted d-block">تاريخ الميلاد</small>
                                                <span>{viewingStaff.date_of_birth || '--'}</span>
                                            </div>
                                            <div className="col-12">
                                                <small className="text-muted d-block">العنوان</small>
                                                <span>{viewingStaff.address || '--'}</span>
                                            </div>
                                            <div className="col-12 border-top pt-3 mt-3">
                                                <h6 className="fw-bold text-danger">جهة اتصال الطوارئ</h6>
                                                <div className="row g-2">
                                                    <div className="col-4">
                                                        <small className="text-muted d-block">الاسم</small>
                                                        <span>{viewingStaff.emergency_contact?.name || '--'}</span>
                                                    </div>
                                                    <div className="col-4">
                                                        <small className="text-muted d-block">الهاتف</small>
                                                        <span dir="ltr">
                                                            {viewingStaff.emergency_contact?.phone || '--'}
                                                        </span>
                                                    </div>
                                                    <div className="col-4">
                                                        <small className="text-muted d-block">القرابة</small>
                                                        <span>{viewingStaff.emergency_contact?.relation || '--'}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {viewTab === 'professional' && (
                                        <div className="row g-3 fw-bold">
                                            <div className="col-md-6">
                                                <small className="text-muted d-block">المسمى / التخصص</small>
                                                <span>{viewingStaff.specialization || '--'}</span>
                                            </div>
                                            <div className="col-md-6">
                                                <small className="text-muted d-block">تاريخ الانضمام</small>
                                                <span>{viewingStaff.join_date || '--'}</span>
                                            </div>
                                            <div className="col-md-6">
                                                <small className="text-muted d-block">سنوات الخبرة</small>
                                                <span>
                                                    {viewingStaff.experience_years
                                                        ? `${viewingStaff.experience_years} سنوات`
                                                        : '--'}
                                                </span>
                                            </div>
                                            <div className="col-md-6">
                                                <small className="text-muted d-block">معرف التيليغرام</small>
                                                <span className="font-monospace">
                                                    {viewingStaff.telegram_id || 'غير مرتبط'}
                                                </span>
                                            </div>
                                            <div className="col-md-6">
                                                <small className="text-muted d-block">رقم النقابة</small>
                                                <span>{viewingStaff.syndicate_number || '--'}</span>
                                            </div>
                                            <div className="col-md-6">
                                                <small className="text-muted d-block">انتهاء الهوية النقابية</small>
                                                <span>{viewingStaff.syndicate_expiry_date || '--'}</span>
                                            </div>
                                        </div>
                                    )}

                                    {viewTab === 'financial' && (
                                        <div className="row g-3 fw-bold text-center">
                                            <div className="col-4">
                                                <small className="text-muted d-block">الراتب الأساسي</small>
                                                <h4 className="fw-bold text-success">
                                                    {Number(
                                                        viewingStaff.salary_details?.basic ||
                                                            viewingStaff.salary_details?.base_salary ||
                                                            0
                                                    ).toLocaleString()}{' '}
                                                    د.أ
                                                </h4>
                                            </div>
                                            <div className="col-4">
                                                <small className="text-muted d-block">بدل تنقلات</small>
                                                <h4 className="fw-bold text-navy">
                                                    {Number(
                                                        viewingStaff.salary_details?.allowance || 0
                                                    ).toLocaleString()}{' '}
                                                    د.أ
                                                </h4>
                                            </div>
                                            <div className="col-4">
                                                <small className="text-muted d-block">نسبة العمولة</small>
                                                <h4 className="fw-bold text-danger">
                                                    {viewingStaff.salary_details?.commission || 0}%
                                                </h4>
                                            </div>
                                            <div className="col-md-6 text-start border-top pt-3">
                                                <small className="text-muted d-block">اسم البنك</small>
                                                <span>{viewingStaff.salary_details?.bank_name || '--'}</span>
                                            </div>
                                            <div className="col-md-6 text-start border-top pt-3">
                                                <small className="text-muted d-block">رقم الآيبان (IBAN)</small>
                                                <span className="font-monospace" dir="ltr">
                                                    {viewingStaff.salary_details?.bank_iban || '--'}
                                                </span>
                                            </div>
                                        </div>
                                    )}

                                    {viewTab === 'documents' && (
                                        <div>
                                            {Array.isArray(viewingStaff.staff_documents) &&
                                            viewingStaff.staff_documents.length > 0 ? (
                                                viewingStaff.staff_documents.map((doc: any, i: number) => (
                                                    <div
                                                        key={i}
                                                        className="d-flex justify-content-between align-items-center p-3 mb-2 border rounded-3 bg-white"
                                                    >
                                                        <div>
                                                            <strong className="d-block">{doc.name}</strong>
                                                            <small className="text-muted font-monospace">
                                                                {doc.date
                                                                    ? new Date(doc.date).toLocaleDateString('ar-EG')
                                                                    : ''}
                                                            </small>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            className="btn btn-sm btn-outline-primary rounded-pill fw-bold"
                                                            onClick={() =>
                                                                MoakkilAPI.downloadR2File(doc.url, doc.name)
                                                            }
                                                        >
                                                            <i className="fas fa-shield-alt me-1 text-success"></i>{' '}
                                                            تحميل مشفر
                                                        </button>
                                                    </div>
                                                ))
                                            ) : (
                                                <div className="text-center p-4 text-muted fw-bold">
                                                    لا توجد وثائق مؤرشفة لهذا الموظف.
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button
                                    type="button"
                                    className="btn btn-outline-secondary fw-bold"
                                    onClick={() => setViewingStaff(null)}
                                >
                                    إغلاق
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-gold fw-bold"
                                    onClick={() => {
                                        const st = viewingStaff;
                                        setViewingStaff(null);
                                        openEditModal(st);
                                    }}
                                >
                                    <i className="fas fa-edit me-1"></i> تحرير البيانات
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* نافذة إضافة / تعديل كادر */}
            {showEditModal && (
                <div
                    className="modal fade show d-block"
                    style={{ background: 'rgba(11,19,43,0.65)', zIndex: 1055 }}
                >
                    <div className="modal-dialog modal-dialog-centered modal-lg modal-dialog-scrollable">
                        <div className="modal-content rounded-4 border-0 shadow-lg">
                            <div
                                className="modal-header text-white"
                                style={{ background: '#0B132B', borderBottom: '3px solid #D4AF37' }}
                            >
                                <h5 className="modal-title fw-bold">
                                    <i className="fas fa-user-edit me-2" style={{ color: '#D4AF37' }}></i>{' '}
                                    {editingStaff ? 'تعديل بيانات الكادر' : 'إضافة كادر جديد'}
                                </h5>
                                <button
                                    type="button"
                                    className="btn-close btn-close-white"
                                    onClick={() => setShowEditModal(false)}
                                ></button>
                            </div>
                            <div className="modal-body p-0">
                                <ul className="nav nav-pills bg-white p-3 border-bottom gap-2">
                                    <li className="nav-item">
                                        <button
                                            type="button"
                                            className={`nav-link fw-bold ${editTab === 'personal' ? 'active' : ''}`}
                                            onClick={() => setEditTab('personal')}
                                        >
                                            الشخصية
                                        </button>
                                    </li>
                                    <li className="nav-item">
                                        <button
                                            type="button"
                                            className={`nav-link fw-bold ${editTab === 'professional' ? 'active' : ''}`}
                                            onClick={() => setEditTab('professional')}
                                        >
                                            المهنية والأمان
                                        </button>
                                    </li>
                                    <li className="nav-item">
                                        <button
                                            type="button"
                                            className={`nav-link fw-bold ${editTab === 'financial' ? 'active' : ''}`}
                                            onClick={() => setEditTab('financial')}
                                        >
                                            المالية والطوارئ
                                        </button>
                                    </li>
                                    <li className="nav-item">
                                        <button
                                            type="button"
                                            className={`nav-link fw-bold ${editTab === 'documents' ? 'active' : ''}`}
                                            onClick={() => setEditTab('documents')}
                                        >
                                            الأرشيف
                                        </button>
                                    </li>
                                </ul>

                                <form onSubmit={handleSaveStaff} className="p-4">
                                    {editTab === 'personal' && (
                                        <div>
                                            <div className="alert alert-warning d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
                                                <span className="fw-bold small">
                                                    <i className="fas fa-magic me-1"></i> التعبئة الذكية للهوية المدنية (OCR)
                                                </span>
                                                <div className="d-flex gap-2">
                                                    <label className="btn btn-sm btn-outline-dark fw-bold mb-0">
                                                        <i className="fas fa-camera me-1"></i> مسح بالكاميرا
                                                        <input
                                                            type="file"
                                                            accept="image/*"
                                                            className="d-none"
                                                            onChange={handleScanIdCamera}
                                                        />
                                                    </label>
                                                    <button
                                                        type="button"
                                                        className="btn btn-sm btn-gold fw-bold"
                                                        onClick={() => setShowAiIdModal(true)}
                                                    >
                                                        نص ذكي <i className="fas fa-robot ms-1"></i>
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="row g-3">
                                                <div className="col-12">
                                                    <label className="form-label fw-bold">الاسم الرباعي *</label>
                                                    <input
                                                        type="text"
                                                        className="form-control"
                                                        value={fullName}
                                                        onChange={(e) => setFullName(e.target.value)}
                                                        required
                                                    />
                                                </div>
                                                <div className="col-md-6">
                                                    <label className="form-label fw-bold">رقم الهاتف *</label>
                                                    <input
                                                        type="tel"
                                                        className="form-control font-monospace text-start"
                                                        dir="ltr"
                                                        value={phone}
                                                        onChange={(e) => setPhone(e.target.value)}
                                                        required
                                                    />
                                                </div>
                                                <div className="col-md-6">
                                                    <label className="form-label fw-bold">الرقم الوطني</label>
                                                    <input
                                                        type="text"
                                                        className="form-control font-monospace text-start"
                                                        dir="ltr"
                                                        value={nationalId}
                                                        onChange={(e) => setNationalId(e.target.value)}
                                                    />
                                                </div>
                                                <div className="col-md-6">
                                                    <label className="form-label fw-bold">الجنس</label>
                                                    <select
                                                        className="form-select"
                                                        value={gender}
                                                        onChange={(e) => setGender(e.target.value)}
                                                    >
                                                        <option value="">غير محدد</option>
                                                        <option value="ذكر">ذكر</option>
                                                        <option value="أنثى">أنثى</option>
                                                    </select>
                                                </div>
                                                <div className="col-md-6">
                                                    <label className="form-label fw-bold">تاريخ الميلاد</label>
                                                    <input
                                                        type="date"
                                                        className="form-control"
                                                        value={dob}
                                                        onChange={(e) => setDob(e.target.value)}
                                                    />
                                                </div>
                                                <div className="col-md-6">
                                                    <label className="form-label fw-bold">رابط صورة شخصية</label>
                                                    <input
                                                        type="text"
                                                        className="form-control text-start"
                                                        dir="ltr"
                                                        value={avatarUrl}
                                                        onChange={(e) => setAvatarUrl(e.target.value)}
                                                    />
                                                </div>
                                                <div className="col-md-6">
                                                    <label className="form-label fw-bold text-primary">
                                                        معرف تيليغرام (Telegram ID)
                                                    </label>
                                                    <input
                                                        type="text"
                                                        className="form-control font-monospace text-start"
                                                        dir="ltr"
                                                        value={telegramId}
                                                        onChange={(e) => setTelegramId(e.target.value)}
                                                    />
                                                </div>
                                                <div className="col-12">
                                                    <label className="form-label fw-bold">عنوان السكن</label>
                                                    <input
                                                        type="text"
                                                        className="form-control"
                                                        value={address}
                                                        onChange={(e) => setAddress(e.target.value)}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {editTab === 'professional' && (
                                        <div className="row g-3">
                                            <div className="col-md-6">
                                                <label className="form-label fw-bold">الدور الوظيفي *</label>
                                                <select
                                                    className="form-select"
                                                    value={role}
                                                    onChange={(e) => setRole(e.target.value)}
                                                >
                                                    <option value="lawyer">محامي مزاول</option>
                                                    <option value="secretary">سكرتير تنفيذي</option>
                                                    <option value="admin">مدير / شريك</option>
                                                </select>
                                            </div>
                                            <div className="col-md-6">
                                                <label className="form-label fw-bold">المسمى / التخصص</label>
                                                <input
                                                    type="text"
                                                    className="form-control"
                                                    value={specialization}
                                                    onChange={(e) => setSpecialization(e.target.value)}
                                                />
                                            </div>
                                            <div className="col-md-6">
                                                <label className="form-label fw-bold">تاريخ الانضمام</label>
                                                <input
                                                    type="date"
                                                    className="form-control"
                                                    value={joinDate}
                                                    onChange={(e) => setJoinDate(e.target.value)}
                                                />
                                            </div>
                                            <div className="col-md-6">
                                                <label className="form-label fw-bold">سنوات الخبرة</label>
                                                <input
                                                    type="number"
                                                    className="form-control"
                                                    min={0}
                                                    value={experienceYears}
                                                    onChange={(e) => setExperienceYears(e.target.value)}
                                                />
                                            </div>

                                            <div className="col-12">
                                                <h6 className="fw-bold mt-2">الصلاحيات المخصصة للنظام</h6>
                                                <div className="d-flex flex-wrap gap-3 p-3 rounded-3 border bg-light">
                                                    <div className="form-check form-switch">
                                                        <input
                                                            className="form-check-input"
                                                            type="checkbox"
                                                            id="perm_del"
                                                            checked={permDelete}
                                                            onChange={(e) => setPermDelete(e.target.checked)}
                                                        />
                                                        <label
                                                            className="form-check-label fw-bold small text-danger"
                                                            htmlFor="perm_del"
                                                        >
                                                            حذف الملفات نهائياً
                                                        </label>
                                                    </div>
                                                    <div className="form-check form-switch">
                                                        <input
                                                            className="form-check-input"
                                                            type="checkbox"
                                                            id="perm_fin"
                                                            checked={permFinance}
                                                            onChange={(e) => setPermFinance(e.target.checked)}
                                                        />
                                                        <label
                                                            className="form-check-label fw-bold small text-success"
                                                            htmlFor="perm_fin"
                                                        >
                                                            الوصول للمالية والفواتير
                                                        </label>
                                                    </div>
                                                    <div className="form-check form-switch">
                                                        <input
                                                            className="form-check-input"
                                                            type="checkbox"
                                                            id="perm_rep"
                                                            checked={permReports}
                                                            onChange={(e) => setPermReports(e.target.checked)}
                                                        />
                                                        <label
                                                            className="form-check-label fw-bold small text-primary"
                                                            htmlFor="perm_rep"
                                                        >
                                                            استخراج التقارير الشاملة
                                                        </label>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="col-md-6">
                                                <div className="form-check form-switch p-3 border rounded-3 bg-light">
                                                    <input
                                                        className="form-check-input"
                                                        type="checkbox"
                                                        id="sw_active"
                                                        checked={isActive}
                                                        onChange={(e) => setIsActive(e.target.checked)}
                                                    />
                                                    <label className="form-check-label fw-bold ms-2" htmlFor="sw_active">
                                                        حساب نشط (Active)
                                                    </label>
                                                </div>
                                            </div>
                                            <div className="col-md-6">
                                                <div className="form-check form-switch p-3 border rounded-3 bg-light">
                                                    <input
                                                        className="form-check-input"
                                                        type="checkbox"
                                                        id="sw_login"
                                                        checked={canLogin}
                                                        onChange={(e) => setCanLogin(e.target.checked)}
                                                    />
                                                    <label
                                                        className="form-check-label fw-bold text-danger ms-2"
                                                        htmlFor="sw_login"
                                                    >
                                                        صلاحية الدخول (Login Access)
                                                    </label>
                                                </div>
                                            </div>

                                            <div className="col-md-6">
                                                <label className="form-label fw-bold">رقم الهوية النقابية</label>
                                                <input
                                                    type="text"
                                                    className="form-control font-monospace text-start"
                                                    dir="ltr"
                                                    value={syndicateNum}
                                                    onChange={(e) => setSyndicateNum(e.target.value)}
                                                />
                                            </div>
                                            <div className="col-md-6">
                                                <label className="form-label fw-bold text-danger">
                                                    تاريخ انتهاء الهوية النقابية
                                                </label>
                                                <input
                                                    type="date"
                                                    className="form-control"
                                                    value={syndicateExpiry}
                                                    onChange={(e) => setSyndicateExpiry(e.target.value)}
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {editTab === 'financial' && (
                                        <div className="row g-3">
                                            <div className="col-md-4">
                                                <label className="form-label fw-bold text-success">
                                                    الراتب الأساسي (د.أ)
                                                </label>
                                                <input
                                                    type="number"
                                                    className="form-control"
                                                    value={salaryBasic}
                                                    onChange={(e) => setSalaryBasic(e.target.value)}
                                                />
                                            </div>
                                            <div className="col-md-4">
                                                <label className="form-label fw-bold">بدل تنقلات (د.أ)</label>
                                                <input
                                                    type="number"
                                                    className="form-control"
                                                    value={salaryAllowance}
                                                    onChange={(e) => setSalaryAllowance(e.target.value)}
                                                />
                                            </div>
                                            <div className="col-md-4">
                                                <label className="form-label fw-bold text-danger">
                                                    نسبة العمولة (%)
                                                </label>
                                                <input
                                                    type="number"
                                                    className="form-control"
                                                    value={salaryCommission}
                                                    onChange={(e) => setSalaryCommission(e.target.value)}
                                                />
                                            </div>
                                            <div className="col-md-6">
                                                <label className="form-label fw-bold">البنك المعتمد</label>
                                                <input
                                                    type="text"
                                                    className="form-control"
                                                    value={bankName}
                                                    onChange={(e) => setBankName(e.target.value)}
                                                />
                                            </div>
                                            <div className="col-md-6">
                                                <label className="form-label fw-bold">رقم الآيبان (IBAN)</label>
                                                <input
                                                    type="text"
                                                    className="form-control font-monospace text-start"
                                                    dir="ltr"
                                                    value={bankIban}
                                                    onChange={(e) => setBankIban(e.target.value)}
                                                />
                                            </div>
                                            <div className="col-12 border-top pt-3 mt-3">
                                                <h6 className="fw-bold text-danger">جهة اتصال للطوارئ</h6>
                                            </div>
                                            <div className="col-md-4">
                                                <label className="form-label fw-bold">الاسم</label>
                                                <input
                                                    type="text"
                                                    className="form-control"
                                                    value={emName}
                                                    onChange={(e) => setEmName(e.target.value)}
                                                />
                                            </div>
                                            <div className="col-md-4">
                                                <label className="form-label fw-bold">الهاتف</label>
                                                <input
                                                    type="tel"
                                                    className="form-control font-monospace text-start"
                                                    dir="ltr"
                                                    value={emPhone}
                                                    onChange={(e) => setEmPhone(e.target.value)}
                                                />
                                            </div>
                                            <div className="col-md-4">
                                                <label className="form-label fw-bold">صلة القرابة</label>
                                                <input
                                                    type="text"
                                                    className="form-control"
                                                    value={emRelation}
                                                    onChange={(e) => setEmRelation(e.target.value)}
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {editTab === 'documents' && (
                                        <div>
                                            {!editingStaff?.id ? (
                                                <div className="alert alert-warning fw-bold">
                                                    يرجى حفظ بيانات الكادر (الأساسية) أولاً لتفعيل خاصية رفع وتوثيق الملفات.
                                                </div>
                                            ) : (
                                                <div>
                                                    <div className="p-3 border rounded-3 mb-3 bg-light">
                                                        <label className="form-label fw-bold">
                                                            رفع مستند (هوية، شهادة، عقد...)
                                                        </label>
                                                        <div className="row g-2">
                                                            <div className="col-md-4">
                                                                <input
                                                                    type="text"
                                                                    className="form-control"
                                                                    placeholder="اسم الوثيقة..."
                                                                    value={docName}
                                                                    onChange={(e) => setDocName(e.target.value)}
                                                                />
                                                            </div>
                                                            <div className="col-md-5">
                                                                <input
                                                                    type="file"
                                                                    className="form-control"
                                                                    onChange={(e) =>
                                                                        setDocFile(e.target.files?.[0] || null)
                                                                    }
                                                                />
                                                            </div>
                                                            <div className="col-md-3">
                                                                <button
                                                                    type="button"
                                                                    className="btn btn-gold w-100 fw-bold"
                                                                    onClick={handleUploadStaffDoc}
                                                                    disabled={uploadingDoc}
                                                                >
                                                                    {uploadingDoc ? (
                                                                        <i className="fas fa-spinner fa-spin"></i>
                                                                    ) : (
                                                                        <>
                                                                            <i className="fas fa-upload me-1"></i> رفع
                                                                        </>
                                                                    )}
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {Array.isArray(editingStaff.staff_documents) &&
                                                    editingStaff.staff_documents.length > 0 ? (
                                                        editingStaff.staff_documents.map((doc: any, idx: number) => (
                                                            <div
                                                                key={idx}
                                                                className="d-flex justify-content-between align-items-center p-2 mb-2 border rounded-3 bg-white"
                                                            >
                                                                <span className="fw-bold">{doc.name}</span>
                                                                <div className="d-flex gap-2">
                                                                    <button
                                                                        type="button"
                                                                        className="btn btn-sm btn-outline-primary"
                                                                        onClick={() =>
                                                                            MoakkilAPI.downloadR2File(doc.url, doc.name)
                                                                        }
                                                                    >
                                                                        تحميل
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        className="btn btn-sm btn-outline-danger"
                                                                        onClick={() => handleDeleteStaffDoc(idx)}
                                                                    >
                                                                        <i className="fas fa-trash"></i>
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        ))
                                                    ) : (
                                                        <div className="text-center p-3 text-muted fw-bold">
                                                            لا توجد وثائق مرفوعة بعد.
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    <button
                                        type="submit"
                                        className="btn btn-gold w-100 py-3 mt-4 fs-5 fw-bold shadow-sm"
                                        disabled={saving}
                                    >
                                        {saving ? (
                                            <>
                                                <i className="fas fa-spinner fa-spin me-2"></i> جاري الحفظ...
                                            </>
                                        ) : (
                                            <>
                                                <i className="fas fa-save me-2"></i> حفظ واعتماد الكادر
                                            </>
                                        )}
                                    </button>
                                </form>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* نافذة المحلل الذكي لنص الهوية */}
            {showAiIdModal && (
                <div
                    className="modal fade show d-block"
                    style={{ background: 'rgba(11,19,43,0.65)', zIndex: 1060 }}
                >
                    <div className="modal-dialog modal-dialog-centered">
                        <div className="modal-content rounded-4 border-0 shadow-lg">
                            <div className="modal-header bg-primary text-white">
                                <h5 className="modal-title fw-bold">
                                    <i className="fas fa-robot me-2 text-warning"></i> المحلل الذكي للبيانات
                                </h5>
                                <button
                                    type="button"
                                    className="btn-close btn-close-white"
                                    onClick={() => setShowAiIdModal(false)}
                                ></button>
                            </div>
                            <div className="modal-body p-4 text-center">
                                <p className="fw-bold mb-3">
                                    قم بنسخ ولصق النص المستخرج من صورة الهوية، وسيقوم الذكاء الاصطناعي بملء الحقول تلقائياً.
                                </p>
                                <textarea
                                    className="form-control mb-3 fw-bold"
                                    rows={5}
                                    placeholder="الصق نص الهوية هنا..."
                                    value={aiIdText}
                                    onChange={(e) => setAiIdText(e.target.value)}
                                />
                                <button
                                    type="button"
                                    className="btn btn-gold w-100 py-2 fw-bold"
                                    onClick={handleProcessIdAI}
                                    disabled={processingAiId}
                                >
                                    {processingAiId ? (
                                        <i className="fas fa-spinner fa-spin"></i>
                                    ) : (
                                        <>
                                            <i className="fas fa-magic me-2"></i> تحليل وملء الحقول
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <BottomNav activeTab="tools" />
        </div>
    );
};
