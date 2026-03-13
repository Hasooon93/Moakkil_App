let caseId = localStorage.getItem('current_case_id');
let caseObj = null;

window.onload = async () => {
    const [cases, updates, inst] = await Promise.all([API.getCases(), API.getUpdates(caseId), API.getInstallments(caseId)]);
    caseObj = cases.find(c => c.id == caseId);
    document.getElementById('case-title').innerText = caseObj.case_internal_id;
    
    document.getElementById('timeline-container').innerHTML = updates.map(u => `
        <div class="p-2 mb-2 bg-white border-bottom small">${u.content} <br> <small class="text-muted">${new Date(u.created_at).toLocaleDateString()}</small></div>
    `).join('');

    document.getElementById('payments-container').innerHTML = inst.map(i => `
        <div class="d-flex justify-content-between p-2 border-bottom"><b>${i.amount} د.أ</b> <small>${new Date(i.created_at).toLocaleDateString()}</small></div>
    `).join('');
};

async function saveUpdate(e) {
    e.preventDefault();
    await API.addUpdate({ case_id: caseId, content: document.getElementById('upd_content').value });
    location.reload();
}

async function savePayment(e) {
    e.preventDefault();
    await API.addInstallment({ case_id: caseId, amount: document.getElementById('pay_amount').value });
    location.reload();
}