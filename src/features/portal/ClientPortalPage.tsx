/**
 * ============================================================================
 * نظام موكّل (Moakkil System) - 2026
 * الملف: src/features/portal/ClientPortalPage.tsx
 * الوصف: بوابة الموكل الرقمية المشفرة (V5.4 Enterprise True Zero-Trust)
 * الميزات الأمنية والوظيفية المطابقة 100% لملف client.html + js/client.js:
 * 1. تطبيع رمز الـ PIN (أرقام وحروف عربية/هندية وإنجليزية كبيرة Alphanumeric Uppercase).
 * 2. جلسة بوابة خادمية مستقلة (portal_session_token عبر x-portal-session-token).
 * 3. تشفير الكاش المحلي للعمل دون اتصال عبر PBKDF2 (100,000 دورة SHA-256) + AES-GCM 256-bit
 *    لمدة 24 ساعة دون تخزين الـ PIN الصريح أبداً.
 * 4. رفع النواقص السحابي (POST /api/public/client/upload-missing-doc) والتوقيع الحي
 *    (HTML5 Canvas + SHA-256 Hash عبر POST /api/public/client/submit-signature).
 * ============================================================================
 */

import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import Swal from 'sweetalert2';
import { API_BASE_URL } from '../../config/constants';
import { useTheme } from '../../context/ThemeContext';

const PORTAL_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 Hours

/**
 * تطبيع رمز الدخول (PIN) ليقبل الأرقام والحروف (مع تحويل الأرقام العربية/الهندية والإنجليزية الكبيرة)
 */
export function normalizePin(rawPin: string): string {
    if (!rawPin) return '';
    return String(rawPin)
        .trim()
        .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
        .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
        .replace(/\s+/g, '')
        .toUpperCase();
}

/**
 * اشتقاق مفتاح AES-GCM 256-bit من (PIN + Token) عبر PBKDF2 بـ 100,000 دورة
 */
async function derivePortalKey(pin: string, token: string, salt: Uint8Array): Promise<CryptoKey> {
    const enc = new TextEncoder();
    const keyMaterial = await window.crypto.subtle.importKey(
        'raw',
        enc.encode(`${normalizePin(pin)}:${token}`),
        { name: 'PBKDF2' },
        false,
        ['deriveKey']
    );
    return window.crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt,
            iterations: 100000,
            hash: 'SHA-256',
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

async function saveEncryptedPortalCache(token: string, pin: string, data: any): Promise<void> {
    try {
        if (!window.crypto?.subtle) return;
        const salt = window.crypto.getRandomValues(new Uint8Array(16));
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        const key = await derivePortalKey(pin, token, salt);
        const encoded = new TextEncoder().encode(
            JSON.stringify({ timestamp: Date.now(), payload: data })
        );
        const cipherBuf = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);

        const toB64 = (u8: Uint8Array) => btoa(String.fromCharCode(...Array.from(u8)));
        const record = {
            salt: toB64(salt),
            iv: toB64(iv),
            ciphertext: toB64(new Uint8Array(cipherBuf)),
            savedAt: Date.now(),
        };
        localStorage.setItem(`moakkil_encrypted_portal_${token}`, JSON.stringify(record));
    } catch (e) {
        console.warn('Encrypted cache write skipped:', e);
    }
}

async function loadEncryptedPortalCache(token: string, pin: string): Promise<any | null> {
    try {
        const raw = localStorage.getItem(`moakkil_encrypted_portal_${token}`);
        if (!raw || !window.crypto?.subtle) return null;
        const record = JSON.parse(raw);
        if (Date.now() - (record.savedAt || 0) > PORTAL_CACHE_TTL_MS) {
            localStorage.removeItem(`moakkil_encrypted_portal_${token}`);
            return null;
        }
        const fromB64 = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const salt = fromB64(record.salt);
        const iv = fromB64(record.iv);
        const cipher = fromB64(record.ciphertext);

        const key = await derivePortalKey(pin, token, salt);
        const plainBuf = await window.crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
        const parsed = JSON.parse(new TextDecoder().decode(plainBuf));
        return parsed.payload || null;
    } catch {
        return null;
    }
}

