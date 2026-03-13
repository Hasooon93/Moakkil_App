// js/auth.js - نظام الدخول المزدوج (مدير + موظفين)

/**
 * 1. طلب كود الدخول للمدير (Telegram OTP)
 */
async function requestOTP() {
    const phone = document.getElementById('phone').value;
    if (!phone) return alert("يرجى إدخال رقم الهاتف أولاً");

    const btn = document.querySelector('#admin-login-view button');
    btn.disabled = true;
    btn.innerText = "جاري الإرسال...";

    try {
        const response = await fetch(`${CONFIG.API_URL}/api/auth/admin/request-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone })
        });

        const data = await response.json();

        if (response.ok) {
            // الانتقال لشاشة إدخال الكود
            document.getElementById('phone-section').classList.add('d-none');
            document.getElementById('otp-section').classList.remove('d-none');
            console.log("✅ OTP Sent to Telegram");
        } else {
            alert(data.error || "خطأ في إرسال الكود");
        }
    } catch (error) {
        alert("تعذر الاتصال بالسيرفر، تأكد من تشغيل الـ Worker");
    } finally {
        btn.disabled = false;
        btn.innerText = "إرسال كود الدخول";
    }
}

/**
 * 2. التحقق من الكود والدخول للمدير
 */
async function verifyOTP() {
    const phone = document.getElementById('phone').value;
    const otp = document.getElementById('otp').value;

    try {
        const response = await fetch(`${CONFIG.API_URL}/api/auth/admin/verify-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, otp })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            // حفظ البيانات والتوجه للوحة التحكم
            localStorage.setItem(CONFIG.TOKEN_KEY, data.token);
            localStorage.setItem(CONFIG.USER_KEY, JSON.stringify(data.user));
            window.location.href = 'app.html';
        } else {
            alert(data.error || "الكود غير صحيح");
        }
    } catch (error) {
        alert("خطأ في عملية التحقق");
    }
}

/**
 * 3. دخول الموظفين (اسم مستخدم وكلمة مرور)
 */
async function staffLogin() {
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    if (!username || !password) return alert("يرجى إدخال كافة البيانات");

    try {
        // نستخدم نفس مسار التحقق ولكن الخادم سيميزه من البيانات المرسلة
        const response = await fetch(`${CONFIG.API_URL}/api/auth/staff/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            localStorage.setItem(CONFIG.TOKEN_KEY, data.token);
            localStorage.setItem(CONFIG.USER_KEY, JSON.stringify(data.user));
            window.location.href = 'app.html';
        } else {
            alert(data.error || "بيانات الدخول خاطئة");
        }
    } catch (error) {
        alert("خطأ في الاتصال بسيرفر الموظفين");
    }
}