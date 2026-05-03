/**
 * js/library.js
 * وحدة إدارة المكتبة القانونية والنماذج
 * الدستور المطبق: تحصين الواجهات (Null-Safe)، التخزين السحابي عبر R2، وتأمين الروابط.
 */

// تأمين دالة الرجوع
window.goBack = function() {
    window.history.back();
};

document.addEventListener('DOMContentLoaded', () => {
    // 1. التحقق من الجلسة
    if (!API.getToken()) {
        window.location.href = '/login.html';
        return;
    }

    const elements = {
        libraryContainer: document.getElementById('library-files-container'),
        uploadForm: document.getElementById('upload-library-file-form'),
        fileInput: document.getElementById('library-file-input'),
        categorySelect: document.getElementById('library-category-select'),
        searchInput: document.getElementById('search-library'),
        loader: document.getElementById('library-loader') // إن وجد
    };

    let allFiles = [];

    // 2. جلب الملفات
    const loadLibraryFiles = async () => {
        try {
            if(elements.libraryContainer) elements.libraryContainer.innerHTML = '<div class="loader text-center p-4"><i class="fas fa-spinner fa-spin"></i> جاري تحميل المكتبة...</div>';
            
            const files = await API.get('/api/files?is_template=eq.true&order=created_at.desc');
            allFiles = files;
            renderFiles(files);
        } catch (error) {
            console.error('[Library Error]:', error);
            if(elements.libraryContainer) {
                elements.libraryContainer.innerHTML = `<div class="alert alert-danger">حدث خطأ أثناء تحميل المكتبة: ${error.message}</div>`;
            }
        }
    };

    // 3. العرض
    const renderFiles = (filesToRender) => {
        if (!elements.libraryContainer) return;

        if (!filesToRender || filesToRender.length === 0) {
            elements.libraryContainer.innerHTML = '<div class="alert alert-info text-center w-100 mt-3">لا توجد ملفات في المكتبة حالياً.</div>';
            return;
        }

        elements.libraryContainer.innerHTML = filesToRender.map(file => {
            const secureDownloadUrl = API.getSecureUrl(file.file_url || file.attachment_url);
            const ext = (file.file_extension || '').toLowerCase();
            let icon = '📄';
            if (['pdf'].includes(ext)) icon = '📕';
            if (['doc', 'docx'].includes(ext)) icon = '📘';
            if (['jpg', 'jpeg', 'png'].includes(ext)) icon = '🖼️';

            return `
                <div class="col-md-4 mb-3">
                    <div class="card file-card h-100 shadow-sm border-0 bg-white" data-id="${file.id}">
                        <div class="card-body text-center">
                            <div class="display-4 mb-2">${icon}</div>
                            <h6 class="file-name text-truncate text-navy fw-bold" title="${file.file_name}">${file.file_name}</h6>
                            <span class="badge bg-light text-dark border mb-2">${file.file_category || 'عام'}</span>
                            <div class="small text-muted mb-3">${new Date(file.created_at).toLocaleDateString('ar-EG')}</div>
                            <div class="d-flex gap-2 justify-content-center">
                                <a href="${secureDownloadUrl}" target="_blank" class="btn btn-sm btn-primary w-50 fw-bold">عرض</a>
                                <button class="btn btn-sm btn-outline-danger w-50 fw-bold delete-file-btn" data-id="${file.id}">حذف</button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        document.querySelectorAll('.delete-file-btn').forEach(btn => {
            btn.addEventListener('click', (e) => deleteFile(e.target.dataset.id));
        });
    };

    // 4. الرفع للسحابة R2
    if (elements.uploadForm) {
        elements.uploadForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if(!elements.fileInput) return;
            const file = elements.fileInput.files[0];
            const category = elements.categorySelect ? elements.categorySelect.value : 'نماذج عامة';

            if (!file) return alert('يرجى اختيار ملف أولاً.');

            const submitBtn = elements.uploadForm.querySelector('button[type="submit"]');
            if(submitBtn) {
                submitBtn.innerHTML = 'جاري الرفع للسحابة (R2)... <span class="spinner-border spinner-border-sm"></span>';
                submitBtn.disabled = true;
            }

            try {
                const uploadResult = await API.uploadToCloudR2(file, 'library_templates');

                const fileMetadata = {
                    file_name: file.name,
                    file_extension: file.name.split('.').pop(),
                    file_type: file.type,
                    file_category: category,
                    file_url: uploadResult.file_path, 
                    is_template: true
                };

                await API.post('/api/files', fileMetadata);

                alert('تم رفع الملف بنجاح وإضافته للمكتبة.');
                elements.uploadForm.reset();
                if(typeof bootstrap !== 'undefined') {
                    const modal = bootstrap.Modal.getInstance(document.getElementById('uploadFileModal'));
                    if(modal) modal.hide();
                }
                loadLibraryFiles(); 

            } catch (error) {
                console.error('[Upload Error]:', error);
                alert(`فشل رفع الملف: ${error.message}`);
            } finally {
                if(submitBtn) {
                    submitBtn.innerHTML = 'رفع النموذج';
                    submitBtn.disabled = false;
                }
            }
        });
    }

    // 5. الحذف
    const deleteFile = async (fileId) => {
        if (!confirm('هل أنت متأكد من حذف هذا المستند؟ لا يمكن التراجع عن هذه العملية.')) return;
        try {
            await API.delete(`/api/files?id=eq.${fileId}`);
            alert('تم حذف الملف بنجاح.');
            loadLibraryFiles();
        } catch (error) {
            console.error('[Delete Error]:', error);
            alert(`فشل الحذف: ${error.message}`);
        }
    };

    // 6. البحث
    if (elements.searchInput) {
        elements.searchInput.addEventListener('input', (e) => {
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