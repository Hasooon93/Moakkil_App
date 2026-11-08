/**
 * ============================================================================
 * نظام موكّل (Moakkil System) - 2026
 * الملف: src/features/library/LibraryPage.tsx
 * الوصف: المحرك الشامل للمكتبة القانونية (Quill.js Smart Editor + Cloud Archive R2 +
 *        HTML5 Canvas Signature + Scoped Drafts Engine + Scoped Action MFA Delete)
 * مطابق 100% لملف library.html + js/library.js
 * ============================================================================
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import { MoakkilAPI } from '../../services/moakkilApi.service';
import { AuthService } from '../../services/auth.service';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { STORAGE_KEYS, UTILS } from '../../config/constants';
import { BottomNav } from '../../components/layout/BottomNav';

export const LibraryPage: React.FC = () => {
    const navigate = useNavigate();
    const { user, isOnline } = useAuth();
    const { isDark, toggleDarkMode } = useTheme();

    const [clientsList, setClientsList] = useState<any[]>([]);
    const [casesList, setCasesList] = useState<any[]>([]);
    const [selectedTemplate, setSelectedTemplate] = useState('');
    const [selectedClientId, setSelectedClientId] = useState('');
    const [selectedCaseId, setSelectedCaseId] = useState('');
    const [rawTemplateText, setRawTemplateText] = useState('');

    // أرشيف المكتبة السحابي والمسودات
    const [archiveFiles, setArchiveFiles] = useState<any[]>([]);
    const [draftsList, setDraftsList] = useState<any[]>([]);
    const [currentCategory, setCurrentCategory] = useState<'مسودات' | 'عقود' | 'وكالات' | 'لوائح' | 'قوانين'>('عقود');
    const [searchTerm, setSearchTerm] = useState('');
    const [loadingArchive, setLoadingArchive] = useState(true);

    // نافذة رفع نموذج سحابي
    const [showUploadModal, setShowUploadModal] = useState(false);
    const [tplFile, setTplFile] = useState<File | null>(null);
    const [tplTitle, setTplTitle] = useState('');
    const [tplCategory, setTplCategory] = useState('عقود');
    const [uploadingTpl, setUploadingTpl] = useState(false);

    // نافذة التوقيع الرقمي (Canvas)
    const [showSignatureModal, setShowSignatureModal] = useState(false);
    const signatureCanvasRef = useRef<HTMLCanvasElement>(null);
    const isDrawingRef = useRef(false);

    // محرر Quill.js
    const editorContainerRef = useRef<HTMLDivElement>(null);
    const quillRef = useRef<any>(null);

    // مفتاح المسودات المعزول بحسب المكتب والمستخدم
    const getDraftsStorageKey = useCallback(() => {
        const uid = user?.id || 'default';
        const firmId = user?.firm_id || localStorage.getItem(STORAGE_KEYS.FIRM_ID) || 'firm';
        const scopedKey = `moakkil_drafts_${firmId}_${uid}`;
        const legacy = localStorage.getItem('moakkil_drafts');
        if (legacy && !localStorage.getItem(scopedKey)) {
            localStorage.setItem(scopedKey, legacy);
            localStorage.removeItem('moakkil_drafts');
        }
        return scopedKey;
    }, [user]);

    const loadLocalDrafts = useCallback(() => {
        const key = getDraftsStorageKey();
        try {
            setDraftsList(JSON.parse(localStorage.getItem(key) || '[]'));
        } catch {
            setDraftsList([]);
        }
    }, [getDraftsStorageKey]);

    const loadArchiveFiles = useCallback(async () => {
        setLoadingArchive(true);
        try {
            const res = await MoakkilAPI.getFiles('case_id=is.null&client_id=is.null');
            if (Array.isArray(res)) {
                setArchiveFiles(res.filter((f) => !f.is_deleted));
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoadingArchive(false);
        }
    }, []);

    // تهيئة محرر Quill.js وجلب البيانات
    useEffect(() => {
        const Quill = (window as any).Quill;
        if (editorContainerRef.current && Quill && !quillRef.current) {
            quillRef.current = new Quill(editorContainerRef.current, {
                theme: 'snow',
                placeholder: 'ابدأ بكتابة المستند القانوني هنا...',
                modules: {
                    toolbar: [
                        [{ header: [1, 2, 3, false] }],
                        [{ align: [] }],
                        ['bold', 'italic', 'underline'],
                        [{ list: 'ordered' }, { list: 'bullet' }],
                        [{ color: [] }, { background: [] }],
                        ['clean'],
                    ],
                },
            });
        }

        Promise.all([MoakkilAPI.getClients(), MoakkilAPI.getCases()]).then(([clRes, caRes]) => {
            if (Array.isArray(clRes)) setClientsList(clRes.filter((c) => !c.is_deleted));
            if (Array.isArray(caRes)) setCasesList(caRes.filter((c) => !c.is_deleted));
        });

        loadArchiveFiles();
        loadLocalDrafts();
    }, [loadArchiveFiles, loadLocalDrafts]);

    // استبدال المتغيرات التلقائي في المحرر
    useEffect(() => {
        if (!rawTemplateText || !quillRef.current) return;

        const clientData = clientsList.find((c) => String(c.id) === String(selectedClientId)) || {};
        const caseData = casesList.find((c) => String(c.id) === String(selectedCaseId)) || {};
        const firmSettings = JSON.parse(localStorage.getItem(STORAGE_KEYS.FIRM_SETTINGS) || '{}');

        const dict: Record<string, string> = {
            '{{date}}': new Date().toLocaleDateString('ar-JO'),
            '{{firm_name}}': UTILS.escapeHTML(firmSettings.firm_name || user?.firm_name || 'مكتب المحاماة'),
            '{{client_name}}': UTILS.escapeHTML(clientData.full_name || '________________'),
            '{{national_id}}': UTILS.escapeHTML(clientData.national_id || '________________'),
            '{{client_phone}}': UTILS.escapeHTML(clientData.phone || '________________'),
            '{{opponent_name}}': UTILS.escapeHTML(caseData.opponent_name || '________________'),
            '{{court_name}}': UTILS.escapeHTML(caseData.current_court || '________________'),
        };

        let processed = rawTemplateText;
        for (const key in dict) {
            processed = processed.replace(new RegExp(key, 'g'), dict[key]);
        }
        quillRef.current.clipboard.dangerouslyPasteHTML(processed);
    }, [rawTemplateText, selectedClientId, selectedCaseId, clientsList, casesList, user]);

    const handleTemplateSelect = (type: string) => {
        setSelectedTemplate(type);
        if (!type) {
            setRawTemplateText('');
            quillRef.current?.setText('');
            return;
        }
        const templates: Record<string, string> = {
            contract: `<h2 class="ql-align-center">عقد أتعاب محاماة</h2><p><br></p><p>تم الاتفاق في هذا اليوم الموافق {{date}} بين كل من:</p><p>الطرف الأول (المحامي): مكتب {{firm_name}}.</p><p>الطرف الثاني (الموكل): السيد/ة {{client_name}}، يحمل رقم وطني: {{national_id}}، ورقم هاتف: {{client_phone}}.</p><p><br></p><p><strong>موضوع العقد:</strong></p><p>وكل الطرف الثاني الطرف الأول بتمثيله في القضية المرفوعة ضد {{opponent_name}} لدى محكمة {{court_name}}.</p><p><br></p><p><strong>توقيع الموكل:</strong></p><p><br></p>`,
            notice: `<h2 class="ql-align-center">إنذار عدلي</h2><p><br></p><p>بواسطة كاتب عدل محكمة {{court_name}} الأكرم.</p><p><strong>المنذر:</strong> {{client_name}} - الرقم الوطني: {{national_id}}.</p><p><strong>المنذر إليه:</strong> {{opponent_name}}.</p><p><br></p><p><strong>وقائع الإنذار:</strong></p><p>...</p>`,
            plea: `<h2 class="ql-align-center">لائحة دعوى</h2><p><br></p><p>لدى محكمة {{court_name}} الموقرة.</p><p><strong>المدعي:</strong> {{client_name}}.</p><p><strong>المدعى عليه:</strong> {{opponent_name}}.</p><p><br></p><p><strong>الوقائع:</strong></p><p>...</p><p><br></p><p><strong>الطلبات:</strong></p><p>...</p>`,
        };
        setRawTemplateText(templates[type] || '');
    };

    const handleSaveDraft = () => {
        if (!quillRef.current) return;
        const plainText = quillRef.current.getText().trim();
        if (!plainText) {
            Swal.fire('تنبيه', 'المحرر فارغ، لا يوجد شيء لحفظه.', 'warning');
            return;
        }
        const content = quillRef.current.root.innerHTML;
        let previewTitle = plainText.split('\n')[0].substring(0, 30);
        if (previewTitle.length < 3) previewTitle = 'مسودة مستند قانوني';

        const key = getDraftsStorageKey();
        const existing = JSON.parse(localStorage.getItem(key) || '[]');
        existing.unshift({
            id: 'draft_' + Date.now(),
            title: previewTitle + '...',
            content,
            created_at: new Date().toISOString(),
        });
        localStorage.setItem(key, JSON.stringify(existing));
        setDraftsList(existing);

        Swal.fire({
            icon: 'success',
            title: 'تم حفظ المسودة',
            text: 'تم الحفظ محلياً بأمان. يمكنك استكمال التحرير لاحقاً من تبويب (مسوداتي).',
            timer: 2500,
            showConfirmButton: false,
        });
    };

    const handleLoadDraft = (draft: any) => {
        if (!quillRef.current) return;
        quillRef.current.root.innerHTML = draft.content;
        window.scrollTo({ top: 0, behavior: 'smooth' });
        Swal.fire({
            icon: 'success',
            title: 'تم جلب المسودة',
            timer: 1500,
            showConfirmButton: false,
        });
    };

    const handleDeleteDraft = async (id: string) => {
        const res = await Swal.fire({
            title: 'هل أنت متأكد؟',
            text: 'سيتم حذف هذه المسودة المحلية نهائياً.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            confirmButtonText: 'نعم، احذف',
            cancelButtonText: 'تراجع',
        });
        if (!res.isConfirmed) return;
        const key = getDraftsStorageKey();
        const next = draftsList.filter((d) => d.id !== id);
        localStorage.setItem(key, JSON.stringify(next));
        setDraftsList(next);
    };

    // لوحة التوقيع الرقمي (Canvas)
    const startCanvasDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
        const canvas = signatureCanvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        isDrawingRef.current = true;
        const rect = canvas.getBoundingClientRect();
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
        ctx.beginPath();
        ctx.moveTo(clientX - rect.left, clientY - rect.top);
    };

    const drawOnCanvas = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
        if (!isDrawingRef.current) return;
        const canvas = signatureCanvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const rect = canvas.getBoundingClientRect();
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#000080';
        ctx.lineTo(clientX - rect.left, clientY - rect.top);
        ctx.stroke();
    };

    const stopCanvasDrawing = () => {
        isDrawingRef.current = false;
    };

    const clearSignature = () => {
        const canvas = signatureCanvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
    };

    const insertSignatureIntoEditor = () => {
        const canvas = signatureCanvasRef.current;
        const Quill = (window as any).Quill;
        if (!canvas || !quillRef.current || !Quill) return;

        const dataUrl = canvas.toDataURL('image/png');
        const range = quillRef.current.getSelection(true);
        const idx = range ? range.index : quillRef.current.getLength();
        quillRef.current.insertText(idx, '\n', Quill.sources.USER);
        quillRef.current.insertEmbed(idx + 1, 'image', dataUrl, Quill.sources.USER);

        setShowSignatureModal(false);
        Swal.fire({
            icon: 'success',
            title: 'تم الإدراج',
            text: 'تم إدراج التوقيع الرقمي بنجاح في المستند.',
            timer: 1500,
            showConfirmButton: false,
        });
    };

    // الرفع السحابي لنموذج جديد
    const handleUploadTemplate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!isOnline) {
            Swal.fire('تنبيه', 'لا يمكن رفع النماذج السحابية أثناء انقطاع الإنترنت.', 'warning');
            return;
        }
        if (!tplFile) {
            Swal.fire('تنبيه', 'الرجاء اختيار ملف', 'warning');
            return;
        }

        setUploadingTpl(true);
        try {
            const uploadRes = await MoakkilAPI.uploadFileToR2(tplFile, 'general', 'general');
            if (uploadRes && uploadRes.success && uploadRes.r2_key) {
                const smartDescription = `${tplCategory}:::${tplTitle.trim() || tplFile.name}`;
                const recordData = {
                    case_id: null,
                    client_id: null,
                    file_name: tplFile.name,
                    file_type: tplFile.type || 'application/octet-stream',
                    file_extension: tplFile.name.includes('.') ? tplFile.name.split('.').pop()?.toLowerCase() : '',
                    file_category: tplCategory,
                    file_url: uploadRes.r2_key,
                    drive_file_id: uploadRes.r2_key,
                    is_template: true,
                    description: smartDescription,
                };

                const dbRes = await MoakkilAPI.addFileRecord(recordData);
                if (dbRes && !dbRes.error) {
                    Swal.fire('تم بنجاح', 'تم أرشفة النموذج السحابي بنجاح', 'success');
                    setShowUploadModal(false);
                    setTplFile(null);
                    setTplTitle('');
                    await loadArchiveFiles();
                } else {
                    await MoakkilAPI.cleanupOrphanR2File(uploadRes.r2_key);
                    throw new Error(dbRes?.error || 'فشل توثيق النموذج في قاعدة البيانات');
                }
            } else {
                throw new Error('فشل الرفع السحابي');
            }
        } catch (err: any) {
            Swal.fire('خطأ', err.message, 'error');
        } finally {
            setUploadingTpl(false);
        }
    };

    // الحذف الآمن لنموذج سحابي عبر Scoped Action MFA
    const handleDeleteArchiveFile = async (fileObj: any) => {
        if (!isOnline) {
            Swal.fire('تنبيه', 'لا يمكن حذف النماذج السحابية في وضع عدم الاتصال (Offline).', 'warning');
            return;
        }

        const confirm = await Swal.fire({
            title: 'هل أنت متأكد؟',
            text: 'سيتم حذف هذا النموذج من المكتبة المشتركة وتوثيق العملية في سجل الرقابة.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            confirmButtonText: 'نعم، متابعة للتحقق الأمني',
            cancelButtonText: 'تراجع',
        });
        if (!confirm.isConfirmed) return;

        try {
            const tplName = fileObj.description?.split(':::')[1] || fileObj.file_name || 'نموذج سحابي';
            const actionToken = await AuthService.requireActionMFA(
                `حذف النموذج السحابي (${tplName})`,
                'mo_files',
                String(fileObj.id)
            );
            if (!actionToken) return;

            Swal.fire({ title: 'جاري الحذف...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
            const res = await MoakkilAPI.deleteFile(String(fileObj.id), actionToken);
            if (res && !res.error) {
                Swal.fire('تم الحذف', 'تم حذف النموذج من الأرشيف بنجاح وتسجيل حركتك في السجل الأمني.', 'success');
                await loadArchiveFiles();
            } else {
                throw new Error(res?.error || 'خطأ أثناء حذف النموذج');
            }
        } catch (err: any) {
            if (err.message?.includes('إلغاء')) return;
            Swal.fire('مرفوض أمنياً', err.message || 'تعذر إتمام عملية الحذف.', 'error');
        }
    };

    // فلترة القوالب السحابية
    const processedArchiveFiles = archiveFiles
        .map((f) => {
            let cat = f.file_category || 'عقود';
            let desc = f.description || f.file_name || '';
            if (f.description && f.description.includes(':::')) {
                const parts = f.description.split(':::');
                cat = parts[0];
                desc = parts[1];
            }
            return { ...f, ext_category: cat, display_desc: desc };
        })
        .filter((f) => {
            const q = searchTerm.toLowerCase();
            return (
                f.ext_category === currentCategory &&
                ((f.file_name || '').toLowerCase().includes(q) || (f.display_desc || '').toLowerCase().includes(q))
            );
        });

    const filteredDrafts = draftsList.filter((d) =>
        (d.title || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="min-vh-100 pb-5 mb-5">
            <div className="top-nav d-flex align-items-center justify-content-between px-3 py-3 d-print-none">
                <div className="d-flex align-items-center">
                    <button
                        className="btn btn-link text-white p-0 text-decoration-none me-3"
                        onClick={() => navigate('/app.html')}
                    >
                        <i className="fas fa-arrow-right fs-4"></i>
                    </button>
                    <h5 className="mb-0 fw-bold text-white">
                        <i className="fas fa-book me-2" style={{ color: '#D4AF37' }}></i> المكتبة والنماذج
                    </h5>
                </div>
                <div className="d-flex align-items-center gap-2">
                    <button
                        className="btn btn-sm btn-outline-light text-white fw-bold rounded-3 px-3 shadow-sm"
                        onClick={toggleDarkMode}
                        title="تبديل الوضع الليلي"
                    >
                        <i className={`fas ${isDark ? 'fa-sun text-warning' : 'fa-moon'}`}></i>
                    </button>
                    <button
                        className="btn btn-gold shadow-sm fw-bold"
                        onClick={() => setShowUploadModal(true)}
                    >
                        <i className="fas fa-cloud-upload-alt"></i>{' '}
                        <span className="d-none d-sm-inline">أرشفة نموذج</span>
                    </button>
                </div>
            </div>

            <div className="container mt-4 fade-in">
                <div
                    className="alert border-0 shadow-sm fw-bold mb-4 d-flex align-items-center rounded-4 d-print-none"
                    style={{
                        background: 'rgba(212, 175, 55, 0.08)',
                        borderRight: '4px solid #D4AF37',
                    }}
                >
                    <i className="fas fa-info-circle fs-4 me-3" style={{ color: '#D4AF37' }}></i>
                    هذه المكتبة السحابية (R2) مشتركة. جميع النماذج، اللوائح، والتشريعات المضافة هنا متاحة لجميع أفراد
                    المكتب لتسهيل وسرعة الإنجاز.
                </div>

                {/* المحرر الذكي (Quill.js Smart Editor) */}
                <div id="smart-editor-section" className="card border-0 shadow-sm rounded-4 overflow-hidden mb-5">
                    <div
                        className="p-3 text-white d-flex justify-content-between align-items-center d-print-none"
                        style={{ background: 'linear-gradient(135deg, #0B132B, #1C2541)' }}
                    >
                        <h6 className="mb-0 fw-bold">
                            <i className="fas fa-magic me-2 text-warning"></i> صياغة العقود والنماذج الذكية
                        </h6>
                    </div>

                    <div className="p-3 bg-light border-bottom d-print-none">
                        <div className="row g-2">
                            <div className="col-md-3 col-6">
                                <label className="form-label small mb-1 text-muted fw-bold">القالب الجاهز</label>
                                <select
                                    className="form-select form-select-sm fw-bold"
                                    value={selectedTemplate}
                                    onChange={(e) => handleTemplateSelect(e.target.value)}
                                >
                                    <option value="">-- اختر قالباً --</option>
                                    <option value="contract">عقد أتعاب محاماة</option>
                                    <option value="notice">إنذار عدلي</option>
                                    <option value="plea">لائحة دعوى (فارغة)</option>
                                </select>
                            </div>
                            <div className="col-md-3 col-6">
                                <label className="form-label small mb-1 text-muted fw-bold">
                                    سحب الموكل (استبدال آلي)
                                </label>
                                <select
                                    className="form-select form-select-sm fw-bold"
                                    value={selectedClientId}
                                    onChange={(e) => setSelectedClientId(e.target.value)}
                                >
                                    <option value="">-- اختر الموكل --</option>
                                    {clientsList.map((c) => (
                                        <option key={c.id} value={c.id}>
                                            {c.full_name} ({c.national_id || 'بدون رقم'})
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="col-md-3 col-6">
                                <label className="form-label small mb-1 text-muted fw-bold">
                                    سحب القضية (اختياري)
                                </label>
                                <select
                                    className="form-select form-select-sm fw-bold"
                                    value={selectedCaseId}
                                    onChange={(e) => setSelectedCaseId(e.target.value)}
                                >
                                    <option value="">-- اختر القضية --</option>
                                    {casesList.map((ca) => (
                                        <option key={ca.id} value={ca.id}>
                                            {ca.case_internal_id || 'ملف'} - {ca.opponent_name || 'بدون خصم'}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="col-md-3 col-6 d-flex align-items-end gap-1">
                                <button
                                    type="button"
                                    className="btn btn-secondary flex-grow-1 fw-bold btn-sm py-2"
                                    onClick={handleSaveDraft}
                                >
                                    <i className="fas fa-save me-1"></i> مسودة
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-warning flex-grow-1 fw-bold btn-sm py-2"
                                    onClick={() => setShowSignatureModal(true)}
                                >
                                    <i className="fas fa-pen-nib me-1"></i> توقيع
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-success flex-grow-1 fw-bold btn-sm py-2"
                                    onClick={() => window.print()}
                                >
                                    <i className="fas fa-print me-1"></i> تصدير
                                </button>
                            </div>
                        </div>
                    </div>

                    <div ref={editorContainerRef} style={{ height: 380, fontFamily: 'Cairo, sans-serif' }} />
                </div>

                {/* أرشيف المكتبة السحابي */}
                <div className="d-print-none">
                    <h5 className="fw-bold mb-3 text-navy">
                        <i className="fas fa-archive me-2 text-muted"></i> أرشيف المكتبة السحابي
                    </h5>

                    <div className="d-flex gap-2 overflow-auto pb-2 mb-4">
                        {(['مسودات', 'عقود', 'وكالات', 'لوائح', 'قوانين'] as const).map((cat) => (
                            <button
                                key={cat}
                                className={`btn fw-bold rounded-3 px-4 flex-shrink-0 ${
                                    currentCategory === cat ? 'btn-gold' : 'btn-light border'
                                }`}
                                onClick={() => setCurrentCategory(cat)}
                            >
                                {cat === 'مسودات' ? 'مسوداتي (Drafts)' : cat === 'قوانين' ? 'تشريعات' : cat}
                            </button>
                        ))}
                    </div>

                    <div className="mb-4 position-relative">
                        <input
                            type="text"
                            className="form-control form-control-lg rounded-4 pe-5 fw-bold shadow-sm"
                            placeholder="البحث الذكي عن نموذج، وكالة، قانون أو مسودة..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                        <i
                            className="fas fa-search position-absolute top-50 translate-middle-y"
                            style={{ right: 20, color: '#D4AF37' }}
                        ></i>
                    </div>

                    {currentCategory === 'مسودات' ? (
                        <div className="row g-4">
                            {filteredDrafts.length === 0 ? (
                                <div className="col-12 text-center py-5 text-muted fw-bold">
                                    <i className="fas fa-edit fa-3x mb-3 opacity-50"></i>
                                    <h5>لا توجد مسودات محلية محفوظة.</h5>
                                </div>
                            ) : (
                                filteredDrafts.map((d) => (
                                    <div key={d.id} className="col-md-6 col-lg-4">
                                        <div className="card border-0 shadow-sm rounded-4 p-4 h-100 d-flex flex-column">
                                            <h6 className="fw-bold text-navy mb-1">{d.title}</h6>
                                            <small className="text-muted fw-bold mb-3">
                                                {new Date(d.created_at).toLocaleString('ar-EG')}
                                            </small>
                                            <div className="mt-auto pt-3 border-top d-flex gap-2">
                                                <button
                                                    className="btn btn-primary flex-grow-1 fw-bold"
                                                    onClick={() => handleLoadDraft(d)}
                                                >
                                                    <i className="fas fa-edit me-1"></i> إكمال التحرير
                                                </button>
                                                <button
                                                    className="btn btn-outline-danger px-3"
                                                    onClick={() => handleDeleteDraft(d.id)}
                                                >
                                                    <i className="fas fa-trash"></i>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    ) : loadingArchive ? (
                        <div className="text-center p-5 bg-white rounded-4 border shadow-sm">
                            <i className="fas fa-spinner fa-spin fa-3x mb-3" style={{ color: '#D4AF37' }}></i>
                            <h5 className="fw-bold text-navy">جاري جلب ملفات المكتبة...</h5>
                        </div>
                    ) : processedArchiveFiles.length === 0 ? (
                        <div className="text-center py-5 text-muted fw-bold">
                            <i className="fas fa-folder-open fa-3x mb-3 opacity-50"></i>
                            <h5>لا توجد ملفات سحابية في قسم ({currentCategory}) مطابقة للبحث.</h5>
                        </div>
                    ) : (
                        <div className="row g-4">
                            {processedArchiveFiles.map((f) => {
                                const fileKey = f.file_url || f.gdrive_file_id || f.drive_file_id || '';
                                return (
                                    <div key={f.id} className="col-md-6 col-lg-4">
                                        <div
                                            className="card border-0 shadow-sm rounded-4 p-4 h-100 d-flex flex-column"
                                            style={{ borderRight: '5px solid #D4AF37' }}
                                        >
                                            <h6 className="fw-bold text-navy mb-1">{f.display_desc}</h6>
                                            <small className="text-muted fw-bold mb-3">
                                                أضيف في:{' '}
                                                {f.created_at
                                                    ? new Date(f.created_at).toLocaleDateString('ar-EG')
                                                    : '--'}
                                            </small>
                                            <div className="mt-auto pt-3 border-top d-flex gap-2">
                                                <button
                                                    className="btn btn-gold flex-grow-1 fw-bold"
                                                    onClick={() =>
                                                        MoakkilAPI.downloadR2File(fileKey, f.file_name || 'document')
                                                    }
                                                >
                                                    <i className="fas fa-download me-1"></i> تحميل
                                                </button>
                                                <button
                                                    className="btn btn-outline-danger px-3"
                                                    onClick={() => handleDeleteArchiveFile(f)}
                                                >
                                                    <i className="fas fa-trash"></i>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* نافذة أرشفة نموذج جديد */}
            {showUploadModal && (
                <div
                    className="modal fade show d-block"
                    style={{ background: 'rgba(11,19,43,0.65)', zIndex: 1055 }}
                >
                    <div className="modal-dialog modal-dialog-centered">
                        <div className="modal-content rounded-4 border-0 shadow-lg">
                            <div
                                className="modal-header text-white"
                                style={{ background: '#0B132B', borderBottom: '3px solid #D4AF37' }}
                            >
                                <h5 className="modal-title fw-bold">
                                    <i className="fas fa-cloud-upload-alt me-2" style={{ color: '#D4AF37' }}></i> أرشفة
                                    نموذج مرجعي جديد
                                </h5>
                                <button
                                    type="button"
                                    className="btn-close btn-close-white"
                                    onClick={() => setShowUploadModal(false)}
                                ></button>
                            </div>
                            <div className="modal-body p-4">
                                <form onSubmit={handleUploadTemplate}>
                                    <div className="mb-3">
                                        <label className="form-label fw-bold">اختر الملف (PDF, DOC, DOCX) *</label>
                                        <input
                                            type="file"
                                            className="form-control"
                                            accept=".pdf,.doc,.docx"
                                            onChange={(e) => setTplFile(e.target.files?.[0] || null)}
                                            required
                                        />
                                    </div>
                                    <div className="mb-3">
                                        <label className="form-label fw-bold">عنوان المرجع / التشريع *</label>
                                        <input
                                            type="text"
                                            className="form-control"
                                            placeholder="مثال: نموذج عقد عمل محدد المدة..."
                                            value={tplTitle}
                                            onChange={(e) => setTplTitle(e.target.value)}
                                            required
                                        />
                                    </div>
                                    <div className="mb-4">
                                        <label className="form-label fw-bold">التصنيف القانوني *</label>
                                        <select
                                            className="form-select fw-bold"
                                            value={tplCategory}
                                            onChange={(e) => setTplCategory(e.target.value)}
                                        >
                                            <option value="عقود">عقود واتفاقيات جاهزة</option>
                                            <option value="وكالات">نماذج وكالات قانونية</option>
                                            <option value="لوائح">لوائح ومذكرات دفاع</option>
                                            <option value="قوانين">نصوص قانونية / تشريعات</option>
                                        </select>
                                    </div>
                                    <button
                                        type="submit"
                                        className="btn btn-gold w-100 py-3 fw-bold"
                                        disabled={uploadingTpl}
                                    >
                                        {uploadingTpl ? (
                                            <>
                                                <i className="fas fa-spinner fa-spin me-2"></i> جاري الرفع للسحابة...
                                            </>
                                        ) : (
                                            <>
                                                <i className="fas fa-save me-2"></i> رفع وحفظ في المكتبة
                                            </>
                                        )}
                                    </button>
                                </form>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* نافذة التوقيع الحي (Canvas Signature) */}
            {showSignatureModal && (
                <div
                    className="modal fade show d-block"
                    style={{ background: 'rgba(11,19,43,0.65)', zIndex: 1055 }}
                >
                    <div className="modal-dialog modal-dialog-centered">
                        <div className="modal-content rounded-4 border-0 shadow-lg">
                            <div className="modal-header border-bottom border-warning">
                                <h5 className="modal-title fw-bold text-navy">
                                    <i className="fas fa-signature me-2 text-warning"></i> التوقيع الإلكتروني (شاشة اللمس)
                                </h5>
                                <button
                                    type="button"
                                    className="btn-close"
                                    onClick={() => setShowSignatureModal(false)}
                                ></button>
                            </div>
                            <div className="modal-body p-4 text-center">
                                <p className="text-muted fw-bold small mb-3">
                                    يرجى التوقيع بالإصبع أو الماوس داخل الإطار المخصص أدناه.
                                </p>
                                <canvas
                                    ref={signatureCanvasRef}
                                    width={420}
                                    height={220}
                                    style={{
                                        border: '2px dashed #1C2541',
                                        borderRadius: 12,
                                        background: '#fff',
                                        touchAction: 'none',
                                        maxWidth: '100%',
                                    }}
                                    onMouseDown={startCanvasDrawing}
                                    onMouseMove={drawOnCanvas}
                                    onMouseUp={stopCanvasDrawing}
                                    onMouseLeave={stopCanvasDrawing}
                                    onTouchStart={startCanvasDrawing}
                                    onTouchMove={drawOnCanvas}
                                    onTouchEnd={stopCanvasDrawing}
                                />
                            </div>
                            <div className="modal-footer justify-content-between">
                                <button
                                    type="button"
                                    className="btn btn-outline-danger fw-bold"
                                    onClick={clearSignature}
                                >
                                    <i className="fas fa-eraser me-1"></i> مسح اللوحة
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-success fw-bold px-4"
                                    onClick={insertSignatureIntoEditor}
                                >
                                    <i className="fas fa-check-circle me-1"></i> اعتماد وإدراج
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
