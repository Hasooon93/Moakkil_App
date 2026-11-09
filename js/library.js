/**
 * ============================================================================
 * نظام موكّل (Moakkil System) - 2026
 * الملف: js/library.js
 * الإصدار: V5.6 Enterprise Edition (Legal Library, Smart Editor & R2 Vault)
 * ============================================================================
 * الميزات والمهام:
 * 1. محرر العقود والمستندات القانونية الذكي (Quill.js) مع السحب والدمج الآلي لبيانات الموكلين والقضايا.
 * 2. التوقيع الإلكتروني الحي عالي الدقة (High-DPI Retina Touch Canvas) للشاشات الذكية والأجهزة اللوحية.
 * 3. الأرشيف السحابي الموحد للمكتب على Cloudflare R2 للأرشفة المباشرة وتصنيف المراجع (عقود، وكالات، لوائح، قوانين).
 * 4. نظام المسودات المحلية المعزول أمنياً بحسب المكتب والمستخدم (Multi-Tenant Local Scoped Drafts).
 * 5. الحذف المؤمن بمبدأ الإذن لمرة واحدة (Zero-Trust Scoped Action Token) عبر الحارس الأمني المركزي.
 * 6. التوافق الكامل مع معايير الويب الحديثة، الوضع الليلي عالي التباين (WCAG AAA)، والطباعة القضائية النظيفة.
 * ============================================================================
 */

// ============================================================================
// [1] المتغيرات العامة وإدارة الحالة (Global State)
// ============================================================================
let quillEditor = null;
let rawTemplateText = "";
let clientsList = [];
let casesList = [];
let signatureModalInstance = null;

// متغيرات لوحة التوقيع
const canvas = document.getElementById('signaturePad');
const ctx = canvas ? canvas.getContext('2d') : null;
let isDrawing = false;

// متغيرات الأرشيف السحابي والمسودات
let archiveFiles = []; 
let currentCategory = 'عقود'; // التصنيف الافتراضي (عقود، وكالات، لوائح، قوانين، مسودات)

// ============================================================================
// [2] دوال الحماية والمساعدة (Security & Helpers)
// ============================================================================

/**
 * تعقيم النصوص لمنع ثغرات الحقن (XSS Sanitizer)
 */
