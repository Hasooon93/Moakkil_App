/**
 * js/library.js
 * وحدة إدارة المكتبة القانونية والنماذج
 * الدستور المطبق: التخزين السحابي عبر R2، تأمين الروابط (Zero Trust)، والعزل التام.
 */

document.addEventListener('DOMContentLoaded', () => {
    // التحقق من الجلسة أولاً
    if (!API.getToken()) {
        window.location.href = '/login.html';
        return;
    }

    const libraryContainer = document.getElementById('library-files-container');
    const uploadForm = document.getElementById('upload-library-file-form');
    const fileInput = document.getElementById('library-file-input');
    const categorySelect = document.getElementById('library-category-select');
    const searchInput = document.getElementById('search-library');

    let allFiles = [];

    // 1. جلب الملفات من قاعدة البيانات (فقط النماذج والملفات العامة للمكتب)
    const loadLibraryFiles = async () => {
        try {
            libraryContainer.innerHTML = '<div class="loader">جاري تحميل المكتبة...</div>';
            // استدعاء الملفات التي تم تصنيفها كنماذج (is_template = true)
            const files = await API.get('/api/files?is_template=eq.true&order=created_at.desc');
            allFiles = files;
            renderFiles(files);
        } catch (error) {
            console.error('[Library Error]:', error);
            libraryContainer.innerHTML = `<div class="error-msg">حدث خطأ أثناء تحميل المكتبة: ${error.message}</div>`;
        }
    };

    // 2. عرض الملفات بشكل ديناميكي (UI Render)
    const renderFiles = (filesToRender) => {
        if (!filesToRender || filesToRender.length === 0) {
            libraryContainer.innerHTML = '<div class="empty-state">لا توجد ملفات في المكتبة حالياً.</div>';
            return;
        }

        libraryContainer.innerHTML = filesToRender.map(file => {
            // [التحديث الأمني]: إحاطة الرابط بدالة getSecureUrl لدمج التوكن وفك تشفير R2
            const secureDownloadUrl = API.getSecureUrl(file.file_url || file.attachment_url);
            
            // تحديد أيقونة الملف بناءً على الامتداد
            const ext = (file.file_extension || '').toLowerCase();
            let icon = '📄';
            if (['pdf'].includes(ext)) icon = '📕';
            if (['doc', 'docx'].includes(ext)) icon = '📘';
            if (['jpg', 'jpeg', 'png'].includes(ext)) icon = '🖼️';

            return `
                <div class="file-card" data-id="${file.id}">
                    <div class="file-icon">${icon}</div>
                    <div class="file-info">
                        <h4 class="file-name" title="${file.file_name}">${file.file_name}</h4>
                        <span class="file-category badge">${file.file_category || 'عام'}</span>
                        <span class="file-date">${new Date(file.created_at).toLocaleDateString('ar-EG')}</span>
                    </div>
                    <div class="file-actions">
                        <a href="${secureDownloadUrl}" target="_blank" class="btn btn-sm btn-primary">عرض / تحميل</a>
                        <button class="btn btn-sm btn-danger delete-file-btn" data-id="${file.id}">حذف</button>
                    </div>
                </div>
            `;
        }).join('');

        // تفعيل أزرار الحذف
        document.querySelectorAll('.delete-file-btn').forEach(btn => {
            btn.addEventListener('click', (e) => deleteFile(e.target.dataset.id));
        });
    };

    // 3. رفع ملف جديد إلى السحابة (Cloudflare R2 Migration)
    if (uploadForm) {
        uploadForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const file = fileInput.files[0];
            const category = categorySelect.value || 'نماذج عامة';

            if (!file) return alert('يرجى اختيار ملف أولاً.');

            const submitBtn = uploadForm.querySelector('button[type="submit"]');
            const originalBtnText = submitBtn.innerHTML;
            submitBtn.innerHTML = 'جاري الرفع للسحابة (R2)... <span class="spinner"></span>';
            submitBtn.disabled = true;

            try {
                // الخطوة أ: رفع الملف الفعلي للسحابة عبر المسار الآمن
                const uploadResult = await API.uploadToCloudR2(file, 'library_templates');

                // الخطوة ب: حفظ بيانات الملف (Metadata) في جدول mo_files
                const fileMetadata = {
                    file_name: file.name,
                    file_extension: file.name.split('.').pop(),
                    file_type: file.type,
                    file_category: category,
                    file_url: uploadResult.file_path, // حفظ مسار R2
                    is_template: true, // تمييزه كنموذج مكتبة
                    // ai_summary: يمكن لاحقاً ربطها بمحرك الاستخراج
                };

                await API.post('/api/files', fileMetadata);

                alert('تم رفع الملف بنجاح وإضافته للمكتبة.');
                uploadForm.reset();
                loadLibraryFiles(); // إعادة تحميل القائمة

            } catch (error) {
                console.error('[Upload Error]:', error);
                alert(`فشل رفع الملف: ${error.message}`);
            } finally {
                submitBtn.innerHTML = originalBtnText;
                submitBtn.disabled = false;
            }
        });
    }

    // 4. حذف الملف من المكتبة (الرقابة والأمان)
    const deleteFile = async (fileId) => {
        if (!confirm('هل أنت متأكد من حذف هذا المستند؟ لا يمكن التراجع عن هذه العملية.')) return;

        try {
            // ملاحظة: الحذف هنا يحذف السجل من قاعدة البيانات ويتم توثيقه في mo_activity_logs بواسطة الوركر
            await API.delete(`/api/files?id=eq.${fileId}`);
            alert('تم حذف الملف بنجاح.');
            loadLibraryFiles();
        } catch (error) {
            console.error('[Delete Error]:', error);
            alert(`فشل الحذف: ${error.message}`);
        }
    };

    // 5. محرك البحث الداخلي
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            const filtered = allFiles.filter(f => 
                (f.file_name && f.file_name.toLowerCase().includes(query)) || 
                (f.file_category && f.file_category.toLowerCase().includes(query))
            );
            renderFiles(filtered);
        });
    }

    // التشغيل الأولي
    loadLibraryFiles();
});