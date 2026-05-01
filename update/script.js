// ============================================================
// CẤU HÌNH: thay SHEET_ID nếu muốn trỏ sang sheet khác
// ============================================================
const SHEET_ID = '10Oguigdpx5RWP4rV0Mw3eVdBrf-uS8ilQHKfA26GMw8';
const GID = '0';

// Google Visualization API – base URL không chứa tqx để tránh trùng tham số
const SHEET_GViz_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?gid=${GID}`;

let inventoryData = [];
let currentJsonpScript = null; // dọn dẹp thẻ script cũ

// ============================================================
// DOM Elements
// ============================================================
const chatBody = document.getElementById('chatBody');
const chatForm = document.getElementById('chatForm');
const userInput = document.getElementById('userInput');
const sendBtn = document.getElementById('sendBtn');
const refreshDataBtn = document.getElementById('refreshDataBtn');

// ============================================================
// Escape HTML an toàn (tránh lỗi khi str là null/undefined)
// ============================================================
function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/[&<>'"]/g,
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;',
            '\\': '&#92;'
        }[tag])
    );
}

// ============================================================
// Khởi động
// ============================================================
function init() {
    fetchInventoryData();
}

// ============================================================
// Fetch dữ liệu bằng JSONP – Google Visualization API
// ============================================================
function fetchInventoryData() {
    setLoadingState(true);

    // Xoá script JSONP cũ nếu còn tồn tại
    if (currentJsonpScript) {
        document.body.removeChild(currentJsonpScript);
        currentJsonpScript = null;
    }

    // Đặt tên callback duy nhất để tránh xung đột
    const callbackName = 'gvizCallback_' + Date.now();

    // Tạo thẻ script JSONP
    const script = document.createElement('script');
    script.src = `${SHEET_GViz_URL}&tqx=out:json;responseHandler:${callbackName}&_t=${Date.now()}`;
    currentJsonpScript = script;

    // Timeout 20 giây
    const timeoutId = setTimeout(() => {
        cleanup();
        if (inventoryData.length === 0) {
            clearInitialMessage();
            updateSystemMessage('⚠️ Quá thời gian tải dữ liệu. Vui lòng nhấn nút làm mới hoặc tải lại trang.');
            setLoadingState(false);
        }
    }, 20000);

    // Hàm dọn dẹp
    function cleanup() {
        clearTimeout(timeoutId);
        delete window[callbackName];
        if (currentJsonpScript && currentJsonpScript.parentNode) {
            document.body.removeChild(currentJsonpScript);
            currentJsonpScript = null;
        }
    }

    // Callback nhận dữ liệu từ Google
    window[callbackName] = function (json) {
        cleanup();
        processGvizData(json);
    };

    script.onerror = function () {
        cleanup();
        clearInitialMessage();
        updateSystemMessage('❌ Lỗi mạng. Không thể tải dữ liệu. Kiểm tra lại kết nối internet hoặc quyền truy cập Google Sheet.');
        setLoadingState(false);
    };

    document.body.appendChild(script);
}

// ============================================================
// Xử lý dữ liệu Google Visualization JSON
// ============================================================
function processGvizData(json) {
    try {
        if (!json || !json.table) {
            throw new Error('Dữ liệu phản hồi không hợp lệ hoặc Google Sheet chưa được public.');
        }

        // Lấy danh sách cột từ cols
        const colLabels = json.table.cols.map(c => (c && c.label) ? c.label.trim() : '');

        // Xây dựng ma trận dữ liệu: [header, row1, row2, ...]
        const matrix = [colLabels];
        (json.table.rows || []).forEach(r => {
            const rowData = (r.c || []).map(cell => {
                if (!cell) return '';
                // Ưu tiên giá trị đã format (f), sau đó mới lấy giá trị thô (v)
                if (cell.f !== null && cell.f !== undefined) return String(cell.f).trim();
                if (cell.v !== null && cell.v !== undefined) return String(cell.v).trim();
                return '';
            });
            matrix.push(rowData);
        });

        // Tìm dòng header chứa "MÃ SKU" & "TÊN SẢN PHẨM"
        let headerIndex = -1;
        let headers = [];
        for (let i = 0; i < matrix.length; i++) {
            const row = matrix[i];
            const upperRow = row.map(cell => cell.toUpperCase());
            if (upperRow.some(c => c.includes('MÃ SKU') || c.includes('MA SKU')) &&
                upperRow.some(c => c.includes('TÊN SẢN PHẨM') || c.includes('TEN SAN PHAM'))) {
                headerIndex = i;
                headers = row;
                break;
            }
        }

        if (headerIndex === -1) {
            // Nếu không tìm được header chuẩn, thử dùng dòng đầu tiên có dữ liệu
            for (let i = 0; i < matrix.length; i++) {
                if (matrix[i].some(cell => cell.trim() !== '')) {
                    headerIndex = i;
                    headers = matrix[i];
                    console.warn('Không tìm thấy header chuẩn, dùng dòng đầu tiên có dữ liệu:', headers);
                    break;
                }
            }
        }

        if (headerIndex === -1) {
            throw new Error('Sheet không có dữ liệu hoặc cấu trúc không đúng. Hãy kiểm tra lại Google Sheet.');
        }

        // Parse từng dòng dữ liệu
        const parsedData = [];
        for (let i = headerIndex + 1; i < matrix.length; i++) {
            const row = matrix[i];
            const item = {};
            let hasData = false;
            for (let j = 0; j < headers.length; j++) {
                const key = headers[j];
                if (key) {
                    item[key] = row[j] || '';
                    if (row[j] && String(row[j]).trim() !== '') hasData = true;
                }
            }
            if (hasData) parsedData.push(item);
        }

        inventoryData = parsedData;
        console.log('✅ Loaded records:', inventoryData.length);

        clearInitialMessage();

        if (inventoryData.length === 0) {
            updateSystemMessage('⚠️ Sheet được tải thành công nhưng không có dòng dữ liệu nào. Hãy kiểm tra lại nội dung.');
        } else {
            updateSystemMessage(
                `<div style="display:flex; align-items:center; gap:10px;">
                    <div style="width:40px; height:40px; background:rgba(16,185,129,0.1); color:#10B981; border-radius:10px; display:flex; align-items:center; justify-content:center; font-size:20px;">
                        <i class='bx bx-check-double'></i>
                    </div>
                    <div>
                        <div style="font-weight:700; font-size:0.9rem;">Hệ thống đã sẵn sàng</div>
                        <div style="font-size:0.8rem; color:var(--text-dim);">Đã tải <b>${inventoryData.length.toLocaleString('vi-VN')}</b> sản phẩm từ kho.</div>
                    </div>
                </div>`
            );
        }

    } catch (err) {
        console.error('Lỗi xử lý dữ liệu JSONP:', err);
        clearInitialMessage();
        updateSystemMessage(`❌ Lỗi: ${escapeHTML(err.message)}`);
    } finally {
        setLoadingState(false);
    }
}

// ============================================================
// Xoá tin nhắn "đang tải" ban đầu (không xoá toàn bộ chat)
// ============================================================
function clearInitialMessage() {
    // Chỉ xoá tin nhắn đầu tiên nếu nó là tin thông báo đang tải
    const firstMsg = chatBody.querySelector('.message');
    if (firstMsg && firstMsg.querySelector('#typingIndicator, .typing-indicator')) {
        firstMsg.remove();
    }
}

// ============================================================
// Trạng thái loading
// ============================================================
function setLoadingState(isLoading) {
    userInput.disabled = isLoading;
    sendBtn.disabled = isLoading;
    if (!isLoading) {
        userInput.focus();
    }
}

// ============================================================
// Hiển thị tin nhắn
// ============================================================
function addUserMessage(text) {
    const msgDiv = document.createElement('div');
    msgDiv.className = 'message user-message';
    msgDiv.innerHTML = `<div class="message-content">${escapeHTML(text)}</div>`;
    chatBody.appendChild(msgDiv);
    scrollToBottom();
}

function addBotMessage(htmlContent) {
    const msgDiv = document.createElement('div');
    msgDiv.className = 'message bot-message';
    msgDiv.innerHTML = `<div class="message-content">${htmlContent}</div>`;
    chatBody.appendChild(msgDiv);
    scrollToBottom();
}

window.copyLoc = function(btn, text) {
    navigator.clipboard.writeText(text).then(() => {
        const old = btn.innerHTML;
        btn.innerHTML = '<i class=\'bx bx-check\' style=\'color:#34D399\'></i>';
        setTimeout(() => btn.innerHTML = old, 1500);
    });
};
// Tìm kiếm sản phẩm (tìm theo SKU & tên, bỏ dấu)
// ============================================================
function normalize(str) {
    if (!str) return '';
    return str.toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd');
}

function searchProduct(query) {
    const q = normalize(query.trim());
    if (!q) return [];
    return inventoryData.filter(item => {
        const skuKey = Object.keys(item).find(k => k.toUpperCase().includes('SKU'));
        const nameKey = Object.keys(item).find(k => k.toUpperCase().includes('SẢN PHẨM') || k.toUpperCase().includes('SAN PHAM'));
        const sku = normalize(skuKey ? item[skuKey] : '');
        const name = normalize(nameKey ? item[nameKey] : '');
        return sku.includes(q) || name.includes(q);
    });
}

// ============================================================
// Xử lý form gửi tin nhắn
// ============================================================
chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const query = userInput.value.trim();
    if (!query) return;

    if (inventoryData.length === 0) {
        addBotMessage('⚠️ Dữ liệu chưa được tải. Vui lòng chờ hoặc nhấn nút làm mới.');
        return;
    }

    addUserMessage(query);
    userInput.value = '';

    showTyping();
    setTimeout(() => {
        hideTyping();
        const results = searchProduct(query);

        if (results.length === 0) {
            addBotMessage(`Rất tiếc, không tìm thấy dữ liệu nào phù hợp với từ khóa:<br><b>"${escapeHTML(query)}"</b>`);
        } else if (results.length > 5) {
            addBotMessage(`Tìm thấy <b>${results.length}</b> sản phẩm. Dưới đây là 5 kết quả sát nhất:`);
            renderResults(results.slice(0, 5));
        } else {
            addBotMessage(`Tìm thấy <b>${results.length}</b> kết quả:`);
            renderResults(results);
        }
    }, 600);
});

// ============================================================
// Hiển thị / ẩn typing indicator
// ============================================================
function showTyping() {
    const msgDiv = document.createElement('div');
    msgDiv.className = 'message bot-message typing-msg';
    msgDiv.innerHTML = `
        <div class="message-content">
            <div class="typing-indicator" style="display:flex; padding:0;">
                <span></span><span></span><span></span>
            </div>
        </div>
    `;
    chatBody.appendChild(msgDiv);
    scrollToBottom();
}

function hideTyping() {
    const typingMsg = document.querySelector('.typing-msg');
    if (typingMsg) typingMsg.remove();
}

// ============================================================
// Render kết quả sản phẩm
// ============================================================
let currentResults = [];

function renderResults(results) {
    currentResults = results;
    let html = '';
    results.forEach((item, idx) => {
        const getVal = (keywords) => {
            const key = Object.keys(item).find(k => keywords.some(kw => k.toUpperCase().includes(kw)));
            return key ? item[key] : '';
        };

        const imgRaw = getVal(['HÌNH ẢNH', 'HINH ANH', 'IMAGE', 'IMG']);
        const tenSp = getVal(['TÊN SẢN PHẨM', 'TEN SAN PHAM', 'SẢN PHẨM', 'SAN PHAM', 'PRODUCT']);
        const sku = getVal(['MÃ SKU', 'MA SKU', 'SKU']);
        const tonKho = getVal(['TỒN VẬT LÝ', 'TON VAT LY', 'TỒN KHO', 'TON KHO', 'STOCK']);
        const quyCach = getVal(['QUY CÁCH', 'QUY CACH', 'CÁCH', 'UNIT']);
        const ke = getVal(['KỆ', 'KE', 'VỊ TRÍ', 'VI TRI', 'SHELF', 'LOCATION']);

        const hinhAnh = imgRaw && imgRaw !== '#N/A' && imgRaw.trim() !== ''
            ? imgRaw
            : 'https://placehold.co/80x80/e0e7ff/4F46E5?text=No+Img';
        const keDisplay = ke && ke !== '#N/A' && ke.trim() !== '' ? ke : 'Chưa xếp kệ';
        const stockNum = parseInt(tonKho) || 0;
        const stockColor = stockNum <= 0 ? '#F87171' : (stockNum <= 10 ? '#FCD34D' : '#34D399');

        html += `
        <div class="product-card clickable" onclick="openModalFromList(${idx})">
            <div class="product-card-header">
                <img src="${escapeHTML(hinhAnh)}" alt="${escapeHTML(tenSp)}" class="product-img"
                     onerror="this.src='https://placehold.co/80x80/030712/6366F1?text=Error'">
                <div style="flex:1;">
                    <h3 class="product-title">${escapeHTML(tenSp)}</h3>
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span class="product-sku">${escapeHTML(sku)}</span>
                        <span style="font-size:10px; color:var(--primary); font-weight:700; text-transform:uppercase; letter-spacing:0.5px;">
                            <i class='bx bx-zoom-in'></i> Chi tiết
                        </span>
                    </div>
                </div>
            </div>
            <div class="product-info-grid">
                <div class="info-item highlight">
                    <span class="info-label">Tồn Kho</span>
                    <span class="info-value" style="color:${stockColor}">
                        <i class='bx bx-package'></i> ${escapeHTML(tonKho) || '0'}
                    </span>
                </div>
                <div class="info-item">
                    <span class="info-label">Vị Trí Kệ</span>
                    <span class="info-value" style="color:#818CF8;">
                        <i class='bx bx-map-pin'></i> ${escapeHTML(keDisplay)}
                    </span>
                </div>
                <div class="info-item" style="grid-column: span 2;">
                    <span class="info-label">Quy Cách Sản Phẩm</span>
                    <div style="font-size:0.85rem; color:var(--text-muted); font-weight:500;">
                        ${escapeHTML(quyCach) || '—'}
                    </div>
                </div>
            </div>
        </div>`;
    });
    addBotMessage(html);
}

window.openModalFromList = function(idx) {
    const item = currentResults[idx];
    if (!item) return;
    const getVal = (keywords) => {
        const key = Object.keys(item).find(k => keywords.some(kw => k.toUpperCase().includes(kw)));
        return key ? item[key] : '';
    };
    const sku = (getVal(['MÃ SKU', 'MA SKU', 'SKU']) || '').trim();
    const name = getVal(['TÊN SẢN PHẨM', 'TEN SAN PHAM', 'SẢN PHẨM', 'SAN PHAM', 'PRODUCT']);
    openModal(sku, name, item);
};

// ============================================================
// MODAL LOGIC (WMS Detail)
// ============================================================
const modalOverlay = document.getElementById('modalOverlay');
const modalCloseBtn = document.getElementById('modalCloseBtn');
const modalHeader = document.getElementById('modalHeader');
const modalBody = document.getElementById('modalBody');

async function openModal(sku, itemName, itemData) {
    if (!sku && !itemName) return;

    modalOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';
    
    renderModalContent(itemName, sku, itemData, null, null);

    if (sku) {
        try {
            const [detailRes, historyRes] = await Promise.all([
                fetch(`http://localhost:3000/wms/sku-detail?sku=${encodeURIComponent(sku)}&group=BUYMED&warehouse=HN`).catch(() => null),
                fetch(`http://localhost:3000/wms/mapping-history?sku=${encodeURIComponent(sku)}`).catch(() => null)
            ]);

            let wmsData = null;
            let histories = [];

            if (detailRes && detailRes.ok) {
                const detailJson = await detailRes.json();
                if (detailJson.ok) wmsData = detailJson;
            }

            if (historyRes && historyRes.ok) {
                const historyJson = await historyRes.json();
                histories = historyJson.data || [];
            }

            renderModalContent(itemName, sku, itemData, histories, wmsData);
        } catch (e) {
            console.error("Fetch SKU info error", e);
            renderModalContent(itemName, sku, itemData, [], null);
        }
    } else {
        renderModalContent(itemName, sku, itemData, [], null);
    }
}

