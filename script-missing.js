// ============================================================
// CẤU HÌNH – thay SHEET_ID và GID nếu cần
// ============================================================
const SHEET_ID = '1Xhtmq2Y_YVC3qrd2y1RrONmuUxssHoN6vAJjOWFgHrA';
const GID      = '366393828'; // NGUỒN DATA MỚI THEO YÊU CẦU NGƯỜI DÙNG
const GVIZ_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?gid=${GID}`;

const ROWS_PER_PAGE = 30;

// ── STATE ──
let allData      = [];
let filtered     = [];
let auxImages    = new Map(); // SKU -> Image Map
let outListNotOut = new Set();
let outMissingSKUs = new Map();
let sortCol      = 'gap';
let sortDir      = 'asc';
let currentPage  = 1;
let jsonpScripts = [];

// ── DOM ──
const searchInput   = document.getElementById('searchInput');
const gapFilter     = document.getElementById('gapFilter');
const tableBody     = document.getElementById('tableBody');
const resultBadge   = document.getElementById('resultBadge');
const statusBanner  = document.getElementById('statusBanner');
const bannerInner   = document.getElementById('bannerInner');
const refreshBtn    = document.getElementById('refreshBtn');
const paginationWrap = document.getElementById('paginationWrap');
const pageInfo      = document.getElementById('pageInfo');
const pageBtns      = document.getElementById('pageBtns');

// ── MODAL DOM ──
const modalOverlay = document.getElementById('modalOverlay');
const modalCloseBtn = document.getElementById('modalCloseBtn');
const modalHeader  = document.getElementById('modalHeader');
const modalBody    = document.getElementById('modalBody');

// ============================================================
// BANNER
// ============================================================
function showBanner(type, msg) {
    statusBanner.style.display = 'block';
    bannerInner.className = `banner ${type}`;
    let icon = 'bx-loader-alt bx-spin';
    if (type === 'success') icon = 'bx-check-circle';
    if (type === 'error')   icon = 'bx-error-circle';
    bannerInner.innerHTML = `<i class='bx ${icon}'></i><span>${msg}</span>`;
}

function hideBanner() {
    statusBanner.style.display = 'none';
}

// ============================================================
// FETCH DATA (JSONP)
// ============================================================
function fetchData() {
    setControls(false);
    refreshBtn.classList.add('spinning');
    refreshBtn.disabled = true;
    showBanner('loading', 'Đang đồng bộ và tính toán độ lệch...');

    // Clear old scripts
    jsonpScripts.forEach(s => s.parentNode && document.body.removeChild(s));
    jsonpScripts = [];

    let mainDone = false;
    let auxDone = false;

    // 1. Fetch MAIN Inventory
    const cbMain = 'pa_missing_' + Date.now();
    window[cbMain] = (json) => {
        mainDone = true;
        if (auxDone && outDone) finalizeData(window._pendingJson || json);
        else if (!window._pendingJson) window._pendingJson = json;
    };
    const sMain = document.createElement('script');
    sMain.src = `${GVIZ_URL}&tqx=out:json;responseHandler:${cbMain}`;
    document.body.appendChild(sMain);
    jsonpScripts.push(sMain);

    // 2. Fetch AUX Images (TỪ FILE DATA INDEX CŨ CHỨA HÌNH ẢNH)
    const cbAux = 'pa_aux_' + Date.now();
    window[cbAux] = (json) => {
        auxDone = true;
        processAuxImages(json);
        if (mainDone && outDone) finalizeData(window._pendingJson);
    };
    const sAux = document.createElement('script');
    const AUX_SHEET_ID = '10Oguigdpx5RWP4rV0Mw3eVdBrf-uS8ilQHKfA26GMw8'; // Master data file (chứa ảnh ở gid=0)
    sAux.src = `https://docs.google.com/spreadsheets/d/${AUX_SHEET_ID}/gviz/tq?gid=0&tqx=out:json;responseHandler:${cbAux}`;
    document.body.appendChild(sAux);
    jsonpScripts.push(sAux);

    // 3. Fetch OUT sheet for true Not_Out checking
    let outDone = false;
    const cbOut = 'pa_out_' + Date.now();
    window[cbOut] = (json) => {
        outDone = true;
        processOutData(json);
        if (mainDone && auxDone) finalizeData(window._pendingJson);
    };
    const sOut = document.createElement('script');
    sOut.src = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?sheet=OUT&tqx=out:json;responseHandler:${cbOut}`;
    document.body.appendChild(sOut);
    jsonpScripts.push(sOut);

    function finalizeData(json) {
        processData(json);
        window._pendingJson = null;
    }
}

function processAuxImages(json) {
    try {
        if (!json?.table) return;
        const headers = json.table.cols.map(c => (c?.label || '').trim().toUpperCase());
        const skuIdx = headers.findIndex(h => h.includes('SKU'));
        const imgIdx = headers.findIndex(h => h.includes('HÌNH') || h.includes('IMAGE') || h.includes('IMG'));
        
        if (skuIdx === -1 || imgIdx === -1) return;

        json.table.rows.forEach(r => {
            const sku = (r.c[skuIdx]?.v || '').toString().trim().toLowerCase();
            const img = (r.c[imgIdx]?.v || '').toString().trim();
            if (sku && img && img !== '#N/A') auxImages.set(sku, img);
        });
    } catch(e) { console.error("Aux Image Error", e); }
}

function processOutData(json) {
    try {
        if (!json?.table?.rows) return;
        const rows = json.table.rows;
        
        // Find indices dynamically from headers usually at row 0 or 1
        let leftSkuIdx = 0;
        let rightSkuIdx = 8; // fallback
        
        const headerRow = rows.find(r => r.c && r.c.some(c => c && typeof c.v === 'string' && (c.v.toUpperCase().trim() === 'MÃ SKU' || c.v.toUpperCase().trim() === 'SKU')));
        if (headerRow) {
            let firstSku = -1;
            headerRow.c.forEach((c, idx) => {
                if (c && typeof c.v === 'string' && (c.v.toUpperCase().trim() === 'MÃ SKU' || c.v.toUpperCase().trim() === 'SKU')) {
                    if (firstSku === -1) firstSku = idx;
                    else rightSkuIdx = idx;
                }
            });
            if (firstSku !== -1) leftSkuIdx = firstSku;
        }

        let leftNameIdx = leftSkuIdx + 1;

        let leftSKUs = new Map();
        let rightSKUs = new Set();
        
        rows.forEach(r => {
            if (!r.c) return;
            let lSku = r.c[leftSkuIdx]?.v;
            if (lSku) lSku = lSku.toString().trim().toLowerCase();
            if (lSku && lSku !== 'mã sku' && lSku !== 'sku') {
                let lName = r.c[leftNameIdx]?.v;
                leftSKUs.set(lSku, lName ? lName.toString().trim() : '');
            }
            
            let rSku = r.c[rightSkuIdx]?.v;
            if (rSku) rSku = rSku.toString().trim().toLowerCase();
            if (rSku && rSku !== 'mã sku' && rSku !== 'sku') {
                rightSKUs.add(rSku);
            }
        });

        leftSKUs.forEach((name, sku) => {
            if (!rightSKUs.has(sku)) {
                outListNotOut.add(sku);
                outMissingSKUs.set(sku, name);
            }
        });
    } catch (e) {
        console.error("Out Data Error", e);
    }
}

// ============================================================
// KEYWORD MAPPING
// ============================================================
const KEY_FIELDS = {
    stock:   ['SỐ LƯỢNG MẤT', 'SO LUONG MAT', 'TỒN HỆ THỐNG', 'TỒN'],
    checked: ['SỐ LƯỢNG ĐÃ OUT', 'SO LUONG DA OUT', 'ĐÃ KIỂM', 'THỰC TẾ'],
    gap:     ['SỐ LƯỢNG CÒN LẠI', 'SO LUONG CON LAI', 'CHÊNH LỆCH'],
    name:    ['PRODUCT_NAME', 'TÊN SẢN PHẨM', 'SẢN PHẨM'],
    sku:     ['SKU_CODE', 'MÃ SKU', 'SKU'],
    img:     ['HÌNH ẢNH','IMAGE'],
    money:   ['TỔNG SỐ TIỀN', 'TONG SO TIEN', 'SỐ TIỀN', 'SO TIEN'],
    moneyOut:['SỐ TIỀN ĐÃ OUT', 'SO TIEN DA OUT'],
    moneyRemain: ['SỐ TIỀN CÒN LẠI', 'SO TIEN CON LAI'],
    location:['VỊ TRÍ', 'VI TRI']
};

function matchesKeyField(colName, keywords) {
    return keywords.some(kw => colName.toUpperCase().includes(kw.toUpperCase()));
}

function getVal(item, keywords) {
    const key = Object.keys(item).find(k => matchesKeyField(k, keywords));
    return key ? item[key] : '';
}

function getName(item)  { return getVal(item, KEY_FIELDS.name); }
function getSKU(item)   { return getVal(item, KEY_FIELDS.sku); }
function getMoney(item) { return getVal(item, KEY_FIELDS.money); }
function getMoneyOut(item) { return getVal(item, KEY_FIELDS.moneyOut); }
function getMoneyRemain(item) { return getVal(item, KEY_FIELDS.moneyRemain); }
function getLocation(item) { return getVal(item, KEY_FIELDS.location); }
function getImg(item) {
    let img = getVal(item, KEY_FIELDS.img);
    if (!img || img === '#N/A' || img.trim() === '') {
        const sku = (getSKU(item) || '').trim().toLowerCase();
        img = auxImages.get(sku) || '';
    }
    return img;
}

// ============================================================
// PROCESS DATA (GAP ANALYSIS)
// ============================================================
function processData(json) {
    refreshBtn.classList.remove('spinning');
    refreshBtn.disabled = false;
    try {
        if (!json || !json.table || !json.table.rows) throw new Error('Dữ liệu không hợp lệ.');

        let headers = json.table.cols.map(c => (c && c.label) ? c.label.trim() : '');
        let rawRows = json.table.rows;

        // Nếu header trống (như gviz thường làm khi header ở các hàng bên dưới), ta phải tìm thủ công
        const headerRowIdx = rawRows.findIndex(r => r.c && r.c.some(c => c && typeof c.v === 'string' && matchesKeyField(c.v, KEY_FIELDS.sku)));

        if (headerRowIdx !== -1) {
            headers = rawRows[headerRowIdx].c.map(c => (c && c.v) ? c.v.toString().trim() : '');
            
            // PATCH: Xử lý cột bị merge / trống header trong file Google Sheet
            // Theo cấu trúc cột của user: K(10) là Số lượng mất, L(11) Đã out, M(12) Còn lại
            if (!headers[7]) headers[7] = 'TỔNG SỐ TIỀN';
            if (!headers[8]) headers[8] = 'SỐ TIỀN ĐÃ OUT';
            if (!headers[9]) headers[9] = 'SỐ TIỀN CÒN LẠI';
            if (!headers[10]) headers[10] = 'SỐ LƯỢNG MẤT';
            if (!headers[11]) headers[11] = 'SỐ LƯỢNG ĐÃ OUT';
            if (!headers[12]) headers[12] = 'SỐ LƯỢNG CÒN LẠI';

            rawRows = rawRows.slice(headerRowIdx + 1); // Cắt bỏ các row rác phía trên header
        }

        const rows = rawRows.map(r => {
            const item = {};
            r.c.forEach((cell, i) => {
                if (headers[i]) {
                    // Ưu tiên cell.v để lấy số thực tế, tránh dính định dạng dấu chấm của cell.f (vd: f="1.564")
                    let val = '';
                    if (cell) {
                        if (cell.v !== null && cell.v !== undefined) val = cell.v.toString();
                        else val = (cell.f || '').toString();
                    }
                    item[headers[i]] = val.trim();
                }
            });
            return item;
        }).filter(item => Object.values(item).some(v => v.length > 0));

        // Grouping Logic for Gap Analysis
        const groupedMap = new Map();
        rows.forEach(item => {
            const sku = (getSKU(item) || '').trim();
            const name = (getName(item) || '').trim();
            const key = (sku || name).toLowerCase();
            if (!key) return;

            const rowStock = parseFloat(getVal(item, KEY_FIELDS.stock).replace(/,/g,'')) || 0;
            const rawChecked = getVal(item, KEY_FIELDS.checked).replace(/,/g,'');
            const rowChecked = rawChecked !== '' ? parseFloat(rawChecked) : 0;
            
            // Lấy gap trực tiếp nếu có, nếu không lấy từ stock & checked
            const rawGap = getVal(item, KEY_FIELDS.gap).replace(/,/g,'');
            const rowGap = rawGap !== '' ? parseFloat(rawGap) : (rowChecked - rowStock);

            const rowMoney = parseFloat(getVal(item, KEY_FIELDS.money).replace(/,/g,'')) || 0;
            const rowMoneyOut = parseFloat(getVal(item, KEY_FIELDS.moneyOut).replace(/,/g,'')) || 0;
            const rowMoneyRemain = parseFloat(getVal(item, KEY_FIELDS.moneyRemain).replace(/,/g,'')) || 0;

            if (!groupedMap.has(key)) {
                groupedMap.set(key, { ...item, _stock: 0, _checked: 0, _gapTotal: 0, _moneyTotal: 0, _moneyOutTotal: 0, _moneyRemainTotal: 0 });
            }
            const entry = groupedMap.get(key);
            entry._stock += rowStock;
            entry._checked += rowChecked;
            entry._gapTotal += rowGap;
            entry._moneyTotal += rowMoney;
            entry._moneyOutTotal += rowMoneyOut;
            entry._moneyRemainTotal += rowMoneyRemain;
        });

        allData = Array.from(groupedMap.values()).map(entry => {
            return { 
                ...entry, 
                _sys: entry._stock, 
                _act: entry._checked,
                _gap: entry._gapTotal 
            };
        });

        // INJECT OUT SKUs that are missing from allData
        outListNotOut.forEach(sku => {
            const existing = allData.find(d => (getSKU(d) || '').toLowerCase() === sku);
            if (!existing) {
                const name = outMissingSKUs.get(sku) || sku;
                allData.push({
                    'MÃ SKU': sku,
                    'TÊN SẢN PHẨM': name,
                    _sys: 0,
                    _act: 0,
                    _gap: 0,
                    _moneyTotal: 0,
                    _moneyOutTotal: 0,
                    _moneyRemainTotal: 0,
                    rawRows: []
                });
            }
        });

        updateStats();
        applyFilter();
        setControls(true);
        showBanner('success', `✅ Đã phân tích ${allData.length} mã SKU.`);
        setTimeout(hideBanner, 3000);

    } catch(err) {
        showBanner('error', `❌ Lỗi: ${err.message}`);
    }
}

// ============================================================
// FILTERS & STATS
// ============================================================
function updateStats() {
    let missing = 0;
    let notOut = 0;
    let ok = 0;

    allData.forEach(d => {
        if (d._gap < 0) missing++;
        else if (d._gap === 0) ok++;
        
        // Count SKUs that haven't been 'out'ed based on the OUT sheet logic
        if (outListNotOut.has((getSKU(d) || '').toLowerCase())) notOut++;
    });

    document.getElementById('statTotalSKU').textContent = allData.length.toLocaleString('vi-VN');
    document.getElementById('statMatched').textContent = ok.toLocaleString('vi-VN');
    document.getElementById('statMissing').textContent = missing.toLocaleString('vi-VN');
    document.getElementById('statNotOut').textContent = notOut.toLocaleString('vi-VN');
}

function applyFilter() {
    const q = normalize(searchInput.value);
    const gapF = gapFilter.value;

    filtered = allData.filter(item => {
        const text = normalize(getName(item)) + ' ' + normalize(getSKU(item));
        if (q && !text.includes(q)) return false;

        if (gapF === 'diff' && item._gap === 0) return false;
        if (gapF === 'missing' && item._gap >= 0) return false;
        if (gapF === 'surplus' && item._gap <= 0) return false;
        if (gapF === 'ok' && item._gap !== 0) return false;
        return true;
    });

    if (sortCol) {
        filtered.sort((a, b) => {
            let av = a['_' + sortCol]; // _sys, _act, _gap
            let bv = b['_' + sortCol];
            // If sort by name rather than number
            if (sortCol === 'name') {
                av = getName(a); bv = getName(b);
            }
            return sortDir === 'asc' ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
        });
    }

    currentPage = 1;
    resultBadge.textContent = `Lọc được ${filtered.length} mã`;
    renderPage();
}

// ============================================================
// PAGINATION & TABLE
// ============================================================
function renderPage() {
    const start = (currentPage - 1) * ROWS_PER_PAGE;
    const slice = filtered.slice(start, start + ROWS_PER_PAGE);
    
    tableBody.innerHTML = slice.length ? slice.map((item, i) => {
        const img = getImg(item) || 'https://placehold.co/48x48/1e293b/4f46e5?text=?';
        const isOk = item._gap === 0;
        const isMissing = item._gap < 0; // Thiếu
        const badgeClass = isOk ? 'ok' : (isMissing ? 'missing' : 'surplus');
        const gapText = isOk ? 'Khớp' : (item._gap > 0 ? `+${item._gap}` : item._gap);

        return `<tr data-idx="${start + i}" style="--i: ${i}">
            <td style="text-align:center; opacity:0.5;">${start + i + 1}</td>
            <td class="td-img"><img src="${img}" onerror="this.src='https://placehold.co/48x48/1e293b/4f46e5?text=?'"></td>
            <td class="td-name">
                <div class="name-main">${highlight(getName(item), searchInput.value)}</div>
                <span class="name-sku">${highlight(getSKU(item), searchInput.value)}</span>
            </td>
            <td class="text-sys" title="Cần kiểm (Số lượng mất)">${item._sys}</td>
            <td class="text-act" title="Đã kiểm (Số lượng đã out)">${item._act}</td>
            <td><span class="badge-gap ${badgeClass}" title="Chưa kiểm (Số lượng còn lại)">${item._gap}</span></td>
        </tr>`;
    }).join('') : '<tr><td colspan="6" class="empty-state">Không tìm thấy mã nào thoả mãn.</td></tr>';

    tableBody.querySelectorAll('tr[data-idx]').forEach(tr => tr.onclick = () => openModal(parseInt(tr.dataset.idx)));
    
    const pages = Math.ceil(filtered.length / ROWS_PER_PAGE);
    paginationWrap.style.display = pages > 1 ? 'flex' : 'none';
    if(pages > 1) {
        pageInfo.innerHTML = `Trang <b>${currentPage}</b> / ${pages}`;
        pageBtns.innerHTML = `<button class="page-btn" ${currentPage===1?'disabled':''} onclick="goPage(${currentPage-1})"><i class='bx bx-chevron-left'></i></button>` +
            `<button class="page-btn active">${currentPage}</button>` +
            `<button class="page-btn" ${currentPage===pages?'disabled':''} onclick="goPage(${currentPage+1})"><i class='bx bx-chevron-right'></i></button>`;
    }
}

function goPage(p) { currentPage = p; renderPage(); window.scrollTo(0,0); }

function setupSort() {
    ['thName', 'thSys', 'thAct', 'thGap'].forEach(id => {
        document.getElementById(id).onclick = (e) => {
            const col = e.currentTarget.dataset.col;
            sortDir = (sortCol === col && sortDir === 'asc') ? 'desc' : 'asc';
            sortCol = col;
            applyFilter();
            
            // update sort icon visual
            document.querySelectorAll('th').forEach(th => { th.classList.remove('asc','desc'); });
            e.currentTarget.classList.add(sortDir);
        };
    });
}

function setControls(en) { [searchInput, gapFilter].forEach(el => el.disabled = !en); }

// ============================================================
// MODAL LOGIC
// ============================================================
function openModal(idx) {
    const item = filtered[idx];
    if (!item) return;

    const img = getImg(item) || 'https://placehold.co/72x72/1e293b/4f46e5?text=?';

    const isOk = item._gap === 0;
    const isMissing = item._gap < 0; 
    const badgeClass = isOk ? 'ok' : (isMissing ? 'missing' : 'surplus');
    const gapText = isOk ? 'KHỚP' : (item._gap > 0 ? `DƯ +${item._gap}` : `THIẾU ${item._gap}`);

    modalHeader.innerHTML = `
        <img class="modal-product-img" src="${img}" onerror="this.src='https://placehold.co/72x72/1e293b/4f46e5?text=?'">
        <div class="modal-title-wrap">
            <div class="modal-product-name">${escapeHTML(getName(item))}</div>
            <div class="modal-sku-row">
                <span class="modal-sku">${escapeHTML(getSKU(item)) || '—'}</span>
                <span class="badge-gap ${badgeClass}" style="margin-left:10px;">${gapText}</span>
            </div>
        </div>`;

    const formatN = (num) => {
        if (!num) return '0';
        return num.toLocaleString('vi-VN');
    };

    const money = formatN(item._moneyTotal);
    const moneyOut = formatN(item._moneyOutTotal);
    const moneyRemain = formatN(item._moneyRemainTotal);
    const loc = getLocation(item) || '—';

    modalBody.innerHTML = `
    <div class="modal-new-blocks">
        <div class="new-block bg-red">
            <div class="new-block-label">Cần kiểm</div>
            <div class="new-block-val">${item._sys}</div>
        </div>
        <div class="new-block bg-yellow">
            <div class="new-block-label">Đã kiểm</div>
            <div class="new-block-val">${item._act}</div>
        </div>
        <div class="new-block bg-green">
            <div class="new-block-label">Còn lại</div>
            <div class="new-block-val">${item._gap}</div>
        </div>
    </div>
    
    <div class="modal-extra-section">
        <h4 class="extra-title-text">Chi tiết bổ sung</h4>
        
        <div class="extra-row">
            <span class="extra-lbl">Số tiền</span>
            <div class="extra-line"></div>
            <span class="extra-val">${money}</span>
        </div>
        <div class="extra-row">
            <span class="extra-lbl">Số tiền đã Out</span>
            <div class="extra-line"></div>
            <span class="extra-val">${moneyOut}</span>
        </div>
        <div class="extra-row">
            <span class="extra-lbl">Số tiền còn lại</span>
            <div class="extra-line"></div>
            <span class="extra-val">${moneyRemain}</span>
        </div>
        <div class="extra-row">
            <span class="extra-lbl">Vị trí</span>
            <div class="extra-line"></div>
            <span class="extra-val">${loc}</span>
        </div>
    </div>`;

    modalOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeModal() { modalOverlay.classList.remove('active'); document.body.style.overflow = ''; }

modalCloseBtn.onclick = closeModal;
modalOverlay.onclick = (e) => { if(e.target === modalOverlay) closeModal(); };

// ============================================================
// CATEGORY MODAL LOGIC
// ============================================================
const catModalOverlay = document.getElementById('catModalOverlay');
const catModalHeader = document.getElementById('catModalHeader');
const catModalBody = document.getElementById('catModalBody');
const catModalCloseBtn = document.getElementById('catModalCloseBtn');

catModalOverlay.onclick = (e) => { if(e.target === catModalOverlay) window.closeCatModal(); };
catModalCloseBtn.onclick = window.closeCatModal;

document.addEventListener('keydown', e => { 
    if(e.key === 'Escape') {
        closeModal();
        if (window.closeCatModal) window.closeCatModal();
    } 
});

let currentCatData = [];
let currentCatType = '';

window.openCatModal = function(type) {
    currentCatType = type;
    currentCatData = allData.filter(d => {
        if (type === 'missing') return d._gap < 0;
        if (type === 'not_out') return outListNotOut.has((getSKU(d) || '').toLowerCase());
        if (type === 'ok') return d._gap === 0;
        return true;
    });

    let title = 'Tổng MÃ SKU';
    let iconHTML = `<div class="stat-icon blue" style="margin:0;"><i class='bx bx-collection'></i></div>`;
    if (type === 'missing') {
        title = 'SKU Thiếu (Missing)';
        iconHTML = `<div class="stat-icon red" style="margin:0;"><i class='bx bx-layer-minus'></i></div>`;
    } else if (type === 'not_out') {
        title = 'SKU ĐÃ TÌM THẤY CHƯA KIỂM';
        iconHTML = `<div class="stat-icon yellow" style="margin:0;"><i class='bx bx-layer-plus'></i></div>`;
    } else if (type === 'ok') {
        title = 'SKU Khớp Hoàn Toàn';
        iconHTML = `<div class="stat-icon green" style="margin:0;"><i class='bx bx-check-shield'></i></div>`;
    }

    let moneySum = 0;
    currentCatData.forEach(d => moneySum += (d._moneyRemainTotal || 0));
    const formatN = num => num ? num.toLocaleString('vi-VN') : '0';

    catModalHeader.innerHTML = `
        <div style="position:relative; width:100%; display:flex; justify-content:center; align-items:center; flex-direction:column; gap:16px; margin-bottom: 8px;">
            ${iconHTML.replace('style="margin:0;"', 'style="margin:0; width:64px; height:64px; font-size:32px;"')}
            <div style="text-align:center;">
                <div style="font-family:var(--font-display); font-size:1.4rem; font-weight:800; color:#fff; text-transform:uppercase; letter-spacing:0.02em;">${title}</div>
                <div style="display:inline-flex; align-items:center; gap:16px; margin-top:12px; background:rgba(0,0,0,0.2); border:1px solid rgba(255,255,255,0.05); border-radius:100px; padding:6px 20px; box-shadow: inset 0 2px 5px rgba(0,0,0,0.2);">
                    <span style="font-size:0.85rem; color:var(--text-muted); font-weight:600; text-transform:uppercase; letter-spacing:0.05em;">Số tiền còn lại</span>
                    <strong style="font-size:1.15rem; color:#fff; font-family:var(--font-display); text-shadow: 0 2px 10px rgba(255,255,255,0.2);">${formatN(moneySum)} đ</strong>
                </div>
            </div>
            <button onclick="exportCatDataToExcel()" onmouseover="this.style.background='rgba(16,185,129,0.2)'; this.style.transform='translateY(-2px)';" onmouseout="this.style.background='rgba(16,185,129,0.1)'; this.style.transform='translateY(0)';" style="position:absolute; right:45px; top:-12px; background:rgba(16,185,129,0.1); color:#34D399; border:1px solid rgba(16,185,129,0.3); padding:10px 20px; border-radius:14px; font-family:var(--font-display); font-size:0.85rem; font-weight:700; display:flex; align-items:center; gap:8px; cursor:pointer; transition:all 0.3s; box-shadow: 0 4px 15px rgba(16,185,129,0.1);">
                <i class='bx bxs-file-export' style="font-size:1.2rem;"></i> XUẤT EXCEL
            </button>
        </div>
    `;

    let rowsHTML = currentCatData.map((item, idx) => {
        const _name = escapeHTML(getName(item)) || 'Không xác định';
        const _sku = escapeHTML(getSKU(item)) || '—';
        const img = getImg(item) || 'https://placehold.co/48x48/1e293b/4f46e5?text=?';
        
        let gapColor = '#34D399';
        if (item._gap < 0) gapColor = '#F87171';
        else if (item._gap > 0) gapColor = '#FCD34D';

        return `
            <tr>
                <td style="color:var(--text-dim); text-align:center;">${idx + 1}</td>
                <td class="td-img"><img src="${img}" onerror="this.src='https://placehold.co/48x48/1e293b/4f46e5?text=?'"></td>
                <td>
                    <div class="name-main">${_name}</div>
                    <div class="name-sku">${_sku}</div>
                </td>
                <td class="text-sys" style="text-align:center;">${item._sys}</td>
                <td class="text-act" style="text-align:center;">${item._act}</td>
                <td style="text-align:center; font-weight:800; font-size:1.15rem; color:${gapColor}; font-family:var(--font-display);">${item._gap > 0 ? '+'+item._gap : item._gap}</td>
            </tr>
        `;
    }).join('');

    if (currentCatData.length === 0) {
        rowsHTML = `<tr><td colspan="6" style="text-align:center; padding:50px; color:var(--text-dim); font-size:0.95rem;">Không có dữ liệu trong nhóm này.</td></tr>`;
    }

    catModalBody.innerHTML = `
        <div class="table-wrap" style="background: rgba(15,23,42,0.4); border: 1px solid rgba(255,255,255,0.05); box-shadow: inset 0 2px 10px rgba(0,0,0,0.2); margin-top: 5px;">
            <div class="table-scroll" style="max-height: 55vh;">
                <table>
                    <thead>
                        <tr>
                            <th style="width:50px; text-align:center;">#</th>
                            <th style="width:60px;"></th>
                            <th>SẢN PHẨM / SKU</th>
                            <th style="text-align:center;">CẦN KIỂM</th>
                            <th style="text-align:center;">ĐÃ KIỂM</th>
                            <th style="text-align:center;">CHƯA KIỂM</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rowsHTML}
                    </tbody>
                </table>
            </div>
        </div>
    `;

    catModalOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';
};

window.closeCatModal = function() { 
    catModalOverlay.classList.remove('active'); 
    if (!modalOverlay.classList.contains('active')) {
        document.body.style.overflow = ''; 
    }
};

window.exportCatDataToExcel = function() {
    if (currentCatData.length === 0) {
        alert("Không có dữ liệu để xuất!");
        return;
    }
    try {
        const exportMap = currentCatData.map(item => ({
            'Tên Sản Phẩm': getName(item),
            'Mã SKU': getSKU(item),
            'Cần Kiểm': item._sys,
            'Đã Kiểm': item._act,
            'Chênh Lệch': item._gap,
            'Số tiền còn lại': item._moneyRemainTotal || 0
        }));
        const worksheet = XLSX.utils.json_to_sheet(exportMap);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Chi Tiet");
        const d = new Date();
        const dateStr = `${d.getFullYear()}${(d.getMonth() + 1).toString().padStart(2, '0')}${d.getDate().toString().padStart(2, '0')}`;
        XLSX.writeFile(workbook, `Detail_${currentCatType}_${dateStr}.xlsx`);
    } catch (err) {
        console.error(err);
        alert("Lỗi xuất file Excel!");
    }
};

// ============================================================
// UTILS
// ============================================================
function normalize(str) { return str ? str.toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').trim() : ''; }

function highlight(text, query) {
    if (!query || !text) return escapeHTML(text);
    const q = normalize(query), t = text.toString(), tn = normalize(t);
    let res = '', lastIdx = 0, idx = tn.indexOf(q);
    while (idx !== -1) {
        res += escapeHTML(t.substring(lastIdx, idx)) + `<mark>${escapeHTML(t.substring(idx, idx + q.length))}</mark>`;
        lastIdx = idx + q.length; idx = tn.indexOf(q, lastIdx);
    }
    return res + escapeHTML(t.substring(lastIdx));
}

function escapeHTML(str) { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }

searchInput.oninput = applyFilter;
gapFilter.onchange = applyFilter;
refreshBtn.onclick = () => { allData=[]; filtered=[]; fetchData(); };

// ============================================================
// EXCEL EXPORT LOGIC
// ============================================================
function exportDataToExcel() {
    const dataToExport = filtered.length > 0 ? filtered : allData;
    if (dataToExport.length === 0) {
        alert("Không có dữ liệu để xuất!");
        return;
    }

    try {
        const exportMap = dataToExport.map(item => {
            return {
                'Tên Sản Phẩm': getName(item),
                'Mã SKU': getSKU(item),
                'Cần Kiểm (Hệ thống)': item._sys,
                'Đã Kiểm (Thực tế)': item._act,
                'Chênh Lệch (Gap)': item._gap
            };
        });

        const worksheet = XLSX.utils.json_to_sheet(exportMap);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Độ Lệch Tồn Kho");
        
        const d = new Date();
        const dateStr = `${d.getFullYear()}${(d.getMonth() + 1).toString().padStart(2, '0')}${d.getDate().toString().padStart(2, '0')}`;
        XLSX.writeFile(workbook, `Missing_Data_${dateStr}.xlsx`);
    } catch (err) {
        console.error("Export error:", err);
        alert("Lỗi khi xuất file Excel!");
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const exBtn = document.getElementById('exportBtn');
    if (exBtn) exBtn.addEventListener('click', exportDataToExcel);
});

setupSort();
// Set defualt sort UI direction
document.getElementById('thGap').classList.add('asc');

fetchData();
