// moakkil-auth.js
// الدستور المطبق: حماية الجلسات، OTP تيليغرام، الدخول البيومتري، تخزين الـ JWT الآمن.

document.addEventListener('DOMContentLoaded', () => {

    // ==========================================
    // 1. تعريف العناصر والتهيئة
    // ==========================================
    const stepPhone = document.getElementById('step-phone');
    const stepOtp = document.getElementById('step-otp');
    const phoneForm = document.getElementById('phoneForm');
    const otpForm = document.getElementById('otpForm');
    
    const userPhoneInput = document.getElementById('userPhone');
    const userOtpInput = document.getElementById('userOtp');
    const displayPhone = document.getElementById('displayPhone');
    
    const btnRequestOtp = document.getElementById('btnRequestOtp');
    const btnVerifyOtp = document.getElementById('btnVerifyOtp');
    const btnBiometricLogin = document.getElementById('btnBiometricLogin');
    
    const alertBox = document.getElementById('alertBox');

    let currentPhone = '';

    // التحقق المسبق: إذا كان المستخدم مسجلاً دخوله مسبقاً، وجهه فوراً للوحة التحكم
    const existingToken = localStorage.getItem('moakkil_token');
    if (existingToken) {
        window.location.href = 'app.html';
    }

    // ==========================================
    // 2. دوال مساعدة للرسائل (Alerts)
    // ==========================================
    function showAlert(message, type = 'error') {
        alertBox.innerText = message;
        alertBox.className = `alert-box alert-${type}`;
        alertBox.style.display = 'block';
        
        // إخفاء الرسالة بعد 5 ثوانٍ
        setTimeout(() => {
            alertBox.style.display = 'none';
        }, 5000);
    }

    window.resetToPhoneStep = () => {
        stepOtp.classList.remove('active');
        stepPhone.classList.add('active');
        userOtpInput.value = '';
        alertBox.style.display = 'none';
    };

    // ==========================================
    // 3. الخطوة الأولى: طلب كود OTP
    // ==========================================
    phoneForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const phone = userPhoneInput.value.trim();
        if (!phone) {
            showAlert("يرجى إدخال رقم الهاتف.");
            return;
        }

        const originalText = btnRequestOtp.innerHTML;
        btnRequestOtp.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الاتصال...';
        btnRequestOtp.disabled = true;

        try {
            // استدعاء endpoint الخاص بطلب الـ OTP من الـ Worker
            // نستخدم fetch مباشرة هنا لأن الـ api.js مصمم للمسارات المحمية بالتوكن
            const response = await fetch('https://your-worker-url.workers.dev/api/auth/request-otp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone: phone })
            });

            const result = await response.json();

            if (response.ok && result.success) {
                currentPhone = phone;
                displayPhone.innerText = phone;
                
                // الانتقال لخطوة الـ OTP
                stepPhone.classList.remove('active');
                stepOtp.classList.add('active');
                showAlert("تم إرسال الكود لتيليغرام بنجاح.", "success");
            } else {
                showAlert(result.error || "رقم الهاتف غير مصرح له بالدخول.");
            }
        } catch (error) {
            showAlert("فشل الاتصال بالخادم. يرجى التأكد من الإنترنت.");
            console.error("OTP Request Error:", error);
        } finally {
            btnRequestOtp.innerHTML = `متابعة <i class="fas fa-arrow-left"></i>`;
            btnRequestOtp.disabled = false;
        }
    });

    // ==========================================
    // 4. الخطوة الثانية: التحقق من كود OTP وتسجيل الدخول
    // ==========================================
    otpForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const otp = userOtpInput.value.trim();
        if (!otp || otp.length !== 6) {
            showAlert("يرجى إدخال الكود المكون من 6 أرقام بشكل صحيح.");
            return;
        }

        const originalText = btnVerifyOtp.innerHTML;
        btnVerifyOtp.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري التحقق...';
        btnVerifyOtp.disabled = true;

        try {
            const response = await fetch('https://your-worker-url.workers.dev/api/auth/verify-otp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone: currentPhone, otp: otp })
            });

            const result = await response.json();

            if (response.ok && result.success) {
                // حفظ الـ Token وبيانات المستخدم في LocalStorage
                localStorage.setItem('moakkil_token', result.token);
                localStorage.setItem('moakkil_user', JSON.stringify(result.user));
                
                // إعادة توجيه المستخدم إلى لوحة التحكم الرئيسية
                window.location.href = 'app.html';
            } else {
                showAlert(result.error || "الكود غير صحيح أو منتهي الصلاحية.");
                userOtpInput.value = ''; // تصفير الحقل للمحاولة مجدداً
            }
        } catch (error) {
            showAlert("فشل الاتصال بالخادم. يرجى المحاولة لاحقاً.");
            console.error("OTP Verification Error:", error);
        } finally {
            btnVerifyOtp.innerHTML = `تحقق ودخول <i class="fas fa-sign-in-alt"></i>`;
            btnVerifyOtp.disabled = false;
        }
    });

    // ==========================================
    // 5. محرك تسجيل الدخول البيومتري (البصمة / WebAuthn)
    // ==========================================
    btnBiometricLogin.addEventListener('click', async () => {
        const phone = userPhoneInput.value.trim();
        if (!phone) {
            showAlert("يرجى إدخال رقم الهاتف أولاً للتعرف على حسابك ثم الضغط على الدخول بالبصمة.");
            userPhoneInput.focus();
            return;
        }

        if (!window.PublicKeyCredential) {
            showAlert("جهازك أو متصفحك لا يدعم تسجيل الدخول بالبصمة (WebAuthn).");
            return;
        }

        try {
            btnBiometricLogin.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري قراءة البصمة...';
            btnBiometricLogin.disabled = true;

            // بناء تحدي وهمي (في الأنظمة البنكية يتم جلبه من الخادم أولاً)
            const challenge = new Uint8Array(32);
            window.crypto.getRandomValues(challenge);

            // استدعاء واجهة البصمة في نظام التشغيل (FaceID, TouchID, Windows Hello)
            const assertion = await navigator.credentials.get({
                publicKey: {
                    challenge: challenge,
                    rpId: window.location.hostname, // يجب أن يتطابق مع الدومين الفعلي
                    userVerification: "required"
                }
            });

            // استخراج المعرف الفريد للبصمة (Credential ID)
            const credentialId = btoa(String.fromCharCode(...new Uint8Array(assertion.rawId)))
                                  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

            // إرسال المعرف للبصمة واسم المستخدم للباك إند للتحقق
            const response = await fetch('https://your-worker-url.workers.dev/api/auth/biometric-login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ credential_id: credentialId, phone: phone })
            });

            const result = await response.json();

            if (response.ok && result.success) {
                // نجاح الدخول البيومتري
                localStorage.setItem('moakkil_token', result.token);
                localStorage.setItem('moakkil_user', JSON.stringify(result.user));
                window.location.href = 'app.html';
            } else {
                showAlert(result.error || "البصمة غير مسجلة في النظام. يرجى الدخول بالكود (OTP) وتفعيلها من الإعدادات.");
            }

        } catch (error) {
            console.error("Biometric Login Error:", error);
            if (error.name === 'NotAllowedError') {
                showAlert("تم إلغاء عملية قراءة البصمة من قبل المستخدم.");
            } else {
                showAlert("فشل قراءة البصمة. تأكد من إعدادات جهازك.");
            }
        } finally {
            btnBiometricLogin.innerHTML = `<i class="fas fa-fingerprint"></i> الدخول السريع بالبصمة`;
            btnBiometricLogin.disabled = false;
        }
    });

});