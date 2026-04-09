// moakkil-verify.js
// الدستور المطبق: التحقق الآمن، منع التزوير، واجهة عامة، حماية البيانات.

document.addEventListener('DOMContentLoaded', async () => {
    
    // 1. إعدادات النظام وتحديد المسار (API URL)
    // بما أننا نستخدم Cloudflare Worker، يجب تحديد رابطه هنا (استبدله برابطك الفعلي عند النشر)
    const API_BASE_URL = 'https://your-worker-url.workers.dev'; 
    
    // 2. قراءة المعطيات من رابط الـ QR Code
    // مثال: verify.html?type=receipt&id=123-abc
    const urlParams = new URLSearchParams(window.location.search);
    const verifyId = urlParams.get('id');
    const verifyType = urlParams.get('type'); // 'receipt' للفواتير, 'cv' للموظفين
    
    // عناصر الواجهة
    const card = document.getElementById('mainCard');
    const loadingState = document.getElementById('loading-state');
    const resultState = document.getElementById('result-state');
    const iconDiv = document.getElementById('status-icon-div');
    const statusTitle = document.getElementById('status-title');
    const statusDesc = document.getElementById('status-desc');
    const dataContainer = document.getElementById('data-container');
    
    // توثيق وقت التحقق
    const now = new Date();
    document.getElementById('verification-time').innerText = now.toLocaleString('en-GB', { hour12: true });

    // دالة لتنظيف النصوص (أمان ضد XSS)
    const escapeHTML = (str) => {
        if (!str) return '--';
        return str.toString().replace(/[&<>'"]/g, 
            tag => ({
                '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
            }[tag] || tag)
        );
    };

    // ==========================================
    // معالجة الأخطاء والسجلات المزورة
    // ==========================================
    function showError(message) {
        loadingState.classList.add('d-none');
        resultState.classList.remove('d-none');
        
        card.classList.add('status-invalid-card');
        iconDiv.className = "status-icon status-invalid";
        iconDiv.innerHTML = '<i class="fas fa-times"></i>';
        
        statusTitle.innerText = "سجل غير موثق / مزور";
        statusTitle.className = "fw-bold mb-2 text-danger";
        statusDesc.innerText = escapeHTML(message);
        
        dataContainer.innerHTML = `
            <div style="background: #f8d7da; color: #dc3545; padding: 15px; border-radius: 8px; font-weight: bold; font-size: 0.9rem;">
                <i class="fas fa-exclamation-triangle"></i> يرجى الحذر! لم يتم العثور على هذا السجل في النظام الرقمي المعتمد، أو أنه قد تعرض للتلاعب. يرجى مراجعة إدارة المكتب فوراً.
            </div>
        `;
    }

    // ==========================================
    // معالجة النجاح والسجلات الأصلية
    // ==========================================
    function showSuccess(data, type) {
        loadingState.classList.add('d-none');
        resultState.classList.remove('d-none');
        
        card.classList.add('status-valid-card');
        iconDiv.className = "status-icon status-valid";
        iconDiv.innerHTML = '<i class="fas fa-check"></i>';
        
        statusTitle.innerText = "مستند أصلي وموثق";
        statusTitle.className = "fw-bold mb-2 text-success";
        
        let htmlContent = '';

        if (type === 'receipt') {
            // عرض بيانات الإيصال المالي
            statusDesc.innerText = "تم التحقق من صحة الإيصال المالي وصدوره عن النظام الرسمي.";
            
            const firmName = data.mo_firms?.firm_name || 'مكتب محاماة';
            const clientName = data.mo_cases?.mo_clients?.full_name || 'غير مدرج';
            const caseId = data.mo_cases?.case_internal_id || 'غير مدرج';
            
            htmlContent = `
                <div class="data-row"><span class="data-label">صادر عن مكتب</span><span class="data-value">${escapeHTML(firmName)}</span></div>
                <div class="data-row"><span class="data-label">رقم الفاتورة / الإيصال</span><span class="data-value" style="color:#6f42c1; font-family:monospace;">${escapeHTML(data.invoice_number)}</span></div>
                <div class="data-row"><span class="data-label">القيمة المقبوضة</span><span class="data-value" style="color:#198754; font-size:1.3rem;">${parseFloat(data.amount).toFixed(2)} دينار أردني</span></div>
                <div class="data-row"><span class="data-label">تاريخ الدفع</span><span class="data-value" dir="ltr">${escapeHTML(data.due_date || data.created_at.split('T')[0])}</span></div>
                <div class="data-row"><span class="data-label">اسم الموكل</span><span class="data-value">${escapeHTML(clientName)}</span></div>
                <div class="data-row"><span class="data-label">رقم القضية المرتبطة</span><span class="data-value">${escapeHTML(caseId)}</span></div>
                <div class="data-row" style="margin-top:10px;"><span class="badge bg-success p-2 w-100"><i class="fas fa-shield-alt"></i> إيصال معتمد مالياً</span></div>
            `;
        } 
        else if (type === 'cv') {
            // عرض بيانات المحامي / الموظف
            statusDesc.innerText = "تم التحقق من هوية الموظف وانتمائه للمكتب القانوني.";
            
            const firmName = data.mo_firms?.firm_name || 'مكتب محاماة';
            const roleStr = data.role === 'lawyer' ? 'محامي مزاول' : (data.role === 'admin' ? 'مدير نظام' : 'إداري');
            
            htmlContent = `
                <div style="text-align:center; margin-bottom:15px;">
                    <img src="${escapeHTML(data.avatar_url) || 'assets/img/default-avatar.png'}" style="width:70px; height:70px; border-radius:50%; border:3px solid #6f42c1; object-fit:cover;" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' viewBox=\\'0 0 24 24\\' fill=\\'%23ccc\\'><path d=\\'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z\\'/></svg>'">
                </div>
                <div class="data-row"><span class="data-label">الاسم الرباعي</span><span class="data-value">${escapeHTML(data.full_name)}</span></div>
                <div class="data-row"><span class="data-label">المنصب</span><span class="data-value" style="color:#6f42c1;">${escapeHTML(roleStr)}</span></div>
                <div class="data-row"><span class="data-label">الجهة المنتمي إليها</span><span class="data-value">${escapeHTML(firmName)}</span></div>
                <div class="data-row"><span class="data-label">رقم النقابة (المزاولة)</span><span class="data-value">${escapeHTML(data.syndicate_number || 'غير متوفر')}</span></div>
                <div class="data-row" style="margin-top:10px;"><span class="badge bg-success p-2 w-100"><i class="fas fa-check-circle"></i> حساب نشط وموثق</span></div>
            `;
        }

        dataContainer.innerHTML = htmlContent;
    }

    // ==========================================
    // 3. المحرك الرئيسي: الاتصال بالخادم
    // ==========================================
    async function verifyRecord() {
        if (!verifyId || !verifyType) {
            showError("رابط التحقق غير مكتمل. تأكد من مسح الرمز (QR Code) بشكل صحيح.");
            return;
        }

        // تحديد المسار الصحيح بناءً على نوع الـ QR الممسوح
        let endpoint = '';
        if (verifyType === 'receipt') endpoint = `/api/public/verify-receipt?id=${encodeURIComponent(verifyId)}`;
        else if (verifyType === 'cv') endpoint = `/api/public/verify-cv?id=${encodeURIComponent(verifyId)}`;
        else {
            showError("نوع التحقق غير مدعوم في النظام.");
            return;
        }

        try {
            // نستخدم مساراتنا في الـ Worker، بدون الحاجة لـ Authorization Token
            const response = await fetch(`${API_BASE_URL}${endpoint}`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            });

            const result = await response.json();

            if (response.ok && result.success && result.data) {
                // نجاح التحقق
                showSuccess(result.data, verifyType);
            } else {
                // خطأ 404 أو سجل مزيف
                showError(result.error || "السجل غير موجود أو مزور.");
            }

        } catch (error) {
            console.error("Verification Error:", error);
            showError("حدث خطأ في الاتصال بالخادم المركزي. يرجى التأكد من اتصالك بالإنترنت والمحاولة لاحقاً.");
        }
    }

    // تأخير بصري بسيط لمدة ثانية لإعطاء شعور "البحث في قواعد البيانات"
    setTimeout(verifyRecord, 1000);
});