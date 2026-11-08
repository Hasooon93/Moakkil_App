/**
 * ============================================================================
 * نظام موكّل (Moakkil System) - 2026
 * الملف: src/features/auth/LoginPage.tsx
 * الوصف: واجهة تسجيل الدخول للمحامين والكوادر (OTP عبر تيليغرام + WebAuthn البصمة)
 * مطابقة 100% لملف login.html + js/auth.js
 * ============================================================================
 */

import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Swal from 'sweetalert2';
import { AuthService } from '../../services/auth.service';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { STORAGE_KEYS } from '../../config/constants';

export const LoginPage: React.FC = () => {
    const navigate = useNavigate();
    const { refreshSession } = useAuth();
    const { isDark, toggleDarkMode } = useTheme();

    const [step, setStep] = useState<'phone' | 'otp'>('phone');
    const [phone, setPhone] = useState(localStorage.getItem('moakkil_last_phone') || '');
    const [otp, setOtp] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        // Flush any pending logout when arriving at login screen
        AuthService.flushPendingLogout();
        const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
        if (token) {
            navigate('/app.html', { replace: true });
        }
    }, [navigate]);

    const handleRequestOtp = async (e: React.FormEvent) => {
        e.preventDefault();
        const cleanPhone = phone.trim();
        if (!cleanPhone) {
            Swal.fire('تنبيه', 'يرجى إدخال رقم الهاتف المعتمد', 'warning');
            return;
        }
        if (!navigator.onLine) {
            Swal.fire('وضع عدم الاتصال', 'يتطلب تسجيل الدخول اتصالاً نشطاً بالشبكة للتحقق الأمني.', 'error');
            return;
        }

        setLoading(true);
        try {
            const res = await AuthService.requestOtp(cleanPhone);
            if (res && !res.error) {
                localStorage.setItem('moakkil_last_phone', cleanPhone);
                setStep('otp');
                Swal.fire({
                    toast: true,
                    position: 'top-end',
                    icon: 'info',
                    title: 'تم إرسال رمز التحقق (OTP) إلى حسابك في تيليغرام',
                    showConfirmButton: false,
                    timer: 3500,
                });
            } else {
                throw new Error(res?.error || 'تعذر إرسال رمز التحقق');
            }
        } catch (err: any) {
            Swal.fire('خطأ في المصادقة', err.message || 'تأكد من رقم الهاتف وارتباطه ببوت التيليغرام.', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleVerifyOtp = async (e: React.FormEvent) => {
        e.preventDefault();
        const cleanOtp = otp.trim();
        if (!cleanOtp || cleanOtp.length < 4) {
            Swal.fire('تنبيه', 'يرجى إدخال رمز التحقق المكون من 6 أرقام', 'warning');
            return;
        }

        setLoading(true);
        try {
            const res = await AuthService.verifyOtp(phone.trim(), cleanOtp);
            if (res && res.token) {
                refreshSession();
                Swal.fire({
                    toast: true,
                    position: 'top-end',
                    icon: 'success',
                    title: `مرحباً بك، ${res.user?.full_name || 'أستاذ'}`,
                    showConfirmButton: false,
                    timer: 2000,
                });
                navigate('/app.html', { replace: true });
            } else {
                throw new Error(res?.error || 'رمز التحقق غير صحيح أو منتهي الصلاحية');
            }
        } catch (err: any) {
            Swal.fire('فشل التحقق', err.message || 'رمز التحقق غير صالح.', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleBiometricLogin = async () => {
        const cleanPhone = phone.trim();
        if (!cleanPhone) {
            Swal.fire('تنبيه', 'يرجى إدخال رقم الهاتف أولاً لتحديد هويتك البيومترية', 'info');
            return;
        }
        if (!navigator.onLine) {
            Swal.fire('تنبيه', 'المصادقة البيومترية تتطلب اتصالاً بالإنترنت للتحقق من التوقيع التشفيري.', 'warning');
            return;
        }

        setLoading(true);
        try {
            const res = await AuthService.loginWithBiometric(cleanPhone);
            if (res && res.token) {
                localStorage.setItem('moakkil_last_phone', cleanPhone);
                refreshSession();
                Swal.fire({
                    toast: true,
                    position: 'top-end',
                    icon: 'success',
                    title: 'تم الدخول عبر البصمة البيومترية بنجاح',
                    showConfirmButton: false,
                    timer: 2000,
                });
                navigate('/app.html', { replace: true });
            } else {
                throw new Error(res?.error || 'فشل الدخول بالبصمة');
            }
        } catch (err: any) {
            Swal.fire('فشل البصمة', err.message || 'تأكد من تفعيل البصمة لهذا الجهاز مسبقاً من داخل النظام.', 'error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div
            className="min-vh-100 d-flex flex-column justify-content-center align-items-center p-3 position-relative"
            style={{
                background: isDark
                    ? 'radial-gradient(circle at top right, #1e293b 0%, #020617 100%)'
                    : 'radial-gradient(circle at top right, #1C2541 0%, #0B132B 100%)',
            }}
        >
            <button
                onClick={toggleDarkMode}
                className="btn btn-outline-light position-fixed top-0 start-0 m-3 rounded-circle shadow-sm d-flex align-items-center justify-content-center"
                style={{ width: 44, height: 44, zIndex: 1050, borderColor: 'rgba(212,175,55,0.4)' }}
                title="تبديل الوضع الليلي"
            >
                <i className={`fas ${isDark ? 'fa-sun text-warning' : 'fa-moon text-warning'}`}></i>
            </button>

            <div
                className="card border-0 shadow-lg p-4 p-md-5 rounded-4 fade-in"
                style={{
                    maxWidth: 440,
                    width: '100%',
                    background: isDark ? '#1e293b' : '#ffffff',
                    color: isDark ? '#f8fafc' : '#0B132B',
                    borderTop: '5px solid #D4AF37',
                }}
            >
                <div className="text-center mb-4">
                    <div
                        className="mx-auto mb-3 d-flex align-items-center justify-content-center rounded-circle shadow"
                        style={{
                            width: 80,
                            height: 80,
                            background: 'linear-gradient(135deg, #0B132B, #1C2541)',
                            border: '3px solid #D4AF37',
                        }}
                    >
                        <i className="fas fa-scale-balanced fa-2x" style={{ color: '#D4AF37' }}></i>
                    </div>
                    <h4 className="fw-black mb-1" style={{ fontWeight: 900 }}>
                        بوابة الدخول الآمن
                    </h4>
                    <p className="text-muted small fw-bold mb-0">
                        نظام موكّل ERP — مصادقة ثنائية مشفرة (2FA & WebAuthn)
                    </p>
                </div>

                {step === 'phone' ? (
                    <form onSubmit={handleRequestOtp}>
                        <div className="mb-3">
                            <label className="form-label fw-bold small">
                                <i className="fas fa-phone-alt me-1 text-warning"></i> رقم الهاتف المعتمد
                            </label>
                            <input
                                type="tel"
                                className="form-control form-control-lg font-monospace text-center fw-bold rounded-3"
                                dir="ltr"
                                placeholder="079XXXXXXX"
                                value={phone}
                                onChange={(e) => setPhone(e.target.value)}
                                required
                                autoFocus
                            />
                        </div>

                        <button
                            type="submit"
                            className="btn btn-lg w-100 fw-bold py-3 rounded-3 shadow-sm mb-3"
                            style={{
                                background: 'linear-gradient(135deg, #0B132B, #1C2541)',
                                color: '#D4AF37',
                                border: '1px solid #D4AF37',
                            }}
                            disabled={loading}
                        >
                            {loading ? (
                                <>
                                    <i className="fas fa-spinner fa-spin me-2"></i> جاري الإرسال...
                                </>
                            ) : (
                                <>
                                    <i className="fab fa-telegram-plane me-2"></i> إرسال رمز التحقق (OTP)
                                </>
                            )}
                        </button>

                        <button
                            type="button"
                            onClick={handleBiometricLogin}
                            className="btn btn-lg w-100 fw-bold py-3 rounded-3 shadow-sm d-flex align-items-center justify-content-center gap-2"
                            style={{
                                background: 'linear-gradient(135deg, #D4AF37, #b5952f)',
                                color: '#0B132B',
                            }}
                            disabled={loading}
                        >
                            <i className="fas fa-fingerprint fs-4"></i>
                            <span>الدخول السريع بالبصمة (WebAuthn)</span>
                        </button>
                    </form>
                ) : (
                    <form onSubmit={handleVerifyOtp}>
                        <div className="alert alert-info small fw-bold rounded-3 mb-3 text-center">
                            <i className="fab fa-telegram fs-5 me-1 align-middle"></i> أدخل الرمز المكون من 6 أرقام
                            المرسل إلى تيليغرام الرقم <span dir="ltr">{phone}</span>
                        </div>

                        <div className="mb-3">
                            <input
                                type="text"
                                inputMode="numeric"
                                maxLength={6}
                                className="form-control form-control-lg font-monospace text-center fw-bold fs-3 rounded-3"
                                dir="ltr"
                                placeholder="------"
                                style={{ letterSpacing: '8px' }}
                                value={otp}
                                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                                required
                                autoFocus
                            />
                        </div>

                        <button
                            type="submit"
                            className="btn btn-lg w-100 fw-bold py-3 rounded-3 shadow-sm mb-2"
                            style={{
                                background: 'linear-gradient(135deg, #D4AF37, #b5952f)',
                                color: '#0B132B',
                            }}
                            disabled={loading}
                        >
                            {loading ? (
                                <>
                                    <i className="fas fa-spinner fa-spin me-2"></i> جاري التحقق...
                                </>
                            ) : (
                                <>
                                    <i className="fas fa-unlock-alt me-2"></i> تأكيد الدخول للنظام
                                </>
                            )}
                        </button>

                        <button
                            type="button"
                            className="btn btn-link w-100 text-muted fw-bold text-decoration-none small"
                            onClick={() => {
                                setStep('phone');
                                setOtp('');
                            }}
                        >
                            <i className="fas fa-redo me-1"></i> تغيير رقم الهاتف أو إعادة الإرسال
                        </button>
                    </form>
                )}

                <hr className="my-4 opacity-25" />

                <div className="d-flex justify-content-between align-items-center small fw-bold">
                    <Link to="/client.html" className="text-decoration-none" style={{ color: '#D4AF37' }}>
                        <i className="fas fa-user-tie me-1"></i> بوابة الموكلين
                    </Link>
                    <Link to="/register.html" className="text-decoration-none text-muted">
                        <i className="fas fa-building me-1"></i> ترخيص مكتب جديد
                    </Link>
                </div>
            </div>
        </div>
    );
};
