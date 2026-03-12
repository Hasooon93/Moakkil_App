// js/auth.js

// 1. الإعدادات المدمجة (تأكد من أن هذا الرابط هو رابط الـ Worker الخاص بك)
const CONFIG = {
    API_URL: "https://curly-pond-9975.hassan-alsakka.workers.dev",
    TOKEN_KEY: "moakkil_v2_token",
    USER_KEY: "moakkil_v2_user",
    FIRM_KEY: "moakkil_v2_firm_id"
};

// 2. نظام التنبيهات الشاشة
function showAlert(message, type = 'danger') {
    const alertBox = document.getElementById('alertBox');
    if(!alertBox) return alert(message); // تنبيه بديل في حال غياب الـ div
    
    alertBox.innerHTML = `<div class="alert-custom alert-${type}-custom"><i class="fas fa-info-circle"></i> ${message}</div>`;
    setTimeout(() => alertBox.innerHTML = '', 5000);
}

// 3. طلب الرمز (OTP) للمدير
async function handleAdminLogin(event) {
    event.preventDefault(); // منع الصفحة من عمل Refresh
    
    const phoneInput = document.getElementById('adminPhone').value.trim();
    const btn = document.getElementById('btnRequestOtp');
    
    if(!phoneInput) {
        showAlert('الرجاء إدخال رقم الهاتف', 'warning');
        return;
    }

    btn.disabled = true;
    btn.innerHTML = 'جاري الاتصال بالخادم... <i class="fas fa-spinner fa-spin"></i>';
    
    console.log("📞 جاري طلب الدخول للرقم:", phoneInput);

    try {
        const res = await fetch(`${CONFIG.API_URL}/api/auth/admin/request-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: phoneInput })
        });
        
        const data = await res.json();
        console.log("📡 استجابة الخادم:", data);

        if (res.ok && data.success) {
            // الانتقال لخطوة الرمز
            document.getElementById('phoneStep').classList.add('d-none');
            document.getElementById('otpStep').classList.remove('d-none');
            showAlert('تم الإرسال! (استخدم 123456 مؤقتاً إذا لم يصلك)', 'success');
        } else {
            // الرقم غير موجود في الداتا بيز
            showAlert(data.error || 'رقم الهاتف هذا غير مسجل كمدير في النظام');
        }
    } catch (e) {
        console.error("❌ خطأ برمجي:", e);
        showAlert('تعذر الاتصال بالخادم. تأكد من رابط الـ API_URL أو اتصال الإنترنت.');
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'إرسال كود الدخول <i class="fas fa-paper-plane ms-2"></i>';
    }
}

// 4. تأكيد الدخول (OTP)
async function verifyAdminOtp() {
    const phone = document.getElementById('adminPhone').value.trim();
    const otp = document.getElementById('adminOtp').value.trim();
    const btn = document.getElementById('btnVerifyOtp');

    if (!otp) return showAlert('الرجاء إدخال الرمز', 'warning');

    btn.disabled = true;
    btn.innerHTML = 'جاري التحقق...';

    try {
        const res = await fetch(`${CONFIG.API_URL}/api/auth/admin/verify-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, otp })
        });
        const data = await res.json();

        if (res.ok && data.success) {
            localStorage.setItem(CONFIG.TOKEN_KEY, data.token);
            localStorage.setItem(CONFIG.USER_KEY, JSON.stringify(data.user));
            localStorage.setItem(CONFIG.FIRM_KEY, data.user.firm_id);
            
            showAlert('تم تسجيل الدخول بنجاح! جاري توجيهك...', 'success');
            // التوجيه للوحة التحكم (قمنا بتعطيلها مؤقتاً لتتأكد من رسالة النجاح، سأعلقها)
            setTimeout(() => { window.location.href = 'app.html'; }, 1500);
        } else {
            showAlert(data.error || 'الرمز غير صحيح');
        }
    } catch (e) {
        showAlert('حدث خطأ في الاتصال بالخادم');
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'تأكيد ودخول';
    }
}

// 5. التبديل للعودة لرقم الهاتف
function resetAdminLogin() {
    document.getElementById('otpStep').classList.add('d-none');
    document.getElementById('phoneStep').classList.remove('d-none');
    document.getElementById('adminOtp').value = '';
}

// 6. فريق العمل والتوجيه التلقائي
function togglePassword() {
    const pwd = document.getElementById('staffPassword');
    const icon = document.getElementById('eyeIcon');
    if (pwd.type === 'password') { pwd.type = 'text'; icon.classList.replace('fa-eye', 'fa-eye-slash'); } 
    else { pwd.type = 'password'; icon.classList.replace('fa-eye-slash', 'fa-eye'); }
}

async function handleStaffLogin(event) {
    event.preventDefault();
    showAlert('سيتم تفعيل دخول فريق العمل بعد إعداد لوحة تحكم المدير.', 'info');
}

window.onload = () => {
    const token = localStorage.getItem(CONFIG.TOKEN_KEY);
    // إذا كان مسجلاً للدخول مسبقاً، نمنعه من العودة لشاشة الدخول
    if (token && window.location.pathname.endsWith('index.html')) {
        window.location.href = 'app.html'; 
    }
};