const escapeHTML = (str) => {
    if (str === null || str === undefined) return '';
    return str.toString().replace(/[&<>'"]/g, 
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
};

/**
 * توليد مفتاح تخزين المسودات المعزول بحسب المكتب والمستخدم مع ترحيل المسودات السابقة تلقائياً
 */
function getDraftsStorageKey() {
    try {
        const user = JSON.parse(localStorage.getItem(CONFIG?.USER_KEY || 'moakkil_user') || '{}');
        const uid = user.id || user.uid || 'default_user';
        const firmId = user.firm_id || localStorage.getItem(CONFIG?.FIRM_KEY || 'moakkil_firm_id') || 'default_firm';
        const scopedKey = `moakkil_drafts_${firmId}_${uid}`;

        // ترحيل المسودات القديمة إن وجدت لضمان عدم ضياع أي عمل سابق للمحامي
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

// ============================================================================
// [3] دورة حياة الصفحة والتهيئة المركزية (Lifecycle & Initialization)
// ============================================================================
document.addEventListener("DOMContentLoaded", async () => {
    // 1. التحقق الصارم من الجلسة عبر الحارس المركزي
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
            placeholder: 'ابدأ بصياغة أو استيراد المستند القانوني هنا...',
            modules: {
                toolbar: [
                    [{ 'header': [1, 2, 3, false] }],
                    [{ 'align': [] }],
                    ['bold', 'italic', 'underline', 'strike'],
                    [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                    [{ 'color': [] }, { 'background': [] }],
                    ['clean']
                ]
            }
        });
    }

    // 3. تهيئة نافذة التوقيع الإلكتروني (Canvas)
    if (document.getElementById('signatureModal')) {
        signatureModalInstance = new bootstrap.Modal(document.getElementById('signatureModal'));
        setupCanvasEvents();
    }

    // 4. جلب بيانات السحب الآلي للمحرر (Clients & Cases)
    await loadSmartDropdownData();
    setupSmartEventListeners();

    // 5. جلب ملفات الأرشيف السحابي للمكتبة
    await loadArchiveFiles();
});

// ============================================================================
// [4] المحرر الذكي وقوالب العقود (Smart Editor & Auto-Fill Engine)
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
                    clientSelect.innerHTML += `<option value="${escapeHTML(c.id)}">${escapeHTML(c.full_name)} (${escapeHTML(c.national_id || 'بدون رقم وطني')})</option>`;
                });
            }
        }

        if (Array.isArray(casesRes) && !casesRes.error) {
            casesList = casesRes.filter(c => !c.is_deleted);
            const caseSelect = document.getElementById('caseSelector');
            if (caseSelect) {
                casesList.forEach(c => {
                    const identifier = c.case_internal_id || c.case_number || 'ملف رقم ' + c.id;
                    caseSelect.innerHTML += `<option value="${escapeHTML(c.id)}">${escapeHTML(identifier)} - ${escapeHTML(c.opponent_name || 'بدون خصم')}</option>`;
                });
            }
        }
    } catch (e) {
        console.error("خطأ أثناء جلب بيانات السحب الآلي:", e);
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

/**
 * تحميل نموذج قياسي محقون بوسوم الاستبدال التلقائي
 */
function loadTemplate(type) {
    if (!quillEditor) return;
    if (!type) {
        quillEditor.setText('');
        rawTemplateText = '';
        return;
    }

    const templates = {
        'contract': `
            <h2 class="ql-align-center">عقد اتفاق على أتعاب محاماة وتوكيل قضائي</h2>
            <p><br></p>
            <p>بعون الله وتوفيقه، تم الاتفاق والتعاقد في هذا اليوم الموافق <strong>{{date}}</strong> بين كل من:</p>
            <p><strong>الطرف الأول (المحامي الوكيل):</strong> {{firm_name}} - هاتف: {{firm_phone}} - البريد: {{firm_email}}.</p>
            <p><strong>الطرف الثاني (الموكل):</strong> السيد/ة <strong>{{client_name}}</strong>، يحمل الرقم الوطني/الهوية: <strong>{{national_id}}</strong>، هاتف: <strong>{{client_phone}}</strong>، وعنوانه: <strong>{{client_address}}</strong>.</p>
            <p><br></p>
            <p><strong>مقدمة العقد:</strong></p>
            <p>لما كان الطرف الثاني بحاجة لتوكيل الطرف الأول لتمثيله والترافع عنه في الدعوى القضائية / موضوع النزاع المقيد برقم: <strong>{{case_internal_id}}</strong> ضد الخصم: <strong>{{opponent_name}}</strong> أمام محكمة: <strong>{{court_name}}</strong> الموقرة، فقد اتفق الطرفان على ما يلي:</p>
            <ol>
                <li>تعتبر مقدمة هذا العقد جزءاً لا يتجزأ منه وتُقرأ معه كوحدة واحدة.</li>
                <li>يلتزم الطرف الأول ببذل العناية القانونية اللازمة والمهنية في المتابعة والترافع وتقديم اللوائح والدفوع أصولاً.</li>
                <li>يلتزم الطرف الثاني بأداء الأتعاب المتفق عليها والرسوم والمصاريف القضائية وفق جدول الدفعات المعتمد.</li>
            </ol>
            <p><br></p>
            <p><strong>توقيع الطرف الأول:</strong> ________________________ &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; <strong>توقيع الطرف الثاني:</strong> ________________________</p>
            <p><br></p>
        `,
        'notice': `
            <h2 class="ql-align-center">إنذار عدلي رسمي على يد محضر / كاتب عدل</h2>
            <p><br></p>
            <p>لدى كاتب عدل محكمة <strong>{{court_name}}</strong> الأكرم،</p>
            <p><strong>المنذر:</strong> السيد/ة <strong>{{client_name}}</strong>، رقمه الوطني: <strong>{{national_id}}</strong>، وكيله المحامي: <strong>{{firm_name}}</strong>.</p>
            <p><strong>المنذر إليه:</strong> السيد/ة <strong>{{opponent_name}}</strong>.</p>
            <p><br></p>
            <p><strong>وقائع الإنذار:</strong></p>
            <ol>
                <li>حيث إن المنذر يطالب المنذر إليه بالالتزامات المستحقة والمترتبة بذمته بخصوص موضوع ملف رقم: <strong>{{case_internal_id}}</strong>.</li>
                <li>وحيث إن المنذر إليه قد تخلف عن الوفاء بالتزاماته رغم المراجعات الودية المتكررة.</li>
            </ol>
            <p><strong>الطلب:</strong> ينذر المنذر المنذر إليه بوجوب تسوية الالتزام خلال المدة القانونية وإلا سيصار إلى إقامة الملاحقة القضائية وتحميله كامل النفقات والأتعاب.</p>
            <p><br></p>
            <p class="ql-align-left"><strong>وكيل المنذر:</strong> {{firm_name}}</p>
        `,
        'plea': `
            <h2 class="ql-align-center">لائحة دعوى حقوقية / جزائية</h2>
            <p><br></p>
            <p>لدى محكمة <strong>{{court_name}}</strong> الموقرة،</p>
            <p><strong>المدعي:</strong> <strong>{{client_name}}</strong>، رقمه الوطني: <strong>{{national_id}}</strong>، وكيله: <strong>{{firm_name}}</strong>.</p>
            <p><strong>المدعى عليه:</strong> <strong>{{opponent_name}}</strong>.</p>
            <p><strong>موضوع الدعوى:</strong> <strong>{{case_subject}}</strong> (رقم الملف الداخلي: <strong>{{case_internal_id}}</strong>).</p>
            <p><br></p>
            <p><strong>الوقائع والأسباب:</strong></p>
            <ol>
                <li>...</li>
                <li>...</li>
            </ol>
            <p><br></p>
            <p><strong>الطلبات:</strong></p>
            <p>يلتمس المدعي بكل احترام قيد الدعوى ومحاكمة المدعى عليه وإلزامه بالطلبات وتضمينه الرسوم والمصاريف وأتعاب المحاماة.</p>
            <p><br></p>
            <p class="ql-align-left"><strong>و/ المدعي:</strong> {{firm_name}}</p>
        `
    };

    rawTemplateText = templates[type] || '';
    applyVariablesToEditor();
}

/**
 * تطبيق الاستبدال الآلي للوسوم والمتغيرات
 */
function applyVariablesToEditor() {
    if (!rawTemplateText || !quillEditor) return;

    let processedText = rawTemplateText;
    
    const clientId = document.getElementById('clientSelector')?.value;
    const clientData = clientsList.find(c => String(c.id) === String(clientId)) || {};
    
    const caseId = document.getElementById('caseSelector')?.value;
    const caseData = casesList.find(c => String(c.id) === String(caseId)) || {};
    
    const currentUser = JSON.parse(localStorage.getItem(CONFIG?.USER_KEY || 'moakkil_user') || '{}');
    const firmSettings = JSON.parse(localStorage.getItem('firm_settings') || '{}');

    // تاريخ اليوم بتنسيق محلي أنيق
    const todayFormatted = new Date().toLocaleDateString('ar-SA', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    // قاموس الاستبدال الذكي الموسع (Smart Auto-Fill Dictionary)
    const dict = {
        '{{date}}': todayFormatted,
        '{{firm_name}}': escapeHTML(firmSettings.firm_name || currentUser.firm_name || 'مكتب المحاماة والاستشارات القانونية'),
        '{{firm_phone}}': escapeHTML(firmSettings.phone || firmSettings.contact_phone || '___________'),
        '{{firm_email}}': escapeHTML(firmSettings.email || currentUser.email || '___________'),
        '{{client_name}}': escapeHTML(clientData.full_name || '________________________'),
        '{{national_id}}': escapeHTML(clientData.national_id || '________________'),
        '{{client_phone}}': escapeHTML(clientData.phone || '________________'),
        '{{client_address}}': escapeHTML(clientData.address || '________________'),
        '{{case_internal_id}}': escapeHTML(caseData.case_internal_id || caseData.case_number || 'ملف غير محدد'),
        '{{opponent_name}}': escapeHTML(caseData.opponent_name || '________________________'),
        '{{court_name}}': escapeHTML(caseData.current_court || caseData.court_name || 'المحكمة المختصة'),
        '{{case_subject}}': escapeHTML(caseData.subject || caseData.case_title || 'مطالبة وحقوق قانونية')
    };

    for (const key in dict) {
        processedText = processedText.replace(new RegExp(key, 'g'), dict[key]);
    }

    quillEditor.clipboard.dangerouslyPasteHTML(processedText);
}

// ============================================================================
// [5] التوقيع الإلكتروني عالي الدقة (High-DPI Retina Touch Canvas)
// ============================================================================

window.openSignatureModal = function() {
    if (signatureModalInstance && canvas) {
        signatureModalInstance.show();
        setTimeout(() => {
            initSignatureCanvas();
        }, 220);
    }
};

/**
 * ضبط مقياس اللوحة عالي الدقة (Retina DPI) لمنع التشويش وانحراف اللمس
 */
function initSignatureCanvas() {
    if (!canvas || !ctx) return;
    const rect = canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const displayWidth = Math.max(280, rect.width - 24);
    const displayHeight = 240;

    canvas.width = displayWidth * dpr;
    canvas.height = displayHeight * dpr;
    canvas.style.width = `${displayWidth}px`;
    canvas.style.height = `${displayHeight}px`;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    window.clearSignature();
}

function getPointerPos(e) {
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    let clientX = 0;
    let clientY = 0;

    if (e.touches && e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
    } else {
        clientX = e.clientX;
        clientY = e.clientY;
    }

    return {
        x: clientX - rect.left,
        y: clientY - rect.top
    };
}

function setupCanvasEvents() {
    if (!canvas || !ctx) return;
    
    const startDrawing = (e) => {
        isDrawing = true;
        const pos = getPointerPos(e);
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
        if (e.cancelable) e.preventDefault();
    };

    const draw = (e) => {
        if (!isDrawing) return;
        const pos = getPointerPos(e);
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        // حبر أزرق قانوني ملكي داكن على الشاشات الفاتحة، وذهبي/أزرق سماوي واضح على الشاشات الداكنة
        ctx.strokeStyle = isDark ? '#38BDF8' : '#0B132B';
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
        if (e.cancelable) e.preventDefault();
    };

    const stopDrawing = () => { 
        if (isDrawing) {
            isDrawing = false; 
            ctx.closePath(); 
        }
    };

    // دعم الماوس
    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseleave', stopDrawing);

    // دعم شاشات اللمس للهواتف والآيباد
    canvas.addEventListener('touchstart', startDrawing, { passive: false });
    canvas.addEventListener('touchmove', draw, { passive: false });
    canvas.addEventListener('touchend', stopDrawing);
}

window.clearSignature = function() {
    if (ctx && canvas) {
        const dpr = window.devicePixelRatio || 1;
        ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    }
};

window.insertSignature = function() {
    if (!canvas || !quillEditor) return;
    
    // التحقق من أن لوحة الرسم ليست فارغة
    const blank = document.createElement('canvas');
    blank.width = canvas.width;
    blank.height = canvas.height;
    if (canvas.toDataURL() === blank.toDataURL()) {
        if (typeof Swal !== 'undefined') {
            Swal.fire({
                toast: true,
                position: 'top-end',
                icon: 'warning',
                title: 'يرجى رسم التوقيع أولاً قبل الإدراج.',
                showConfirmButton: false,
                timer: 2500
            });
        }
        return;
    }

    const dataUrl = canvas.toDataURL('image/png');
    
    // إدراج التوقيع في موضع المؤشر بالمحرر
    const range = quillEditor.getSelection(true);
    const insertIdx = range ? range.index : quillEditor.getLength();
    quillEditor.insertText(insertIdx, '\n', Quill.sources.USER);
    quillEditor.insertEmbed(insertIdx + 1, 'image', dataUrl, Quill.sources.USER);
    
    if (signatureModalInstance) {
        signatureModalInstance.hide();
    }

    if (typeof Swal !== 'undefined') {
        Swal.fire({
            icon: 'success',
            title: 'تم اعتماد التوقيع',
            text: 'تم إدراج التوقيع الإلكتروني بنجاح في المستند.',
            timer: 1800,
            showConfirmButton: false
        });
    }
};

window.printDocument = function() {
    if (!quillEditor) return;
    const text = quillEditor.getText().trim();
    if (text.length === 0) {
        if (typeof Swal !== 'undefined') {
            Swal.fire('تنبيه', 'المستند فارغ، يرجى كتابة أو اختيار نموذج أولاً.', 'info');
        }
        return;
    }
    window.print();
};

// ============================================================================
// [6] محرك المسودات المعزول محلياً (Scoped Drafts Engine)
// ============================================================================

window.saveDraft = function() {
    if (!quillEditor) return;
    const content = quillEditor.root.innerHTML;
    const plainText = quillEditor.getText().trim();
    
    if (plainText.length === 0) {
        if (typeof Swal !== 'undefined') {
            Swal.fire('تنبيه', 'المحرر فارغ، لا يوجد محتوى لحفظه كمسودة.', 'warning');
        }
        return;
    }

    let previewTitle = plainText.split('\n')[0].substring(0, 35);
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
    
    if (typeof Swal !== 'undefined') {
        Swal.fire({
            icon: 'success', 
            title: 'تم حفظ المسودة', 
            text: 'تم الحفظ محلياً بأمان. يمكنك استكمال تحريرها لاحقاً من تبويب (مسوداتي).', 
            timer: 2500, 
            showConfirmButton: false
        });
    }

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
        
        if (typeof Swal !== 'undefined') {
            Swal.fire({
                icon: 'success', 
                title: 'تم استرجاع المسودة', 
                text: 'المستند الآن في المحرر وجاهز للاستكمال أو التصدير.', 
                timer: 1500, 
                showConfirmButton: false
            });
        }
    }
};

window.deleteDraft = function(id) {
    if (typeof Swal === 'undefined') {
        if (confirm("هل تريد حذف هذه المسودة نهائياً؟")) {
            const storageKey = getDraftsStorageKey();
            let drafts = JSON.parse(localStorage.getItem(storageKey) || '[]');
            drafts = drafts.filter(d => d.id !== id);
            localStorage.setItem(storageKey, JSON.stringify(drafts));
            renderDrafts();
        }
        return;
    }

    Swal.fire({
        title: 'هل أنت متأكد؟',
        text: 'سيتم حذف هذه المسودة المحلية نهائياً ولا يمكن التراجع عنها.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#B3372F',
        cancelButtonColor: '#1C2541',
        confirmButtonText: 'نعم، احذف',
        cancelButtonText: 'تراجع'
    }).then((result) => {
        if (result.isConfirmed) {
            const storageKey = getDraftsStorageKey();
            let drafts = JSON.parse(localStorage.getItem(storageKey) || '[]');
            drafts = drafts.filter(d => d.id !== id);
            localStorage.setItem(storageKey, JSON.stringify(drafts));
            renderDrafts();
            Swal.fire({ icon: 'success', title: 'تم حذف المسودة بنجاح', timer: 1500, showConfirmButton: false });
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
                <p class="text-muted small">ابدأ بكتابة مستند واضغط على زر (مسودة) لتخزينه هنا.</p>
            </div>`;
        return;
    }
    
    let html = '';
    filtered.forEach(d => {
        const dateObj = new Date(d.created_at);
        const dateStr = dateObj.toLocaleDateString('ar-EG') + ' ' + dateObj.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
        
        html += `
        <div class="col-md-6 col-lg-4">
            <div class="template-card border-primary" style="border-right-color: var(--secondary-navy) !important;">
                <div class="d-flex align-items-start mb-3">
                    <div class="p-3 bg-light rounded-3 me-3 text-primary">
                        <i class="fas fa-file-signature fa-2x"></i>
                    </div>
                    <div>
                        <h6 class="fw-bold mb-1" style="color: var(--primary-navy); line-height: 1.4;">${escapeHTML(d.title)}</h6>
                        <small class="text-muted fw-bold"><i class="fas fa-clock me-1"></i> ${escapeHTML(dateStr)}</small>
                    </div>
                </div>
                <div class="mt-auto pt-3 border-top d-flex gap-2">
                    <button class="btn flex-grow-1 text-white fw-bold shadow-sm" style="background: var(--primary-navy);" onclick="loadDraft('${escapeHTML(d.id)}')">
                        <i class="fas fa-edit me-1"></i> استكمال التحرير
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
// [7] أرشيف المكتبة السحابي والبحث (Cloud Archive & Filtering)
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
                container.innerHTML = `<div class="col-12 text-center text-danger fw-bold py-5">فشل جلب ملفات الأرشيف السحابي من الخادم.</div>`;
            }
        }
    } catch (e) {
        console.error("خطأ جلب ملفات الأرشيف:", e);
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

    // معالجة الوصف واستخراج التصنيف المدمج
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
                <p class="text-muted small">يمكنك إضافة ملفات أو نماذج جديدة لهذا القسم بالضغط على (أرشفة نموذج).</p>
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
                        <h6 class="fw-bold mb-1" style="color: var(--primary-navy); line-height: 1.4;">${escapeHTML(f.display_desc)}</h6>
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
// [8] الرفع والحذف السحابي المؤمن على R2 (R2 Upload & Scoped Deletion)
// ============================================================================

window.uploadTemplate = async function(event) {
    if (event) event.preventDefault();
    
    if (!navigator.onLine) {
        if (typeof Swal !== 'undefined') {
            Swal.fire('تنبيه', 'لا يمكن رفع النماذج السحابية أثناء انقطاع الإنترنت.', 'warning');
        }
        return;
    }

    const fileInput = document.getElementById('tpl_file');
    const title = document.getElementById('tpl_title')?.value?.trim() || '';
    const category = document.getElementById('tpl_category')?.value || 'عقود';
    
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
        if (typeof Swal !== 'undefined') {
            Swal.fire('تنبيه', 'الرجاء اختيار ملف من جهازك أولاً.', 'warning');
        }
        return;
    }
    
    const file = fileInput.files[0];
    const btn = document.getElementById('btn_upload_tpl');
    const originalText = btn ? btn.innerHTML : '';
    
    try {
        if (btn) {
            btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i> جاري الرفع إلى مستودع R2 السحابي...';
            btn.disabled = true;
        }

        // 1. الرفع المباشر لـ Cloudflare R2
        const uploadRes = await API.uploadFileToR2(file, 'general', 'general');
        
        if (uploadRes && uploadRes.success && uploadRes.r2_key) {
            const smartDescription = `${category}:::${title || file.name}`;

            // 2. توثيق السجل في جدول mo_files
            const recordData = {
                case_id: null,
                client_id: null,
                file_name: file.name,
                file_type: file.type || 'application/octet-stream',
                file_extension: file.name.includes('.') ? file.name.split('.').pop().toLowerCase() : '',
                file_category: category,
                file_url: uploadRes.r2_key,
                drive_file_id: uploadRes.r2_key,
                is_template: true,
                description: smartDescription
            };
            
            const dbRes = await API.addFileRecord(recordData);
            
            if (dbRes && !dbRes.error) {
                if (typeof Swal !== 'undefined') {
                    Swal.fire('تم بنجاح', 'تمت أرشفة النموذج السحابي في المكتبة بنجاح.', 'success');
                }
                document.getElementById('uploadForm')?.reset();
                bootstrap.Modal.getInstance(document.getElementById('uploadModal'))?.hide();
                
                await loadArchiveFiles();
            } else {
                if (typeof API.cleanupOrphanR2File === 'function') {
                    await API.cleanupOrphanR2File(uploadRes.r2_key);
                }
                throw new Error(dbRes?.error || 'فشل توثيق النموذج في قاعدة البيانات.');
            }
        } else {
            throw new Error(uploadRes?.error || 'فشل الرفع السحابي.');
        }

    } catch (error) {
        if (typeof Swal !== 'undefined') {
            Swal.fire('خطأ', error.message, 'error');
        }
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
 * الحذف المؤمن لنماذج المكتبة السحابية بتذكرة خادمية لمرة واحدة (AUTH.requireActionAuth)
 */
window.deleteArchiveFile = async function(id) {
    if (!navigator.onLine) {
        if (typeof Swal !== 'undefined') {
            Swal.fire('تنبيه', 'لا يمكن حذف النماذج السحابية في وضع عدم الاتصال (Offline).', 'warning');
        }
        return;
    }

    if (typeof Swal === 'undefined') {
        if (confirm("هل تريد حذف هذا النموذج السحابي نهائياً؟")) {
            await API.deleteFile(id);
            await loadArchiveFiles();
        }
        return;
    }

    const result = await Swal.fire({
        title: 'هل أنت متأكد؟',
        text: 'سيتم حذف هذا النموذج من المكتبة السحابية المشتركة وتوثيق العملية في سجل الرقابة.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#B3372F',
        cancelButtonColor: '#1C2541',
        confirmButtonText: 'نعم، متابعة للتحقق الأمني',
        cancelButtonText: 'تراجع'
    });

    if (!result.isConfirmed) return;

    try {
        const targetTpl = archiveFiles.find(f => String(f.id) === String(id));
        const tplName = targetTpl ? (targetTpl.description?.split(':::')[1] || targetTpl.file_name) : 'نموذج سحابي';

        // استدعاء الحارس الأمني الموحد لاستصدار تذكرة حذف لمرة واحدة
        let actionToken = null;
        if (typeof AUTH !== 'undefined' && typeof AUTH.requireActionAuth === 'function') {
            actionToken = await AUTH.requireActionAuth(
                `حذف النموذج السحابي (${tplName})`,
                'mo_files',
                id
            );
            if (!actionToken) return;
        }

        Swal.fire({ title: 'جاري الحذف وتحديث الأرشيف...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        
        const res = await API.deleteFile(id, actionToken);
        
        if (res && !res.error) {
            Swal.fire('تم الحذف', 'تم حذف النموذج من الأرشيف بنجاح وتوثيقه في السجل الأمني.', 'success');
            await loadArchiveFiles();
        } else {
            throw new Error(res?.error || 'خطأ أثناء حذف النموذج من السحابة.');
        }
    } catch (err) {
        if (err.message && err.message.includes('إلغاء')) return;
        Swal.fire('مرفوض أمنياً', err.message || 'تعذر إتمام عملية الحذف.', 'error');
    }
};
