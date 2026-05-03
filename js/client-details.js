/**
 * js/client-details.js
 * وحدة الإدارة الشاملة لملف الموكل (Client Profile & Portal Management)
 * الدستور المطبق: استغلال 100% لبيانات الهوية، التخزين السحابي R2، والتحكم ببوابة الموكل.
 */

document.addEventListener('DOMContentLoaded', async () => {
    // 1. التحقق من الجلسة (Security First)
    if (!API.getToken()) {
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
    // 2. المتغيرات ومؤشرات واجهة المستخدم (UI Elements)
    // ==========================================
    const elements = {
        loader: document.getElementById('client-loader'),
        content: document.getElementById('client-content'),
        
        // البيانات الأساسية والشخصية
        fullName: document.getElementById('client-full-name'),
        phone: document.getElementById('client-phone'),
        nationalId: document.getElementById('client-national-id'),
        email: document.getElementById('client-email'),
        address: document.getElementById('client-address'),
        dob: document.getElementById('client-dob'),
        
        // الحقول الذهبية المستردة (Zero Data Loss)
        motherName: document.getElementById('client-mother-name'),
        placeOfBirth: document.getElementById('client-pob'),
        nationality: document.getElementById('client-nationality'),
        maritalStatus: document.getElementById('client-marital-status'),
        profession: document.getElementById('client-profession'),
        confidentiality: document.getElementById('client-confidentiality'),
        clientType: document.getElementById('client-type'),
        notes: document.getElementById('client-notes'),

        // بوابة الموكل والمستندات
        portalStatusBadge: document.getElementById('portal-status-badge'),
        togglePortalBtn: document.getElementById('toggle-portal-btn'),
        documentsList: document.getElementById('client-documents-list'),
        casesList: document.getElementById('client-cases-list'),

        // النماذج (Forms)
        uploadDocForm: document.getElementById('upload-client-doc-form'),
        docFileInput: document.getElementById('client-doc-file')
    };

    let currentClientData = null;

    // ==========================================
    // 3. المحرك الرئيسي لجلب البيانات (Data Fetching)
    // ==========================================
    const loadClientDetails = async () => {
        try {
            elements.content.style.display = 'none';
            elements.loader.style.display = 'block';

            // جلب بيانات الموكل
            const clientReq = await API.get(`/api/clients?id=eq.${clientId}`);
            if (!clientReq || clientReq.length === 0) throw new Error('الموكل غير موجود أو لا تملك صلاحية الوصول.');
            currentClientData = clientReq[0];

            // جلب القضايا المرتبطة بهذا الموكل
            const casesReq = await API.get(`/api/cases?client_id=eq.${clientId}&order=created_at.desc`);

            renderClientData(currentClientData);
            renderClientDocuments(currentClientData.identity_documents);
            renderClientCases(casesReq);

            elements.loader.style.display = 'none';
            elements.content.style.display = 'block';
        } catch (error) {
            console.error('[Client Details Error]:', error);
            elements.loader.innerHTML = `<div class="alert alert-danger">${error.message}</div>`;
        }
    };

    // ==========================================
    // 4. عرض البيانات (UI Rendering)
    // ==========================================
    const renderClientData = (data) => {
        const safe = (val) => val ? val : 'غير محدد';

        if(elements.fullName) elements.fullName.textContent = safe(data.full_name);
        if(elements.phone) elements.phone.textContent = safe(data.phone);
        if(elements.nationalId) elements.nationalId.textContent = safe(data.national_id);
        if(elements.email) elements.email.textContent = safe(data.email);
        if(elements.address) elements.address.textContent = safe(data.address);
        if(elements.dob) elements.dob.textContent = safe(data.date_of_birth);
        
        // الحقول العميقة المستردة
        if(elements.motherName) elements.motherName.textContent = safe(data.mother_name);
        if(elements.placeOfBirth) elements.placeOfBirth.textContent = safe(data.place_of_birth);
        if(elements.nationality) elements.nationality.textContent = safe(data.nationality);
        if(elements.maritalStatus) elements.maritalStatus.textContent = safe(data.marital_status);
        if(elements.profession) elements.profession.textContent = safe(data.profession || data.occupation);
        if(elements.confidentiality) elements.confidentiality.textContent = safe(data.confidentiality_level);
        if(elements.clientType) elements.clientType.textContent = safe(data.client_type);
        if(elements.notes) elements.notes.textContent = safe(data.notes);

        // حالة بوابة الموكل
        if (elements.portalStatusBadge) {
            if (data.client_portal_active) {
                elements.portalStatusBadge.className = 'badge bg-success';
                elements.portalStatusBadge.textContent = 'البوابة مفعلة';
                if(elements.togglePortalBtn) {
                    elements.togglePortalBtn.textContent = 'إيقاف دخول الموكل';
                    elements.togglePortalBtn.className = 'btn btn-outline-danger btn-sm';
                }
            } else {
                elements.portalStatusBadge.className = 'badge bg-secondary';
                elements.portalStatusBadge.textContent = 'البوابة معطلة';
                if(elements.togglePortalBtn) {
                    elements.togglePortalBtn.textContent = 'تفعيل دخول الموكل';
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
            elements.documentsList.innerHTML = '<div class="alert alert-info">لا توجد وثائق أو وكالات مرفوعة لهذا الموكل.</div>';
            return;
        }

        elements.documentsList.innerHTML = docs.map((doc, index) => {
            // [التأمين (Zero Trust)]: تشفير رابط عرض الهوية/الوكالة
            const secureDocUrl = API.getSecureUrl(doc.url || doc.file_path);
            const docName = doc.file_name || doc.name || `وثيقة رقم ${index + 1}`;
            
            return `
                <div class="col-md-6 mb-3">
                    <div class="card h-100 shadow-sm border-0 bg-light">
                        <div class="card-body d-flex justify-content-between align-items-center">
                            <div class="text-truncate" style="max-width: 70%;" title="${docName}">
                                📄 <strong>${docName}</strong>
                                <div class="text-muted small">${new Date(doc.uploaded_at || Date.now()).toLocaleDateString('ar-EG')}</div>
                            </div>
                            <a href="${secureDocUrl}" target="_blank" class="btn btn-sm btn-primary">عرض الوثيقة</a>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    };

    const renderClientCases = (cases) => {
        if (!elements.casesList) return;
        if (!cases || cases.length === 0) {
            elements.casesList.innerHTML = '<tr><td colspan="5" class="text-center">لا توجد قضايا مرتبطة بهذا الموكل.</td></tr>';
            return;
        }

        elements.casesList.innerHTML = cases.map(c => {
            // تجهيز رمز الدخول الخاص بالموكل (Access PIN) لعرضه للمحامي ليعطيه للموكل
            const portalAccessInfo = currentClientData.client_portal_active 
                ? `<strong>رمز الدخول:</strong> ${c.access_pin || 'غير محدد'}` 
                : '<span class="text-muted">البوابة معطلة</span>';

            return `
                <tr>
                    <td><a href="/case-details.html?id=${c.id}" class="text-decoration-none fw-bold">${c.case_internal_id || 'بدون رقم'}</a></td>
                    <td>${c.case_type || 'غير محدد'}</td>
                    <td>${c.opponent_name || 'غير محدد'}</td>
                    <td><span class="badge bg-info text-dark">${c.status || 'غير محدد'}</span></td>
                    <td><small>${portalAccessInfo}</small></td>
                </tr>
            `;
        }).join('');
    };

    // ==========================================
    // 5. العمليات التفاعلية والإدخال (Forms & Actions)
    // ==========================================

    // أ. التحكم بحالة بوابة الموكل
    if (elements.togglePortalBtn) {
        elements.togglePortalBtn.addEventListener('click', async () => {
            const newStatus = !currentClientData.client_portal_active;
            const confirmMsg = newStatus 
                ? 'هل أنت متأكد من تفعيل بوابة الموكل؟ سيتمكن من الإطلاع على سير قضاياه (المرئية فقط).' 
                : 'هل أنت متأكد من إيقاف وصول الموكل לבوابة؟';
            
            if (!confirm(confirmMsg)) return;

            const btnOriginalText = elements.togglePortalBtn.innerHTML;
            elements.togglePortalBtn.innerHTML = 'جاري التحديث...';
            elements.togglePortalBtn.disabled = true;

            try {
                await API.put(`/api/clients?id=eq.${clientId}`, { client_portal_active: newStatus });
                alert('تم تحديث حالة البوابة بنجاح.');
                loadClientDetails(); // إعادة تحميل الواجهة
            } catch (error) {
                alert(`حدث خطأ: ${error.message}`);
                elements.togglePortalBtn.innerHTML = btnOriginalText;
                elements.togglePortalBtn.disabled = false;
            }
        });
    }

    // ب. رفع الوثائق الثبوتية والوكالات إلى R2
    if (elements.uploadDocForm) {
        elements.uploadDocForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const file = elements.docFileInput.files[0];
            const docTitleInput = document.getElementById('client-doc-title');
            const docTitle = docTitleInput ? docTitleInput.value : file.name;

            if (!file) return alert('يرجى اختيار المستند.');

            const submitBtn = elements.uploadDocForm.querySelector('button[type="submit"]');
            submitBtn.innerHTML = 'جاري الرفع للسحابة (R2)... <span class="spinner-border spinner-border-sm"></span>';
            submitBtn.disabled = true;

            try {
                // 1. رفع الملف الفعلي للسحابة في مسار معزول خاص بالموكل
                const uploadResult = await API.uploadToCloudR2(file, `clients/${clientId}/documents`);

                // 2. جلب مصفوفة الوثائق الحالية وتحديثها
                let currentDocs = [];
                if (typeof currentClientData.identity_documents === 'string') {
                    try { currentDocs = JSON.parse(currentClientData.identity_documents); } catch(err) {}
                } else if (Array.isArray(currentClientData.identity_documents)) {
                    currentDocs = currentClientData.identity_documents;
                }

                const newDocObj = {
                    file_name: docTitle || file.name,
                    url: uploadResult.file_path, // مسار R2 المحمي
                    uploaded_at: new Date().toISOString()
                };

                currentDocs.push(newDocObj);

                // 3. تحديث حقل identity_documents (JSONB) في قاعدة البيانات
                await API.put(`/api/clients?id=eq.${clientId}`, { identity_documents: currentDocs });

                alert('تم رفع الوثيقة بنجاح.');
                elements.uploadDocForm.reset();
                const modal = bootstrap.Modal.getInstance(document.getElementById('uploadClientDocModal'));
                if(modal) modal.hide();
                loadClientDetails();
            } catch (error) {
                console.error('[Document Upload Error]:', error);
                alert(`فشل رفع الوثيقة: ${error.message}`);
            } finally {
                submitBtn.innerHTML = 'رفع الوثيقة';
                submitBtn.disabled = false;
            }
        });
    }

    // التشغيل الأولي
    loadClientDetails();
});