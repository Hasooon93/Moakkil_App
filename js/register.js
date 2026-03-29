// js/register.js - محرك تأسيس المكاتب (Super Admin) مع حماية XSS

// دالة الحماية من ثغرات الحقن (XSS)
const escapeHTML = (str) => {
    if (str === null || str === undefined) return '';
    return str.toString().replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );
};

async function handleSuperRegister(event) {
    event.preventDefault();
    
    const btn = document.getElementById('reg_btn');
    const msgBox = document.getElementById('reg_msg');
    
    const payload = {
        super_password: document.getElementById('reg_super_pass').value,
        firm_name: document.getElementById('reg_firm_name').value,
        max_users: document.getElementById('reg_max_users').value,
        admin_name: document.getElementById('reg_admin_name').value,
        admin_phone: document.getElementById('reg_admin_phone').value,
        telegram_id: document.getElementById('reg_telegram_id').value || null
    };

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الإنشاء...';
    msgBox.innerHTML = '';
    msgBox.className = 'text-center mt-3 small fw-bold';

    try {
        const response = await fetch(`${CONFIG.API_URL}/api/super/register-firm`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (response.ok && result.success) {
            msgBox.classList.add('text-success');
            // تنظيف اسم المكتب القادم من السيرفر لمنع ثغرات XSS
            msgBox.innerHTML = `✅ تم إنشاء المكتب (${escapeHTML(result.firm.firm_name)}) بنجاح!<br>يمكن للمدير الدخول برقم الهاتف الآن.`;
            document.getElementById('superRegisterForm').reset();
            
            // تحويل اختياري لصفحة الدخول بعد 3 ثواني
            setTimeout(() => {
                window.location.href = 'login.html';
            }, 3000);
        } else {
            msgBox.classList.add('text-danger');
            // تنظيف رسالة الخطأ القادمة من السيرفر
            msgBox.innerHTML = `❌ فشل الإنشاء: ${escapeHTML(result.error || 'خطأ غير معروف')}`;
        }
    } catch (error) {
        msgBox.classList.add('text-danger');
        msgBox.innerHTML = `❌ حدث خطأ في الاتصال بالخادم.`;
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-plus-circle me-1"></i> إنشاء المكتب والمدير';
    }
}