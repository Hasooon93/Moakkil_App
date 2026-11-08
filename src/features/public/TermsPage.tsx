/**
 * ============================================================================
 * نظام موكّل (Moakkil System) - 2026
 * الملف: src/features/public/TermsPage.tsx
 * الوصف: صفحة شروط وأحكام الاستخدام (مطابقة 100% لملف terms.html)
 * ============================================================================
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../../context/ThemeContext';

export const TermsPage: React.FC = () => {
    const navigate = useNavigate();
    const { isDark, toggleDarkMode } = useTheme();

    return (
        <div className="min-vh-100 pb-5">
            <div className="top-nav d-flex justify-content-between align-items-center px-3 py-3">
                <div className="d-flex align-items-center gap-2">
                    <button
                        className="btn btn-link text-white p-0 text-decoration-none"
                        onClick={() => navigate(-1)}
                    >
                        <i className="fas fa-arrow-right fs-4"></i>
                    </button>
                    <h5 className="mb-0 fw-bold text-white">
                        <i className="fas fa-file-contract me-2 text-warning"></i> شروط وأحكام الاستخدام
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
                <div className="card border-0 shadow-sm rounded-4 p-4 p-md-5">
                    <div className="text-center mb-4 pb-3 border-bottom">
                        <i className="fas fa-gavel fa-3x mb-3" style={{ color: 'var(--accent)' }}></i>
                        <h3 className="fw-bold text-navy">اتفاقية مستوى الخدمة وشروط الاستخدام</h3>
                        <p className="text-muted fw-bold mb-0">تطبق هذه الشروط على كافة المكاتب والمستخدمين والوكلاء</p>
                    </div>

                    <div className="lh-lg fw-semibold">
                        <h5 className="fw-bold text-navy mt-3">1. الاستخدام المصرح به</h5>
                        <p className="text-muted">
                            يُخصص نظام "موكّل" للاستخدام المهني القانوني من قبل مكاتب وشركات المحاماة المرخصة وكوادرها
                            وموكليها. يُحظر مشاركة رموز الدخول (OTP) أو رموز الـ PIN الخاصة ببوابة الموكل مع أطراف غير
                            مصرح لها.
                        </p>

                        <h5 className="fw-bold text-navy mt-4">2. الجلسة الأحادية والرقابة الأمنية</h5>
                        <p className="text-muted">
                            يطبق النظام سياسة الجلسة الأحادية الصارمة (Single Active Device Session). يؤدي تسجيل الدخول
                            من جهاز جديد إلى إنهاء الجلسة السابقة تلقائياً. كما تخضع كافة الإجراءات لسجل الرقابة غير
                            القابل للتعديل (Immutable Audit Trail).
                        </p>

                        <h5 className="fw-bold text-navy mt-4">3. مخرجات المستشار القانوني الذكي (AI Disclaimer)</h5>
                        <p className="text-muted">
                            يعمل محرك الذكاء الاصطناعي كأداة مساندة للبحث وصياغة المسودات القانونية استناداً إلى التشريعات
                            الأردنية، وتبقى المسؤولية المهنية النهائية عن اعتماد المذكرات واللوائح على عاتق المحامي
                            المزاول.
                        </p>

                        <h5 className="fw-bold text-navy mt-4">4. التوقيع الإلكتروني والوثائق</h5>
                        <p className="text-muted">
                            تُوثق التواقيع الإلكترونية في بوابة الموكل ببصمة رقمية مشفرة (SHA-256) وتُحفظ في سجل التحقق
                            العام لضمان سلامة الوثيقة من أي تلاعب.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};
