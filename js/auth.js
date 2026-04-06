// js/auth.js - نظام المصادقة وإدارة الجلسات (V4.2 Enterprise - Fallback Support)
// التحديث: إضافة Fallback لإشعارات Swal ودعم الأخطاء المتقدمة

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const otpForm = document.getElementById('otpForm');
    const phoneInput = document.getElementById('phoneInput');
    const otpInput = document.getElementById('otpInput');
    const btnRequestOtp = document.getElementById('btnRequestOtp');
    const btnVerifyOtp = document.getElementById('btnVerifyOtp');

    // -------------------------------------------------------------
    // [1] الحماية الأولية (Redirect if already logged in)
    // -------------------------------------------------------------
    const token = localStorage.getItem(CONFIG.TOKEN_KEY || 'moakkil_token');
    const userStr = localStorage.getItem(CONFIG.USER_KEY || 'moakkil_user');
    
    if (token && userStr && window.location.pathname.includes('login.html')) {
        const user = JSON.parse(userStr);
        if (user.role === 'super_admin') {
            window.location.replace('register.html');
        } else {
            window.location.replace('app.html');
        }
        return;
    }

    // دالة عرض الأخطاء الذكية (تدعم Fallback في حال فشل تحميل المكتبة)
    const showError = (msg) => {
        if (typeof Swal !== 'undefined') {
            Swal.fire({
                icon: 'error',
                title: 'تنبيه',
                text: msg,
                confirmButtonText: 'حسناً',
                confirmButtonColor: '#0a192f'
            });
        } else {
            // البديل الاحتياطي إذا كان المستخدم يفتح الملف بصيغة file:///
            alert("تنبيه: " + msg);
        }
    };

    // -------------------------------------------------------------
    // [2] الخطوة الأولى: إرسال رقم الهاتف وطلب الكود
    // -------------------------------------------------------------
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const phone = phoneInput.value.trim();
            if (!phone) {
                showError("يرجى إدخال رقم الهاتف المسجل بالنظام.");
                return;
            }

            const originalText = btnRequestOtp.innerHTML;
            btnRequestOtp.innerHTML = 'جاري الإرسال... <i class="fas fa-spinner fa-spin"></i>';
            btnRequestOtp.disabled = true;

            try {
                const response = await fetch(`${CONFIG.API_URL}/api/auth/request-otp`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ phone })
                });

                const data = await response.json();
                
                // التقاط الخطأ 403 (الرقم غير مسجل) أو أي خطأ آخر
                if (!response.ok) {
                    throw new Error(data.error || 'حدث خطأ غير معروف في الخادم.');
                }

                // عرض إشعار نجاح الإرسال
                if (typeof Swal !== 'undefined') {
                    Swal.fire({
                        icon: 'success',
                        title: 'تم الإرسال',
                        text: data.message || 'تم إرسال رمز التحقق بنجاح.',
                        timer: 2500,
                        showConfirmButton: false
                    });
                } else {
                    alert(data.message || 'تم إرسال رمز التحقق بنجاح.');
                }

                // إخفاء فورم الهاتف وإظهار فورم الـ OTP بشكل صحيح
                loginForm.classList.add('d-none');
                if (otpForm) {
                    otpForm.classList.remove('d-none');
                }
                
                sessionStorage.setItem('temp_phone', phone);
                if (otpInput) {
                    setTimeout(() => otpInput.focus(), 500); 
                }

            } catch (err) {
                showError(err.message);
            } finally {
                btnRequestOtp.innerHTML = originalText;
                btnRequestOtp.disabled = false;
            }
        });
    }

    // -------------------------------------------------------------
    // [3] الخطوة الثانية: التحقق من الكود وتوليد الجلسة
    // -------------------------------------------------------------
    if (otpForm) {
        otpForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const otp = otpInput.value.trim();
            const phone = sessionStorage.getItem('temp_phone');

            if (!otp || !phone) {
                showError("البيانات مفقودة، يرجى تحديث الصفحة والمحاولة من جديد.");
                return;
            }

            const originalText = btnVerifyOtp.innerHTML;
            btnVerifyOtp.innerHTML = 'جاري التحقق... <i class="fas fa-spinner fa-spin"></i>';
            btnVerifyOtp.disabled = true;

            try {
                const response = await fetch(`${CONFIG.API_URL}/api/auth/verify-otp`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ phone, otp })
                });

                const data = await response.json();
                if (!response.ok) throw new Error(data.error || 'الكود المدخل غير صحيح.');

                // تخزين التوكن وبيانات المستخدم
                localStorage.setItem(CONFIG.TOKEN_KEY || 'moakkil_token', data.token);
                localStorage.setItem(CONFIG.USER_KEY || 'moakkil_user', JSON.stringify(data.user));
                
                if (data.user.firm_id) {
                    localStorage.setItem(CONFIG.FIRM_KEY || 'moakkil_firm_id', data.user.firm_id);
                }
                
                sessionStorage.removeItem('temp_phone');

                // إشعار الدخول الناجح قبل التوجيه
                if (typeof Swal !== 'undefined') {
                    Swal.fire({
                        icon: 'success',
                        title: 'مرحباً بك',
                        text: 'تم تسجيل الدخول بنجاح، جاري تحويلك...',
                        timer: 1500,
                        showConfirmButton: false
                    }).then(() => {
                        window.location.href = data.user.role === 'super_admin' ? 'register.html' : 'app.html';
                    });
                } else {
                    window.location.href = data.user.role === 'super_admin' ? 'register.html' : 'app.html';
                }

            } catch (err) {
                showError(err.message);
                otpInput.value = '';
                otpInput.focus();
            } finally {
                btnVerifyOtp.innerHTML = originalText;
                btnVerifyOtp.disabled = false;
            }
        });
    }
});

// -------------------------------------------------------------
// [4] دالة تسجيل الخروج الشاملة
// -------------------------------------------------------------
window.logout = function() {
    if (typeof Swal !== 'undefined') {
        Swal.fire({
            title: 'تسجيل الخروج',
            text: 'هل أنت متأكد أنك تريد تسجيل الخروج؟',
            icon: 'question',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            cancelButtonColor: '#0a192f',
            confirmButtonText: 'نعم، خروج',
            cancelButtonText: 'إلغاء'
        }).then((result) => {
            if (result.isConfirmed) {
                executeLogout();
            }
        });
    } else {
        if(confirm('هل أنت متأكد أنك تريد تسجيل الخروج؟')) {
            executeLogout();
        }
    }
};

function executeLogout() {
    console.log("🔒 جاري تسجيل الخروج وتدمير الجلسة...");
    localStorage.removeItem(CONFIG.TOKEN_KEY || 'moakkil_token');
    localStorage.removeItem(CONFIG.USER_KEY || 'moakkil_user');
    localStorage.removeItem(CONFIG.FIRM_KEY || 'moakkil_firm_id');
    window.location.href = 'login.html';
}