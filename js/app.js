// moakkil-worker-2026-ultimate.js
// الدستور المطبق: العزل التام، الرقابة، الذكاء الاصطناعي المزدوج، البصمة، الكوتا، السرية، التخزين السحابي R2.
// التحديثات الحصرية: النسخ الاحتياطي الفولاذي لكل مكتب يومياً، رادار المواعيد، الوسوم الذكية، والإشعارات الذكية.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-device-id',
  'Access-Control-Max-Age': '86400',
};

// =========================================================
// دوال مساعدة عامة (توقيت، تشفير، وتنسيق)
// =========================================================
const getLocalTime = (dateObj = new Date()) => {
    return new Date(dateObj.getTime() + (3 * 60 * 60 * 1000));
};

const safeTG = (str) => (str || '').toString().replace(/</g, '&lt;').replace(/>/g, '&gt;');

const base64UrlEncode = (buffer) => {
    return btoa(String.fromCharCode(...new Uint8Array(buffer)))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
};

const formatVal = (val) => {
    if (!val) return 'غير محدد';
    if (typeof val === 'string' && val.includes('T')) return val.split('T')[0];
    return val;
};

export default {
  // =========================================================
  // [1] المحرك الأوتوماتيكي اليومي (Cron Triggers & Backups)
  // =========================================================
  async scheduled(event, env, ctx) {
      const db = async (endpoint, options = {}) => {
          const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${endpoint}`, {
              ...options,
              headers: {
                  'apikey': env.SUPABASE_SERVICE_KEY,
                  'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
                  'Content-Type': 'application/json',
                  'Prefer': 'return=representation'
              }
          });
          return await r.json();
      };

      const sendTG = async (chatId, msg) => {
          if (!env.TG_BOT_TOKEN || !chatId) return;
          await fetch(`https://api.telegram.org/bot${env.TG_BOT_TOKEN}/sendMessage`, {
              method: 'POST',
              headers: {'Content-Type': 'application/json'},
              body: JSON.stringify({ chat_id: chatId, text: msg, parse_mode: 'HTML' })
          }).catch((err)=> console.error("TG Send Error:", err));
      };

      const sendNotification = async (notifBody) => {
          const r = await fetch(`${env.SUPABASE_URL}/rest/v1/mo_notifications`, {
              method: 'POST',
              headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
              body: JSON.stringify(notifBody)
          });
          if (!r.ok) {
              const errText = await r.text();
              console.error(`🚨 [CRON DB_INSERT_ERROR] mo_notifications:`, errText);
          }
      };

      try {
          const now = getLocalTime();
          const todayStr = now.toISOString().split('T')[0];
          
          // --- فحص المكاتب والنسخ الاحتياطي اليومي ---
          const firms = await db('mo_firms?select=*,mo_users(telegram_id,role)', { method: 'GET' }).catch(()=>[]);
          for (const firm of firms) {
              if (!firm.is_active) continue;

              // 1. [ميزة جديدة - الحفظ الفولاذي]: أخذ نسخة احتياطية يومية لداتا كل مكتب ورفعها لـ R2
              try {
                  const firmCases = await db(`mo_cases?firm_id=eq.${firm.id}&select=*`).catch(()=>[]);
                  const firmClients = await db(`mo_clients?firm_id=eq.${firm.id}&select=*`).catch(()=>[]);
                  
                  const backupData = JSON.stringify({
                      timestamp: now.toISOString(),
                      firm_info: { id: firm.id, name: firm.firm_name },
                      cases_count: firmCases.length,
                      clients_count: firmClients.length,
                      cases: firmCases,
                      clients: firmClients
                  });

                  // مسار آمن ومعزول لكل مكتب: firms/{firm_id}/backups/backup_2026-05-03.json
                  const backupPath = `firms/${firm.id}/backups/backup_${todayStr}.json`;
                  
                  await env.R2_BUCKET.put(backupPath, backupData, {
                      httpMetadata: { contentType: 'application/json' }
                  });
              } catch(backupErr) {
                  console.error(`[Backup Error] Firm: ${firm.id}`, backupErr);
              }

              // 2. التنبيه باشتراكات المكتب
              if (!firm.subscription_end_date) continue;
              const adminUser = firm.mo_users?.find(u => u.role === 'admin' && u.telegram_id);
              const adminTgId = adminUser ? adminUser.telegram_id : null;
              
              const endDate = new Date(firm.subscription_end_date);
              const createdAt = new Date(firm.created_at);
              const diffTime = endDate - now;
              const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
              const ageDays = Math.floor((now - createdAt) / (1000 * 60 * 60 * 24));

              if (daysLeft === 2 && adminTgId) {
                  await sendTG(adminTgId, `⚠️ <b>تنبيه من نظام موكّل</b>\n\nنود إعلامكم بأن اشتراك مكتبكم سينتهي بعد <b>يومين</b>.\nيرجى التجديد لضمان عدم توقف الخدمة.`);
              }
              if (daysLeft === 0 && adminTgId) {
                  await sendTG(adminTgId, `🔴 <b>إشعار انتهاء الاشتراك</b>\n\nلقد انتهى اشتراككم اليوم. تم منحكم <b>فترة سماح 3 أيام</b> لتسيير أعمالكم العاجلة.`);
              }
              if (ageDays > 0 && ageDays % 365 === 0) {
                  const newEndDate = new Date(endDate);
                  newEndDate.setMonth(newEndDate.getMonth() + 1);
                  await db(`mo_firms?id=eq.${firm.id}`, { method: 'PATCH', body: JSON.stringify({ subscription_end_date: newEndDate.toISOString() }) });
                  await db('mo_billing_history', { method: 'POST', body: JSON.stringify({ firm_id: firm.id, action_type: 'هدية سنوية', months_added: 1 }) });
                  if (adminTgId) await sendTG(adminTgId, `🎉 <b>ذكرى سنوية سعيدة!</b>\n\nمضى عام كامل على انضمامكم. 🎁 <b>هديتنا لكم:</b> تمديد الاشتراك شهر مجاناً!`);
              }
          }

          // --- فحص أعياد الميلاد وهويات النقابة ---
          const users = await db('mo_users?is_active=eq.true&select=*,mo_firms(firm_name)', { method: 'GET' }).catch(()=>[]);
          for (const user of users) {
              if (user.date_of_birth && user.telegram_id) {
                  const dob = new Date(user.date_of_birth);
                  if (dob.getDate() === now.getDate() && dob.getMonth() === now.getMonth()) {
                      await sendTG(user.telegram_id, `🎂 <b>عيد ميلاد سعيد!</b>\n\nعائلة موكّل ومكتب (${safeTG(user.mo_firms?.firm_name)}) يتمنون لك عاماً مليئاً بالنجاح! 🎉`);
                  }
              }
              if (user.syndicate_expiry_date && user.telegram_id) {
                  const synEndDate = new Date(user.syndicate_expiry_date);
                  const synDaysLeft = Math.ceil((synEndDate - now) / (1000 * 60 * 60 * 24));
                  if (synDaysLeft === 7) await sendTG(user.telegram_id, `⚖️ <b>تذكير نقابي مهني</b>\n\nهويتك النقابية ستنتهي بعد <b>أسبوع واحد</b>.`);
                  else if (synDaysLeft === 0) await sendTG(user.telegram_id, `🚨 <b>تنبيه هام جداً</b>\n\nانتهت صلاحية هويتك النقابية اليوم!`);
              }
          }

          // --- فحص المواعيد لليوم التالي ---
          const tomorrow = getLocalTime();
          tomorrow.setDate(tomorrow.getDate() + 1);
          const tomorrowStr = tomorrow.toISOString().split('T')[0];
          const upcomingAppts = await db(`mo_appointments?status=eq.مجدول&appt_date=gte.${tomorrowStr}T00:00:00&appt_date=lte.${tomorrowStr}T23:59:59&select=*`, { method: 'GET' }).catch(()=>[]);

          for (const appt of upcomingAppts) {
              if (!appt.assigned_to || !Array.isArray(appt.assigned_to) || appt.assigned_to.length === 0) continue;
              const assignedIds = appt.assigned_to.join(',');
              const staffList = await db(`mo_users?id=in.(${assignedIds})&select=id,telegram_id,full_name`).catch(()=>[]);

              for (const staff of staffList) {
                  await sendNotification({ user_id: staff.id, firm_id: appt.firm_id, title: 'تذكير بموعد غداً 📅', message: `لديك (${appt.type || 'موعد'}) غداً: ${appt.title}`, action_url: `/app.html#appointments`, is_read: false, created_at: getLocalTime().toISOString(), created_by: staff.id });
                  if (staff.telegram_id) await sendTG(staff.telegram_id, `📅 <b>تذكير بموعد غداً</b>\n\nعزيزي ${safeTG(staff.full_name)}، لديك (${safeTG(appt.type)}) غداً:\n📌 ${safeTG(appt.title)}`);
              }
          }

          // --- [رادار المواعيد القانونية والتقادم] ---
          const casesRadar = await db(`mo_cases?deadline_date=gte.${todayStr}&select=id,case_internal_id,deadline_date,assigned_lawyer_id,firm_id,mo_clients(full_name)`).catch(()=>[]);
          for (const c of casesRadar) {
              if (!c.deadline_date || !c.assigned_lawyer_id || c.assigned_lawyer_id.length === 0) continue;
              const dDate = new Date(c.deadline_date);
              const daysLeft = Math.ceil((dDate - now) / (1000 * 60 * 60 * 24));
              
              if ([10, 3, 0].includes(daysLeft)) {
                  const lawyers = await db(`mo_users?id=in.(${c.assigned_lawyer_id.join(',')})&select=id,telegram_id`).catch(()=>[]);
                  for (const l of lawyers) {
                      const alertMsg = daysLeft === 0 ? "⚠️ انقضى الموعد القانوني اليوم!" : `تنبيه: تبقى ${daysLeft} أيام فقط.`;
                      await sendNotification({ user_id: l.id, firm_id: c.firm_id, title: '🚨 رادار المواعيد القانونية', message: `القضية ${c.case_internal_id} تقترب من الموعد النهائي: ${c.deadline_date}`, action_url: `/case-details.html?id=${c.id}`, is_read: false, created_at: getLocalTime().toISOString(), created_by: l.id });
                      if (l.telegram_id) await sendTG(l.telegram_id, `🚨 <b>رادار المواعيد القانونية</b>\n\nملف رقم: <b>${safeTG(c.case_internal_id)}</b>\n👤 الموكل: ${safeTG(c.mo_clients?.full_name)}\n\n📆 <b>${alertMsg}</b>\nتاريخ السقوط/التقادم: ${c.deadline_date}`);
                  }
              }
          }

      } catch (err) { console.error("Cron Job Error:", err); }
  },

  // =========================================================
  // [2] المحرك الأساسي (API Engine)
  // =========================================================
  async fetch(request, env) {
    const url = new URL(request.url);
    const method = request.method;
    const path = url.pathname;

    if (method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });

    const jwtSecret = env.JWT_SECRET || "moakkil_secure_secret_2026_enterprise_production_key";
    const SUPER_ADMIN_PHONE = "0777738380";
    const SUPER_ADMIN_TG = "877384498";

    const createRes = (data, status = 200) => new Response(JSON.stringify(data), {
      status, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

    const generateToken = async (payload) => {
      const enc = new TextEncoder();
      const encodeB64 = (obj) => btoa(String.fromCodePoint(...enc.encode(JSON.stringify(obj)))).replace(/[+/=]/g, m => ({'+':'-','/':'_','=':''}[m]));
      const data = `${encodeB64({ alg: "HS256", typ: "JWT" })}.${encodeB64(payload)}`;
      const key = await crypto.subtle.importKey("raw", enc.encode(jwtSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
      const signature = await crypto.subtle.sign("HMAC", key, enc.encode(data));
      const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/[+/=]/g, m => ({'+':'-','/':'_','=':''}[m]));
      return `${data}.${sigB64}`;
    };

    const verifyToken = async (token) => {
      try {
        const parts = token.split('.');
        if (parts.length !== 3) return null;
        const payloadBinStr = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
        const payloadBytes = Uint8Array.from(payloadBinStr, c => c.charCodeAt(0));
        const payload = JSON.parse(new TextDecoder().decode(payloadBytes));

        if (env.MOAKKIL_KV && payload.phone) {
          const savedToken = await env.MOAKKIL_KV.get(`session:${payload.phone}`);
          if (savedToken !== token) return null;
        }
        return payload;
      } catch (e) { return null; }
    };

    const db = async (endpoint, options = {}) => {
      const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${endpoint}`, {
        ...options, headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation', ...options.headers }
      });
      if (options.method === 'DELETE' && r.status === 204) return { success: true };
      const data = await r.json();
      if (!r.ok) throw new Error(data.message || JSON.stringify(data));
      return data;
    };

    const sendTG = async (chatId, msg) => {
      if (!env.TG_BOT_TOKEN || !chatId) return;
      await fetch(`https://api.telegram.org/bot${env.TG_BOT_TOKEN}/sendMessage`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ chat_id: chatId, text: msg, parse_mode: 'HTML' }) }).catch(()=>{});
    };

    const sendNotification = async (notifBody) => {
        const r = await fetch(`${env.SUPABASE_URL}/rest/v1/mo_notifications`, {
            method: 'POST', headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
            body: JSON.stringify(notifBody)
        });
        if (!r.ok) return;

        try {
            if(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) {
                const devices = await db(`mo_user_devices?user_id=eq.${notifBody.user_id}&select=*`).catch(()=>[]);
                for (const device of devices) {
                    if (!device.endpoint) continue;
                    const pushUrl = new URL(device.endpoint);
                    const aud = `${pushUrl.protocol}//${pushUrl.host}`;
                    const exp = Math.floor(Date.now() / 1000) + 12 * 60 * 60;
                    const sub = env.VAPID_SUBJECT || 'mailto:admin@moakkil.com';

                    const header = { typ: 'JWT', alg: 'ES256' };
                    const payload = { aud, exp, sub };
                    const enc = new TextEncoder();
                    const dataToSign = `${base64UrlEncode(enc.encode(JSON.stringify(header)))}.${base64UrlEncode(enc.encode(JSON.stringify(payload)))}`;
                    
                    await fetch(device.endpoint, {
                        method: 'POST', headers: { 'TTL': '60', 'Urgency': 'high', 'Topic': 'moakkil_alert' }
                    }).catch(()=>{});
                }
            }
        } catch(e) {}
    };

    const updateCaseFinancials = async (caseId, firmId) => {
        try {
            const installments = await db(`mo_installments?case_id=eq.${caseId}&firm_id=eq.${firmId}&status=eq.مدفوعة&select=amount`);
            const totalPaid = installments.reduce((sum, inst) => sum + (Number(inst.amount) || 0), 0);
            await db(`mo_cases?id=eq.${caseId}&firm_id=eq.${firmId}`, { method: 'PATCH', body: JSON.stringify({ total_paid: totalPaid }) });
        } catch (err) {}
    };

    try {
      // عرض الملفات الآمن (Zero Trust) عبر R2
      if (path === '/api/files/download' && method === 'GET') {
          const filePath = url.searchParams.get('path');
          const token = url.searchParams.get('token');
          if (!filePath || !token) return createRes({ error: "مسار الملف أو التوكن مفقود" }, 400);

          const session = await verifyToken(token);
          if (!session) return createRes({ error: "غير مصرح لك بعرض هذا الملف" }, 401);

          const object = await env.R2_BUCKET.get(filePath);
          if (!object) return createRes({ error: "الملف غير موجود" }, 404);

          const headers = new Headers();
          object.writeHttpMetadata(headers);
          headers.set('etag', object.httpEtag);
          headers.set('Cache-Control', 'public, max-age=31536000'); 
          for (const [key, value] of Object.entries(corsHeaders)) headers.set(key, value);

          return new Response(object.body, { headers });
      }

      // Webhooks
      if (path === '/api/webhook/telegram' && method === 'POST') {
          const body = await request.json();
          if (body.message && body.message.text) {
              const chatId = body.message.chat.id;
              const text = body.message.text.trim();
              if (text === '/id' || text === '/start') {
                  const replyMsg = `أهلاً بك في نظام موكّل ⚖️\n\nالرقم التعريفي (ID) الخاص بك هو:\n<code>${chatId}</code>\n\nيرجى نسخ هذا الرقم وإعطائه لمدير النظام لتفعيل حسابك.`;
                  await sendTG(chatId, replyMsg);
              }
          }
          return new Response("OK", { status: 200 });
      }

      if (path === '/api/ai/agree' && method === 'GET' && env.AI) {
          try {
              const aiRes = await env.AI.run('@cf/meta/llama-3.2-11b-vision-instruct', { prompt: "agree" });
              return createRes({ success: true, message: "تم تفعيل محرك الرؤية.", response: aiRes });
          } catch(e) { return createRes({ error: e.message }, 500); }
      }

      // =========================================================
      // المصادقة (Auth & Biometrics)
      // =========================================================
      if (path === '/api/auth/request-otp' && method === 'POST') {
        const { phone } = await request.json();
        
        if (phone === SUPER_ADMIN_PHONE) {
            const otp = Math.floor(100000 + Math.random() * 900000).toString();
            if (env.MOAKKIL_KV) await env.MOAKKIL_KV.put(`otp:${phone}`, otp, { expirationTtl: 300 });
            await sendTG(SUPER_ADMIN_TG, `👨‍💻 <b>دخول الإدارة العليا - نظام موكّل</b>\n\nكود التحقق:\n<code>${otp}</code>`);
            return createRes({success: true, message: "تم إرسال الكود"});
        }

        const users = await db(`mo_users?phone=eq.${encodeURIComponent(phone)}&select=*,mo_firms(firm_name,is_active,subscription_end_date)`);
        if (!users.length) return createRes({error: 'الرقم غير مسجل بالنظام'}, 403);
        
        const user = users[0];
        const firm = user.mo_firms;

        if (!user.is_active || !user.can_login) return createRes({error: 'تم إيقاف حسابك من قبل الإدارة.'}, 403);
        if (!firm?.is_active) return createRes({error: 'تم إيقاف حساب المكتب من قبل الإدارة.'}, 403);
        
        if (firm?.subscription_end_date) {
            const gracePeriodEnd = new Date(firm.subscription_end_date);
            gracePeriodEnd.setDate(gracePeriodEnd.getDate() + 3);
            if (getLocalTime() > gracePeriodEnd) return createRes({error: 'انتهت صلاحية اشتراك المكتب. يرجى التجديد.'}, 402);
        }
        
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        if (env.MOAKKIL_KV) await env.MOAKKIL_KV.put(`otp:${phone}`, otp, { expirationTtl: 300 });
        
        let targetTgId = user.telegram_id;
        if (!targetTgId) {
            const hubUsers = await db(`hub_users?phone_number=eq.${encodeURIComponent(phone)}&select=telegram_id`).catch(()=>[]);
            if (hubUsers.length) targetTgId = hubUsers[0].telegram_id;
        }

        if (targetTgId) await sendTG(targetTgId, `🔐 كود الدخول لنظام موكّل:\n\n<code>${otp}</code>\n\nصالح لمدة 5 دقائق.`);
        return createRes({success: true, message: "تم إرسال الكود لتيليغرام"});
      }

      if (path === '/api/auth/verify-otp' && method === 'POST') {
        const { phone, otp } = await request.json();
        let savedOtpVal = null;
        if (env.MOAKKIL_KV) {
            const fetched = await env.MOAKKIL_KV.get(`otp:${phone}`);
            if (fetched) savedOtpVal = fetched;
        }
        if (!savedOtpVal || savedOtpVal !== otp) return createRes({error: 'الكود غير صحيح أو منتهي الصلاحية'}, 401);
        
        if (phone === SUPER_ADMIN_PHONE) {
            const token = await generateToken({ uid: 'super_admin_id', role: 'super_admin', phone: SUPER_ADMIN_PHONE, name: 'الإدارة العليا' });
            if (env.MOAKKIL_KV) {
              await env.MOAKKIL_KV.put(`session:${phone}`, token, { expirationTtl: 604800 });
              await env.MOAKKIL_KV.delete(`otp:${phone}`);
            }
            return createRes({ success: true, token, user: { id: 'super_admin_id', role: 'super_admin', full_name: 'الإدارة العليا', phone: SUPER_ADMIN_PHONE } });
        }

        const u = (await db(`mo_users?phone=eq.${encodeURIComponent(phone)}&select=*`))[0];
        const token = await generateToken({ uid: u.id, firm_id: u.firm_id, role: u.role, name: u.full_name, phone: u.phone, permissions: u.permissions });
        if (env.MOAKKIL_KV) {
          await env.MOAKKIL_KV.put(`session:${phone}`, token, { expirationTtl: 604800 });
          await env.MOAKKIL_KV.delete(`otp:${phone}`);
        }
        return createRes({ success: true, token, user: u });
      }

      if (path === '/api/auth/biometric-register' && method === 'POST') {
        const authHeader = request.headers.get('Authorization');
        const session = authHeader ? await verifyToken(authHeader.split(' ')[1]) : null;
        if (!session) return createRes({error: 'جلسة غير صالحة'}, 401);
        const { credential_id, public_key, device_name } = await request.json();
        await db('mo_user_credentials', { method: 'POST', body: JSON.stringify({ user_id: session.uid, credential_id, public_key, device_name }) }).catch(e=>console.error(e));
        return createRes({success: true, message: "تم تسجيل جهازك"});
      }

      if (path === '/api/auth/biometric-login' && method === 'POST') {
          const { credential_id, phone } = await request.json();
          if (!credential_id || !phone) return createRes({error: 'بيانات غير مكتملة'}, 400);

          const creds = await db(`mo_user_credentials?credential_id=eq.${encodeURIComponent(credential_id)}&select=user_id,mo_users(role,full_name,firm_id,permissions)`);
          if(!creds.length) return createRes({error: 'البصمة غير مسجلة في النظام.'}, 401);

          const user = creds[0].mo_users;
          const token = await generateToken({ uid: creds[0].user_id, firm_id: user.firm_id, role: user.role, name: user.full_name, phone: phone, permissions: user.permissions });
          if (env.MOAKKIL_KV) await env.MOAKKIL_KV.put(`session:${phone}`, token, { expirationTtl: 604800 });
          return createRes({ success: true, token, user });
      }

      // =========================================================
      // بوابة الموكل والتحقق المفتوح
      // =========================================================
      if (path === '/api/public/client/login' && method === 'POST') {
        const { case_number, access_pin } = await request.json();
        if (env.MOAKKIL_KV) {
            let attempts = parseInt(await env.MOAKKIL_KV.get(`brute:${case_number}`) || "0");
            attempts += 1;
            if (attempts > 5) return createRes({error: 'تم تجاوز الحد الأقصى للمحاولات.'}, 429);
            await env.MOAKKIL_KV.put(`brute:${case_number}`, attempts.toString(), { expirationTtl: 900 });
        }
        const cases = await db(`mo_cases?case_internal_id=eq.${encodeURIComponent(case_number)}&access_pin=eq.${encodeURIComponent(access_pin)}&select=public_token`);
        if (!cases.length) return createRes({error: 'رقم القضية أو رمز الدخول غير صحيح'}, 401);
        if (env.MOAKKIL_KV) await env.MOAKKIL_KV.delete(`brute:${case_number}`);
        return createRes({ success: true, token: cases[0].public_token });
      }

      if (path === '/api/public/client' && method === 'GET') {
        const token = url.searchParams.get('token');
        if (!token) return createRes({error: 'توكن مفقود'}, 400);
        const cases = await db(`mo_cases?public_token=eq.${token}&select=*`);
        if (!cases.length) return createRes({error: 'الملف غير موجود'}, 404);
        const c = cases[0];
        
        const [cl, upd, firm, fl, inst, exp] = await Promise.all([
          db(`mo_clients?id=eq.${c.client_id}&select=full_name,phone,national_id,address,mother_name,date_of_birth,place_of_birth,nationality,marital_status,profession,client_portal_active`),
          db(`mo_case_updates?case_id=eq.${c.id}&is_visible_to_client=eq.true&order=created_at.desc`),
          db(`mo_firms?id=eq.${c.firm_id}&select=firm_name,logo_url,primary_color,accent_color`),
          db(`mo_files?case_id=eq.${c.id}`), db(`mo_installments?case_id=eq.${c.id}`), db(`mo_expenses?case_id=eq.${c.id}`)
        ]);
        
        await db(`mo_cases?id=eq.${c.id}`, { method: 'PATCH', body: JSON.stringify({ client_last_seen: getLocalTime().toISOString() }) });
        delete c.secret_notes; delete c.success_probability; delete c.access_pin; delete c.confidentiality_level; delete c.custom_metadata;
        return createRes({ client: cl[0], case: c, updates: upd, firm: firm[0], files: fl, installments: inst, expenses: exp });
      }

      if (path === '/api/public/verify-receipt' && method === 'GET') {
          const id = url.searchParams.get('id');
          if (!id) return createRes({error: 'معرف الإيصال مفقود'}, 400);
          try {
              const inst = await db(`mo_installments?id=eq.${id}&select=*,mo_cases(case_internal_id,mo_clients(full_name)),mo_firms(firm_name)`);
              if (!inst || !inst.length) return createRes({error: 'الإيصال غير موجود أو غير صالح'}, 404);
              return createRes({ success: true, data: inst[0] });
          } catch(e) { return createRes({error: 'صيغة المعرف غير صالحة'}, 400); }
      }

      if (path === '/api/public/verify-cv' && method === 'GET') {
          const id = url.searchParams.get('id');
          if (!id) return createRes({error: 'معرف الموظف مفقود'}, 400);
          try {
              const user = await db(`mo_users?id=eq.${id}&select=full_name,role,phone,syndicate_number,avatar_url,mo_firms(firm_name)`);
              if (!user || !user.length) return createRes({error: 'ملف الموظف غير موجود'}, 404);
              return createRes({ success: true, data: user[0] });
          } catch(e) { return createRes({error: 'صيغة المعرف غير صالحة'}, 400); }
      }

      // =========================================================
      // الإدارة العليا (Super Admin)
      // =========================================================
      if (path.startsWith('/api/super')) {
        const authHeader = request.headers.get('Authorization');
        const session = authHeader ? await verifyToken(authHeader.split(' ')[1]) : null;
        if (!session || session.role !== 'super_admin') return createRes({error: 'Access Denied'}, 403);

        let bodyParsed = null;
        if (method === 'POST' || method === 'PATCH') bodyParsed = await request.clone().json().catch(()=>({}));

        if (path === '/api/super/stats' && method === 'GET') {
            const [firms, users, cases] = await Promise.all([ db('mo_firms?select=id', { method: 'GET' }).catch(()=>[]), db('mo_users?select=id', { method: 'GET' }).catch(()=>[]), db('mo_cases?select=id', { method: 'GET' }).catch(()=>[]) ]);
            return createRes({ firms_count: firms.length || 0, users_count: users.length || 0, cases_count: cases.length || 0 });
        }
        if (path === '/api/super/firms' && method === 'GET') return createRes(await db('mo_firms?select=*,mo_users(count)', { method: 'GET' }).catch(()=>[]));
        if (path === '/api/super/firms' && method === 'PATCH') return createRes(await db(`mo_firms?id=eq.${bodyParsed.id}`, { method: 'PATCH', body: JSON.stringify({ max_users: bodyParsed.max_users, is_active: bodyParsed.is_active }) }));
        if (path === '/api/super/register-firm' && method === 'POST') {
            const { firm_name, subscription_months, max_users, admin_name, admin_phone, telegram_id } = bodyParsed;
            const endDate = getLocalTime(); endDate.setMonth(endDate.getMonth() + (parseInt(subscription_months) || 1));
            const newFirm = await db('mo_firms', { method: 'POST', body: JSON.stringify({ firm_name: firm_name, max_users: parseInt(max_users) || 5, is_active: true, subscription_end_date: endDate.toISOString() }) });
            await db('mo_billing_history', { method: 'POST', body: JSON.stringify({ firm_id: newFirm[0].id, action_type: 'اشتراك جديد', months_added: parseInt(subscription_months) || 1 }) });
            await db('mo_users', { method: 'POST', body: JSON.stringify({ firm_id: newFirm[0].id, full_name: admin_name, phone: admin_phone, telegram_id: telegram_id || null, role: 'admin', is_active: true, can_login: true }) });
            if (telegram_id) await sendTG(telegram_id, `🎊 <b>أهلاً بك في نظام موكّل</b>\n\nتم تسجيل مكتبكم (${safeTG(firm_name)}) بنجاح.\nمدة الاشتراك: <b>${subscription_months} شهر</b>.`);
            return createRes({ success: true, firm: newFirm[0] });
        }
        if (path === '/api/super/renew-firm' && method === 'POST') {
            const { id, add_months } = bodyParsed;
            const firmReq = await db(`mo_firms?id=eq.${id}&select=*`);
            if (!firmReq.length) return createRes({error: "المكتب غير موجود"}, 404);
            let newEndDate = firmReq[0].subscription_end_date ? new Date(firmReq[0].subscription_end_date) : getLocalTime();
            if (newEndDate < getLocalTime()) newEndDate = getLocalTime();
            newEndDate.setMonth(newEndDate.getMonth() + parseInt(add_months));
            await db(`mo_firms?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ subscription_end_date: newEndDate.toISOString() }) });
            await db('mo_billing_history', { method: 'POST', body: JSON.stringify({ firm_id: id, action_type: 'تجديد اشتراك', months_added: parseInt(add_months) }) });
            return createRes({ success: true, new_end_date: newEndDate.toISOString() });
        }
        return createRes({error: 'المسار غير موجود'}, 404);
      }

      // =========================================================
      // >>> جدار الحماية للعمليات الداخلية للمكاتب (التوكن) <<<
      // =========================================================
      const authHeader = request.headers.get('Authorization');
      const session = authHeader ? await verifyToken(authHeader.split(' ')[1]) : null;
      if (!session) return createRes({error: 'الجلسة منتهية أو تم تسجيل الدخول من جهاز آخر'}, 401);
      if (session.role === 'super_admin') return createRes({error: 'السوبر أدمن يملك صلاحية لمسارات الإدارة العليا فقط'}, 403);

      if (path === '/api/files/upload' && method === 'POST') {
          const formData = await request.formData();
          const file = formData.get('file');
          let folderPath = formData.get('folderPath') || 'uncategorized';
          if (!file) return createRes({ error: "لم يتم إرسال أي ملف" }, 400);

          const safeFirmId = session.firm_id;
          const fileExtension = file.name.split('.').pop();
          const uniqueFileName = `${crypto.randomUUID()}.${fileExtension}`;
          const finalR2Path = `firms/${safeFirmId}/${folderPath}/${uniqueFileName}`;

          await env.R2_BUCKET.put(finalR2Path, file.stream(), { httpMetadata: { contentType: file.type } });
          return createRes({ success: true, file_path: finalR2Path, file_name: file.name, file_type: file.type });
      }

      if (path === '/api/notifications/subscribe' && method === 'POST') {
          const body = await request.json();
          if (!body.endpoint) return createRes({error: 'Endpoint is required'}, 400);
          const existing = await db(`mo_user_devices?endpoint=eq.${encodeURIComponent(body.endpoint)}&select=id`).catch(()=>[]);
          if (existing && existing.length > 0) {
              await db(`mo_user_devices?id=eq.${existing[0].id}`, { method: 'PATCH', body: JSON.stringify({ user_id: session.uid, last_active: getLocalTime().toISOString() }) });
          } else {
              await db('mo_user_devices', { method: 'POST', body: JSON.stringify({ user_id: session.uid, endpoint: body.endpoint, p256dh: body.keys?.p256dh || "", auth: body.keys?.auth || "", device_type: "web", last_active: getLocalTime().toISOString() }) });
          }
          return createRes({ success: true });
      }

      if (path === '/api/drive/generate-upload-url' && method === 'GET') {
          return createRes({ success: true, upload_url: `https://www.googleapis.com/upload/drive/v3/files`, gdrive_file_id: crypto.randomUUID() });
      }

      // =========================================================
      // [الذكاء الاصطناعي والبحث الدلالي]
      // =========================================================
      if (path === '/api/ai/ocr' && method === 'POST' && env.AI) {
          try {
              const { image_base_64 } = await request.json();
              if (!image_base_64) return createRes({ error: 'لم يتم استلام أي صورة.' }, 400);
              const binaryString = atob(image_base_64);
              const bytes = new Uint8Array(binaryString.length);
              for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);

              const aiRes = await env.AI.run('@cf/meta/llama-3.2-11b-vision-instruct', {
                  prompt: `أنت خبير قراءة هويات. استخرج "full_name" و "national_id". أعد JSON فقط. لا تكتب أي نص آخر.`,
                  image: [...bytes]
              });
              const match = aiRes.response.match(/\{[\s\S]*\}/);
              return createRes(JSON.parse(match ? match[0] : "{}"));
          } catch (e) { return createRes({ error: 'حدث خطأ في محرك الرؤية.' }, 500); }
      }

      if (path === '/api/ai/process' && method === 'POST' && env.AI) {
        const { type, content } = await request.json();
        
        if (type === 'legal_advisor') {
            const aiRes = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
                messages: [
                    { role: "system", content: "أنت مستشار قانوني أردني. اطبع النص القانوني مباشرة دون مقدمات." },
                    { role: "user", content }
                ]
            });
            return createRes({ reply: aiRes.response });
        }
        
        if (type === 'data_extractor') {
            // [تحديث] أمر استخراج الوسوم الذكية (Tags) موجود هنا
            const aiRes = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
                messages: [
                    {
                        role: "system",
                        content: `أنت خبير قانوني أردني. قم باستخراج البيانات من النص الذي يزودك به المستخدم إلى JSON.
تعليمات صارمة: القيم باللغة العربية الفصحى حصراً. لا تكتب أي نص خارج الـ JSON.
استخدم المفاتيح التالية:
- "lawsuit_facts": سرد الوقائع.
- "legal_basis": السند القانوني.
- "final_requests": مصفوفة الطلبات.
- "opponent_name": اسم الخصم.
- "claim_amount": قيمة المطالبة.
- "next_hearing_date": الجلسة القادمة.
- "case_tags": مصفوفة (Array) تحتوي على 3 إلى 5 كلمات مفتاحية (Tags) تصف نوع وتصنيف القضية.`
                    },
                    { role: "user", content }
                ]
            });
            try {
                const match = aiRes.response.match(/\{[\s\S]*\}/);
                return createRes({ extracted_json: JSON.parse(match ? match[0] : "{}") });
            } catch (e) { return createRes({ extracted_json: aiRes.response }); }
        }
      }

      if (path === '/api/search' && method === 'GET') {
          const q = url.searchParams.get('q');
          if (!q) return createRes({cases: [], clients: [], brain: []});
          const safeQ = decodeURIComponent(q);

          let brainResults = [];
          if (env.AI) {
              try {
                  const embeddingRes = await env.AI.run('@cf/baai/bge-m3', { text: [safeQ] });
                  brainResults = await db('rpc/search_legal_brain', {
                      method: 'POST', body: JSON.stringify({ query_embedding: embeddingRes.data[0], match_threshold: 0.7, match_count: 5 })
                  }).catch(()=>[]);
              } catch(e) {}
          }

          let caseQuery = `mo_cases?firm_id=eq.${session.firm_id}&or=(case_internal_id.ilike.*${safeQ}*,opponent_name.ilike.*${safeQ}*)&limit=5`;
          if (session.role !== 'admin') caseQuery += `&or=(confidentiality_level.eq.عادي,confidentiality_level.is.null,assigned_lawyer_id.cs.{${session.uid}})`;
          const cases = await db(caseQuery).catch(()=>[]);
          
          let clientQuery = `mo_clients?firm_id=eq.${session.firm_id}&or=(full_name.ilike.*${safeQ}*,national_id.ilike.*${safeQ}*,phone.ilike.*${safeQ}*)&limit=5`;
          if (session.role !== 'admin') {
              const myCases = await db(`mo_cases?firm_id=eq.${session.firm_id}&assigned_lawyer_id=cs.{${session.uid}}&select=client_id`).catch(()=>[]);
              const myClientIds = [...new Set(myCases.map(c => c.client_id))];
              clientQuery += myClientIds.length > 0 ? `&or=(confidentiality_level.eq.عادي,confidentiality_level.is.null,id.in.(${myClientIds.join(',')}))` : `&or=(confidentiality_level.eq.عادي,confidentiality_level.is.null)`;
          }
          const clients = await db(clientQuery).catch(()=>[]);
          
          return createRes({cases, clients, brain: brainResults});
      }

      if (path === '/api/check-conflict' && method === 'GET') {
          const name = url.searchParams.get('name');
          if (!name) return createRes({clientConflicts: [], opponentConflicts: []});
          const safeName = decodeURIComponent(name);
          const clientConflicts = await db(`mo_clients?firm_id=eq.${session.firm_id}&or=(full_name.ilike.*${safeName}*,national_id.eq.${safeName})&select=id,full_name,national_id`).catch(()=>[]);
          const opponentConflicts = await db(`mo_cases?firm_id=eq.${session.firm_id}&opponent_name=ilike.*${safeName}*&select=id,opponent_name,case_internal_id`).catch(()=>[]);
          return createRes({clientConflicts, opponentConflicts});
      }

      // =========================================================
      // الإشعارات الذكية (Smart Diff) والمزامنة
      // =========================================================
      const triggerSmartNotifications = async (httpMethod, tableName, reqBody, entityId, oldData) => {
          try {
              let notifyIds = [];
              let entityName = "سجل";
              let itemDesc = reqBody.title || reqBody.case_internal_id || reqBody.full_name || reqBody.update_title || "";
              let link = '/app.html';
              let tgMsg = null;
              let actionDetails = "";

              if (httpMethod === 'PATCH' && oldData) {
                  let changes = [];
                  for (let key in reqBody) {
                      if (reqBody[key] !== oldData[key] && key !== 'updated_at') {
                          let oldV = oldData[key] ? formatVal(oldData[key]) : 'غير محدد';
                          let newV = reqBody[key] ? formatVal(reqBody[key]) : 'غير محدد';
                          if (key === 'status') changes.push(`الحالة من [${oldV}] إلى [${newV}]`);
                          else if (key === 'appt_date') changes.push(`الموعد من [${oldV}] إلى [${newV}]`);
                          else if (key === 'amount') changes.push(`المبلغ من [${oldV}] إلى [${newV}]`);
                          else if (key === 'next_hearing_date') changes.push(`الجلسة القادمة من [${oldV}] إلى [${newV}]`);
                          else if (key === 'current_stage') changes.push(`المرحلة من [${oldV}] إلى [${newV}]`);
                      }
                  }
                  if (changes.length > 0) actionDetails = `\n\n🔄 التعديلات:\n- ` + changes.join('\n- ');
                  else actionDetails = `\n\n🔄 تم تحديث بعض البيانات العامة.`;
              } else if (httpMethod === 'POST') {
                  actionDetails = `\n\n✨ تم تسجيل بيانات جديدة.`;
              }

              if (['mo_appointments', 'mo_tasks', 'mo_hearings'].includes(tableName)) {
                  entityName = "مهمة/موعد";
                  link = '/app.html#appointments';
                  if (reqBody.assigned_to && Array.isArray(reqBody.assigned_to)) notifyIds.push(...reqBody.assigned_to);
                  else if (oldData?.assigned_to && Array.isArray(oldData.assigned_to)) notifyIds.push(...oldData.assigned_to);
                  tgMsg = `📋 <b>إشعار ${entityName}</b>\n\n📌 العنوان: ${safeTG(itemDesc || oldData?.title)}${safeTG(actionDetails)}\n\n👤 بواسطة: ${safeTG(session.name)}`;
              }
              else if (tableName === 'mo_cases') {
                  entityName = "قضية";
                  link = `/case-details.html?id=${entityId}`;
                  if (reqBody.assigned_lawyer_id && Array.isArray(reqBody.assigned_lawyer_id)) notifyIds.push(...reqBody.assigned_lawyer_id);
                  else if (oldData?.assigned_lawyer_id && Array.isArray(oldData.assigned_lawyer_id)) notifyIds.push(...oldData.assigned_lawyer_id);
                  tgMsg = `⚖️ <b>إشعار ${entityName}</b>\n\nملف رقم: (${safeTG(itemDesc || oldData?.case_internal_id || '--')})${safeTG(actionDetails)}\n\n👤 بواسطة: ${safeTG(session.name)}`;
              }
              else if (tableName === 'mo_clients' && httpMethod === 'POST') {
                  entityName = "موكل";
                  link = '/app.html#clients';
              }
              else if (['mo_case_updates', 'mo_files', 'mo_expenses', 'mo_installments'].includes(tableName)) {
                  const mapNames = { 'mo_case_updates': 'إجراء قضائي', 'mo_files': 'مستند أرشيف', 'mo_expenses': 'مصروف مالي', 'mo_installments': 'دفعة مالية' };
                  entityName = mapNames[tableName];
                  const cId = reqBody.case_id || oldData?.case_id;
                  link = `/case-details.html?id=${cId}`;
                  
                  if (cId) {
                      const cData = await db(`mo_cases?id=eq.${cId}&select=assigned_lawyer_id,case_internal_id,mo_clients(full_name)`).catch(()=>[]);
                      if (cData && cData[0]) {
                          if (cData[0].assigned_lawyer_id && Array.isArray(cData[0].assigned_lawyer_id)) notifyIds.push(...cData[0].assigned_lawyer_id);
                          const caseNum = cData[0].case_internal_id;
                          const clientName = cData[0].mo_clients?.full_name || 'غير محدد';
                          
                          let valStr = "";
                          if(tableName === 'mo_installments' && reqBody.amount) valStr = `\n💰 المبلغ: ${reqBody.amount} دينار`;
                          else if(tableName === 'mo_expenses' && reqBody.amount) valStr = `\n💸 المبلغ: ${reqBody.amount} دينار`;
                          else if(tableName === 'mo_files' && reqBody.file_name) valStr = `\n📄 الملف: ${reqBody.file_name}`;
                          else if(tableName === 'mo_case_updates' && reqBody.update_title) valStr = `\n📝 الإجراء: ${reqBody.update_title}`;
                          
                          tgMsg = `🔔 <b>إشعار ${entityName}</b>\n\nملف رقم (${safeTG(caseNum)})\n👤 الموكل: ${safeTG(clientName)}${safeTG(valStr)}${safeTG(actionDetails)}\n\n👤 بواسطة: ${safeTG(session.name)}`;
                      }
                  }
              }

              const admins = await db(`mo_users?firm_id=eq.${session.firm_id}&role=in.(admin,super_admin)&select=id,telegram_id`).catch(()=>[]);
              admins.forEach(a => {
                  notifyIds.push(a.id);
                  if(a.telegram_id && tableName === 'mo_clients' && httpMethod === 'POST') {
                      sendTG(a.telegram_id, `👤 <b>موكل جديد تم تسجيله</b>\n\nالاسم: ${safeTG(reqBody.full_name)}\nرقم الهاتف: ${safeTG(reqBody.phone) || '--'}\n\n👤 بواسطة: ${safeTG(session.name)}`);
                  }
              });

              notifyIds = [...new Set(notifyIds)].filter(id => id !== session.uid);

              if (notifyIds.length > 0) {
                  const actionTitle = httpMethod === 'POST' ? `إضافة ${entityName} جديد` : `تحديث ${entityName}`;
                  let actionBody = httpMethod === 'POST' ? `قام ${session.name} بإضافة ${entityName} (${itemDesc})` : `قام ${session.name} بتعديل ${entityName} (${itemDesc}).`;
                  const targetUsers = await db(`mo_users?id=in.(${notifyIds.join(',')})&select=id,telegram_id`).catch(()=>[]);

                  for (const tUser of targetUsers) {
                      await sendNotification({ user_id: tUser.id, firm_id: session.firm_id, title: actionTitle, message: actionBody, action_url: link, is_read: false, created_by: session.uid, created_at: getLocalTime().toISOString() });
                      if (tgMsg && tUser.telegram_id && tableName !== 'mo_clients') await sendTG(tUser.telegram_id, tgMsg);
                  }
              }
          } catch (err) {}
      };

      // =========================================================
      // العمليات الديناميكية (CRUD Engine) مع التحققات الأمنية
      // =========================================================
      const routeMap = {
        '/api/clients': 'mo_clients', '/api/cases': 'mo_cases', '/api/users': 'mo_users',
        '/api/installments': 'mo_installments', '/api/updates': 'mo_case_updates',
        '/api/appointments': 'mo_appointments', '/api/files': 'mo_files',
        '/api/notifications': 'mo_notifications', '/api/expenses': 'mo_expenses',
        '/api/firms': 'mo_firms', '/api/history': 'mo_activity_logs',
        '/api/subscriptions': 'mo_subscriptions', '/api/legal_brain': 'legal_brain'
      };
      
      let table = null;
      for (const r in routeMap) { if (path.startsWith(r)) { table = routeMap[r]; break; } }

      if (table) {
        if (method === 'GET') {
          let query = `${table}?firm_id=eq.${session.firm_id}`;
          if (table === 'mo_notifications') query = `${table}?user_id=eq.${session.uid}`;
          
          if (table === 'mo_cases' && session.role !== 'admin') query += `&or=(confidentiality_level.eq.عادي,confidentiality_level.is.null,assigned_lawyer_id.cs.{${session.uid}})`;

          if (table === 'mo_clients' && session.role !== 'admin') {
              const myCases = await db(`mo_cases?firm_id=eq.${session.firm_id}&assigned_lawyer_id=cs.{${session.uid}}&select=client_id`).catch(()=>[]);
              const myClientIds = [...new Set(myCases.map(c => c.client_id))];
              query += myClientIds.length > 0 ? `&or=(confidentiality_level.eq.عادي,confidentiality_level.is.null,id.in.(${myClientIds.join(',')}))` : `&or=(confidentiality_level.eq.عادي,confidentiality_level.is.null)`;
          }

          url.searchParams.forEach((v, k) => {
              if (k !== 'firm_id' && k !== 'user_id' && k !== 'select' && k !== 'order' && k !== 'limit') query += `&${k}=${/^[a-z]{2,5}\./.test(v) ? v : 'eq.' + v}`;
              else if (k === 'select' || k === 'order' || k === 'limit') query += `&${k}=${v}`;
          });
          
          if(!url.searchParams.has('order')) query += `&order=created_at.desc`;
          return createRes(await db(query));
        }
        
        if (method === 'POST') {
          const body = await request.json();
          body.firm_id = session.firm_id;
          
          if (table === 'mo_cases') {
              const subList = await db(`mo_subscriptions?firm_id=eq.${session.firm_id}&select=max_cases`).catch(()=>[]);
              const currentCases = await db(`mo_cases?firm_id=eq.${session.firm_id}&select=id`);
              if (currentCases.length >= (subList.length ? subList[0].max_cases : 50)) return createRes({error: 'تجاوزت الحد الأقصى للقضايا'}, 402);
              if (!body.public_token) body.public_token = crypto.randomUUID();
          }

          if (table === 'mo_users' && body.can_login === true) {
              const firmData = await db(`mo_firms?id=eq.${session.firm_id}&select=max_users`).catch(()=>[]);
              const currentUsers = await db(`mo_users?firm_id=eq.${session.firm_id}&can_login=eq.true&select=id`);
              const maxAllowed = firmData.length ? firmData[0].max_users : 5;
              if (currentUsers.length >= maxAllowed) return createRes({error: 'تجاوزت الحد الأقصى للحسابات المصرح لها بالدخول'}, 402);
          }

          const result = await db(table, { method: 'POST', body: JSON.stringify(body) });
          await db('mo_activity_logs', { method: 'POST', body: JSON.stringify({ firm_id: session.firm_id, user_id: session.uid, action_type: 'CREATE', entity_type: table, entity_id: result[0]?.id || crypto.randomUUID(), new_data: body, created_at: getLocalTime().toISOString() }) }).catch(e => console.error("Audit Error:", e));
          
          if (table === 'mo_installments' && body.case_id) await updateCaseFinancials(body.case_id, session.firm_id);
          await triggerSmartNotifications('POST', table, body, result[0]?.id, null);
          return createRes(result);
        }

        if (method === 'PATCH') {
          const body = await request.json();
          let entityId = url.searchParams.get('id');
          if (!entityId || !entityId.startsWith('eq.')) return createRes({error: 'يجب تحديد المُعرف (ID)'}, 400);
          const cleanId = entityId.replace('eq.', '');

          if (cleanId.includes('temp_')) return createRes({error: 'هذا سجل مؤقت، جاري المزامنة، يرجى الانتظار.'}, 400);

          const oldDataArr = await db(`${table}?id=eq.${cleanId}&firm_id=eq.${session.firm_id}&select=*`);
          if (!oldDataArr.length) return createRes({error: 'السجل غير موجود أو لا تملك صلاحية'}, 404);
          const oldData = oldDataArr[0];
          
          if (table === 'mo_cases' && session.role !== 'admin') {
              if (!(oldData.assigned_lawyer_id || []).includes(session.uid)) return createRes({error: 'لا تملك صلاحية تعديل هذه القضية.'}, 403);
          }

          if (table === 'mo_users' && body.can_login === true && oldData.can_login !== true) {
              const firmData = await db(`mo_firms?id=eq.${session.firm_id}&select=max_users`).catch(()=>[]);
              const currentUsers = await db(`mo_users?firm_id=eq.${session.firm_id}&can_login=eq.true&select=id`);
              const maxAllowed = firmData.length ? firmData[0].max_users : 5;
              if (currentUsers.length >= maxAllowed) return createRes({error: 'تجاوزت الحد الأقصى للحسابات'}, 402);
          }

          const result = await db(`${table}?id=eq.${cleanId}&firm_id=eq.${session.firm_id}`, { method: 'PATCH', body: JSON.stringify(body) });
          await db('mo_activity_logs', { method: 'POST', body: JSON.stringify({ firm_id: session.firm_id, user_id: session.uid, action_type: 'UPDATE', entity_type: table, entity_id: cleanId, old_data: oldData, new_data: body, created_at: getLocalTime().toISOString() }) }).catch(e=>console.log(e));
          if (table === 'mo_installments') await updateCaseFinancials(body.case_id || oldData.case_id, session.firm_id);
          
          await triggerSmartNotifications('PATCH', table, body, cleanId, oldData);
          return createRes(result);
        }

        if (method === 'DELETE') {
          let entityId = url.searchParams.get('id');
          if (!entityId || !entityId.startsWith('eq.')) return createRes({error: 'يجب تحديد المُعرف'}, 400);
          const cleanId = entityId.replace('eq.', '');

          if (table === 'mo_users') return createRes({error: 'لا يمكن حذف الموظف نهائياً. يرجى إيقاف حسابه.'}, 403);
          if (table === 'mo_clients') {
              const checkCases = await db(`mo_cases?client_id=eq.${cleanId}&select=id`).catch(()=>[]);
              if (checkCases.length > 0) return createRes({error: 'لا يمكن الحذف لوجود قضايا مرتبطة.'}, 403);
          }

          const oldDataArr = await db(`${table}?id=eq.${cleanId}&firm_id=eq.${session.firm_id}&select=*`);
          if (!oldDataArr.length) return createRes({error: 'السجل غير موجود'}, 404);
          
          if (session.role !== 'admin' && !session.permissions?.can_delete) {
              if (['mo_case_updates', 'mo_files', 'mo_expenses'].includes(table)) {
                  const parentCase = await db(`mo_cases?id=eq.${oldDataArr[0].case_id}&select=assigned_lawyer_id`);
                  if (!parentCase[0]?.assigned_lawyer_id?.includes(session.uid)) return createRes({error: 'صلاحية الحذف للمحامي المسند فقط'}, 403);
              } else return createRes({error: 'صلاحية الحذف للمدير العام فقط'}, 403);
          }
          
          await db(`${table}?id=eq.${cleanId}&firm_id=eq.${session.firm_id}`, { method: 'DELETE' });
          await db('mo_activity_logs', { method: 'POST', body: JSON.stringify({ firm_id: session.firm_id, user_id: session.uid, action_type: 'DELETE', entity_type: table, entity_id: cleanId, old_data: oldDataArr[0], created_at: getLocalTime().toISOString() }) }).catch(e=>console.log(e));
          
          if (table === 'mo_installments' && oldDataArr[0].case_id) await updateCaseFinancials(oldDataArr[0].case_id, session.firm_id);
          return createRes({success: true, message: "تم الحذف بنجاح"});
        }
      }
      return createRes({error: 'المسار البرمجي غير موجود'}, 404);
    } catch (e) { return createRes({error: "حدث خطأ داخلي: " + e.message}, 500); }
  }
};