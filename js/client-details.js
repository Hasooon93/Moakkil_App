// moakkil-client-details.js
// الدستور المطبق: إدارة الـ CRM، حماية البوابة، استخدام JSONB، العزل.

document.addEventListener('DOMContentLoaded', async () => {
    // التحقق من وجود معرف الموكل في الرابط
    const urlParams = new URLSearchParams(window.location.search);
    const clientId = urlParams.get('id');
    
    if (!clientId) {
        alert("رقم الموكل مفقود!");
        window.location.href = 'clients.html';
        return;
    }

    // المتغيرات العامة
    let currentClientData = {};
    let identityDocuments = []; // المصفوفة التي ستمثل الـ JSONB في الداتا بيز
    let isPortalActive = false;

    // عناصر الواجهة
    const form = document.getElementById('clientDetailsForm');
    const pageTitle = document.getElementById('pageTitle');
    
    // عناصر البوابة
    const portalBox = document.getElementById('portalBox');
    const portalStatusText = document.getElementById('portalStatusText');
    const portalDescText = document.getElementById('portalDescText');
    const btnTogglePortal = document.getElementById('btnTogglePortal');
    
    // عناصر الوثائق
    const documentsList = document.getElementById('documentsList');
    const docTypeInput = document.getElementById('doc_type');
    const docNumberInput = document.getElementById('doc_number');
    const btnAddDoc = document.getElementById('btnAddDoc');
    const btnSaveAll = document.getElementById('btnSaveChanges');

    // ==========================================
    // 1. جلب بيانات الموكل
    // ==========================================
    async function loadClientData() {
        try {
            // جلب البيانات من الـ Worker متضمنة الحقول المخفية
            const response = await api.get(`/api/clients?id=eq.${clientId}`);
            if (!response || response.length === 0) throw new Error("الموكل غير موجود أو لا تملك صلاحية الوصول.");
            
            currentClientData = response[0];
            populateForm(currentClientData);
        } catch (error) {
            console.error("خطأ في جلب البيانات:", error);
            alert(error.message);
        }
    }

    // ==========================================
    // 2. تعبئة الحقول (Populate)
    // ==========================================
    function populateForm(data) {
        pageTitle.innerHTML = `<i class="fas fa-user-tie"></i> ملف الموكل: ${data.full_name}`;
        
        // الحقول النصية المباشرة
        const textFields = [
            'full_name', 'national_id', 'phone', 'email', 'address', 'notes',
            'mother_name', 'nationality', 'place_of_birth', 'marital_status', 
            'profession', 'confidentiality_level'
        ];
        
        textFields.forEach(field => {
            if (document.getElementById(field) && data[field]) {
                document.getElementById(field).value = data[field];
            }
        });

        // حقل التاريخ
        if (data.date_of_birth) {
            document.getElementById('date_of_birth').value = data.date_of_birth.split('T')[0];
        }

        // إعداد حالة البوابة الإلكترونية
        isPortalActive = data.client_portal_active !== false; // الافتراضي مفعل إذا كان null
        updatePortalUI();

        // إعداد مصفوفة الهويات (JSONB)
        if (data.identity_documents && Array.isArray(data.identity_documents)) {
            identityDocuments = data.identity_documents;
        } else if (data.identity_documents && typeof data.identity_documents === 'object') {
            // معالجة إذا كانت الداتا القديمة object وليست array
            identityDocuments = [data.identity_documents];
        }
        renderDocuments();
    }

    // ==========================================
    // 3. إدارة زر بوابة الموكل (Security Switch)
    // ==========================================
    function updatePortalUI() {
        if (isPortalActive) {
            portalBox.className = 'portal-access-box active';
            portalStatusText.innerHTML = '<i class="fas fa-check-circle"></i> البوابة مفعلة';
            portalDescText.innerText = 'يمكن للموكل تسجيل الدخول ومتابعة ملفاته.';
            btnTogglePortal.innerText = 'إيقاف البوابة';
            btnTogglePortal.style.background = '#dc3545';
            btnTogglePortal.style.color = 'white';
        } else {
            portalBox.className = 'portal-access-box inactive';
            portalStatusText.innerHTML = '<i class="fas fa-ban"></i> البوابة موقوفة';
            portalDescText.innerText = 'تم حظر الموكل من الدخول للنظام.';
            btnTogglePortal.innerText = 'تفعيل البوابة';
            btnTogglePortal.style.background = '#198754';
            btnTogglePortal.style.color = 'white';
        }
    }

    btnTogglePortal.addEventListener('click', () => {
        isPortalActive = !isPortalActive;
        updatePortalUI();
    });

    // ==========================================
    // 4. إدارة مصفوفة وثائق الهوية (JSONB Engine)
    // ==========================================
    function renderDocuments() {
        documentsList.innerHTML = '';
        if (identityDocuments.length === 0) {
            documentsList.innerHTML = '<div style="text-align:center; color:gray; font-size:0.9rem;">لم يتم إضافة أي وثائق مهيكلة بعد.</div>';
            return;
        }

        identityDocuments.forEach((doc, index) => {
            const docElement = document.createElement('div');
            docElement.className = 'doc-item';
            
            // تحديد الأيقونة حسب نوع الوثيقة
            let icon = 'fa-id-card';
            if(doc.type === 'جواز سفر') icon = 'fa-passport';
            if(doc.type === 'سجل تجاري') icon = 'fa-building';
            if(doc.type === 'وكالة عامة') icon = 'fa-file-contract';

            docElement.innerHTML = `
                <div style="display:flex; align-items:center; gap:15px;">
                    <i class="fas ${icon}" style="font-size:2rem; color:#6f42c1;"></i>
                    <div class="doc-info">
                        <strong>${doc.type}</strong>
                        <span>رقم: ${doc.number}</span>
                    </div>
                </div>
                <button type="button" class="btn-danger" onclick="removeDocument(${index})" title="حذف الوثيقة"><i class="fas fa-trash"></i></button>
            `;
            documentsList.appendChild(docElement);
        });
    }

    // إضافة وثيقة للمصفوفة
    btnAddDoc.addEventListener('click', () => {
        const type = docTypeInput.value;
        const number = docNumberInput.value.trim();

        if (!number) {
            alert('يرجى إدخال رقم الوثيقة!');
            return;
        }

        // إضافة للـ JSONB Array
        identityDocuments.push({ type: type, number: number, added_at: new Date().toISOString() });
        renderDocuments();
        
        // تصفير الحقل
        docNumberInput.value = '';
    });

    // إزالة وثيقة (متوفرة عاملياً داخل الـ DOM)
    window.removeDocument = (index) => {
        if(confirm('هل تريد حذف هذه الوثيقة؟')) {
            identityDocuments.splice(index, 1);
            renderDocuments();
        }
    };

    // ==========================================
    // 5. حفظ كافة البيانات (PATCH Request)
    // ==========================================
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const originalText = btnSaveAll.innerHTML;
        btnSaveAll.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الحفظ والأرشفة...';
        btnSaveAll.disabled = true;

        try {
            // تجميع الكائن ليطابق Schema قاعدة البيانات تماماً
            const updatedClientData = {
                full_name: document.getElementById('full_name').value.trim(),
                national_id: document.getElementById('national_id').value.trim(),
                phone: document.getElementById('phone').value.trim(),
                email: document.getElementById('email').value.trim(),
                address: document.getElementById('address').value.trim(),
                notes: document.getElementById('notes').value.trim(),
                
                mother_name: document.getElementById('mother_name').value.trim(),
                nationality: document.getElementById('nationality').value.trim(),
                date_of_birth: document.getElementById('date_of_birth').value || null,
                place_of_birth: document.getElementById('place_of_birth').value.trim(),
                marital_status: document.getElementById('marital_status').value,
                profession: document.getElementById('profession').value.trim(),
                confidentiality_level: document.getElementById('confidentiality_level').value,
                
                client_portal_active: isPortalActive, // مفتاح البوابة
                identity_documents: identityDocuments // الـ JSONB المجمع
            };

            // إرسال الطلب عبر الـ API Wrapper
            await api.patch(`/api/clients?id=eq.${clientId}`, updatedClientData);
            
            alert("تم حفظ ملف الموكل بنجاح وتحديث صلاحياته!");
        } catch (error) {
            console.error("خطأ أثناء الحفظ:", error);
            alert("فشل الحفظ: " + error.message);
        } finally {
            btnSaveAll.innerHTML = originalText;
            btnSaveAll.disabled = false;
        }
    });

    // بدء التشغيل
    loadClientData();
});