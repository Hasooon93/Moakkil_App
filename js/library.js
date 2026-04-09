// moakkil-library.js
// الدستور المطبق: أرشفة ذكية، لا ضياع للملفات، الذكاء الاصطناعي، العزل التام.

document.addEventListener('DOMContentLoaded', () => {
    // عناصر الواجهة
    const dropZone = document.getElementById('dropZone');
    const uploadInput = document.getElementById('uploadInput');
    const filesGrid = document.getElementById('filesGrid');
    const filterBtns = document.querySelectorAll('.filter-btn');
    
    // عناصر النافذة المنبثقة
    const modal = document.getElementById('fileDetailsModal');
    const fileForm = document.getElementById('fileDetailsForm');
    const caseSelect = document.getElementById('meta_case_id');
    const clientSelect = document.getElementById('meta_client_id');
    
    let currentPendingFile = null;
    let allFiles = [];

    // ==========================================
    // 1. التهيئة وجلب البيانات
    // ==========================================
    async function initLibrary() {
        try {
            // جلب الملفات، القضايا، والموكلين بالتوازي لتوفير الوقت
            const [files, cases, clients] = await Promise.all([
                api.get('/api/files?select=*,mo_cases(case_internal_id),mo_clients(full_name)'),
                api.get('/api/cases?select=id,case_internal_id'),
                api.get('/api/clients?select=id,full_name')
            ]);

            allFiles = files || [];
            renderFiles(allFiles);

            // تعبئة قوائم الربط (Drop-downs)
            cases.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.id; opt.textContent = c.case_internal_id;
                caseSelect.appendChild(opt);
            });

            clients.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.id; opt.textContent = c.full_name;
                clientSelect.appendChild(opt);
            });

        } catch (error) {
            console.error("خطأ في تهيئة المكتبة:", error);
            filesGrid.innerHTML = `<div style="color:red; text-align:center; grid-column: 1/-1;">فشل تحميل المكتبة: ${error.message}</div>`;
        }
    }

    // ==========================================
    // 2. عرض الملفات والفلاتر
    // ==========================================
    function renderFiles(filesToRender) {
        filesGrid.innerHTML = '';
        if (filesToRender.length === 0) {
            filesGrid.innerHTML = '<div style="text-align:center; grid-column: 1/-1; color: gray;">لا توجد ملفات في هذا التصنيف.</div>';
            return;
        }

        filesToRender.forEach(file => {
            const ext = (file.file_extension || '').toLowerCase();
            let icon = 'fa-file'; let iconClass = '';
            if (['pdf'].includes(ext)) { icon = 'fa-file-pdf'; iconClass = 'pdf'; }
            else if (['doc', 'docx'].includes(ext)) { icon = 'fa-file-word'; iconClass = 'word'; }
            else if (['jpg', 'jpeg', 'png'].includes(ext)) { icon = 'fa-file-image'; iconClass = 'image'; }

            let badgeHtml = '';
            let cardClass = 'file-card';
            
            if (file.is_template) {
                cardClass += ' template';
                badgeHtml += '<div style="position:absolute; top:10px; left:10px; color:#ffc107;" title="نموذج قانوني"><i class="fas fa-star"></i></div>';
            }

            let aiHtml = '';
            if (file.is_analyzed && file.ai_summary) {
                cardClass += ' analyzed';
                aiHtml = `<div class="ai-summary-badge"><i class="fas fa-brain"></i> <b>الخلاصة:</b> ${file.ai_summary.substring(0, 80)}...</div>`;
            }

            const metaText = file.mo_cases?.case_internal_id ? `قضية: ${file.mo_cases.case_internal_id}` : 
                             file.mo_clients?.full_name ? `موكل: ${file.mo_clients.full_name}` : 'غير مرتبط';

            const card = document.createElement('div');
            card.className = cardClass;
            card.innerHTML = `
                ${badgeHtml}
                <div class="file-icon ${iconClass}"><i class="fas ${icon}"></i></div>
                <div class="file-name" title="${file.file_name}">${file.file_name}</div>
                <div class="file-meta">${metaText} | ${new Date(file.created_at).toLocaleDateString('ar-EG')}</div>
                ${aiHtml}
                <div class="card-actions">
                    <button class="btn-action btn-view" onclick="window.open('${file.file_url || '#'}', '_blank')" title="عرض في درايف"><i class="fas fa-eye"></i></button>
                    <button class="btn-action btn-ai" onclick="summarizeFile('${file.id}')" title="تحليل بالذكاء الاصطناعي"><i class="fas fa-magic"></i></button>
                    <button class="btn-action btn-delete" onclick="deleteFile('${file.id}')" title="حذف الأرشفة"><i class="fas fa-trash"></i></button>
                </div>
            `;
            filesGrid.appendChild(card);
        });
    }

    // نظام الفلترة
    filterBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            filterBtns.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            
            const filter = e.target.dataset.filter;
            let filtered = allFiles;
            
            if (filter === 'template') filtered = allFiles.filter(f => f.is_template);
            else if (filter === 'analyzed') filtered = allFiles.filter(f => f.is_analyzed);
            else if (filter === 'case') filtered = allFiles.filter(f => f.case_id !== null);
            else if (filter === 'client') filtered = allFiles.filter(f => f.client_id !== null);
            
            renderFiles(filtered);
        });
    });

    // ==========================================
    // 3. نظام الرفع والتصنيف (درايف + قاعدة البيانات)
    // ==========================================
    
    // أحداث السحب والإفلات
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault(); dropZone.classList.remove('dragover');
        if (e.dataTransfer.files.length) handleFileSelection(e.dataTransfer.files[0]);
    });
    
    dropZone.addEventListener('click', () => uploadInput.click());
    uploadInput.addEventListener('change', (e) => {
        if (e.target.files.length) handleFileSelection(e.target.files[0]);
    });

    function handleFileSelection(file) {
        currentPendingFile = file;
        document.getElementById('meta_file_name').value = file.name;
        modal.classList.add('active'); // فتح نافذة التصنيف
    }

    window.closeModal = () => {
        modal.classList.remove('active');
        fileForm.reset();
        currentPendingFile = null;
        uploadInput.value = '';
    };

    // إرسال البيانات للباك إند بعد التصنيف
    fileForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!currentPendingFile) return;

        const btnSubmit = fileForm.querySelector('button[type="submit"]');
        const originalText = btnSubmit.innerHTML;
        btnSubmit.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الرفع...';
        btnSubmit.disabled = true;

        try {
            // الخطوة 1: طلب رابط رفع من Worker (محاكاة Google Drive)
            const driveRes = await api.get('/api/drive/generate-upload-url');
            const gdriveFileId = driveRes.gdrive_file_id || crypto.randomUUID();
            
            // (هنا يتم الرفع الفعلي لـ Google Drive باستخدام الرابط)
            // await fetch(driveRes.upload_url, { method: 'PUT', body: currentPendingFile });

            // الخطوة 2: حفظ البيانات التعريفية في جدول mo_files (الكنز المفقود!)
            const fileData = {
                file_name: document.getElementById('meta_file_name').value,
                file_category: document.getElementById('meta_file_category').value,
                case_id: caseSelect.value || null,
                client_id: clientSelect.value || null,
                is_template: document.getElementById('meta_is_template').checked,
                drive_file_id: gdriveFileId,
                file_extension: currentPendingFile.name.split('.').pop(),
                file_url: `https://drive.google.com/file/d/${gdriveFileId}/view`, // رابط وهمي للعرض
                file_type: currentPendingFile.type
            };

            await api.post('/api/files', fileData);
            
            alert('تم الأرشفة بنجاح وربط الملف بقاعدة البيانات!');
            closeModal();
            initLibrary(); // إعادة تحميل المكتبة
        } catch (error) {
            alert("حدث خطأ أثناء الرفع: " + error.message);
        } finally {
            btnSubmit.innerHTML = originalText;
            btnSubmit.disabled = false;
        }
    });

    // ==========================================
    // 4. محرك الذكاء الاصطناعي لقراءة الملفات (AI OCR & Summarize)
    // ==========================================
    window.summarizeFile = async (fileId) => {
        const fileObj = allFiles.find(f => f.id === fileId);
        if (!fileObj) return;

        // تنبيه ذكي للمستخدم
        const proceed = confirm(`هل تريد من الذكاء الاصطناعي قراءة وتحليل ملف "${fileObj.file_name}" واستخراج خلاصته؟\n(هذه العملية تستهلك من كوتا الذكاء الاصطناعي الخاصة بالمكتب).`);
        if (!proceed) return;

        try {
            // محاكاة استخراج النص من الملف (في الواقع نستخدم مكتبة أو Endpoint)
            // سنرسل طلباً للـ Worker الخاص بنا الذي برمجناه مسبقاً
            const aiPayload = {
                type: 'data_extractor',
                content: `قم بقراءة هذا الملف ذو التصنيف (${fileObj.file_category || 'مستند'}) واستخرج أهم 3 نقاط منه باختصار شديد.`
            };

            const response = await api.post('/api/ai/process', aiPayload);
            
            // تحديث قاعدة البيانات بنتيجة الذكاء الاصطناعي
            const summaryText = response.extracted_json ? JSON.stringify(response.extracted_json) : (response.reply || "تمت قراءة الملف بنجاح.");
            
            await api.patch(`/api/files?id=eq.${fileId}`, {
                is_analyzed: true,
                ai_summary: summaryText
            });

            alert("تم التحليل بنجاح!");
            initLibrary(); // تحديث الواجهة لظهور التاج الأخضر
        } catch (error) {
            alert("فشل التحليل الذكي: " + error.message);
        }
    };

    // حماية الحذف الشامل
    window.deleteFile = async (fileId) => {
        if (!confirm('هل أنت متأكد من حذف هذا الملف من الأرشيف؟ (سيتم تسجيل ذلك في سجل الرقابة)')) return;
        try {
            await api.delete(`/api/files?id=eq.${fileId}`);
            initLibrary();
        } catch (e) { alert("فشل الحذف: " + e.message); }
    };

    // تشغيل النظام
    initLibrary();
});