/**
 * ============================================================================
 * نظام موكّل (Moakkil System) - 2026
 * الملف: js/library.js
 * الوصف: المحرك الشامل للمكتبة (Smart Editor + Cloud Archive + Canvas Signature + Drafts Engine)
 * الإصدار: Enterprise V5.3 True Zero-Trust & R2 Edition
 * التحديثات والتحصينات:
 * 1. تفعيل الحارس الأمني الموحد (AUTH.checkSession) عند إقلاع الصفحة.
 * 2. استبدال نافذة الـ PIN اليدوية في حذف النماذج السحابية بالحارس الموحد (AUTH.requireActionAuth)
 *    لإصدار تذكرة حذف خادمية لمرة واحدة (act_UUID) مربوطة بجدول mo_files والسجل المحدد.
 * 3. عزل المسودات المحلية بحسب المكتب والمستخدم مع دعم الترقية التلقائية للمسودات السابقة.
 * 4. توافق كامل مع فاحص ملكية ملفات Cloudflare R2 في الوركر (file_url & gdrive_file_id) وتعقيم XSS.
 * ============================================================================
 */

// متغيرات المحرر الذكي والتوقيع
let quillEditor;
let rawTemplateText = "";
let clientsList = [];
let casesList = [];
let signatureModalInstance;

// متغيرات لوحة الرسم
const canvas = document.getElementById('signaturePad');
const ctx = canvas ? canvas.getContext('2d') : null;
let isDrawing = false;

// متغيرات الأرشيف السحابي والمسودات
let archiveFiles = []; 
let currentCategory = 'عقود'; // التصنيف الافتراضي (يتغير إلى 'مسودات' عند التبديل)

/**
 * دالة الحماية من ثغرات الحقن (XSS Sanitizer)
 */
