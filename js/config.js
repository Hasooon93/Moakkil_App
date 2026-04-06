// js/config.js - الإعدادات العامة والمتغيرات المركزية للنظام

// 1. رابط الـ Cloudflare Worker الخاص بك (الباك إند)
// ⚠️ تأكد دائماً من استخدام https عند الرفع
const API_BASE_URL = "https://curly-pond-9975.hassan-alsakka.workers.dev"; 

// 2. إعدادات النظام الداخلية
const CONFIG = {
    API_URL: API_BASE_URL,
    
    // رابط سكربت جوجل للرفع السحابي (Google Drive Integration)
    GAS_URL: "https://script.google.com/macros/s/AKfycbwxHOR6u00UEP-VLzFwuIICUH1ljhOWAMi8Qai4KGEKB5Khvd6aMSHk_7x_nW5G-ArQ/exec", 
    
    // مفاتيح التخزين المحلي (Local Storage Keys)
    TOKEN_KEY: "moakkil_token",
    USER_KEY: "moakkil_user",
    FIRM_KEY: "moakkil_firm_id",

    // 🔔 مفتاح VAPID العام (ضروري جداً لعمل الإشعارات في بيئة الرفع)
    // ملاحظة: يجب أن يتطابق هذا المفتاح مع المفتاح الموجود في إعدادات الـ Worker
    VAPID_PUBLIC_KEY: "BEl62vp95h4An3Wp7K8nS8zYvS8zYvS8zYvS8zYvS8zYvS8zYvS8zYvS8zYvS8zYvS8zYvS8zYvS8zYvS8zYv" 
};

// التأكد من توفر المتغيرات على مستوى النوافذ (Global Window Objects)
window.API_BASE_URL = API_BASE_URL;
window.CONFIG = CONFIG;