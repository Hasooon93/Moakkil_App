/**
 * ============================================================================
 * نظام موكّل (Moakkil System) - 2026
 * الملف: src/features/super-admin/SuperAdminPage.tsx
 * الوصف: بوابة الإدارة العليا وترخيص المكاتب الجديدة (Super Admin Portal)
 * مطابقة 100% لملف register.html + js/register.js
 * ============================================================================
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import { API_BASE_URL } from '../../config/constants';
import { useTheme } from '../../context/ThemeContext';

export const SuperAdminPage: React.FC = () => {
    const navigate = useNavigate();
    const { isDark, toggleDarkMode } = useTheme();

    const [masterSecret, setMasterSecret] = useState('');
    const [activeTab, setActiveTab] = useState<'register' | 'firms'>('register');

    // New Firm Registration Form State
    const [firmName, setFirmName] = useState('');
    const [managerName, setManagerName] = useState('');
    const [managerPhone, setManagerPhone] = useState('');
    const [telegramId, setTelegramId] = useState('');
    const [subscriptionPlan, setSubscriptionPlan] = useState('enterprise');
    const [subscriptionEnd, setSubscriptionEnd] = useState('');
    const [maxUsers, setMaxUsers] = useState(10);
    const [submitting, setSubmitting] = useState(false);

    // Firms Management State
    const [firmsList, setFirmsList] = useState<any[]>([]);
    const [loadingFirms, setLoadingFirms] = useState(false);

    const handleRegisterFirm = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!masterSecret.trim()) {
            Swal.fire('مرفوض أمنياً', 'يرجى إدخال مفتاح الإدارة العليا (Super Admin Secret) أولاً.', 'error');
            return;
        }

        setSubmitting(true);
        try {
            const res = await fetch(`${API_BASE_URL}/api/superadmin/register-firm`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-super-admin-secret': masterSecret.trim(),
                },
                body: JSON.stringify({
                    firm_name: firmName.trim(),
                    manager_name: managerName.trim(),
                    manager_phone: managerPhone.trim(),
                    telegram_id: telegramId.trim(),
                    subscription_plan: subscriptionPlan,
                    subscription_end: subscriptionEnd || null,
                    max_users: Number(maxUsers) || 10,
                }),
            });

            const data = await res.json();
            if (res.ok && !data.error) {
                Swal.fire(
                    'تم الترخيص بنجاح',
                    `تم تأسيس المكتب (${firmName}) وتفعيل حساب المدير العام بنجاح.`,
                    'success'
                );
                setFirmName('');
                setManagerName('');
                setManagerPhone('');
                setTelegramId('');
            } else {
                throw new Error(data.error || 'فشل تسجيل المكتب');
            }
        } catch (err: any) {
            Swal.fire('خطأ', err.message || 'تعذر إتمام العملية', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const loadFirms = async () => {
        if (!masterSecret.trim()) {
            Swal.fire('تنبيه', 'أدخل مفتاح الإدارة العليا أولاً لعرض قائمة المكاتب', 'warning');
            return;
        }
        setLoadingFirms(true);
        try {
            const res = await fetch(`${API_BASE_URL}/api/superadmin/firms`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'x-super-admin-secret': masterSecret.trim(),
                },
            });
            const data = await res.json();
            if (res.ok && Array.isArray(data)) {
                setFirmsList(data);
            } else {
                throw new Error(data.error || 'تعذر جلب قائمة المكاتب');
            }
        } catch (err: any) {
            Swal.fire('خطأ أمني', err.message, 'error');
        } finally {
            setLoadingFirms(false);
        }
    };

    const handleUpdateFirm = async (firm: any) => {
        const { value: formValues } = await Swal.fire({
            title: `إدارة اشتراك: ${firm.name || firm.firm_name}`,
            html: `
                <div class="text-start mb-3">
                    <label class="form-label fw-bold small">حالة المكتب</label>
                    <select id="sa_is_active" class="form-select fw-bold">
                        <option value="true" ${firm.is_active !== false ? 'selected' : ''}>نشط (Active)</option>
                        <option value="false" ${firm.is_active === false ? 'selected' : ''}>موقوف (Suspended)</option>
                    </select>
                </div>
                <div class="text-start mb-3">
                    <label class="form-label fw-bold small">تاريخ انتهاء الاشتراك</label>
                    <input type="date" id="sa_sub_end" class="form-control fw-bold" value="${(firm.subscription_end || '').split('T')[0]}">
                </div>
                <div class="text-start">
                    <label class="form-label fw-bold small">الحد الأقصى للمستخدمين</label>
                    <input type="number" id="sa_max_users" class="form-control fw-bold" value="${firm.max_users || 10}">
                </div>
            `,
            focusConfirm: false,
            showCancelButton: true,
            confirmButtonText: 'حفظ التعديلات',
            cancelButtonText: 'إلغاء',
            preConfirm: () => {
                return {
                    firm_id: firm.id,
                    is_active: (document.getElementById('sa_is_active') as HTMLSelectElement).value === 'true',
                    subscription_end: (document.getElementById('sa_sub_end') as HTMLInputElement).value || null,
                    max_users: Number((document.getElementById('sa_max_users') as HTMLInputElement).value) || 10,
                };
            },
        });

        if (!formValues) return;

        try {
            const res = await fetch(`${API_BASE_URL}/api/superadmin/update-firm`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'x-super-admin-secret': masterSecret.trim(),
                },
                body: JSON.stringify(formValues),
            });
            const data = await res.json();
            if (res.ok && !data.error) {
                Swal.fire('تم التحديث', 'تم تحديث بيانات واشتراك المكتب بنجاح.', 'success');
                loadFirms();
            } else {
                throw new Error(data.error || 'فشل التحديث');
            }
        } catch (err: any) {
            Swal.fire('خطأ', err.message, 'error');
        }
    };

    return (
        <div className="min-vh-100 pb-5">
            <div className="top-nav d-flex justify-content-between align-items-center px-3 py-3">
                <div className="d-flex align-items-center gap-2">
                    <button
                        className="btn btn-link text-white p-0 text-decoration-none"
                        onClick={() => navigate('/login.html')}
                    >
                        <i className="fas fa-arrow-right fs-4"></i>
                    </button>
                    <h5 className="mb-0 fw-bold text-white">
                        <i className="fas fa-user-astronaut me-2 text-warning"></i> بوابة الإدارة المركزية العليا (Super Admin)
                    </h5>
                </div>
                <button
                    className="btn btn-sm btn-outline-light rounded-3 px-3"
                    onClick={toggleDarkMode}
                    title="تبديل الوضع الليلي"
                >
                    <i className={`fas ${isDark ? 'fa-sun text-warning' : 'fa-moon'}`}></i>
                </button>
            </div>

            <div className="container mt-4" style={{ maxWidth: 850 }}>
                <div className="card border-0 shadow-sm rounded-4 p-4 mb-4 border-top border-4 border-warning">
                    <label className="form-label fw-bold text-danger">
                        <i className="fas fa-key me-1"></i> مفتاح المصادقة السيادي (x-super-admin-secret)
                    </label>
                    <input
                        type="password"
                        className="form-control form-control-lg font-monospace text-center"
                        dir="ltr"
                        placeholder="Enter SUPER_ADMIN_SECRET..."
                        value={masterSecret}
                        onChange={(e) => setMasterSecret(e.target.value)}
                    />
                </div>

                <ul className="nav nav-pills mb-4 gap-2">
                    <li className="nav-item">
                        <button
                            className={`nav-link fw-bold px-4 rounded-3 ${activeTab === 'register' ? 'active bg-navy text-warning' : 'bg-white text-dark border'}`}
                            onClick={() => setActiveTab('register')}
                        >
                            <i className="fas fa-plus-circle me-1"></i> ترخيص مكتب محاماة جديد
                        </button>
                    </li>
                    <li className="nav-item">
                        <button
                            className={`nav-link fw-bold px-4 rounded-3 ${activeTab === 'firms' ? 'active bg-navy text-warning' : 'bg-white text-dark border'}`}
                            onClick={() => {
                                setActiveTab('firms');
                                if (masterSecret) loadFirms();
                            }}
                        >
                            <i className="fas fa-building me-1"></i> إدارة المكاتب والاشتراكات
                        </button>
                    </li>
                </ul>

                {activeTab === 'register' ? (
                    <div className="card border-0 shadow-sm rounded-4 p-4">
                        <h5 className="fw-bold text-navy mb-3 border-bottom pb-2">
                            بيانات المكتب والمدير العام (Tenant Provisioning)
                        </h5>
                        <form onSubmit={handleRegisterFirm} className="row g-3">
                            <div className="col-md-6">
                                <label className="form-label fw-bold">اسم مكتب / شركة المحاماة *</label>
                                <input
                                    type="text"
                                    className="form-control"
                                    value={firmName}
                                    onChange={(e) => setFirmName(e.target.value)}
                                    required
                                    placeholder="مثال: مكتب العدالة للمحاماة والاستشارات"
                                />
                            </div>
                            <div className="col-md-6">
                                <label className="form-label fw-bold">اسم المحامي المدير (Admin) *</label>
                                <input
                                    type="text"
                                    className="form-control"
                                    value={managerName}
                                    onChange={(e) => setManagerName(e.target.value)}
                                    required
                                />
                            </div>
                            <div className="col-md-6">
                                <label className="form-label fw-bold">رقم هاتف المدير *</label>
                                <input
                                    type="tel"
                                    className="form-control font-monospace text-start"
                                    dir="ltr"
                                    value={managerPhone}
                                    onChange={(e) => setManagerPhone(e.target.value)}
                                    required
                                    placeholder="079XXXXXXX"
                                />
                            </div>
                            <div className="col-md-6">
                                <label className="form-label fw-bold text-primary">
                                    معرف تيليغرام للمدير (Telegram Chat ID) *
                                </label>
                                <input
                                    type="text"
                                    className="form-control font-monospace text-start"
                                    dir="ltr"
                                    value={telegramId}
                                    onChange={(e) => setTelegramId(e.target.value)}
                                    required
                                    placeholder="مثال: 123456789"
                                />
                            </div>
                            <div className="col-md-4">
                                <label className="form-label fw-bold">باقة الاشتراك</label>
                                <select
                                    className="form-select fw-bold"
                                    value={subscriptionPlan}
                                    onChange={(e) => setSubscriptionPlan(e.target.value)}
                                >
                                    <option value="basic">أساسية (Basic)</option>
                                    <option value="pro">احترافية (Pro)</option>
                                    <option value="enterprise">مؤسسية شاملة (Enterprise)</option>
                                </select>
                            </div>
                            <div className="col-md-4">
                                <label className="form-label fw-bold">تاريخ انتهاء الترخيص</label>
                                <input
                                    type="date"
                                    className="form-control"
                                    value={subscriptionEnd}
                                    onChange={(e) => setSubscriptionEnd(e.target.value)}
                                />
                            </div>
                            <div className="col-md-4">
                                <label className="form-label fw-bold">الحد الأقصى للموظفين</label>
                                <input
                                    type="number"
                                    className="form-control"
                                    min={1}
                                    value={maxUsers}
                                    onChange={(e) => setMaxUsers(Number(e.target.value))}
                                />
                            </div>
                            <div className="col-12 mt-4">
                                <button
                                    type="submit"
                                    className="btn btn-lg w-100 fw-bold py-3 rounded-3"
                                    style={{ background: '#0B132B', color: '#D4AF37' }}
                                    disabled={submitting}
                                >
                                    {submitting ? (
                                        <i className="fas fa-spinner fa-spin"></i>
                                    ) : (
                                        <>
                                            <i className="fas fa-check-double me-2"></i> إنشاء المكتب وتفعيل الترخيص
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                ) : (
                    <div className="card border-0 shadow-sm rounded-4 p-4">
                        <div className="d-flex justify-content-between align-items-center mb-3">
                            <h5 className="fw-bold text-navy mb-0">المكاتب المرخصة في السحابة</h5>
                            <button className="btn btn-sm btn-outline-primary fw-bold" onClick={loadFirms}>
                                <i className="fas fa-sync-alt me-1"></i> تحديث القائمة
                            </button>
                        </div>

                        {loadingFirms ? (
                            <div className="text-center p-5">
                                <i className="fas fa-spinner fa-spin fa-2x text-warning"></i>
                            </div>
                        ) : firmsList.length === 0 ? (
                            <div className="text-center p-4 text-muted fw-bold">
                                لا توجد بيانات معروضة. تأكد من إدخال المفتاح السيادي والضغط على تحديث.
                            </div>
                        ) : (
                            <div className="table-responsive">
                                <table className="table table-hover align-middle text-center">
                                    <thead className="table-dark">
                                        <tr>
                                            <th className="text-start">اسم المكتب</th>
                                            <th>الباقة</th>
                                            <th>الحالة</th>
                                            <th>انتهاء الاشتراك</th>
                                            <th>إجراء</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {firmsList.map((f) => (
                                            <tr key={f.id}>
                                                <td className="text-start fw-bold">{f.name || f.firm_name}</td>
                                                <td>
                                                    <span className="badge bg-info text-dark">
                                                        {f.subscription_plan || 'Enterprise'}
                                                    </span>
                                                </td>
                                                <td>
                                                    {f.is_active !== false ? (
                                                        <span className="badge bg-success">نشط</span>
                                                    ) : (
                                                        <span className="badge bg-danger">موقوف</span>
                                                    )}
                                                </td>
                                                <td className="font-monospace small">
                                                    {f.subscription_end
                                                        ? new Date(f.subscription_end).toLocaleDateString('ar-JO')
                                                        : 'مفتوح'}
                                                </td>
                                                <td>
                                                    <button
                                                        className="btn btn-sm btn-outline-primary fw-bold"
                                                        onClick={() => handleUpdateFirm(f)}
                                                    >
                                                        <i className="fas fa-cog me-1"></i> إدارة
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
