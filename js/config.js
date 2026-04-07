// js/config.js - الإعدادات العامة والمتغيرات المركزية للنظام (V3.0 Enterprise)

// 1. إعدادات البيئة والإصدار
const ENV = "production"; // يمكن تغييرها إلى "development" أثناء التطوير لاختبار الأخطاء
const APP_VERSION = "3.0.0"; // يستخدم لتحديث الكاش (Service Worker) عند إطلاق ميزات جديدة

// 2. رابط الـ Cloudflare Worker الخاص بك (الباك إند)
// ⚠️ تأكد دائماً من استخدام https عند الرفع
const API_BASE_URL = "https://curly-pond-9975.hassan-alsakka.workers.dev"; 

// 3. إعدادات النظام الداخلية (The Central Configuration Object)
const CONFIG = {
    APP_VERSION: APP_VERSION,
    API_URL: API_BASE_URL,
    
    // رابط سكربت جوجل للرفع السحابي (Google Drive Integration - Backup/Direct)
    GAS_URL: "https://script.google.com/macros/s/AKfycbwxHOR6u00UEP-VLzFwuIICUH1ljhOWAMi8Qai4KGEKB5Khvd6aMSHk_7x_nW5G-ArQ/exec", 
    
    // مفاتيح التخزين المحلي (Local Storage Keys) - تم تجميعها لتجنب التكرار والخطأ الإملائي
    TOKEN_KEY: "moakkil_token",
    USER_KEY: "moakkil_user",
    FIRM_KEY: "moakkil_firm_id",
    
    // مفاتيح الميزات المتقدمة (Offline & Biometrics)
    OFFLINE_QUEUE_KEY: "moakkil_offline_queue",
    BIOMETRIC_ID_KEY: "moakkil_biometric_id",
    SAVED_PHONE_KEY: "moakkil_saved_phone",

    // 🔔 مفتاح VAPID العام (ضروري جداً لعمل الإشعارات الفورية Web Push API)
    VAPID_PUBLIC_KEY: "BEl62vp95h4An3Wp7K8nS8zYvS8zYvS8zYvS8zYvS8zYvS8zYvS8zYvS8zYvS8zYvS8zYvS8zYvS8zYvS8zYv" 
};

// 4. دوال مساعدة عالمية (Global Utility Functions)
const UTILS = {
    // دالة مساعدة لتحويل مفتاح VAPID إلى صيغة يقبلها المتصفح للاشتراك في الإشعارات
    urlBase64ToUint8Array: (base64String) => {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
    }
};

// التأكد من توفر المتغيرات على مستوى النوافذ (Global Window Objects) ليتم الوصول لها من أي ملف
window.API_BASE_URL = API_BASE_URL;
window.CONFIG = CONFIG;
window.UTILS = UTILS;

// طباعة رسالة ترحيبية في الـ Console إذا كنا في بيئة التطوير
if (ENV === "development") {
    console.log(`%c⚖️ Moakkil System Booted - v${APP_VERSION}`, 'color: #cda434; font-size: 16px; font-weight: bold;');
    console.log(`🔗 API Connected to: ${CONFIG.API_URL}`);
}