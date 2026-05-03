/**
 * js/client-details.js
 * وحدة الإدارة الشاملة لملف الموكل (Client Profile & Portal Management)
 * الدستور المطبق: تحصين الواجهات (Null-Safe)، استغلال 100% للبيانات، التخزين السحابي R2، وبوابة الموكل.
 */

window.goBack = function() {
    window.history.back();
};

document.addEventListener('DOMContentLoaded', async () => {
    if (!window.API || !window.API.getToken()) {
        window.location.href = '/login.html';
        return;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const clientId = urlParams.get('id');

    if (!clientId) {
        alert('لم يتم تحديد الموكل.');
        window.location.href = '/app.html#clients';
        return;
    }

    // ==========================================
    // المتغيرات ومؤشرات واجهة المستخدم (Null-Safe)
    // ==========================================
    const elements = {
        loader: document.getElementById('client-loader') || document.getElementById('main-loader'),
        content: document.getElementById('client-content') || document.getElementById('main-content'),
        
        fullName: document.getElementById('det-full-name') || document.getElementById('header-client-name'),
        phone: document.getElementById('det-phone'),
        nationalId: document.getElementById('det-national-id'),
        email: document.getElementById('det-email'),
        address: document.getElementById('det-address'),
        dob: document.getElementById('det-dob'),
        
        motherName: document.getElementById('det-mother'),
        placeOfBirth: document.getElementById('det-pob'),
        nationality: document.getElementById('det-nationality'),
        maritalStatus: document.getElementById('det-marital'),
        profession: document.getElementById('det-profession'),
        confidentiality: document.getElementById('client-confidentiality'),
        clientType: document.getElementById('client-type'),
        notes: document.getElementById('client-notes'),

        portalStatusBadge: document.getElementById('portal_status_badge'),
        portalLastSeenBadge: document.getElementById('portal_last_seen_badge'),
        togglePortalBtn: document.getElementById('toggle-portal-btn'),
        documentsList: document.getElementById('client-files-list'),
        casesList: document.getElementById('client-cases-list'),

        uploadDocForm: document.getElementById('fileForm'),
        docFileInput: document.getElementById('file_input'),
        docCategoryInput: document.getElementById('file_category_input'),
        docTitleInput: document.getElementById('file_title_input'),
        docExpiryInput: document.getElementById('file_expiry_date')
    };

    let currentClientData = null;

    // ==========================================
    // المحرك الرئيسي لجلب البيانات
    // ==========================================
    const loadClientDetails = async () => {
        try {
            if(elements.content) elements.content.style.display = 'none';
            if(elements.loader) elements.loader.style.display = 'block';

            const clientReq = await window.API.get(`/api/clients?id=eq.${clientId}`);
            if (!clientReq || clientReq.length === 0) throw new Error('الموكل غير موجود أو لا تملك صلاحية الوصول.');
            currentClientData = clientReq[0];

            const casesReq = await window.API.get(`/api/cases?client_id=eq.${clientId}&order=created_at.desc`);

            renderClientData(currentClientData);
            renderClientDocuments(currentClientData.identity_documents);
            renderClientCases(casesReq);

            if(elements.loader) elements.loader.style.display = 'none';
            if(elements.content) elements.content.style.display = 'block';
        } catch (error) {
            console.error('[Client Details Error]:', error);
            if(elements.loader) {
                elements.loader.innerHTML = `<div class="alert alert-danger">${error.message}</div>`;
            } else if (typeof showAlert !== 'undefined') {
                showAlert(`خطأ: ${error.message}`, 'danger');
            } else {
                alert(`خطأ: ${error.message}`);
            }
        }
    };

    // ==========================================
    // عرض البيانات (UI Rendering)
    // ==========================================
    const renderClientData = (data) => {
        const safe = (val) => val ? val : 'غير محدد';

        if(elements.fullName) elements.fullName.textContent = safe(data.full_name);
        if(elements.phone) elements.phone.textContent = safe(data.phone);
        if(elements.nationalId) elements.nationalId.textContent = safe(data.national_id);
        if(elements.email) elements.email.textContent = safe(data.email);
        if(elements.address) elements.address.textContent = safe(data.address);
        if(elements.dob) elements.dob.textContent = safe(data.date_of_birth);
        
        if(elements.motherName) elements.motherName.textContent = safe(data.mother_name);
        if(elements.placeOfBirth) elements.placeOfBirth.textContent = safe(data.place_of_birth);
        if(elements.nationality) elements.nationality.textContent = safe(data.nationality);
        if(elements.maritalStatus) elements.maritalStatus.textContent = safe(data.marital_status);
        if(elements.profession) elements.profession.textContent = safe(data.profession || data.occupation);

        if (elements.portalStatusBadge) {
            if (data.client_portal_active) {
                elements.portalStatusBadge.className = 'badge bg-success border-success text-white px-3 py-2 shadow-sm';
                elements.portalStatusBadge.innerHTML = '<i class="fas fa-check-circle me-1"></i> البوابة مفعلة';
                if(elements.togglePortalBtn) {
                    elements.togglePortalBtn.textContent = 'إيقاف الدخول';
                    elements.togglePortalBtn.className = 'btn btn-outline-danger btn-sm';
                }
            } else {
                elements.portalStatusBadge.className = 'badge bg-secondary border-secondary text-white px-3 py-2 shadow-sm';
                elements.portalStatusBadge.innerHTML = '<i class="fas fa-times-circle me-1"></i> البوابة معطلة';
                if(elements.togglePortalBtn) {
                    elements.togglePortalBtn.textContent = 'تفعيل الدخول';
                    elements.togglePortalBtn.className = 'btn btn-outline-success btn-sm';
                }
            }
        }
    };

    const renderClientDocuments = (docsData) => {
        if (!elements.documentsList) return;
        
        let docs = [];
        if (typeof docsData === 'string') {
            try { docs = JSON.parse(docsData); } catch(e) { docs = []; }
        } else if (Array.isArray(docsData)) {
            docs = docsData;
        }

        if (!docs || docs.length === 0) {
            elements.documentsList.innerHTML = '<div class="col-12"><div class="alert alert-info border-0 shadow-sm text-center small fw-bold">لا توجد وثائق أو وكالات مرفوعة لهذا الموكل.</div></div>';
            return;
        }

        elements.documentsList.innerHTML = docs.map((doc, index) => {
            const secureDocUrl = window.API.getSecureUrl(doc.url || doc.file_path);
            const docName = doc.file_name || doc.name || `وثيقة رقم ${index + 1}`;
            const expiry = doc.expiry_date ? `<div class="text-danger small mt-1"><i class="fas fa-hourglass-end"></i> انتهاء: ${doc.expiry_date}</div>` : '';
            
            return `
                <div class="col-md-6 mb-3">
                    <div class="card h-100 shadow-sm border-0 bg-white">
                        <div class="card-body d-flex justify-content-between align-items-center p-3">
                            <div class="text-truncate" style="max-width: 70%;" title="${docName}">
                                <i class="fas fa-file-pdf text-danger fs-4 me-2 align-middle"></i>
                                <strong>${docName}</strong>
                                <div class="text-muted small mt-1">${new Date(doc.uploaded_at || Date.now()).toLocaleDateString('ar-EG')}</div>
                                ${expiry}
                            </div>
                            <a href="${secureDocUrl}" target="_blank" class="btn btn-sm btn-outline-primary fw-bold px-3">عرض</a>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    };

    const renderClientCases = (cases) => {
        if (!elements.casesList) return;
        if (!cases || cases.length === 0) {
            elements.casesList.innerHTML = '<div class="text-center p-4 text-muted small bg-white rounded border shadow-sm w-100">لا توجد قضايا مرتبطة بهذا الموكل حتى الآن.</div>';
            return;
        }

        elements.casesList.innerHTML = cases.map(c => {
            const statusColor = c.status === 'نشطة' ? 'success' : 'warning';
            return `
                <div class="card-custom case-card p-3 mb-2 shadow-sm border-start border-4 border-${statusColor} bg-white rounded-3">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <a href="/case-details.html?id=${c.id}" class="text-decoration-none fw-bold text-navy fs-6">${c.case_internal_id || 'بدون رقم'}</a>
                        <span class="badge bg-${statusColor} shadow-sm">${c.status || 'غير محدد'}</span>
                    </div>
                    <div class="text-muted small mb-2"><i class="fas fa-gavel me-1 text-secondary"></i> الخصم: <b class="text-danger">${c.opponent_name || '--'}</b></div>
                    <div class="d-flex justify-content-between align-items-center border-top pt-2 mt-2">
                        <small class="text-muted">النوع: ${c.case_type || '--'}</small>
                        <small class="text-primary fw-bold"><i class="fas fa-key"></i> PIN: ${c.access_pin || '---'}</small>
                    </div>
                </div>
            `;
        }).join('');
    };

    // ==========================================
    // العمليات التفاعلية والإدخال
    // ==========================================
    if (elements.uploadDocForm) {
        elements.uploadDocForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if(!elements.docFileInput) return;
            const file = elements.docFileInput.files[0];
            const docTitle = elements.docTitleInput ? elements.docTitleInput.value : file.name;
            const docExpiry = elements.docExpiryInput ? elements.docExpiryInput.value : null;

            if (!file) return alert('يرجى اختيار المستند.');

            const submitBtn = elements.uploadDocForm.querySelector('button[type="submit"]');
            if(submitBtn) {
                submitBtn.innerHTML = 'جاري الرفع للسحابة (R2)... <span class="spinner-border spinner-border-sm"></span>';
                submitBtn.disabled = true;
            }

            try {
                const uploadResult = await window.API.uploadToCloudR2(file, `clients/${clientId}/documents`);

                let currentDocs = [];
                if (typeof currentClientData.identity_documents === 'string') {
                    try { currentDocs = JSON.parse(currentClientData.identity_documents); } catch(err) {}
                } else if (Array.isArray(currentClientData.identity_documents)) {
                    currentDocs = currentClientData.identity_documents;
                }

                currentDocs.push({
                    file_name: docTitle || file.name,
                    url: uploadResult.file_path, 
                    expiry_date: docExpiry,
                    uploaded_at: new Date().toISOString()
                });

                await window.API.patch(`/api/clients?id=eq.${clientId}`, { identity_documents: currentDocs });

                alert('تم رفع الوثيقة بنجاح.');
                elements.uploadDocForm.reset();
                if(typeof bootstrap !== 'undefined') {
                    const modal = bootstrap.Modal.getInstance(document.getElementById('fileModal'));
                    if(modal) modal.hide();
                }
                loadClientDetails();
            } catch (error) {
                console.error('[Document Upload Error]:', error);
                alert(`فشل رفع الوثيقة: ${error.message}`);
            } finally {
                if(submitBtn) {
                    submitBtn.innerHTML = '<i class="fas fa-upload me-1"></i> حفظ في أرشيف الموكل';
                    submitBtn.disabled = false;
                }
            }
        });
    }

    // التشغيل الأولي
    loadClientDetails();
});