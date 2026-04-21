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
function updateSystemMessage(text) {
    addBotMessage(text);
}

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

// ============================================================
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
function renderResults(results) {
    let html = '';
    results.forEach(item => {
        // Tự động tìm key phù hợp (không phân biệt hoa/thường)
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
        
        // Fields for additional details section
        const maSeller = getVal(['MÃ SELLER', 'MA SELLER', 'SELLER', 'VENDOR']);
        const nhom = getVal(['NHÓM', 'NHOM', 'CATEGORY', 'GROUP']);
        const adminId = getVal(['ADMIN ID', 'ADMIN', 'OWNER']);
        const choNhap = getVal(['CHỜ NHẬP', 'CHO NHAP', 'PENDING', 'DUE']);

        html += `
        <div class="product-card">
            <div class="product-card-header">
                <img src="${escapeHTML(hinhAnh)}" alt="${escapeHTML(tenSp)}" class="product-img"
                     onerror="this.src='https://placehold.co/80x80/030712/6366F1?text=Error'">
                <div style="flex:1;">
                    <h3 class="product-title">${escapeHTML(tenSp)}</h3>
                    <span class="product-sku">${escapeHTML(sku)}</span>
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
                        ${escapeHTML(quyCach) || 'N/A'}
                    </div>
                </div>
            </div>

            <!-- Additional Details Section -->
            <div class="extra-details">
                <span class="extra-title">Chi tiết bổ sung</span>
                <div class="detail-list">
                    <div class="detail-row">
                        <span class="detail-label">Mã seller</span>
                        <span class="detail-value">${escapeHTML(maSeller) || '—'}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Nhóm</span>
                        <span class="detail-value">${escapeHTML(nhom) || '—'}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Admin ID</span>
                        <span class="detail-value">${escapeHTML(adminId) || '—'}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Chờ nhập</span>
                        <span class="detail-value" style="color:#FCD34D;">${escapeHTML(choNhap) || '—'}</span>
                    </div>
                </div>
            </div>
        </div>`;
    });
    addBotMessage(html);
}

// ============================================================
// Tiện ích
// ============================================================
function scrollToBottom() {
    setTimeout(() => {
        chatBody.scrollTop = chatBody.scrollHeight;
    }, 50);
}

// Nút làm mới dữ liệu
refreshDataBtn.addEventListener('click', () => {
    inventoryData = [];
    chatBody.innerHTML = '';
    addBotMessage('<i>Đang làm mới dữ liệu từ máy chủ...</i>');
    fetchInventoryData();
});

// ============================================================
// Bắt đầu
// ============================================================
init();