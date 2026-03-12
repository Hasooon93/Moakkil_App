// js/auth.js

// 1. نظام التنبيهات
function showAlert(message, type = 'danger') {
    const alertBox = document.getElementById('alertBox');
    if(!alertBox) return alert(message); 
    
    alertBox.innerHTML = `<div class="alert-custom alert-${type}-custom"><i class="fas fa-info-circle"></i> ${message}</div>`;
    setTimeout(() => alertBox.innerHTML = '', 5000);
}

// 2. طلب الرمز (OTP) للمدير
async function handleAdminLogin(event) {
    event.preventDefault(); 
    
    const phoneInput = document.getElementById('adminPhone').value.trim();
    const btn = document.getElementById('btnRequestOtp');
    
    if(!phoneInput) {
        showAlert('الرجاء إدخال رقم الهاتف', 'warning');
        return;
    }

    btn.disabled = true;
    btn.innerHTML = 'جاري الاتصال بالخادم... <i class="fas fa-spinner fa-spin"></i>';
    
    try {
        const res = await fetch(`${CONFIG.API_URL}/api/auth/admin/request-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: phoneInput })
        });
        
        const data = await res.json();

        if (res.ok && data.success) {
            document.getElementById('phoneStep').classList.add('d-none');
            document.getElementById('otpStep').classList.remove('d-none');
            showAlert('تم الإرسال! (استخدم 123456 مؤقتاً إذا لم يصلك)', 'success');
        } else {
            showAlert(data.error || 'رقم الهاتف هذا غير مسجل كمدير في النظام');
        }
    } catch (e) {
        showAlert('تعذر الاتصال بالخادم. تأكد من رابط الـ API_URL.');
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'إرسال كود الدخول <i class="fas fa-paper-plane ms-2"></i>';
    }
}

// 3. تأكيد الدخول (OTP)
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

// 4. التبديل للعودة لرقم الهاتف
function resetAdminLogin() {
    document.getElementById('otpStep').classList.add('d-none');
    document.getElementById('phoneStep').classList.remove('d-none');
    document.getElementById('adminOtp').value = '';
}

// 5. دخول فريق العمل (المحامين والسكرتاريا)
function togglePassword() {
    const pwd = document.getElementById('staffPassword');
    const icon = document.getElementById('eyeIcon');
    if (pwd.type === 'password') { pwd.type = 'text'; icon.classList.replace('fa-eye', 'fa-eye-slash'); } 
    else { pwd.type = 'password'; icon.classList.replace('fa-eye-slash', 'fa-eye'); }
}

async function handleStaffLogin(event) {
    event.preventDefault();
    
    const usernameInput = document.getElementById('staffUsername').value.trim();
    const passwordInput = document.getElementById('staffPassword').value;
    const btn = document.getElementById('btnStaffLogin');

    btn.disabled = true;
    btn.innerHTML = 'جاري التحقق... <i class="fas fa-spinner fa-spin"></i>';

    try {
        const res = await fetch(`${CONFIG.API_URL}/api/auth/staff/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: usernameInput, password: passwordInput })
        });
        
        const data = await res.json();

        if (res.ok && data.success) {
            localStorage.setItem(CONFIG.TOKEN_KEY, data.token);
            localStorage.setItem(CONFIG.USER_KEY, JSON.stringify(data.user));
            localStorage.setItem(CONFIG.FIRM_KEY, data.user.firm_id);
            
            showAlert('تم تسجيل الدخول بنجاح! جاري توجيهك...', 'success');
            setTimeout(() => { window.location.href = 'app.html'; }, 1500);
        } else {
            showAlert(data.error || 'بيانات الدخول غير صحيحة');
        }
    } catch (e) {
        showAlert('تعذر الاتصال بالخادم.');
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'دخول للنظام <i class="fas fa-sign-in-alt ms-2"></i>';
    }
}

// التوجيه التلقائي إذا كان مسجلاً للدخول مسبقاً
window.onload = () => {
    const token = localStorage.getItem(CONFIG.TOKEN_KEY);
    if (token && window.location.pathname.endsWith('index.html')) {
        window.location.href = 'app.html'; 
    }
};