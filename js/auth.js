// js/auth.js

window.onload = () => {
    // التأكد من أن الملف يرى الإعدادات
    if (typeof CONFIG === 'undefined') {
        console.error("❌ Error: CONFIG is not defined. Make sure config.js is loaded before auth.js");
        return;
    }
    console.log("🔐 Auth System Ready");
};

/**
 * طلب كود الدخول (OTP)
 */
async function requestOTP() {
    const phone = document.getElementById('phone').value;
    if (!phone) return alert("يرجى إدخال رقم الهاتف");

    const btn = document.querySelector('button');
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
            // إخفاء شاشة الهاتف وإظهار شاشة الكود
            document.getElementById('phone-section').classList.add('d-none');
            document.getElementById('otp-section').classList.remove('d-none');
        } else {
            alert(data.error || "خطأ في الإرسال");
        }
    } catch (error) {
        alert("فشل الاتصال بالسيرفر");
    } finally {
        btn.disabled = false;
        btn.innerText = "إرسال كود الدخول";
    }
}

/**
 * التحقق من الكود والدخول
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
            // حفظ التوكن وبيانات المستخدم
            localStorage.setItem(CONFIG.TOKEN_KEY, data.token);
            localStorage.setItem(CONFIG.USER_KEY, JSON.stringify(data.user));
            
            // التوجه للوحة التحكم
            window.location.href = 'app.html';
        } else {
            alert(data.error || "كود خاطئ");
        }
    } catch (error) {
        alert("خطأ في التحقق");
    }
}