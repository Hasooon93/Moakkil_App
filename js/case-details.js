// moakkil-case-details.js
// يعالج البيانات المعقدة (Tags, JSONB, Execution, AI Summaries)

document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const caseId = urlParams.get('id');
    
    if (!caseId) {
        alert("رقم القضية مفقود!");
        window.location.href = 'cases/index.html';
        return;
    }

    let currentCaseData = {};
    let currentTags = [];

    // عناصر الـ DOM
    const form = document.getElementById('caseDetailsForm');
    const tagsContainer = document.getElementById('caseTagsContainer');
    const tagInput = document.getElementById('new_tag_input');
    const btnAddTag = document.getElementById('btnAddTag');
    const btnGenerateAi = document.getElementById('btnGenerateAiSummary');
    
    // دالة تهيئة الصفحة وجلب البيانات
    async function loadCaseData() {
        try {
            // استخدام الـ API Wrapper للباك إند
            const response = await api.get(`/api/cases?id=eq.${caseId}`);
            if (!response || response.length === 0) throw new Error("القضية غير موجودة أو لا تملك صلاحية الوصول.");
            
            currentCaseData = response[0];
            populateForm(currentCaseData);
        } catch (error) {
            console.error("خطأ في جلب البيانات:", error);
            alert(error.message);
        }
    }

    // تعبئة الحقول بما فيها الحقول المكتشفة حديثاً
    function populateForm(data) {
        document.getElementById('pageTitle').innerText = `ملف قضية: ${data.case_internal_id}`;
        
        // الحقول النصية العادية
        const textFields = ['case_internal_id', 'court_case_number', 'current_court', 'litigation_degree', 'opponent_name', 'opponent_lawyer', 'execution_file_number', 'claim_amount', 'confidentiality_level', 'lawsuit_facts', 'legal_basis'];
        
        textFields.forEach(field => {
            if (document.getElementById(field)) {
                document.getElementById(field).value = data[field] || '';
            }
        });

        // معالجة مصفوفة الطلبات الختامية (JSONB/Array)
        if (data.final_requests && Array.isArray(data.final_requests)) {
            document.getElementById('final_requests').value = data.final_requests.join('\n');
        }

        // معالجة العلامات (Tags Array)
        currentTags = data.case_tags || [];
        renderTags();

        // معالجة الذكاء الاصطناعي
        if (data.ai_cumulative_summary) {
            document.getElementById('aiSummarySection').classList.remove('hidden');
            document.getElementById('aiSummaryText').innerText = data.ai_cumulative_summary;
        }
    }

    // إدارة الـ Tags بصرية وبرمجية
    function renderTags() {
        tagsContainer.innerHTML = '';
        currentTags.forEach((tag, index) => {
            const span = document.createElement('span');
            span.className = 'case-tag';
            span.innerHTML = `${tag} <i class="fas fa-times" onclick="removeTag(${index})"></i>`;
            tagsContainer.appendChild(span);
        });
    }

    window.removeTag = function(index) {
        currentTags.splice(index, 1);
        renderTags();
    };

    btnAddTag.addEventListener('click', () => {
        const val = tagInput.value.trim();
        if (val && !currentTags.includes(val)) {
            currentTags.push(val);
            renderTags();
            tagInput.value = '';
        }
    });

    // توليد ملخص بالذكاء الاصطناعي (AI Integration)
    btnGenerateAi.addEventListener('click', async (e) => {
        e.preventDefault();
        btnGenerateAi.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري التحليل...';
        btnGenerateAi.disabled = true;

        try {
            // نرسل تفاصيل القضية للباك إند ليقوم الـ Worker بتلخيصها
            const textToSummarize = `
                الوقائع: ${document.getElementById('lawsuit_facts').value}
                الأسانيد: ${document.getElementById('legal_basis').value}
                الطلبات: ${document.getElementById('final_requests').value}
            `;

            const aiResponse = await api.post('/api/ai/process', {
                type: 'legal_advisor', // استخدام الـ prompt الموجود في الـ worker
                content: `لخص هذه القضية الأردنية في 3 أسطر مركزة لاستعراضها كـ Executive Summary: ${textToSummarize}`
            });

            if (aiResponse.reply) {
                document.getElementById('aiSummarySection').classList.remove('hidden');
                document.getElementById('aiSummaryText').innerText = aiResponse.reply;
                currentCaseData.ai_cumulative_summary = aiResponse.reply; // لحفظها لاحقاً
            }
        } catch (error) {
            alert("فشل توليد الملخص: " + error.message);
        } finally {
            btnGenerateAi.innerHTML = '<i class="fas fa-magic"></i> تلخيص ذكي للقضية';
            btnGenerateAi.disabled = false;
        }
    });

    // حفظ التعديلات الشاملة وإرسالها للباك إند
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btnSave = document.getElementById('btnSaveChanges');
        const originalText = btnSave.innerHTML;
        btnSave.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الحفظ...';
        btnSave.disabled = true;

        try {
            // تجميع البيانات من الحقول
            const requestsText = document.getElementById('final_requests').value.trim();
            const finalRequestsArray = requestsText ? requestsText.split('\n').map(r => r.trim()).filter(r => r) : [];

            const updatedData = {
                court_case_number: document.getElementById('court_case_number').value,
                current_court: document.getElementById('current_court').value,
                litigation_degree: document.getElementById('litigation_degree').value,
                opponent_name: document.getElementById('opponent_name').value,
                opponent_lawyer: document.getElementById('opponent_lawyer').value,
                execution_file_number: document.getElementById('execution_file_number').value, // الميزة المكتشفة!
                claim_amount: parseFloat(document.getElementById('claim_amount').value) || 0,
                confidentiality_level: document.getElementById('confidentiality_level').value,
                lawsuit_facts: document.getElementById('lawsuit_facts').value,
                legal_basis: document.getElementById('legal_basis').value,
                final_requests: finalRequestsArray, // JSONB Array
                case_tags: currentTags, // Array
                ai_cumulative_summary: currentCaseData.ai_cumulative_summary // AI
            };

            // الـ Worker ذكي، سيقبل هذه الحقول مباشرة لأنها موجودة في Schema
            await api.patch(`/api/cases?id=eq.${caseId}`, updatedData);
            
            alert("تم الحفظ بنجاح! تم توثيق العملية في سجل الرقابة (Audit Trail).");
        } catch (error) {
            console.error("خطأ أثناء الحفظ:", error);
            alert("فشل الحفظ: " + error.message);
        } finally {
            btnSave.innerHTML = originalText;
            btnSave.disabled = false;
        }
    });

    // بدء التشغيل
    loadCaseData();
});