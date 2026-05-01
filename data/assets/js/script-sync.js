/**
 * PHIÊN BẢN ĐỒNG BỘ CUỐI CÙNG (KHÔNG CẦN EXTENSION - DÙNG SERVER-SIDE FETCH)
 */

const SYNC_CONFIG = {
    GAS_WEB_APP: 'https://script.google.com/macros/s/AKfycbwr5kDqqYn7eF9pxIr1WbgmBO-mPxLFH2Gc_jutHSGBVtSb088vGSnQKvLLJRxxIvo/exec',
    SESSION_TOKEN: 'eyJ0eXBlIjoiYWNjZXNzX3Rva2VuIiwiaXNzIjoiQnV5bWVkLUFQIiwidG9rZW4iOiJOeUZMR3diTHFVWG5kRGN$NDUx" + "xqMjlKNjVEdHB0TWJCZUV2bmRSbEE0eWhnZHgiLCJjbGllbnQiOiI5ZjM1MkFGclVESVJTOFc0amxZQldLRHJKNjFwNHdFOHF0TDRtcDdEQUg0dkVqamkifQo='
};

// Cập nhật Token mới nhất từ bạn (nếu có chuỗi dài bạn copy vào đây)
SYNC_CONFIG.SESSION_TOKEN = 'eyJ0eXBlIjoiYWNjZXNzX3Rva2VuIiwiaXNzIjoiQnV5bWVkLUFQIiwidG9rZW4iOiJOeUZMR3diTHFVWG5kRGNjOTQ1MXhxMjlKNjVEdHB0TWJCZUV2bmRSbEE0eWhnZHgiLCJjbGllbnQiOiI5ZjM1MkFGclVESVJTOFc0amxZQldLRHJKNjFwNHdFOHF0TDRtcDdEQUg0dkVqamkifQo=';

document.addEventListener('DOMContentLoaded', () => {
    const syncBtn = document.getElementById('syncDataBtn');
    if (syncBtn) syncBtn.addEventListener('click', handleSync);
});

async function handleSync() {
    if (!confirm('Bắt đầu đồng bộ dữ liệu qua máy chủ Google? (Không cần bật Extension)')) return;
    
    setSyncState(true);
    showStatus('Đang gửi yêu cầu đồng bộ tới máy chủ Google...', 'loading');

    try {
        // Sử dụng Fetch với text/plain để tránh lỗi CORS (Simple Request)
        const response = await fetch(SYNC_CONFIG.GAS_WEB_APP, {
            method: 'POST',
            mode: 'no-cors', // Dùng no-cors để gửi Token đi mà không bị chặn
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({ token: SYNC_CONFIG.SESSION_TOKEN })
        });

        // Với no-cors, chúng ta không đọc được phản hồi nhưng request vẫn được gửi thành công.
        // Chúng ta sẽ đợi khoảng 15s để GAS xử lý rồi báo thành công.
        showStatus('Đang chờ hệ thống ghi dữ liệu vào Sheet (khoảng 15s)...', 'loading');
        
        setTimeout(() => {
            showStatus('✅ Yêu cầu đồng bộ đã được gửi!', 'success');
            alert('Yêu cầu đồng bộ đã được gửi! Bạn hãy kiểm tra Google Sheet sau ít giây.');
            setSyncState(false);
            if (typeof fetchInventoryData === 'function') fetchInventoryData();
        }, 15000);

    } catch (error) {
        console.error('SYNC ERROR:', error);
        showStatus('❌ Lỗi: ' + error.message, 'error');
        alert('Lỗi đồng bộ: ' + error.message);
        setSyncState(false);
    }
}

function setSyncState(isSyncing) {
    const btn = document.getElementById('syncDataBtn');
    if (!btn) return;
    btn.disabled = isSyncing;
    btn.querySelector('span').textContent = isSyncing ? 'Đang chạy...' : 'Cập nhật';
}

function showStatus(msg, type) {
    const banner = document.getElementById('statusBanner');
    const inner = document.getElementById('bannerInner');
    if (banner && inner) {
        banner.style.display = 'block';
        inner.className = `banner ${type}`;
        inner.innerHTML = `<span>${msg}</span>`;
    }
}