const escapeHTML = (str) => {
    if (str === null || str === undefined) return '';
    return str.toString().replace(/[&<>'"]/g, 
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
};

/**
 * توليد مفتاح تخزين المسودات المعزول بحسب المكتب والمستخدم مع دمج المسودات القديمة إن وجدت
 */
function getDraftsStorageKey() {
    try {
        const user = JSON.parse(localStorage.getItem(CONFIG?.USER_KEY || 'moakkil_user') || '{}');
        const uid = user.id || user.uid || 'default';
        const firmId = user.firm_id || localStorage.getItem(CONFIG?.FIRM_KEY || 'moakkil_firm_id') || 'firm';
        const scopedKey = `moakkil_drafts_${firmId}_${uid}`;

        const legacyDrafts = localStorage.getItem('moakkil_drafts');
        if (legacyDrafts && !localStorage.getItem(scopedKey)) {
            localStorage.setItem(scopedKey, legacyDrafts);
            localStorage.removeItem('moakkil_drafts');
        }
        return scopedKey;
    } catch (e) {
        return 'moakkil_drafts';
    }
}

document.addEventListener("DOMContentLoaded", async () => {
    // 1. التأكد الصارم من صلاحية الجلسة عبر الحارس المركزي
    if (typeof AUTH !== 'undefined' && typeof AUTH.checkSession === 'function') {
        const currentUser = AUTH.checkSession();
        if (!currentUser) return;
    } else {
        const token = localStorage.getItem(CONFIG?.TOKEN_KEY || 'moakkil_token');
        if (!token) {
            window.location.replace('login.html');
            return;
        }
    }

    // 2. تهيئة محرر النصوص المتقدم (Quill.js)
    if (document.getElementById('editor-container') && typeof Quill !== 'undefined') {
        quillEditor = new Quill('#editor-container', {
            theme: 'snow',
            placeholder: 'ابدأ بكتابة المستند القانوني هنا...',
            modules: {
                toolbar: [
                    [{ 'header': [1, 2, 3, false] }],
                    [{ 'align': [] }],
                    ['bold', 'italic', 'underline'],
                    [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                    [{ 'color': [] }, { 'background': [] }],
                    ['clean']
                ]
            }
        });
    }

    // 3. تهيئة نافذة التوقيع (Canvas)
    if (document.getElementById('signatureModal')) {
        signatureModalInstance = new bootstrap.Modal(document.getElementById('signatureModal'));
        setupCanvasEvents();
    }

    // 4. جلب بيانات السحب الآلي للمحرر (Clients & Cases)
    await loadSmartDropdownData();
    setupSmartEventListeners();

    // 5. جلب بيانات الأرشيف السحابي للمكتبة
    await loadArchiveFiles();
});

// ============================================================================
// [القسم الأول]: المحرر الذكي والسحب الآلي (Smart Editor & Auto-Fill)
// ============================================================================

async function loadSmartDropdownData() {
    try {
        const [clientsRes, casesRes] = await Promise.all([
            API.getClients(),
            API.getCases()
        ]);

        if (Array.isArray(clientsRes) && !clientsRes.error) {
            clientsList = clientsRes.filter(c => !c.is_deleted);
            const clientSelect = document.getElementById('clientSelector');
            if (clientSelect) {
                clientsList.forEach(c => {
                    clientSelect.innerHTML += `<option value="${escapeHTML(c.id)}">${escapeHTML(c.full_name)} (${escapeHTML(c.national_id || 'بدون رقم')})</option>`;
                });
            }
        }

        if (Array.isArray(casesRes) && !casesRes.error) {
            casesList = casesRes.filter(c => !c.is_deleted);
            const caseSelect = document.getElementById('caseSelector');
            if (caseSelect) {
                casesList.forEach(c => {
                    caseSelect.innerHTML += `<option value="${escapeHTML(c.id)}">${escapeHTML(c.case_internal_id || 'ملف')} - ${escapeHTML(c.opponent_name || 'بدون خصم')}</option>`;
                });
            }
        }
    } catch (e) {
        console.error("خطأ في جلب بيانات السحب الآلي:", e);
    }
}

function setupSmartEventListeners() {
    const tplSel = document.getElementById('templateSelector');
    const clSel = document.getElementById('clientSelector');
    const caSel = document.getElementById('caseSelector');

    if (tplSel) tplSel.addEventListener('change', (e) => loadTemplate(e.target.value));
    if (clSel) clSel.addEventListener('change', applyVariablesToEditor);
    if (caSel) caSel.addEventListener('change', applyVariablesToEditor);
}

function loadTemplate(type) {
    if (!quillEditor) return;
    if (!type) {
        quillEditor.setText('');
        rawTemplateText = '';
        return;
    }

    // قوالب افتراضية محقونة بالمتغيرات
    const templates = {
        'contract': `<h2 class="ql-align-center">عقد أتعاب محاماة</h2><p><br></p><p>تم الاتفاق في هذا اليوم الموافق {{date}} بين كل من:</p><p>الطرف الأول (المحامي): مكتب {{firm_name}}.</p><p>الطرف الثاني (الموكل): السيد/ة {{client_name}}، يحمل رقم وطني: {{national_id}}، ورقم هاتف: {{client_phone}}.</p><p><br></p><p><strong>موضوع العقد:</strong></p><p>وكل الطرف الثاني الطرف الأول بتمثيله في القضية المرفوعة ضد {{opponent_name}} لدى محكمة {{court_name}}.</p><p><br></p><p><strong>توقيع الموكل:</strong></p><p><br></p>`,
        'notice': `<h2 class="ql-align-center">إنذار عدلي</h2><p><br></p><p>بواسطة كاتب عدل محكمة {{court_name}} الأكرم.</p><p><strong>المنذر:</strong> {{client_name}} - الرقم الوطني: {{national_id}}.</p><p><strong>المنذر إليه:</strong> {{opponent_name}}.</p><p><br></p><p><strong>وقائع الإنذار:</strong></p><p>...</p>`,
        'plea': `<h2 class="ql-align-center">لائحة دعوى</h2><p><br></p><p>لدى محكمة {{court_name}} الموقرة.</p><p><strong>المدعي:</strong> {{client_name}}.</p><p><strong>المدعى عليه:</strong> {{opponent_name}}.</p><p><br></p><p><strong>الوقائع:</strong></p><p>...</p><p><br></p><p><strong>الطلبات:</strong></p><p>...</p>`
    };

    rawTemplateText = templates[type] || '';
    applyVariablesToEditor();
}

function applyVariablesToEditor() {
    if (!rawTemplateText || !quillEditor) return;

    let processedText = rawTemplateText;
    
    const clientId = document.getElementById('clientSelector')?.value;
    const clientData = clientsList.find(c => String(c.id) === String(clientId)) || {};
    
    const caseId = document.getElementById('caseSelector')?.value;
    const caseData = casesList.find(c => String(c.id) === String(caseId)) || {};
    
    const currentUser = JSON.parse(localStorage.getItem(CONFIG?.USER_KEY || 'moakkil_user') || '{}');
    const firmSettings = JSON.parse(localStorage.getItem('firm_settings') || '{}');

    // قاموس الاستبدال الذكي (Auto-Fill Tags)
    const dict = {
        '{{date}}': new Date().toLocaleDateString('ar-JO'),
        '{{firm_name}}': escapeHTML(firmSettings.firm_name || currentUser.firm_name || 'مكتب المحاماة'),
        '{{client_name}}': escapeHTML(clientData.full_name || '________________'),
        '{{national_id}}': escapeHTML(clientData.national_id || '________________'),
        '{{client_phone}}': escapeHTML(clientData.phone || '________________'),
        '{{opponent_name}}': escapeHTML(caseData.opponent_name || '________________'),
        '{{court_name}}': escapeHTML(caseData.current_court || '________________')
    };

    for (let key in dict) {
        processedText = processedText.replace(new RegExp(key, 'g'), dict[key]);
    }

    // حقن النص النهائي في المحرر
    quillEditor.clipboard.dangerouslyPasteHTML(processedText);
}

// ============================================================================
// [القسم الثاني]: التوقيع الرقمي المزدوج (Canvas Signature) والطباعة
// ============================================================================

window.openSignatureModal = function() {
    if (signatureModalInstance && canvas) {
        signatureModalInstance.show();
        setTimeout(() => {
            const rect = canvas.parentElement.getBoundingClientRect();
            canvas.width = rect.width - 30;
            clearSignature();
        }, 250);
    }
};

function getPointerPos(e) {
    const rect = canvas.getBoundingClientRect();
    if (e.touches && e.touches.length > 0) {
        return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function setupCanvasEvents() {
    if (!canvas || !ctx) return;
    
    const startDrawing = (e) => {
        isDrawing = true;
        const pos = getPointerPos(e);
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
        e.preventDefault();
    };

    const draw = (e) => {
        if (!isDrawing) return;
        const pos = getPointerPos(e);
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#000080'; // حبر أزرق قانوني
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
        e.preventDefault();
    };

    const stopDrawing = () => { isDrawing = false; ctx.closePath(); };

    // دعم الماوس
    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseout', stopDrawing);

    // دعم اللمس للموبايل
    canvas.addEventListener('touchstart', startDrawing, { passive: false });
    canvas.addEventListener('touchmove', draw, { passive: false });
    canvas.addEventListener('touchend', stopDrawing);
}

window.clearSignature = function() {
    if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
};

window.insertSignature = function() {
    if (!canvas || !quillEditor) return;
    const blank = document.createElement('canvas');
    blank.width = canvas.width;
    blank.height = canvas.height;
    if (canvas.toDataURL() === blank.toDataURL()) {
        Swal.fire('تنبيه', 'يرجى التوقيع في المربع أولاً', 'warning');
        return;
    }

    const dataUrl = canvas.toDataURL('image/png');
    
    // إدراج التوقيع كصورة في المحرر
    const range = quillEditor.getSelection(true);
    const insertIdx = range ? range.index : quillEditor.getLength();
    quillEditor.insertText(insertIdx, '\n', Quill.sources.USER);
    quillEditor.insertEmbed(insertIdx + 1, 'image', dataUrl, Quill.sources.USER);
    
    if (signatureModalInstance) signatureModalInstance.hide();
    Swal.fire({
        icon: 'success',
        title: 'تم الإدراج',
        text: 'تم إدراج التوقيع الرقمي بنجاح في المستند.',
        timer: 1500,
        showConfirmButton: false
    });
};

window.printDocument = function() {
    if (!quillEditor) return;
    const text = quillEditor.getText().trim();
    if (text.length === 0) {
        Swal.fire('تنبيه', 'المستند فارغ، يرجى كتابة أو اختيار نموذج أولاً.', 'info');
        return;
    }
    window.print();
};

// ============================================================================
// [القسم الثالث]: محرك المسودات المعزول (Scoped Drafts Engine - LocalStorage)
// ============================================================================

window.saveDraft = function() {
    if (!quillEditor) return;
    const content = quillEditor.root.innerHTML;
    const plainText = quillEditor.getText().trim();
    
    if (plainText.length === 0) {
        Swal.fire('تنبيه', 'المحرر فارغ، لا يوجد شيء لحفظه.', 'warning');
        return;
    }

    let previewTitle = plainText.split('\n')[0].substring(0, 30);
    if (previewTitle.length < 3) previewTitle = "مسودة مستند قانوني";

    const storageKey = getDraftsStorageKey();
    let drafts = JSON.parse(localStorage.getItem(storageKey) || '[]');
    const draftId = 'draft_' + Date.now();
    
    drafts.unshift({
        id: draftId,
        title: previewTitle + '...',
        content: content,
        created_at: new Date().toISOString()
    });

    localStorage.setItem(storageKey, JSON.stringify(drafts));
    
    Swal.fire({
        icon: 'success', 
        title: 'تم حفظ المسودة', 
        text: 'تم الحفظ محلياً بأمان. يمكنك استكمال التحرير لاحقاً من تبويب (مسوداتي).', 
        timer: 2500, 
        showConfirmButton: false
    });

    if (currentCategory === 'مسودات') {
        renderDrafts();
    }
};

window.loadDraft = function(id) {
    if (!quillEditor) return;
    const storageKey = getDraftsStorageKey();
    let drafts = JSON.parse(localStorage.getItem(storageKey) || '[]');
    const draft = drafts.find(d => d.id === id);
    if (draft) {
        quillEditor.root.innerHTML = draft.content;
        const editorSec = document.getElementById('smart-editor-section');
        if (editorSec) {
            window.scrollTo({ top: editorSec.offsetTop - 20, behavior: 'smooth' });
        }
        
        Swal.fire({
            icon: 'success', 
            title: 'تم جلب المسودة', 
            text: 'المسودة الآن جاهزة لإكمال التحرير.', 
            timer: 1500, 
            showConfirmButton: false
        });
    }
};

window.deleteDraft = function(id) {
    Swal.fire({
        title: 'هل أنت متأكد؟',
        text: 'سيتم حذف هذه المسودة المحلية نهائياً.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'نعم، احذف',
        cancelButtonText: 'تراجع'
    }).then((result) => {
        if (result.isConfirmed) {
            const storageKey = getDraftsStorageKey();
            let drafts = JSON.parse(localStorage.getItem(storageKey) || '[]');
            drafts = drafts.filter(d => d.id !== id);
            localStorage.setItem(storageKey, JSON.stringify(drafts));
            renderDrafts();
            Swal.fire({ icon: 'success', title: 'تم الحذف بنجاح', timer: 1500, showConfirmButton: false });
        }
    });
};

function renderDrafts() {
    const container = document.getElementById('templates-container');
    if (!container) return;
    const searchTerm = document.getElementById('search-input')?.value.toLowerCase() || '';
    const storageKey = getDraftsStorageKey();
    let drafts = JSON.parse(localStorage.getItem(storageKey) || '[]');
    
    const filtered = drafts.filter(d => (d.title || '').toLowerCase().includes(searchTerm));
    
    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="col-12 text-center py-5">
                <i class="fas fa-edit fa-4x text-muted mb-3 opacity-50"></i>
                <h5 class="text-muted fw-bold">لا توجد مسودات محلية محفوظة.</h5>
                <p class="text-muted small">ابدأ بكتابة مستند واضغط على (مسودة) لحفظه هنا.</p>
            </div>`;
        return;
    }
    
    let html = '';
    filtered.forEach(d => {
        const dateObj = new Date(d.created_at);
        const dateStr = dateObj.toLocaleDateString('ar-EG') + ' ' + dateObj.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
        
        html += `
        <div class="col-md-6 col-lg-4">
            <div class="template-card border-primary" style="border-right-color: var(--primary-light) !important;">
                <div class="d-flex align-items-start mb-3">
                    <div class="p-3 bg-light rounded-3 me-3 text-primary">
                        <i class="fas fa-file-signature fa-2x"></i>
                    </div>
                    <div>
                        <h6 class="fw-bold mb-1" style="color: var(--primary-dark); line-height:1.4;">${escapeHTML(d.title)}</h6>
                        <small class="text-muted fw-bold"><i class="fas fa-clock me-1"></i> ${escapeHTML(dateStr)}</small>
                    </div>
                </div>
                <div class="mt-auto pt-3 border-top d-flex gap-2">
                    <button class="btn flex-grow-1 text-white fw-bold shadow-sm" style="background: var(--primary-dark);" onclick="loadDraft('${escapeHTML(d.id)}')">
                        <i class="fas fa-edit me-1"></i> إكمال التحرير
                    </button>
                    <button class="btn btn-outline-danger px-3 shadow-sm" onclick="deleteDraft('${escapeHTML(d.id)}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        </div>`;
    });
    
    container.innerHTML = html;
}

// ============================================================================
// [القسم الرابع]: أرشيف المكتبة السحابي (Cloud Archive)
// ============================================================================

async function loadArchiveFiles() {
    try {
        const res = await API.getFiles('case_id=is.null&client_id=is.null');
        
        if (res && !res.error && Array.isArray(res)) {
            archiveFiles = res.filter(f => !f.is_deleted);
            if (currentCategory !== 'مسودات') {
                renderTemplates();
            }
        } else {
            const container = document.getElementById('templates-container');
            if (container) {
                container.innerHTML = `<div class="col-12 text-center text-danger fw-bold">فشل في جلب الأرشيف.</div>`;
            }
        }
    } catch (e) {
        console.error(e);
    }
}

window.filterTemplates = function(category) {
    currentCategory = category;
    if (category === 'مسودات') {
        renderDrafts();
    } else {
        renderTemplates();
    }
};

window.searchTemplates = function() {
    if (currentCategory === 'مسودات') {
        renderDrafts();
    } else {
        renderTemplates();
    }
};

function renderTemplates() {
    const container = document.getElementById('templates-container');
    const searchTerm = document.getElementById('search-input')?.value.toLowerCase() || '';
    
    if (!container) return;

    // فك تشفير حقل الـ Description لاستخراج الـ Category المدمج
    const processedFiles = archiveFiles.map(f => {
        let cat = f.file_category || 'عقود';
        let desc = f.description || f.file_name || '';
        
        if (f.description && f.description.includes(':::')) {
            const parts = f.description.split(':::');
            cat = parts[0];
            desc = parts[1];
        }
        
        return { ...f, ext_category: cat, display_desc: desc };
    });

    const filteredFiles = processedFiles.filter(f => {
        const matchesCategory = f.ext_category === currentCategory;
        const matchesSearch = (f.file_name || '').toLowerCase().includes(searchTerm) || (f.display_desc || '').toLowerCase().includes(searchTerm);
        return matchesCategory && matchesSearch;
    });

    if (filteredFiles.length === 0) {
        container.innerHTML = `
            <div class="col-12 text-center py-5">
                <i class="fas fa-folder-open fa-4x text-muted mb-3 opacity-50"></i>
                <h5 class="text-muted fw-bold">لا توجد ملفات سحابية في قسم (${escapeHTML(currentCategory)}) مطابقة للبحث.</h5>
            </div>`;
        return;
    }

    let html = '';
    const icons = {
        'pdf': 'fa-file-pdf text-danger',
        'doc': 'fa-file-word text-primary',
        'docx': 'fa-file-word text-primary',
        'default': 'fa-file-alt text-secondary'
    };

    filteredFiles.forEach(f => {
        const ext = (f.file_name || '').split('.').pop().toLowerCase();
        const icon = icons[ext] || icons['default'];
        const dateStr = f.created_at ? new Date(f.created_at).toLocaleDateString('ar-EG') : '--';
        const fileKey = f.file_url || f.gdrive_file_id || f.drive_file_id || '';
        const safeJsKey = escapeHTML(fileKey).replace(/'/g, "\\'");
        const safeJsName = escapeHTML(f.file_name || 'document').replace(/'/g, "\\'");
        
        html += `
        <div class="col-md-6 col-lg-4">
            <div class="template-card">
                <div class="d-flex align-items-start mb-3">
                    <div class="p-3 bg-light rounded-3 me-3">
                        <i class="fas ${icon} fa-2x"></i>
                    </div>
                    <div>
                        <h6 class="fw-bold mb-1" style="color: var(--primary-dark); line-height:1.4;">${escapeHTML(f.display_desc)}</h6>
                        <small class="text-muted fw-bold"><i class="fas fa-clock me-1"></i> أضيف في: ${escapeHTML(dateStr)}</small>
                    </div>
                </div>
                
                <div class="mt-auto pt-3 border-top d-flex gap-2">
                    <button class="btn btn-gold flex-grow-1" onclick="downloadArchiveFile('${safeJsKey}', '${safeJsName}')">
                        <i class="fas fa-download"></i> تحميل
                    </button>
                    <button class="btn btn-outline-danger px-3" onclick="deleteArchiveFile('${escapeHTML(f.id)}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        </div>`;
    });

    container.innerHTML = html;
}

// ============================================================================
// [القسم الخامس]: الرفع والحذف السحابي الموثق للأرشيف (R2 Upload & Scoped MFA Delete)
// ============================================================================

window.uploadTemplate = async function(event) {
    event.preventDefault();
    
    if (!navigator.onLine) {
        Swal.fire('تنبيه', 'لا يمكن رفع النماذج السحابية أثناء انقطاع الإنترنت.', 'warning');
        return;
    }

    const fileInput = document.getElementById('tpl_file');
    const title = document.getElementById('tpl_title')?.value?.trim() || '';
    const category = document.getElementById('tpl_category')?.value || 'عقود';
    
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
        Swal.fire('تنبيه', 'الرجاء اختيار ملف', 'warning');
        return;
    }
    
    const file = fileInput.files[0];
    const btn = document.getElementById('btn_upload_tpl');
    const originalText = btn ? btn.innerHTML : '';
    
    try {
        if (btn) {
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الرفع للسحابة...';
            btn.disabled = true;
        }

        // 1. الرفع لـ Cloudflare R2 تحت مسار عام (general) لتجنب اعتباره معرف قضية
        const uploadRes = await API.uploadFileToR2(file, 'general', 'general');
        
        if (uploadRes && uploadRes.success && uploadRes.r2_key) {
            // دمج التصنيف مع الوصف
            const smartDescription = `${category}:::${title || file.name}`;

            // 2. تسجيل الملف في قاعدة البيانات (mo_files) مع حفظ gdrive_file_id لتوافق فاحص الوركر
            const recordData = {
                case_id: null,
                client_id: null,
                file_name: file.name,
                file_type: file.type || 'application/octet-stream',
                file_extension: file.name.includes('.') ? file.name.split('.').pop().toLowerCase() : '',
                file_category: category,
                file_url: uploadRes.r2_key,
                gdrive_file_id: uploadRes.r2_key,
                drive_file_id: uploadRes.r2_key,
                is_template: true,
                description: smartDescription
            };
            
            const dbRes = await API.addFileRecord(recordData);
            
            if (dbRes && !dbRes.error) {
                Swal.fire('تم بنجاح', 'تم أرشفة النموذج السحابي بنجاح', 'success');
                document.getElementById('uploadForm')?.reset();
                bootstrap.Modal.getInstance(document.getElementById('uploadModal'))?.hide();
                
                await loadArchiveFiles();
            } else {
                if (typeof API.cleanupOrphanR2File === 'function') {
                    await API.cleanupOrphanR2File(uploadRes.r2_key);
                }
                throw new Error(dbRes?.error || 'فشل توثيق النموذج في قاعدة البيانات');
            }
        } else {
            throw new Error(uploadRes?.error || 'فشل الرفع السحابي');
        }

    } catch (error) {
        Swal.fire('خطأ', error.message, 'error');
    } finally {
        if (btn) {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    }
};

window.downloadArchiveFile = async function(r2Key, fileName) {
    await API.downloadR2File(r2Key, fileName);
};

/**
 * 🛡️ الحذف الآمن لنماذج المكتبة السحابية باستخدام الحارس الموحد (AUTH.requireActionAuth)
 * يستصدر تذكرة خادمية لمرة واحدة (act_UUID) مربوطة بجدول mo_files ومعرف النموذج
 */
window.deleteArchiveFile = async function(id) {
    if (!navigator.onLine) {
        Swal.fire('تنبيه', 'لا يمكن حذف النماذج السحابية في وضع عدم الاتصال (Offline).', 'warning');
        return;
    }

    const result = await Swal.fire({
        title: 'هل أنت متأكد؟',
        text: 'سيتم حذف هذا النموذج من المكتبة المشتركة وتوثيق العملية في سجل الرقابة.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'نعم، متابعة للتحقق الأمني',
        cancelButtonText: 'تراجع'
    });

    if (!result.isConfirmed) return;

    try {
        const targetTpl = archiveFiles.find(f => String(f.id) === String(id));
        const tplName = targetTpl ? (targetTpl.description?.split(':::')[1] || targetTpl.file_name) : 'نموذج سحابي';

        // استدعاء الحارس الموحد لاستصدار تذكرة حذف لمرة واحدة مربوطة بالسجل
        const actionToken = await AUTH.requireActionAuth(
            `حذف النموذج السحابي (${tplName})`,
            'mo_files',
            id
        );

        if (!actionToken) return;

        Swal.fire({ title: 'جاري الحذف...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        
        const res = await API.deleteFile(id, actionToken);
        
        if (res && !res.error) {
            Swal.fire('تم الحذف', 'تم حذف النموذج من الأرشيف بنجاح وتسجيل حركتك في السجل الأمني.', 'success');
            await loadArchiveFiles();
        } else {
            throw new Error(res?.error || 'خطأ أثناء حذف النموذج');
        }
    } catch (err) {
        if (err.message && err.message.includes('إلغاء')) return;
        Swal.fire('مرفوض أمنياً', err.message || 'تعذر إتمام عملية الحذف.', 'error');
    }
};