export const ClientPortalPage: React.FC = () => {
    const [searchParams] = useSearchParams();
    const urlToken = searchParams.get('token') || '';
    const { isDark, toggleDarkMode } = useTheme();

    const [tokenInput, setTokenInput] = useState(urlToken);
    const [caseNumberInput, setCaseNumberInput] = useState('');
    const [pinInput, setPinInput] = useState('');
    const [portalSessionToken, setPortalSessionToken] = useState<string | null>(
        sessionStorage.getItem(`moakkil_portal_session_${urlToken}`)
    );
    const [portalData, setPortalData] = useState<any | null>(null);
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState<'updates' | 'appts' | 'finance' | 'files'>('updates');

    // رفع النواقص
    const [missingFile, setMissingFile] = useState<File | null>(null);
    const [uploadingMissing, setUploadingMissing] = useState(false);

    // نافذة التوقيع الإلكتروني (Canvas + SHA-256)
    const [showSignModal, setShowSignModal] = useState(false);
    const [signingSub, setSigningSub] = useState(false);
    const signCanvasRef = useRef<HTMLCanvasElement>(null);
    const isDrawingRef = useRef(false);

    const fetchPortalData = async (tok: string, sessionTok: string, pinForCache?: string) => {
        const res = await fetch(`${API_BASE_URL}/api/public/client?token=${encodeURIComponent(tok)}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'x-portal-session-token': sessionTok,
            },
        });
        const data = await res.json();
        if (!res.ok || data.error) {
            throw new Error(data.error || 'انتهت صلاحية الجلسة أو تعذر جلب البيانات');
        }
        setPortalData(data);
        if (pinForCache) {
            await saveEncryptedPortalCache(tok, pinForCache, data);
        }
    };

    useEffect(() => {
        if (urlToken && portalSessionToken && !portalData) {
            fetchPortalData(urlToken, portalSessionToken).catch(() => {
                sessionStorage.removeItem(`moakkil_portal_session_${urlToken}`);
                setPortalSessionToken(null);
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [urlToken, portalSessionToken]);

    const handlePortalLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        const normalizedPin = normalizePin(pinInput);
        const cleanToken = tokenInput.trim();
        const cleanCaseNumber = caseNumberInput.trim();

        if (!normalizedPin || normalizedPin.length < 4) {
            Swal.fire('تنبيه', 'يرجى إدخال رمز الدخول السري (PIN) الصحيح.', 'warning');
            return;
        }
        if (!cleanToken && !cleanCaseNumber) {
            Swal.fire('تنبيه', 'يرجى فتح الرابط المرسل من مكتب المحاماة أو إدخال رقم ملف القضية.', 'warning');
            return;
        }

        setLoading(true);
        try {
            if (!navigator.onLine && cleanToken) {
                const cached = await loadEncryptedPortalCache(cleanToken, normalizedPin);
                if (cached) {
                    setPortalData(cached);
                    Swal.fire({
                        toast: true,
                        position: 'top-end',
                        icon: 'info',
                        title: 'تم فك تشفير النسخة المحلية (وضع عدم الاتصال)',
                        showConfirmButton: false,
                        timer: 3000,
                    });
                    return;
                }
                throw new Error('لا توجد نسخة مشفرة محفوظة لهذا الرمز، يرجى الاتصال بالإنترنت.');
            }

            const loginRes = await fetch(`${API_BASE_URL}/api/public/client/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    token: cleanToken || undefined,
                    case_number: cleanCaseNumber || undefined,
                    access_pin: normalizedPin,
                }),
            });

            const loginData = await loginRes.json();
            if (!loginRes.ok || loginData.error || !loginData.portal_session_token) {
                throw new Error(loginData.error || 'بيانات الدخول أو رمز الـ PIN غير صحيح');
            }

            const finalToken = loginData.public_token || cleanToken;
            setTokenInput(finalToken);
            setPortalSessionToken(loginData.portal_session_token);
            sessionStorage.setItem(`moakkil_portal_session_${finalToken}`, loginData.portal_session_token);

            await fetchPortalData(finalToken, loginData.portal_session_token, normalizedPin);
        } catch (err: any) {
            Swal.fire('رفض الدخول', err.message || 'تأكد من صحة رمز الـ PIN.', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handlePortalLogout = async () => {
        try {
            if (portalSessionToken && navigator.onLine) {
                await fetch(`${API_BASE_URL}/api/public/client/logout`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-portal-session-token': portalSessionToken,
                    },
                    body: JSON.stringify({
                        token: tokenInput,
                        portal_session_token: portalSessionToken,
                    }),
                });
            }
        } catch {
            // Ignore network error on logout
        } finally {
            if (tokenInput) {
                sessionStorage.removeItem(`moakkil_portal_session_${tokenInput}`);
                localStorage.removeItem(`moakkil_encrypted_portal_${tokenInput}`);
            }
            setPortalSessionToken(null);
            setPortalData(null);
            setPinInput('');
        }
    };

    // رفع الوثائق الناقصة عبر المسار الخادمي الجديد في الوركر
    const handleUploadMissingDoc = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!missingFile || !portalSessionToken || !tokenInput) {
            Swal.fire('تنبيه', 'يرجى اختيار المستند المطلوب أولاً', 'warning');
            return;
        }

        setUploadingMissing(true);
        try {
            const res = await fetch(
                `${API_BASE_URL}/api/public/client/upload-missing-doc?token=${encodeURIComponent(tokenInput)}`,
                {
                    method: 'POST',
                    headers: {
                        'x-portal-token': tokenInput,
                        'x-portal-session-token': portalSessionToken,
                        'x-file-name': encodeURIComponent(missingFile.name),
                        'Content-Type': missingFile.type || 'application/octet-stream',
                    },
                    body: missingFile,
                }
            );
            const data = await res.json();
            if (res.ok && data.success) {
                Swal.fire('تم الرفع بنجاح', 'وصل المستند إلى محاميك المسؤول وتم توثيقه في ملف القضية.', 'success');
                setMissingFile(null);
                await fetchPortalData(tokenInput, portalSessionToken);
            } else {
                throw new Error(data.error || 'تعذر رفع المستند');
            }
        } catch (err: any) {
            Swal.fire('خطأ', err.message, 'error');
        } finally {
            setUploadingMissing(false);
        }
    };

    // تحميل ملف محمي من R2 خاص بالموكل
    const handleDownloadClientFile = async (r2Key: string, fileName: string) => {
        if (!portalSessionToken || !tokenInput) return;
        try {
            Swal.fire({ title: 'جاري فك تشفير وتحميل المستند...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
            const res = await fetch(
                `${API_BASE_URL}/api/r2/download?key=${encodeURIComponent(r2Key)}&token=${encodeURIComponent(
                    tokenInput
                )}`,
                {
                    method: 'GET',
                    headers: {
                        'x-portal-session-token': portalSessionToken,
                    },
                }
            );
            if (!res.ok) throw new Error('تعذر تحميل الملف');
            const blob = await res.blob();
            Swal.close();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName || 'document';
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 60000);
        } catch (err: any) {
            Swal.fire('خطأ', err.message, 'error');
        }
    };

    // التوقيع الإلكتروني للموكل مع بصمة SHA-256
    const startSignDraw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
        const canvas = signCanvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        isDrawingRef.current = true;
        const rect = canvas.getBoundingClientRect();
        const x = ('touches' in e ? e.touches[0].clientX : e.clientX) - rect.left;
        const y = ('touches' in e ? e.touches[0].clientY : e.clientY) - rect.top;
        ctx.beginPath();
        ctx.moveTo(x, y);
    };

    const moveSignDraw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
        if (!isDrawingRef.current) return;
        const canvas = signCanvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const rect = canvas.getBoundingClientRect();
        const x = ('touches' in e ? e.touches[0].clientX : e.clientX) - rect.left;
        const y = ('touches' in e ? e.touches[0].clientY : e.clientY) - rect.top;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#0B132B';
        ctx.lineTo(x, y);
        ctx.stroke();
    };

    const stopSignDraw = () => {
        isDrawingRef.current = false;
    };

    const handleSubmitSignature = async () => {
        const canvas = signCanvasRef.current;
        if (!canvas || !portalSessionToken || !tokenInput) return;

        const { value: confirmPin } = await Swal.fire({
            title: 'تأكيد الهوية للتوقيع القانوني',
            text: 'أدخل رمز الدخول السري (PIN) الخاص بك لاعتماد التوقيع الرقمي:',
            input: 'password',
            showCancelButton: true,
            confirmButtonText: 'توقيع واعتماد',
            cancelButtonText: 'إلغاء',
        });
        if (!confirmPin) return;

        setSigningSub(true);
        try {
            const dataUrl = canvas.toDataURL('image/png');
            const msgBytes = new TextEncoder().encode(`${tokenInput}:${dataUrl}:${Date.now()}`);
            const hashBuf = await window.crypto.subtle.digest('SHA-256', msgBytes);
            const signatureHash = Array.from(new Uint8Array(hashBuf))
                .map((b) => b.toString(16).padStart(2, '0'))
                .join('');

            const res = await fetch(`${API_BASE_URL}/api/public/client/submit-signature`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-portal-session-token': portalSessionToken,
                },
                body: JSON.stringify({
                    token: tokenInput,
                    portal_session_token: portalSessionToken,
                    access_pin: normalizePin(confirmPin),
                    signature_data: dataUrl,
                    signature_hash: signatureHash,
                }),
            });
            const data = await res.json();
            if (res.ok && data.success) {
                Swal.fire(
                    'تم التوقيع والتوثيق',
                    `تم اعتماد توقيعك الإلكتروني ببصمة رقمية مشفرة:\n${signatureHash.substring(0, 16)}...`,
                    'success'
                );
                setShowSignModal(false);
                await fetchPortalData(tokenInput, portalSessionToken);
            } else {
                throw new Error(data.error || 'فشل إرسال التوقيع');
            }
        } catch (err: any) {
            Swal.fire('خطأ', err.message, 'error');
        } finally {
            setSigningSub(false);
        }
    };

    const caseInfo = portalData?.case || portalData || {};
    const updatesList: any[] = portalData?.updates || [];
    const apptsList: any[] = portalData?.appointments || [];
    const installmentsList: any[] = portalData?.installments || [];
    const filesList: any[] = portalData?.files || [];

    return (
        <div className="min-vh-100 pb-5">
            <div className="top-nav d-flex justify-content-between align-items-center px-3 py-3">
                <h5 className="mb-0 fw-bold text-white">
                    <i className="fas fa-balance-scale me-2" style={{ color: '#D4AF37' }}></i> بوابة الموكل الرقمية المشفرة
                </h5>
                <div className="d-flex gap-2">
                    <button
                        className="btn btn-sm btn-outline-light rounded-3 px-3"
                        onClick={toggleDarkMode}
                        title="تبديل الوضع الليلي"
                    >
                        <i className={`fas ${isDark ? 'fa-sun text-warning' : 'fa-moon'}`}></i>
                    </button>
                    {portalData && (
                        <button className="btn btn-sm btn-danger fw-bold rounded-3 px-3" onClick={handlePortalLogout}>
                            <i className="fas fa-sign-out-alt me-1"></i> خروج آمن
                        </button>
                    )}
                </div>
            </div>

            {!portalData ? (
                <div className="container mt-5" style={{ maxWidth: 460 }}>
                    <div className="card border-0 shadow-lg rounded-4 p-4 p-md-5 text-center border-top border-4 border-warning">
                        <div
                            className="mx-auto mb-3 rounded-circle d-flex align-items-center justify-content-center shadow"
                            style={{ width: 76, height: 76, background: '#0B132B', color: '#D4AF37' }}
                        >
                            <i className="fas fa-user-lock fa-2x"></i>
                        </div>
                        <h4 className="fw-bold text-navy mb-1">تسجيل دخول الموكل</h4>
                        <p className="text-muted small fw-bold mb-4">
                            أدخل رمز الدخول السري (PIN — أرقام أو أحرف) المدون في ملف قضيتك لمتابعة المستجدات والوثائق
                        </p>

                        <form onSubmit={handlePortalLogin} className="text-start">
                            {!urlToken && (
                                <div className="mb-3">
                                    <label className="form-label fw-bold small">رقم ملف القضية في المكتب</label>
                                    <input
                                        type="text"
                                        className="form-control form-control-lg font-monospace text-center fw-bold"
                                        dir="ltr"
                                        placeholder="مثال: CASE-2026-101"
                                        value={caseNumberInput}
                                        onChange={(e) => setCaseNumberInput(e.target.value)}
                                        required={!urlToken}
                                    />
                                </div>
                            )}

                            <div className="mb-4">
                                <label className="form-label fw-bold small">
                                    رمز الدخول السري (PIN — يقبل الأرقام والأحرف) *
                                </label>
                                <input
                                    type="text"
                                    autoCapitalize="characters"
                                    autoComplete="off"
                                    maxLength={12}
                                    className="form-control form-control-lg font-monospace text-center fw-bold fs-4"
                                    dir="ltr"
                                    placeholder="PIN CODE"
                                    style={{ letterSpacing: 4 }}
                                    value={pinInput}
                                    onChange={(e) => setPinInput(e.target.value.toUpperCase())}
                                    required
                                />
                            </div>

                            <button
                                type="submit"
                                className="btn btn-gold btn-lg w-100 fw-bold py-3 rounded-3"
                                disabled={loading}
                            >
                                {loading ? (
                                    <>
                                        <i className="fas fa-spinner fa-spin me-2"></i> جاري فك التشفير والتحقق...
                                    </>
                                ) : (
                                    <>
                                        <i className="fas fa-unlock me-2"></i> فتح ملف القضية المشفر
                                    </>
                                )}
                            </button>
                        </form>
                    </div>
                </div>
            ) : (
                <div className="container mt-4 fade-in">
                    {/* بطاقة معلومات القضية */}
                    <div className="card border-0 shadow-sm rounded-4 p-4 mb-4 border-top border-4 border-warning">
                        <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
                            <div>
                                <span className="badge bg-navy text-warning font-monospace mb-1">
                                    ملف رقم: {caseInfo.case_internal_id || '--'}
                                </span>
                                <h4 className="fw-bold text-navy mb-0">
                                    {caseInfo.case_type || 'قضية قانونية'} — ضد: {caseInfo.opponent_name || '--'}
                                </h4>
                            </div>
                            <span className="badge bg-success px-3 py-2 fs-6">
                                {caseInfo.current_stage || caseInfo.status || 'قيد المتابعة'}
                            </span>
                        </div>

                        <div className="row g-3 small fw-bold text-muted">
                            <div className="col-md-4">
                                <i className="fas fa-university text-warning me-1"></i> المحكمة:{' '}
                                <span className="text-dark">{caseInfo.current_court || '--'}</span>
                            </div>
                            <div className="col-md-4">
                                <i className="fas fa-hashtag text-primary me-1"></i> رقم الدعوى:{' '}
                                <span className="text-dark font-monospace">{caseInfo.court_case_number || '--'}</span>
                            </div>
                            <div className="col-md-4">
                                <i className="fas fa-layer-group text-success me-1"></i> درجة التقاضي:{' '}
                                <span className="text-dark">{caseInfo.litigation_degree || 'بداية'}</span>
                            </div>
                        </div>

                        {/* تنبيه النواقص أو التوقيع المطلوب */}
                        {(caseInfo.missing_docs_request || caseInfo.missing_documents) && (
                            <div className="alert alert-warning mt-3 mb-0 rounded-4">
                                <h6 className="fw-bold text-dark">
                                    <i className="fas fa-exclamation-triangle me-2"></i> مطلوب منك تزويد المكتب بالوثائق التالية:
                                </h6>
                                <p className="fw-bold mb-2">
                                    {caseInfo.missing_docs_request || caseInfo.missing_documents}
                                </p>
                                <form onSubmit={handleUploadMissingDoc} className="d-flex gap-2 flex-wrap">
                                    <input
                                        type="file"
                                        className="form-control form-control-sm w-auto flex-grow-1"
                                        onChange={(e) => setMissingFile(e.target.files?.[0] || null)}
                                        required
                                    />
                                    <button
                                        type="submit"
                                        className="btn btn-sm btn-dark fw-bold px-3"
                                        disabled={uploadingMissing}
                                    >
                                        {uploadingMissing ? 'جاري الرفع...' : 'رفع المستند للمكتب'}
                                    </button>
                                </form>
                            </div>
                        )}

                        {caseInfo.signature_request && (
                            <div className="alert alert-info mt-3 mb-0 rounded-4 d-flex justify-content-between align-items-center flex-wrap gap-2">
                                <div>
                                    <h6 className="fw-bold mb-1">
                                        <i className="fas fa-file-signature me-1"></i> طلب توقيع إلكتروني معتمد
                                    </h6>
                                    <small className="fw-bold">{caseInfo.signature_request}</small>
                                </div>
                                <button
                                    className="btn btn-primary fw-bold btn-sm px-3"
                                    onClick={() => setShowSignModal(true)}
                                >
                                    <i className="fas fa-pen-nib me-1"></i> التوقيع الآن
                                </button>
                            </div>
                        )}
                    </div>

                    {/* التبويبات */}
                    <ul className="nav nav-pills mb-4 gap-2">
                        <li className="nav-item">
                            <button
                                className={`nav-link fw-bold ${activeTab === 'updates' ? 'active' : 'bg-white border'}`}
                                onClick={() => setActiveTab('updates')}
                            >
                                <i className="fas fa-stream me-1"></i> المستجدات والجلسات ({updatesList.length})
                            </button>
                        </li>
                        <li className="nav-item">
                            <button
                                className={`nav-link fw-bold ${activeTab === 'appts' ? 'active' : 'bg-white border'}`}
                                onClick={() => setActiveTab('appts')}
                            >
                                <i className="fas fa-calendar-check me-1"></i> المواعيد القادمة ({apptsList.length})
                            </button>
                        </li>
                        <li className="nav-item">
                            <button
                                className={`nav-link fw-bold ${activeTab === 'finance' ? 'active' : 'bg-white border'}`}
                                onClick={() => setActiveTab('finance')}
                            >
                                <i className="fas fa-wallet me-1"></i> الكشف المالي
                            </button>
                        </li>
                        <li className="nav-item">
                            <button
                                className={`nav-link fw-bold ${activeTab === 'files' ? 'active' : 'bg-white border'}`}
                                onClick={() => setActiveTab('files')}
                            >
                                <i className="fas fa-folder-open me-1"></i> الوثائق المتاحة ({filesList.length})
                            </button>
                        </li>
                    </ul>

                    {activeTab === 'updates' && (
                        <div className="card border-0 shadow-sm rounded-4 p-4">
                            {updatesList.length === 0 ? (
                                <div className="text-center p-4 text-muted fw-bold">
                                    لا توجد مستجدات منشورة حالياً.
                                </div>
                            ) : (
                                updatesList.map((u: any) => (
                                    <div key={u.id} className="p-3 mb-3 border rounded-4 bg-light">
                                        <div className="d-flex justify-content-between align-items-center mb-2">
                                            <h6 className="fw-bold text-navy mb-0">{u.update_title || 'تحديث إجرائي'}</h6>
                                            <small className="text-muted font-monospace fw-bold">
                                                {u.hearing_date ||
                                                    (u.created_at
                                                        ? new Date(u.created_at).toLocaleDateString('ar-JO')
                                                        : '')}
                                            </small>
                                        </div>
                                        <p className="mb-0 fw-semibold">{u.update_details}</p>
                                    </div>
                                ))
                            )}
                        </div>
                    )}

                    {activeTab === 'appts' && (
                        <div className="card border-0 shadow-sm rounded-4 p-4">
                            {apptsList.length === 0 ? (
                                <div className="text-center p-4 text-muted fw-bold">لا توجد مواعيد مجدولة حالياً.</div>
                            ) : (
                                apptsList.map((a: any) => (
                                    <div
                                        key={a.id}
                                        className="d-flex justify-content-between align-items-center p-3 mb-2 border rounded-3"
                                    >
                                        <div>
                                            <h6 className="fw-bold text-navy mb-1">{a.title}</h6>
                                            <small className="text-muted font-monospace fw-bold">
                                                {a.appt_date ? new Date(a.appt_date).toLocaleString('ar-JO') : '--'}
                                            </small>
                                        </div>
                                        <span className="badge bg-primary">{a.status || 'مجدول'}</span>
                                    </div>
                                ))
                            )}
                        </div>
                    )}

                    {activeTab === 'finance' && (
                        <div className="card border-0 shadow-sm rounded-4 p-4">
                            <div className="row g-3 text-center mb-4">
                                <div className="col-4">
                                    <div className="p-3 border rounded-3 bg-light">
                                        <small className="text-muted fw-bold d-block">الأتعاب المتفق عليها</small>
                                        <strong className="fs-5 text-navy font-monospace">
                                            {Number(caseInfo.total_agreed_fees || 0).toLocaleString()} د.أ
                                        </strong>
                                    </div>
                                </div>
                                <div className="col-4">
                                    <div className="p-3 border rounded-3 bg-light">
                                        <small className="text-muted fw-bold d-block">المدفوع</small>
                                        <strong className="fs-5 text-success font-monospace">
                                            {Number(caseInfo.total_paid || 0).toLocaleString()} د.أ
                                        </strong>
                                    </div>
                                </div>
                                <div className="col-4">
                                    <div className="p-3 border rounded-3 bg-light">
                                        <small className="text-muted fw-bold d-block">المتبقي</small>
                                        <strong className="fs-5 text-danger font-monospace">
                                            {Math.max(
                                                0,
                                                Number(caseInfo.total_agreed_fees || 0) -
                                                    Number(caseInfo.total_paid || 0)
                                            ).toLocaleString()}{' '}
                                            د.أ
                                        </strong>
                                    </div>
                                </div>
                            </div>

                            <h6 className="fw-bold text-navy mb-3">سجل الدفعات والأقساط</h6>
                            {installmentsList.length === 0 ? (
                                <div className="text-center p-3 text-muted fw-bold">لا توجد دفعات مسجلة.</div>
                            ) : (
                                installmentsList.map((inst: any) => (
                                    <div
                                        key={inst.id}
                                        className="d-flex justify-content-between align-items-center p-2 mb-2 border rounded-3"
                                    >
                                        <span className="fw-bold font-monospace">
                                            {Number(inst.amount || 0).toLocaleString()} د.أ
                                        </span>
                                        <small className="text-muted font-monospace">
                                            {inst.due_date ||
                                                (inst.created_at
                                                    ? new Date(inst.created_at).toLocaleDateString('ar-JO')
                                                    : '')}
                                        </small>
                                        <span
                                            className={`badge ${
                                                inst.status === 'مدفوعة' ? 'bg-success' : 'bg-warning text-dark'
                                            }`}
                                        >
                                            {inst.status || 'مدفوعة'}
                                        </span>
                                    </div>
                                ))
                            )}
                        </div>
                    )}

                    {activeTab === 'files' && (
                        <div className="card border-0 shadow-sm rounded-4 p-4">
                            {filesList.length === 0 ? (
                                <div className="text-center p-4 text-muted fw-bold">
                                    لا توجد وثائق متاحة للتحميل حالياً.
                                </div>
                            ) : (
                                filesList.map((f: any) => (
                                    <div
                                        key={f.id}
                                        className="d-flex justify-content-between align-items-center p-3 mb-2 border rounded-3"
                                    >
                                        <span className="fw-bold text-navy">{f.file_name}</span>
                                        <button
                                            className="btn btn-sm btn-gold fw-bold"
                                            onClick={() =>
                                                handleDownloadClientFile(f.file_url || f.drive_file_id, f.file_name)
                                            }
                                        >
                                            <i className="fas fa-download me-1"></i> تحميل آمن
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* نافذة التوقيع الإلكتروني للموكل */}
            {showSignModal && (
                <div
                    className="modal fade show d-block"
                    style={{ background: 'rgba(11,19,43,0.65)', zIndex: 1055 }}
                >
                    <div className="modal-dialog modal-dialog-centered">
                        <div className="modal-content rounded-4 border-0 shadow-lg">
                            <div className="modal-header bg-navy text-white">
                                <h5 className="modal-title fw-bold">اعتماد التوقيع الإلكتروني المشفر (SHA-256)</h5>
                                <button
                                    type="button"
                                    className="btn-close btn-close-white"
                                    onClick={() => setShowSignModal(false)}
                                ></button>
                            </div>
                            <div className="modal-body p-4 text-center">
                                <p className="small fw-bold text-muted mb-3">
                                    يرجى التوقيع داخل الإطار أدناه؛ سيتم ختم التوقيع ببصمة تشفيرية غير قابلة للتعديل.
                                </p>
                                <canvas
                                    ref={signCanvasRef}
                                    width={400}
                                    height={200}
                                    style={{
                                        border: '2px dashed #0B132B',
                                        borderRadius: 12,
                                        background: '#fff',
                                        touchAction: 'none',
                                        maxWidth: '100%',
                                    }}
                                    onMouseDown={startSignDraw}
                                    onMouseMove={moveSignDraw}
                                    onMouseUp={stopSignDraw}
                                    onMouseLeave={stopSignDraw}
                                    onTouchStart={startSignDraw}
                                    onTouchMove={moveSignDraw}
                                    onTouchEnd={stopSignDraw}
                                />
                            </div>
                            <div className="modal-footer justify-content-between">
                                <button
                                    type="button"
                                    className="btn btn-outline-danger fw-bold"
                                    onClick={() => {
                                        const c = signCanvasRef.current;
                                        c?.getContext('2d')?.clearRect(0, 0, c.width, c.height);
                                    }}
                                >
                                    مسح
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-success fw-bold px-4"
                                    onClick={handleSubmitSignature}
                                    disabled={signingSub}
                                >
                                    {signingSub ? 'جاري التوثيق...' : 'اعتماد وإرسال التوقيع'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
