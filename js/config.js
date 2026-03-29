// js/config.js - الإعدادات العامة والمتغيرات المركزية للنظام

// 1. ضع رابط الـ Cloudflare Worker الخاص بك هنا (بدون / في النهاية)
const API_BASE_URL = "https://your-worker-name.your-subdomain.workers.dev"; 

// 2. إعدادات النظام الداخلية (متوافقة مع جميع ملفات JS التي قمنا ببرمجتها)
const CONFIG = {
    API_URL: API_BASE_URL,
    
    // رابط Google Apps Script الخاص برفع الملفات للأرشيف (Drive)
    GAS_URL: "https://script.google.com/macros/s/AKfycb.../exec", 
    
    // مفاتيح التخزين المحلي (Local Storage Keys)
    TOKEN_KEY: "moakkil_token",
    USER_KEY: "moakkil_user",
    FIRM_KEY: "moakkil_firm_id"
};

// التأكد من توفر المتغيرات على مستوى النوافذ
window.API_BASE_URL = API_BASE_URL;
window.CONFIG = CONFIG;