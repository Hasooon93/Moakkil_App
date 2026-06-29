/**
 * ============================================================================
 * نظام موكّل (Moakkil System) - 2026
 * الملف: js/library.js
 * الوصف: المحرك الشامل للمكتبة (Smart Editor + Cloud Archive + Canvas Signature + Drafts Engine)
 * التحديث: إضافة محرك حفظ المسودات المحلي لضمان عدم ضياع العمل.
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
let currentCategory = 'عقود'; // التصنيف الافتراضي (تغير إلى 'مسودات' عند التبديل)

document.addEventListener("DOMContentLoaded", async () => {
    // 1. التأكد من تسجيل الدخول
    const token = localStorage.getItem(CONFIG.TOKEN_KEY || 'moakkil_token');
    if (!token) {
        window.location.href = 'login.html';
        return;
    }

    // 2. تهيئة محرر النصوص المتقدم (Quill.js)
    if(document.getElementById('editor-container')) {
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

        if(!clientsRes.error) {
            clientsList = clientsRes;
            const clientSelect = document.getElementById('clientSelector');
            if(clientSelect) {
                clientsList.forEach(c => {
                    clientSelect.innerHTML += `<option value="${c.id}">${c.full_name} (${c.national_id || 'بدون رقم'})</option>`;
                });
            }
        }

        if(!casesRes.error) {
            casesList = casesRes;
            const caseSelect = document.getElementById('caseSelector');
            if(caseSelect) {
                casesList.forEach(c => {
                    caseSelect.innerHTML += `<option value="${c.id}">${c.case_internal_id} - ${c.opponent_name}</option>`;
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

    if(tplSel) tplSel.addEventListener('change', (e) => loadTemplate(e.target.value));
    if(clSel) clSel.addEventListener('change', applyVariablesToEditor);
    if(caSel) caSel.addEventListener('change', applyVariablesToEditor);
}

function loadTemplate(type) {
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
    if (!rawTemplateText) return;

    let processedText = rawTemplateText;
    
    const clientId = document.getElementById('clientSelector').value;
    const clientData = clientsList.find(c => c.id == clientId) || {};
    
    const caseId = document.getElementById('caseSelector').value;
    const caseData = casesList.find(c => c.id == caseId) || {};
    
    const currentUser = JSON.parse(localStorage.getItem(CONFIG.USER_KEY || 'moakkil_user')) || {};

    // قاموس الاستبدال الذكي (Auto-Fill Tags)
    const dict = {
        '{{date}}': new Date().toLocaleDateString('ar-JO'),
        '{{firm_name}}': currentUser.firm_name || 'مكتب المحاماة',
        '{{client_name}}': clientData.full_name || '________________',
        '{{national_id}}': clientData.national_id || '________________',
        '{{client_phone}}': clientData.phone || '________________',
        '{{opponent_name}}': caseData.opponent_name || '________________',
        '{{court_name}}': caseData.current_court || '________________'
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

function openSignatureModal() {
    if(signatureModalInstance) {
        signatureModalInstance.show();
        // تأخير بسيط لضمان ظهور الكانفاس قبل حساب أبعاده
        setTimeout(() => {
            const rect = canvas.parentElement.getBoundingClientRect();
            canvas.width = rect.width - 30; // خصم الحواف
            clearSignature();
        }, 250);
    }
}

function getPointerPos(e) {
    const rect = canvas.getBoundingClientRect();
    if(e.touches && e.touches.length > 0) {
        return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function setupCanvasEvents() {
    if(!canvas || !ctx) return;
    
    const startDrawing = (e) => {
        isDrawing = true;
        const pos = getPointerPos(e);
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
        e.preventDefault(); // منع السكرول بالموبايل
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
    canvas.addEventListener('touchstart', startDrawing, {passive: false});
    canvas.addEventListener('touchmove', draw, {passive: false});
    canvas.addEventListener('touchend', stopDrawing);
}

function clearSignature() {
    if(ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function insertSignature() {
    // التحقق هل تم الرسم فعلاً
    const blank = document.createElement('canvas');
    blank.width = canvas.width; blank.height = canvas.height;
    if (canvas.toDataURL() === blank.toDataURL()) {
        Swal.fire('تنبيه', 'يرجى التوقيع في المربع أولاً', 'warning');
        return;
    }

    const dataUrl = canvas.toDataURL('image/png');
    
    // إدراج التوقيع كصورة في المحرر
    const range = quillEditor.getSelection(true);
    quillEditor.insertText(range.index, '\n', Quill.sources.USER);
    quillEditor.insertEmbed(range.index + 1, 'image', dataUrl, Quill.sources.USER);
    
    signatureModalInstance.hide();
    Swal.fire({
        icon: 'success',
        title: 'تم الإدراج',
        text: 'تم إدراج التوقيع الرقمي بنجاح في المستند.',
        timer: 1500,
        showConfirmButton: false
    });
}

window.printDocument = function() {
    const text = quillEditor.getText().trim();
    if (text.length === 0) {
        Swal.fire('تنبيه', 'المستند فارغ، يرجى كتابة أو اختيار نموذج أولاً.', 'info');
        return;
    }
    window.print();
}

// ============================================================================
// [القسم الثالث]: محرك المسودات (Drafts Engine - LocalStorage) 🔥 جديد 🔥
// ============================================================================

window.saveDraft = function() {
    const content = quillEditor.root.innerHTML;
    const plainText = quillEditor.getText().trim();
    
    if (plainText.length === 0) {
        Swal.fire('تنبيه', 'المحرر فارغ، لا يوجد شيء لحفظه.', 'warning');
        return;
    }

    // بناء عنوان تلقائي للمسودة من أول كلمات مكتوبة
    let previewTitle = plainText.split('\n')[0].substring(0, 30);
    if(previewTitle.length < 3) previewTitle = "مسودة مستند قانوني";

    let drafts = JSON.parse(localStorage.getItem('moakkil_drafts') || '[]');
    const draftId = 'draft_' + Date.now();
    
    drafts.unshift({
        id: draftId,
        title: previewTitle + '...',
        content: content,
        created_at: new Date().toISOString()
    });

    localStorage.setItem('moakkil_drafts', JSON.stringify(drafts));
    
    Swal.fire({
        icon: 'success', 
        title: 'تم حفظ المسودة', 
        text: 'تم الحفظ محلياً بأمان. يمكنك استكمال التحرير لاحقاً من تبويب (مسوداتي).', 
        timer: 2500, 
        showConfirmButton: false
    });

    // تحديث العرض فوراً إذا كنا في تبويب المسودات
    if (currentCategory === 'مسودات') {
        renderDrafts();
    }
};

window.loadDraft = function(id) {
    let drafts = JSON.parse(localStorage.getItem('moakkil_drafts') || '[]');
    const draft = drafts.find(d => d.id === id);
    if(draft) {
        quillEditor.root.innerHTML = draft.content;
        // التمرير السلس إلى المحرر
        window.scrollTo({ top: document.getElementById('smart-editor-section').offsetTop - 20, behavior: 'smooth' });
        
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
        text: 'سيتم حذف هذه المسودة نهائياً.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'نعم، احذف',
        cancelButtonText: 'تراجع'
    }).then((result) => {
        if (result.isConfirmed) {
            let drafts = JSON.parse(localStorage.getItem('moakkil_drafts') || '[]');
            drafts = drafts.filter(d => d.id !== id);
            localStorage.setItem('moakkil_drafts', JSON.stringify(drafts));
            renderDrafts();
            Swal.fire({icon: 'success', title: 'تم الحذف بنجاح', timer: 1500, showConfirmButton: false});
        }
    });
};

function renderDrafts() {
    const container = document.getElementById('templates-container');
    const searchTerm = document.getElementById('search-input')?.value.toLowerCase() || '';
    let drafts = JSON.parse(localStorage.getItem('moakkil_drafts') || '[]');
    
    const filtered = drafts.filter(d => d.title.toLowerCase().includes(searchTerm));
    
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
        const dateStr = dateObj.toLocaleDateString('ar-EG') + ' ' + dateObj.toLocaleTimeString('ar-EG', {hour: '2-digit', minute:'2-digit'});
        
        html += `
        <div class="col-md-6 col-lg-4">
            <div class="template-card border-primary" style="border-right-color: var(--primary-light) !important;">
                <div class="d-flex align-items-start mb-3">
                    <div class="p-3 bg-light rounded-3 me-3 text-primary">
                        <i class="fas fa-file-signature fa-2x"></i>
                    </div>
                    <div>
                        <h6 class="fw-bold mb-1" style="color: var(--primary-dark); line-height:1.4;">${d.title}</h6>
                        <small class="text-muted fw-bold"><i class="fas fa-clock me-1"></i> ${dateStr}</small>
                    </div>
                </div>
                <div class="mt-auto pt-3 border-top d-flex gap-2">
                    <button class="btn flex-grow-1 text-white fw-bold shadow-sm" style="background: var(--primary-dark);" onclick="loadDraft('${d.id}')">
                        <i class="fas fa-edit me-1"></i> إكمال التحرير
                    </button>
                    <button class="btn btn-outline-danger px-3 shadow-sm" onclick="deleteDraft('${d.id}')">
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
        
        if (res && !res.error) {
            archiveFiles = res;
            if (currentCategory !== 'مسودات') {
                renderTemplates();
            }
        } else {
            document.getElementById('templates-container').innerHTML = `<div class="col-12 text-center text-danger fw-bold">فشل في جلب الأرشيف.</div>`;
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
}

window.searchTemplates = function() {
    if (currentCategory === 'مسودات') {
        renderDrafts();
    } else {
        renderTemplates();
    }
}

function renderTemplates() {
    const container = document.getElementById('templates-container');
    const searchTerm = document.getElementById('search-input')?.value.toLowerCase() || '';
    
    if (!container) return;

    // فك تشفير حقل الـ Description لاستخراج الـ Category المدمج
    const processedFiles = archiveFiles.map(f => {
        let cat = 'عقود'; // افتراضي
        let desc = f.description || f.file_name;
        
        if (f.description && f.description.includes(':::')) {
            const parts = f.description.split(':::');
            cat = parts[0];
            desc = parts[1];
        }
        
        return { ...f, ext_category: cat, display_desc: desc };
    });

    const filteredFiles = processedFiles.filter(f => {
        const matchesCategory = f.ext_category === currentCategory;
        const matchesSearch = f.file_name.toLowerCase().includes(searchTerm) || f.display_desc.toLowerCase().includes(searchTerm);
        return matchesCategory && matchesSearch;
    });

    if (filteredFiles.length === 0) {
        container.innerHTML = `
            <div class="col-12 text-center py-5">
                <i class="fas fa-folder-open fa-4x text-muted mb-3 opacity-50"></i>
                <h5 class="text-muted fw-bold">لا توجد ملفات سحابية في قسم (${currentCategory}) مطابقة للبحث.</h5>
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
        const ext = f.file_name.split('.').pop().toLowerCase();
        const icon = icons[ext] || icons['default'];
        const dateStr = new Date(f.created_at).toLocaleDateString('ar-EG');
        
        html += `
        <div class="col-md-6 col-lg-4">
            <div class="template-card">
                <div class="d-flex align-items-start mb-3">
                    <div class="p-3 bg-light rounded-3 me-3">
                        <i class="fas ${icon} fa-2x"></i>
                    </div>
                    <div>
                        <h6 class="fw-bold mb-1" style="color: var(--primary-dark); line-height:1.4;">${f.display_desc}</h6>
                        <small class="text-muted fw-bold"><i class="fas fa-clock me-1"></i> أضيف في: ${dateStr}</small>
                    </div>
                </div>
                
                <div class="mt-auto pt-3 border-top d-flex gap-2">
                    <button class="btn btn-gold flex-grow-1" onclick="downloadArchiveFile('${f.file_url}', '${f.file_name}')">
                        <i class="fas fa-download"></i> تحميل
                    </button>
                    <button class="btn btn-outline-danger px-3" onclick="deleteArchiveFile('${f.id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        </div>`;
    });

    container.innerHTML = html;
}

// ============================================================================
// [القسم الخامس]: الرفع السحابي للأرشيف (Upload & Delete)
// ============================================================================

window.uploadTemplate = async function(event) {
    event.preventDefault();
    
    const fileInput = document.getElementById('tpl_file');
    const title = document.getElementById('tpl_title').value;
    const category = document.getElementById('tpl_category').value;
    
    if (!fileInput.files || fileInput.files.length === 0) {
        Swal.fire('تنبيه', 'الرجاء اختيار ملف', 'warning');
        return;
    }
    
    const file = fileInput.files[0];
    const btn = document.getElementById('btn_upload_tpl');
    const originalText = btn.innerHTML;
    
    try {
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الرفع للسحابة...';
        btn.disabled = true;

        // 1. الرفع لـ Cloudflare R2
        const uploadRes = await API.uploadFileToR2(file, 'library', 'template');
        
        if (uploadRes && uploadRes.success && uploadRes.r2_key) {
            
            // دمج التصنيف مع الوصف
            const smartDescription = `${category}:::${title}`;

            // 2. تسجيل الملف في قاعدة البيانات
            const recordData = {
                case_id: null,
                client_id: null,
                file_name: file.name,
                file_url: uploadRes.r2_key,
                description: smartDescription
            };
            
            const dbRes = await API.addFileRecord(recordData);
            
            if (!dbRes.error) {
                Swal.fire('تم بنجاح', 'تم أرشفة النموذج السحابي بنجاح', 'success');
                document.getElementById('uploadForm').reset();
                bootstrap.Modal.getInstance(document.getElementById('uploadModal')).hide();
                
                // إعادة جلب البيانات
                await loadArchiveFiles();
            } else throw new Error(dbRes.error);
        } else throw new Error(uploadRes.error || 'فشل الرفع السحابي');

    } catch (error) {
        Swal.fire('خطأ', error.message, 'error');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

window.downloadArchiveFile = async function(r2Key, fileName) {
    await API.downloadR2File(r2Key, fileName);
}

window.deleteArchiveFile = async function(id) {
    const result = await Swal.fire({
        title: 'هل أنت متأكد؟',
        text: 'سيتم حذف هذا النموذج من المكتبة المشتركة.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'نعم، احذف النموذج',
        cancelButtonText: 'تراجع'
    });

    if (result.isConfirmed) {
        Swal.fire({ title: 'جاري الحذف...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        const res = await API.deleteFile(id);
        
        if (!res.error) {
            Swal.fire('تم الحذف', 'تم حذف النموذج من الأرشيف بنجاح.', 'success');
            await loadArchiveFiles();
        } else {
            Swal.fire('خطأ', res.error, 'error');
        }
    }
}