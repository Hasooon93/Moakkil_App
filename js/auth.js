// js/auth.js - نظام الدخول الموحد (OTP لجميع المستخدمين + إضافة البصمة WebAuthn)

/**
 * 1. طلب كود الدخول (OTP)
 * يتصل بمسار: /api/auth/request-otp
 */
async function requestOTP() {
    const phoneInput = document.getElementById('phone');
    const phone = phoneInput.value.trim();
    
    if (!phone) {
        Swal.fire({
            icon: 'warning',
            title: 'تنبيه',
            text: 'يرجى إدخال رقم الهاتف المسجل في النظام أولاً.',
            confirmButtonText: 'حسناً'
        });
        phoneInput.focus();
        return;
    }

    const btn = document.getElementById('btn-request-otp');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i> جاري الإرسال...';

    try {
        const response = await fetch(`${CONFIG.API_URL}/api/auth/request-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            // إخفاء نافذة الهاتف وإظهار نافذة الكود
            document.getElementById('phone-section').classList.add('d-none');
            document.getElementById('otp-section').classList.remove('d-none');
            document.getElementById('otp').focus();
            
            // تنبيه نجاح الإرسال
            const Toast = Swal.mixin({
                toast: true,
                position: 'top-end',
                showConfirmButton: false,
                timer: 3000,
                timerProgressBar: true
            });
            Toast.fire({
                icon: 'success',
                title: data.message || 'تم إرسال الكود بنجاح'
            });

        } else {
            Swal.fire({
                icon: 'error',
                title: 'فشل الإرسال!',
                text: data.error || 'حدث خطأ غير معروف، يرجى مراجعة مدير النظام.',
                confirmButtonText: 'حسناً'
            });
        }
    } catch (error) {
        Swal.fire({
            icon: 'error',
            title: 'خطأ في الاتصال',
            text: 'تعذر الاتصال بالخادم. يرجى التأكد من اتصالك بالإنترنت وأن النظام يعمل.',
            confirmButtonText: 'حسناً'
        });
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-paper-plane me-2"></i> إرسال رمز التحقق';
    }
}

/**
 * 2. التحقق من الكود (OTP) وإتمام الدخول واقتراح البصمة
 * يتصل بمسار: /api/auth/verify-otp
 */
async function verifyOTP() {
    const phone = document.getElementById('phone').value.trim();
    const otpInput = document.getElementById('otp');
    const otp = otpInput.value.trim();

    if (!otp || otp.length < 4) {
        Swal.fire({
            icon: 'warning',
            title: 'تنبيه',
            text: 'يرجى إدخال رمز التحقق بشكل صحيح.',
            confirmButtonText: 'حسناً'
        });
        otpInput.focus();
        return;
    }

    const btn = document.getElementById('btn-verify-otp');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i> جاري التحقق...';

    try {
        const response = await fetch(`${CONFIG.API_URL}/api/auth/verify-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, otp })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            // حفظ التوكن وبيانات المستخدم في التخزين المحلي
            localStorage.setItem(CONFIG.TOKEN_KEY || 'moakkil_token', data.token);
            localStorage.setItem(CONFIG.USER_KEY || 'moakkil_user', JSON.stringify(data.user));
            
            // محاولة اقتراح تفعيل البصمة إذا كان المتصفح يدعمها
            if (window.PublicKeyCredential) {
                Swal.fire({
                    icon: 'question',
                    title: `أهلاً بك، ${data.user.full_name}`,
                    text: 'هل ترغب بتفعيل الدخول السريع عبر البصمة (أو التعرف على الوجه) لهذا الجهاز؟',
                    showCancelButton: true,
                    confirmButtonText: '<i class="fas fa-fingerprint me-1"></i> نعم، فعّل البصمة',
                    cancelButtonText: 'ليس الآن',
                    allowOutsideClick: false
                }).then((result) => {
                    if (result.isConfirmed) {
                        registerBiometrics().then(() => {
                            window.location.href = 'app.html';
                        });
                    } else {
                        window.location.href = 'app.html';
                    }
                });
            } else {
                // انتقال مباشر إذا كان الجهاز لا يدعم البصمة
                Swal.fire({
                    icon: 'success',
                    title: `أهلاً بك، ${data.user.full_name}`,
                    text: 'جاري تحويلك إلى لوحة التحكم...',
                    timer: 1500,
                    showConfirmButton: false
                }).then(() => {
                    window.location.href = 'app.html';
                });
            }
            
        } else {
            Swal.fire({
                icon: 'error',
                title: 'خطأ!',
                text: data.error || 'الكود غير صحيح أو منتهي الصلاحية.',
                confirmButtonText: 'المحاولة مجدداً'
            });
            otpInput.value = '';
            otpInput.focus();
        }
    } catch (error) {
        Swal.fire({
            icon: 'error',
            title: 'خطأ في الاتصال',
            text: 'تعذر الاتصال بالخادم أثناء التحقق.',
            confirmButtonText: 'حسناً'
        });
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-shield-alt me-1"></i> تأكيد الدخول';
    }
}

/**
 * 3. تسجيل البصمة (WebAuthn) - ميزة إضافية للراحة والأمان
 */
async function registerBiometrics() {
    try {
        // توليد تحدي عشوائي (Challenge)
        const challenge = new Uint8Array(32);
        window.crypto.getRandomValues(challenge);
        
        const userStr = localStorage.getItem(CONFIG.USER_KEY || 'moakkil_user');
        const user = userStr ? JSON.parse(userStr) : { id: 'unknown', phone: 'unknown', full_name: 'User' };

        const publicKey = {
            challenge: challenge,
            rp: { name: "نظام موكّل القانوني", id: window.location.hostname },
            user: {
                id: new TextEncoder().encode(user.id),
                name: user.phone,
                displayName: user.full_name
            },
            pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
            authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required" },
            timeout: 60000,
            attestation: "none"
        };

        const credential = await navigator.credentials.create({ publicKey });
        
        // إرسال المفتاح العام ومعرف البصمة للباك إند للحفظ
        if (credential) {
            const result = await API.registerBiometric({
                credential_id: btoa(String.fromCharCode(...new Uint8Array(credential.rawId))),
                public_key: 'webauthn_public_key_registered', // يتم تخزين البصمة محلياً بالجهاز، ونرسل الإثبات للباك إند
                device_name: navigator.userAgent
            });

            if(!result.error) {
                Swal.fire('تم بنجاح!', 'تم تفعيل الدخول بالبصمة لهذا الجهاز.', 'success');
            }
        }
    } catch (err) {
        console.warn("تم إلغاء أو فشل تسجيل البصمة:", err);
        Swal.fire('ملاحظة', 'لم يتم تفعيل البصمة. يمكنك المحاولة لاحقاً.', 'info');
    }
}