function renderModalContent(name, sku, item, histories, wmsData) {
    const formatN = (num) => {
        if (num === undefined || num === null || num === '') return '0';
        return parseFloat(num.toString().replace(/,/g,'')).toLocaleString('vi-VN');
    };

    const getFieldVal = (keywords) => {
        const key = Object.keys(item).find(k => keywords.some(kw => k.toUpperCase().includes(kw)));
        return key ? item[key] : '';
    };

    const tonKho = getFieldVal(['TỒN VẬT LÝ', 'TON VAT LY', 'TỒN KHO', 'TON KHO', 'STOCK']);
    const imgRaw = getFieldVal(['HÌNH ẢNH', 'HINH ANH', 'IMAGE', 'IMG']);
    const img = imgRaw && imgRaw !== '#N/A' && imgRaw.trim() !== '' ? imgRaw : 'https://placehold.co/80x80/030712/6366F1?text=?';

    modalHeader.innerHTML = `
        <img class="modal-product-img" src="${escapeHTML(img)}" onerror="this.src='https://placehold.co/80x80/030712/6366F1?text=?'">
        <div class="modal-title-wrap">
            <div class="modal-product-name">${escapeHTML(name)}</div>
            <div class="modal-sku-row">
                <span class="modal-sku">${escapeHTML(sku) || '—'}</span>
            </div>
        </div>`;

    let otherHtml = '';
    const ignore = ['TÊN SẢN PHẨM', 'TEN SAN PHAM', 'MÃ SKU', 'MA SKU', 'HÌNH ẢNH', 'HINH ANH', 'IMAGE', 'IMG'];
    Object.entries(item).forEach(([k, v]) => {
        if (ignore.some(kw => k.toUpperCase().includes(kw))) return;
        otherHtml += `<div class="modal-field">
            <div class="modal-field-label">${k}</div>
            <div class="modal-field-value">${escapeHTML(v) || '—'}</div>
        </div>`;
    });

    let wmsStatsHTML = '';
    let wmsLocsHTML = '';
    let wmsLotsHTML = '';
    let historyHTML = '';

    if (wmsData === null && histories === null) {
        wmsStatsHTML = `<div class="modal-loading-box"><div class="spinner"></div><span>Đang lấy dữ liệu WMS...</span></div>`;
    } else if (wmsData) {
        const sd = wmsData.skuData || {};
        const locs = wmsData.skuLocations || [];
        const lots = wmsData.skuLotDate || [];
        
        const typeMap = {'DRUG': 'Thuốc', 'SUPPLEMENT': 'TPCN', 'COSMETIC': 'Mỹ phẩm', 'MEDICAL_DEVICE': 'Vật tư', 'EQUIPMENT': 'Thiết bị'};
        const typeText = typeMap[sd.productType] || sd.productType || '—';
        const typeColor = (sd.productType === 'DRUG') ? '#f37021' : '#6366f1';

        wmsStatsHTML = `
        <div class="stat-chip-container">
            <div class="stat-chip"><div class="stat-chip-val" style="color:#34D399">${formatN(sd.availableQuantity)}</div><div class="stat-chip-lbl">Có sẵn</div></div>
            <div class="stat-chip"><div class="stat-chip-val" style="color:#FCD34D">${formatN(sd.onHoldQuantity)}</div><div class="stat-chip-lbl">Đang giữ</div></div>
            <div class="stat-chip" style="border: 1px solid ${typeColor}66; background: ${typeColor}11;">
                <div class="stat-chip-val" style="color:${typeColor}; font-size:14px;">${typeText}</div>
                <div class="stat-chip-lbl">Loại SP</div>
            </div>
        </div>`;

        const activeLocs = locs.filter(l => (l.stockQuantity||0) > 0).sort((a,b) => b.stockQuantity - a.stockQuantity);
        if (activeLocs.length > 0) {
            wmsLocsHTML = `
            <div class="modal-section-title">📦 Vị trí kệ (WMS)</div>
            <table class="loc-table">
                <thead><tr><th>Kệ</th><th>Tồn</th><th>Sẵn</th><th>Giữ</th></tr></thead>
                <tbody>${activeLocs.map(l => `<tr>
                    <td><span class="badge-loc">${l.locationCode}</span></td>
                    <td><b>${formatN(l.stockQuantity)}</b></td>
                    <td style="color:#34D399">${formatN(l.availableQuantity)}</td>
                    <td style="color:#FCD34D">${formatN(l.onHoldQuantity)}</td>
                </tr>`).join('')}</tbody>
            </table>`;
        }
    }

    if (histories && histories.length > 0) {
        historyHTML = `
        <div class="modal-section-title">🕒 Lịch sử mapping (WMS)</div>
        <table class="history-table">
            <thead><tr><th>Thời gian</th><th>Hành động</th><th>Vị trí</th></tr></thead>
            <tbody>
                ${histories.slice(0, 5).map(h => {
                    let dateStr = h.createdTime || h.createdAt;
                    let formattedDate = '—';
                    if (dateStr) {
                        const d = new Date(dateStr);
                        formattedDate = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')} ${d.getDate().toString().padStart(2, '0')}/${(d.getMonth()+1).toString().padStart(2, '0')}`;
                    }
                    let actionName = h.templateCode === 'wms-mapping-sku-delete' ? 'Gỡ' : 'Gán';
                    const location = (h.data && h.data.locationCode) || h.locationCode || '—';
                    return `<tr><td class="history-date">${formattedDate}</td><td>${actionName}</td><td><span class="badge-loc">${location}</span></td></tr>`;
                }).join('')}
            </tbody>
        </table>`;
    }

    modalBody.innerHTML = `
        <div class="stat-chip-container">
            <div class="stat-chip" style="background:var(--primary)11; border-color:var(--primary)33;">
                <div class="stat-chip-val" style="color:var(--primary);">${escapeHTML(getFieldVal(['KỆ', 'KE', 'VỊ TRÍ', 'VI TRI'])) || '—'}</div>
                <div class="stat-chip-lbl">Kệ (Sheet)</div>
            </div>
            <div class="stat-chip" style="background:#10B98111; border-color:#10B98133;">
                <div class="stat-chip-val" style="color:#10B981;">${formatN(tonKho)}</div>
                <div class="stat-chip-lbl">Tồn (Sheet)</div>
            </div>
        </div>
        ${wmsStatsHTML}
        ${wmsLocsHTML}
        ${wmsLotsHTML}
        ${historyHTML}
        <div class="modal-section-title">Dữ liệu từ Google Sheet</div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">${otherHtml}</div>
    `;
}

function closeModal() {
    modalOverlay.classList.remove('active');
    document.body.style.overflow = '';
}

modalCloseBtn.onclick = closeModal;
modalOverlay.onclick = (e) => { if (e.target === modalOverlay) closeModal(); };
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

function scrollToBottom() {
    setTimeout(() => {
        chatBody.scrollTop = chatBody.scrollHeight;
    }, 50);
}

refreshDataBtn.addEventListener('click', () => {
    inventoryData = [];
    chatBody.innerHTML = '';
    addBotMessage('<i>Đang làm mới dữ liệu từ máy chủ...</i>');
    fetchInventoryData();
});

function init() {
    fetchInventoryData();
}

init();