// moakkil-app.js
// الدستور المطبق: Single Session, Push Notifications, Dynamic Rendering, Role-Based Access.

document.addEventListener('DOMContentLoaded', async () => {

    // ==========================================
    // 1. الحماية والتحقق من الجلسة (Auth Guard)
    // ==========================================
    const token = localStorage.getItem('moakkil_token');
    const userDataStr = localStorage.getItem('moakkil_user');
    
    // إذا لم يكن هناك توكن، اطرد المستخدم فوراً إلى صفحة الدخول
    if (!token || !userDataStr) {
        window.location.replace('login.html');
        return;
    }

    const user = JSON.parse(userDataStr);

    // ==========================================
    // 2. إعداد واجهة المستخدم بناءً على الصلاحيات
    // ==========================================
    const topbarName = document.getElementById('topbarName');
    const topbarRole = document.getElementById('topbarRole');
    const welcomeText = document.getElementById('welcomeText');
    
    let roleAr = 'موظف';
    if (user.role === 'admin') roleAr = 'مدير النظام';
    else if (user.role === 'lawyer') roleAr = 'محامي مزاول';
    else if (user.role === 'secretary') roleAr = 'إداري / سكرتاريا';

    topbarName.innerText = user.full_name;
    topbarRole.innerText = roleAr;
    welcomeText.innerText = `أهلاً بك، الأستاذ ${user.full_name}`;

    // إخفاء الروابط الحساسة إذا لم يكن المستخدم مديراً
    if (user.role !== 'admin') {
        const navHr = document.getElementById('nav-hr');
        const navAudit = document.getElementById('nav-audit');
        if(navHr) navHr.style.display = 'none';
        if(navAudit) navAudit.style.display = 'none';
    }

    // ==========================================
    // 3. التجاوب مع الجوال (Mobile Menu)
    // ==========================================
    const sidebar = document.getElementById('sidebar');
    const menuToggle = document.getElementById('menuToggle');
    
    menuToggle.addEventListener('click', () => {
        sidebar.classList.toggle('open');
    });

    // ==========================================
    // 4. تسجيل الخروج (Logout)
    // ==========================================
    document.getElementById('btnLogout').addEventListener('click', () => {
        if(confirm('هل أنت متأكد من تسجيل الخروج؟')) {
            localStorage.removeItem('moakkil_token');
            localStorage.removeItem('moakkil_user');
            window.location.replace('login.html');
        }
    });

    // ==========================================
    // 5. محرك الإشعارات الفورية (Web Push API)
    // ==========================================
    const pushAlert = document.getElementById('pushNotificationAlert');
    const btnEnablePush = document.getElementById('btnEnablePush');

    // التحقق مما إذا كان المتصفح يدعم الإشعارات ولم يتم الاشتراك بعد
    if ('serviceWorker' in navigator && 'PushManager' in window) {
        const permission = Notification.permission;
        if (permission === 'default') {
            pushAlert.style.display = 'flex';
        }
    }

    btnEnablePush.addEventListener('click', async () => {
        try {
            const permission = await Notification.requestPermission();
            if (permission === 'granted') {
                pushAlert.style.display = 'none';
                
                // تسجيل Service Worker
                const registration = await navigator.serviceWorker.register('/sw.js');
                
                // للحصول على VAPID Key من الخادم يجب أن يكون مبرمجاً، هنا نضع مفتاح عام افتراضي
                // VAPID Public Key يجب أن يتطابق مع ما في الـ Worker
                const publicVapidKey = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuB24n4sH3J1nUq9f5WcO2e-w8';
                
                const urlBase64ToUint8Array = (base64String) => {
                    const padding = '='.repeat((4 - base64String.length % 4) % 4);
                    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
                    const rawData = window.atob(base64);
                    const outputArray = new Uint8Array(rawData.length);
                    for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
                    return outputArray;
                };

                const subscription = await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlBase64ToUint8Array(publicVapidKey)
                });

                // إرسال الاشتراك إلى الباك إند
                await api.post('/api/notifications/subscribe', subscription);
                alert('تم تفعيل الإشعارات بنجاح!');
            } else {
                alert('تم رفض صلاحية الإشعارات.');
            }
        } catch (error) {
            console.error('Push Setup Error:', error);
        }
    });

    // ==========================================
    // 6. جلب الإحصائيات الحية (Dashboard Data)
    // ==========================================
    async function loadDashboardData() {
        try {
            // تنفيذ 4 استعلامات بالتوازي لضمان سرعة التحميل (Performance)
            const [cases, clients, appointments, logs] = await Promise.all([
                api.get('/api/cases?select=id&status=eq.نشطة'),
                api.get('/api/clients?select=id'),
                api.get('/api/appointments?limit=5&order=appt_date.asc'),
                api.get('/api/history?limit=5&order=created_at.desc&select=action_type,entity_type,created_at,mo_users(full_name)')
            ]);

            // تحديث الأرقام
            document.getElementById('statCases').innerText = cases.length || 0;
            document.getElementById('statClients').innerText = clients.length || 0;
            document.getElementById('statTasks').innerText = appointments.length || 0;

            // عرض المواعيد
            const apptList = document.getElementById('appointmentsList');
            apptList.innerHTML = '';
            if (appointments.length === 0) {
                apptList.innerHTML = '<div style="padding: 15px; color: gray; text-align: center;">لا توجد مواعيد قادمة.</div>';
            } else {
                appointments.forEach(appt => {
                    const dateObj = new Date(appt.appt_date);
                    const isToday = dateObj.toDateString() === new Date().toDateString();
                    const badgeClass = isToday ? 'badge-today' : 'badge-upcoming';
                    const badgeText = isToday ? 'اليوم' : 'قادم';
                    
                    apptList.innerHTML += `
                        <div class="list-item">
                            <div class="item-details">
                                <h4>${appt.title || 'موعد غير معنون'}</h4>
                                <p><i class="far fa-clock"></i> ${dateObj.toLocaleDateString('ar-EG')} - ${appt.type || 'جلسة'}</p>
                            </div>
                            <span class="badge ${badgeClass}">${badgeText}</span>
                        </div>
                    `;
                });
            }

            // عرض سجل النشاطات الأخير (Audit Trail)
            const actList = document.getElementById('activityList');
            actList.innerHTML = '';
            if (logs.length === 0) {
                actList.innerHTML = '<div style="padding: 15px; color: gray; text-align: center;">لا توجد نشاطات حديثة.</div>';
            } else {
                logs.forEach(log => {
                    let actionAr = 'تعديل'; let icon = 'fa-pen'; let color = '#0d6efd';
                    if(log.action_type === 'CREATE') { actionAr = 'إضافة'; icon = 'fa-plus'; color = '#198754'; }
                    if(log.action_type === 'DELETE') { actionAr = 'حذف'; icon = 'fa-trash'; color = '#dc3545'; }

                    const entityAr = { 'mo_cases': 'قضية', 'mo_clients': 'موكل', 'mo_installments': 'دفعة مالية' }[log.entity_type] || 'سجل';
                    const userName = log.mo_users?.full_name || 'النظام';
                    
                    const timeAgo = Math.floor((new Date() - new Date(log.created_at)) / 60000);
                    const timeStr = timeAgo < 60 ? `منذ ${timeAgo} دقيقة` : `منذ ${Math.floor(timeAgo/60)} ساعة`;

                    actList.innerHTML += `
                        <div class="list-item">
                            <div style="display: flex; gap: 10px; align-items: center;">
                                <div style="width: 30px; height: 30px; border-radius: 50%; background: ${color}20; color: ${color}; display: flex; justify-content: center; align-items: center;">
                                    <i class="fas ${icon} fa-sm"></i>
                                </div>
                                <div class="item-details">
                                    <h4>${userName} قام بـ ${actionAr} ${entityAr}</h4>
                                    <p><i class="far fa-clock"></i> ${timeStr}</p>
                                </div>
                            </div>
                        </div>
                    `;
                });
            }

        } catch (error) {
            console.error('Dashboard Load Error:', error);
            // التعامل مع انتهاء الجلسة أو طرد المستخدم من الخادم
            if (error.message.includes('401') || error.message.includes('Unauthorized')) {
                localStorage.removeItem('moakkil_token');
                window.location.replace('login.html');
            }
        }
    }

    // التشغيل
    loadDashboardData();
});