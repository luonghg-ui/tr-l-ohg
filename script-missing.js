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
        if (auxDone) finalizeData(json);
        else window._pendingJson = json;
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
        if (mainDone) finalizeData(window._pendingJson);
    };
    const sAux = document.createElement('script');
    const AUX_SHEET_ID = '10Oguigdpx5RWP4rV0Mw3eVdBrf-uS8ilQHKfA26GMw8'; // Master data file (chứa ảnh ở gid=0)
    sAux.src = `https://docs.google.com/spreadsheets/d/${AUX_SHEET_ID}/gviz/tq?gid=0&tqx=out:json;responseHandler:${cbAux}`;
    document.body.appendChild(sAux);
    jsonpScripts.push(sAux);

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

// ============================================================
// KEYWORD MAPPING
// ============================================================
const KEY_FIELDS = {
    stock:   ['SỐ LƯỢNG MẤT', 'SO LUONG MAT', 'TỒN HỆ THỐNG', 'TỒN'],
    checked: ['SỐ LƯỢNG ĐÃ OUT', 'SO LUONG DA OUT', 'ĐÃ KIỂM', 'THỰC TẾ'],
    gap:     ['SỐ LƯỢNG CÒN LẠI', 'SO LUONG CON LAI', 'CHÊNH LỆCH'],
    name:    ['PRODUCT_NAME', 'TÊN SẢN PHẨM', 'SẢN PHẨM'],
    sku:     ['SKU_CODE', 'MÃ SKU', 'SKU'],
    img:     ['HÌNH ẢNH','IMAGE']
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

            if (!groupedMap.has(key)) {
                groupedMap.set(key, { ...item, _stock: 0, _checked: 0, _gapTotal: 0 });
            }
            const entry = groupedMap.get(key);
            entry._stock += rowStock;
            entry._checked += rowChecked;
            entry._gapTotal += rowGap;
        });

        allData = Array.from(groupedMap.values()).map(entry => {
            return { 
                ...entry, 
                _sys: entry._stock, 
                _act: entry._checked,
                _gap: entry._gapTotal 
            };
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
    let surplus = 0;
    let ok = 0;

    allData.forEach(d => {
        if (d._gap < 0) missing++;
        else if (d._gap > 0) surplus++;
        else ok++;
    });

    document.getElementById('statTotalSKU').textContent = allData.length.toLocaleString('vi-VN');
    document.getElementById('statMatched').textContent = ok.toLocaleString('vi-VN');
    document.getElementById('statMissing').textContent = missing.toLocaleString('vi-VN');
    document.getElementById('statSurplus').textContent = surplus.toLocaleString('vi-VN');
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

    modalBody.innerHTML = `
    <div class="modal-key-fields">
        <div class="modal-key-card">
            <div class="modal-key-label">Số lượng cần kiểm</div>
            <div class="modal-key-value text-sys">${item._sys}</div>
        </div>
        <div class="modal-key-card accent-blue">
            <div class="modal-key-label">Số lượng đã kiểm</div>
            <div class="modal-key-value text-act">${item._act}</div>
        </div>
        <div class="modal-key-card ${isOk ? 'accent-green' : (isMissing ? 'accent-red' : 'accent-yellow')}">
            <div class="modal-key-label">Còn lại</div>
            <div class="modal-key-value" style="color: ${isOk ? '#34D399' : (isMissing ? '#F87171' : '#FCD34D')};">${item._gap}</div>
        </div>
    </div>`;

    modalOverlay.classList.add('open');
    document.body.style.overflow = 'hidden';
}

function closeModal() { modalOverlay.classList.remove('open'); document.body.style.overflow = ''; }

modalCloseBtn.onclick = closeModal;
modalOverlay.onclick = (e) => { if(e.target === modalOverlay) closeModal(); };
document.addEventListener('keydown', e => { if(e.key === 'Escape') closeModal(); });

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
