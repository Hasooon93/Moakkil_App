// js/api.js
// الدالة المركزية للتخاطب مع الخادم مع إرفاق التوكن في كل طلب
async function fetchAPI(endpoint, method = 'GET', body = null) {
    const token = localStorage.getItem(CONFIG.TOKEN_KEY);
    
    // إذا لم يكن هناك توكن، نطرده لصفحة الدخول
    if (!token) {
        window.location.href = 'index.html';
        throw new Error('غير مصرح لك بالدخول');
    }

    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    };

    const options = { method, headers };
    if (body) options.body = JSON.stringify(body);

    try {
        const response = await fetch(`${CONFIG.API_URL}${endpoint}`, options);
        const data = await response.json();
        
        if (!response.ok) {
            // إذا كان التوكن منتهي أو خاطئ
            if (response.status === 401) {
                localStorage.clear();
                window.location.href = 'index.html';
            }
            throw new Error(data.error || 'حدث خطأ في الخادم');
        }
        return data;
    } catch (error) {
        console.error(`API Error (${endpoint}):`, error);
        throw error;
    }
}

// كائن (Object) يحتوي على جميع مسارات النظام لسهولة الاستخدام
const API = {
    // الموكلين
    getClients: () => fetchAPI('/api/clients'),
    addClient: (data) => fetchAPI('/api/clients', 'POST', data),
    
    // القضايا
    getCases: () => fetchAPI('/api/cases'),
    addCase: (data) => fetchAPI('/api/cases', 'POST', data),
    
    // فريق العمل (المستخدمين)
    getStaff: () => fetchAPI('/api/users'),
    addStaff: (data) => fetchAPI('/api/users', 'POST', data),
    
    // المواعيد والأجندة
    getAppointments: () => fetchAPI('/api/appointments'),
    addAppointment: (data) => fetchAPI('/api/appointments', 'POST', data),
};