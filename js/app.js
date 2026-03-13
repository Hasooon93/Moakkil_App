async function saveStaff(event) {
    event.preventDefault();
    const data = {
        full_name: document.getElementById('staff_full_name').value, 
        username: document.getElementById('staff_username').value,
        password: document.getElementById('staff_password').value, 
        role: document.getElementById('staff_role').value
    };
    
    const res = await fetchAPI('/api/users', 'POST', data);
    if(res && !res.error) { 
        closeModal('staffModal'); 
        document.getElementById('staffForm').reset(); 
        await loadAllData(); 
        // عرض التحذير إذا تم تجاوزه، وإلا يعرض رسالة النجاح الطبيعية
        if(res._warning) showAlert(res._warning, 'warning');
        else showAlert('تم إضافة الموظف الفعال بنجاح', 'success'); 
    } else if (res && res.error) {
        showAlert(res.error, 'danger');
    }
}

async function toggleStaffStatus(id, currentStatus) {
    if(!confirm('تأكيد الإجراء؟ تذكر أنه لا يمكنك التراجع إلا بعد 24 ساعة!')) return;
    const newStatus = !currentStatus;
    
    const res = await fetchAPI(`/api/users?id=eq.${id}`, 'PATCH', { is_active: newStatus, can_login: newStatus });
    
    if(res && !res.error) { 
        showAlert('تم تحديث حالة الموظف بنجاح', 'success'); 
        await loadAllData(); 
    } else if (res && res.error) {
        // سيظهر هنا الخطأ الخاص بمدة 24 ساعة، أو تجاوز الحد الأقصى
        showAlert(res.error, 'danger');
    }
}