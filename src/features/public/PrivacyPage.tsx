/**
 * ============================================================================
 * نظام موكّل (Moakkil System) - 2026
 * الملف: src/features/public/PrivacyPage.tsx
 * الوصف: صفحة سياسة الخصوصية وحماية البيانات (مطابقة 100% لملف privacy.html)
 * ============================================================================
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../../context/ThemeContext';

export const PrivacyPage: React.FC = () => {
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
                        <i className="fas fa-user-shield me-2 text-warning"></i> سياسة الخصوصية وأمن المعلومات
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
                        <i className="fas fa-lock fa-3x mb-3" style={{ color: 'var(--accent)' }}></i>
                        <h3 className="fw-bold text-navy">ميثاق الخصوصية والسرية المهنية</h3>
                        <p className="text-muted fw-bold mb-0">
                            نظام موكّل لإدارة مكاتب المحاماة — معمارية انعدام الثقة (True Zero-Trust Architecture)
                        </p>
                    </div>

                    <div className="lh-lg fw-semibold">
                        <h5 className="fw-bold text-navy mt-3">
                            <i className="fas fa-check-circle text-success me-2"></i> 1. التزام السرية القانونية المطلقة
                        </h5>
                        <p className="text-muted">
                            يخضع نظام "موكّل" لأعلى معايير السرية المهنية المنصوص عليها في قانون نقابة المحامين الأردنيين.
                            تُعزل بيانات كل مكتب محاماة منطقياً وأمنياً بالكامل (Multi-Tenant Isolation) عبر معرفات مشفرة
                            ولا يمكن لأي جهة خارجية الاطلاع عليها.
                        </p>

                        <h5 className="fw-bold text-navy mt-4">
                            <i className="fas fa-hdd text-primary me-2"></i> 2. التشفير وحماية الوثائق السحابية (Cloudflare R2)
                        </h5>
                        <p className="text-muted">
                            تُحفظ كافة الوثائق والمرفقات في خوادم سحابية مشفرة (Cloudflare R2) ولا تُمنح روابط عامة
                            مفتوحة؛ بل يتم التحقق من ملكية المكتب للوثيقة وصلاحية الجلسة في كل طلب تحميل.
                        </p>

                        <h5 className="fw-bold text-navy mt-4">
                            <i className="fas fa-fingerprint text-warning me-2"></i> 3. المصادقة المتعددة والبصمة الحيوية (WebAuthn & 2FA)
                        </h5>
                        <p className="text-muted">
                            يعتمد النظام التحقق الثنائي عبر البوت الأمني المشفر، والبصمة البيومترية (WebAuthn)، وتذاكر
                            التحقق الإجرائي لمرة واحدة (Scoped Action MFA) قبل تنفيذ أي عملية حذف حساسة.
                        </p>

                        <h5 className="fw-bold text-navy mt-4">
                            <i className="fas fa-shield-virus text-danger me-2"></i> 4. تشفير بوابة الموكلين (PBKDF2 + AES-GCM)
                        </h5>
                        <p className="text-muted">
                            تُشفر بيانات بوابة الموكل على جهازه باستخدام خوارزمية AES-GCM 256-bit المشتقة عبر PBKDF2
                            بـ 100,000 دورة، مع صلاحية زمنية محددة وعدم تخزين رمز الـ PIN كنص صريح أبداً.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};
