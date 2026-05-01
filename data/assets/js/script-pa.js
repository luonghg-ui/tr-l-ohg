// ============================================================
// CẤU HÌNH – thay SHEET_ID và GID nếu cần
// ============================================================
const SHEET_ID = '10Oguigdpx5RWP4rV0Mw3eVdBrf-uS8ilQHKfA26GMw8';
const GID = '749041260'; // Sheet: DataPA
const GVIZ_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?gid=${GID}`;

const ROWS_PER_PAGE = 30;

// ── STATE ──
let allData = [];
let filtered = [];
let auxImages = new Map(); // SKU -> Image Map
let sortCol = null;
let sortDir = 'asc';
let currentPage = 1;
let jsonpScripts = [];

// ── DOM ──
const searchInput = document.getElementById('searchInput');
const stockFilter = document.getElementById('stockFilter');
const shelfFilter = document.getElementById('shelfFilter');
const tableBody = document.getElementById('tableBody');
const resultBadge = document.getElementById('resultBadge');
const statusBanner = document.getElementById('statusBanner');
const bannerInner = document.getElementById('bannerInner');
const refreshBtn = document.getElementById('refreshBtn');
const paginationWrap = document.getElementById('paginationWrap');
const pageInfo = document.getElementById('pageInfo');
const pageBtns = document.getElementById('pageBtns');

// ── MODAL DOM ──
const modalOverlay = document.getElementById('modalOverlay');
const modalCloseBtn = document.getElementById('modalCloseBtn');
const modalHeader = document.getElementById('modalHeader');
const modalBody = document.getElementById('modalBody');

// ============================================================
// BANNER
// ============================================================
function showBanner(type, msg) {
    statusBanner.style.display = 'block';
    bannerInner.className = `banner ${type}`;
    let icon = 'bx-loader-alt bx-spin';
    if (type === 'success') icon = 'bx-check-circle';
    if (type === 'error') icon = 'bx-error-circle';
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
    showBanner('loading', 'Đang đồng bộ dữ liệu từ các kho...');

    // Clear old scripts
    jsonpScripts.forEach(s => s.parentNode && document.body.removeChild(s));
    jsonpScripts = [];

    let mainDone = false;
    let auxDone = false;

    // 1. Fetch MAIN Inventory (GID=749041260)
    const cbMain = 'pa_main_' + Date.now();
    window[cbMain] = (json) => {
        mainDone = true;
        if (auxDone) finalizeData(json);
        else window._pendingJson = json;
    };
    const sMain = document.createElement('script');
    sMain.src = `${GVIZ_URL}&tqx=out:json;responseHandler:${cbMain}`;
    document.body.appendChild(sMain);
    jsonpScripts.push(sMain);

    // 2. Fetch AUX Images (GID=0)
    const cbAux = 'pa_aux_' + Date.now();
    window[cbAux] = (json) => {
        auxDone = true;
        processAuxImages(json);
        if (mainDone) finalizeData(window._pendingJson);
    };
    const sAux = document.createElement('script');
    sAux.src = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?gid=0&tqx=out:json;responseHandler:${cbAux}`;
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
    } catch (e) { console.error("Aux Image Error", e); }
}

// ============================================================
// XỬ LÝ DỮ LIỆU GVIZ JSON
// ============================================================
function processData(json) {
    refreshBtn.classList.remove('spinning');
    refreshBtn.disabled = false;
    try {
        if (!json || !json.table) throw new Error('Dữ liệu không hợp lệ.');

        const headers = json.table.cols.map(c => (c && c.label) ? c.label.trim() : '');
        const rows = (json.table.rows || []).map(r => {
            const item = {};
            r.c.forEach((cell, i) => {
                if (headers[i]) item[headers[i]] = cell ? (cell.f || cell.v || '').toString().trim() : '';
            });
            return item;
        }).filter(item => Object.values(item).some(v => v.length > 0));

        // Grouping Logic
        const groupedMap = new Map();
        rows.forEach(item => {
            const sku = (getSKU(item) || '').trim();
            const name = (getName(item) || '').trim();
            const key = (sku || name).toLowerCase();
            if (!key) return;

            const rowShelf = getShelf(item) || '—';
            const rowStock = parseInt(getStock(item)) || 0;
            const rowLotRaw = Object.keys(item).filter(k => matchesKeyField(k, KEY_FIELDS.lot))
                .map(k => ({ label: k, value: item[k] }))
                .filter(p => p.value && p.value !== '#N/A');
            const rowLotStr = rowLotRaw.map(p => p.value).join(' / ') || '—';

            if (!groupedMap.has(key)) {
                groupedMap.set(key, { ...item, _stock: 0, _breakdowns: new Map() });
            }
            const entry = groupedMap.get(key);
            const bKey = `${rowShelf}|${rowLotStr}`;
            if (entry._breakdowns.has(bKey)) {
                entry._breakdowns.get(bKey).stock += rowStock;
            } else {
                entry._breakdowns.set(bKey, {
                    shelf: rowShelf,
                    lot: rowLotStr,
                    stock: rowStock,
                    lotDetails: rowLotRaw // Store detailed parts for styling
                });
            }
            entry._stock += rowStock;
        });

        allData = Array.from(groupedMap.values()).map(entry => {
            const sortedB = Array.from(entry._breakdowns.values()).sort((a, b) => a.shelf.localeCompare(b.shelf));
            return { ...entry, [getStockKey(entry)]: entry._stock, _breakdown: sortedB };
        });

        buildShelfFilter();
        updateStats();
        applyFilter();
        setControls(true);
        showBanner('success', `✅ Đã tải ${allData.length} sản phẩm.`);
        setTimeout(hideBanner, 3000);

    } catch (err) {
        showBanner('error', `❌ Lỗi: ${err.message}`);
    }
}

// ============================================================
// KEYWORD MAPPING
// ============================================================
const KEY_FIELDS = {
    stock: ['TỒN VẬT LÝ', 'TON VAT LY', 'TỒN KHO', 'TON KHO', 'STOCK', 'TỒN'],
    name: ['TÊN SẢN PHẨM', 'TEN SAN PHAM', 'SẢN PHẨM', 'SAN PHAM', 'PRODUCT', 'TÊN'],
    sku: ['MÃ SKU', 'MA SKU', 'SKU'],
    shelf: ['KỆ', 'KE', 'VỊ TRÍ', 'VI TRI', 'SHELF', 'LOCATION', 'KỆ HÀNG'],
    unit: ['QUY CÁCH', 'QUY CACH', 'CÁCH', 'UNIT', 'ĐVT'],
    img: ['HÌNH ẢNH', 'HINH ANH', 'IMAGE', 'IMG', 'ẢNH'],
    lot: ['LOT', 'DATE', 'HSD', 'HẠN', 'HAN', 'NGÀY', 'NGAY', 'BATCH'],
    note: ['GHI CHÚ', 'GHI CHU', 'NOTE', 'NOTES', 'REMARK'],
    price: ['GIÁ', 'GIA', 'PRICE', 'ĐƠN GIÁ'],
};

function matchesKeyField(colName, keywords) {
    return keywords.some(kw => colName.toUpperCase().includes(kw.toUpperCase()));
}

function classifyCol(colName) {
    for (const [field, kws] of Object.entries(KEY_FIELDS)) {
        if (matchesKeyField(colName, kws)) return field;
    }
    return 'other';
}

function getVal(item, keywords) {
    const key = Object.keys(item).find(k => matchesKeyField(k, keywords));
    return key ? item[key] : '';
}
function getStockKey(item) { return Object.keys(item).find(k => matchesKeyField(k, KEY_FIELDS.stock)) || 'Stock'; }
function getStock(item) { return getVal(item, KEY_FIELDS.stock); }
function getName(item) { return getVal(item, KEY_FIELDS.name); }
function getSKU(item) { return getVal(item, KEY_FIELDS.sku); }
function getShelf(item) { return getVal(item, KEY_FIELDS.shelf); }
function getUnit(item) { return getVal(item, KEY_FIELDS.unit); }
function getImg(item) {
    let img = getVal(item, KEY_FIELDS.img);
    if (!img || img === '#N/A' || img.trim() === '') {
        const sku = (getSKU(item) || '').trim().toLowerCase();
        img = auxImages.get(sku) || '';
    }
    return img;
}

// ============================================================
// FILTERS & STATS
// ============================================================
function buildShelfFilter() {
    const shelves = new Set();
    allData.forEach(d => { const s = getShelf(d); if (s && s !== '#N/A') s.split(',').forEach(p => shelves.add(p.trim())); });
    shelfFilter.innerHTML = '<option value="all">Tất cả vị trí</option>' +
        Array.from(shelves).sort().map(s => `<option value="${s}">${s}</option>`).join('');
}

function updateStats() {
    document.getElementById('statTotal').textContent = allData.length.toLocaleString('vi-VN');
    document.getElementById('statInStock').textContent = allData.filter(d => parseInt(getStock(d)) > 0).length.toLocaleString('vi-VN');
    document.getElementById('statOutStock').textContent = allData.filter(d => parseInt(getStock(d)) <= 0).length.toLocaleString('vi-VN');
    document.getElementById('statShelved').textContent = allData.filter(d => { const s = getShelf(d); return s && s !== '#N/A'; }).length.toLocaleString('vi-VN');
}

function applyFilter() {
    const q = normalize(searchInput.value);
    const stock = stockFilter.value;
    const shelf = shelfFilter.value;

    filtered = allData.filter(item => {
        const text = normalize(getName(item)) + ' ' + normalize(getSKU(item)) + ' ' + normalize(getShelf(item));
        if (q && !text.includes(q)) return false;

        const s = parseInt(getStock(item)) || 0;
        if (stock === 'in' && s <= 0) return false;
        if (stock === 'out' && s > 0) return false;
        if (stock === 'low' && (s <= 0 || s > 10)) return false;

        if (shelf !== 'all' && !getShelf(item).includes(shelf)) return false;
        return true;
    });

    if (sortCol) {
        filtered.sort((a, b) => {
            let av = getVal(a, KEY_FIELDS[sortCol] || [sortCol]), bv = getVal(b, KEY_FIELDS[sortCol] || [sortCol]);
            if (sortCol === 'stock') { av = parseInt(av) || 0; bv = parseInt(bv) || 0; }
            return sortDir === 'asc' ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
        });
    }

    currentPage = 1;
    resultBadge.textContent = `Tìm thấy ${filtered.length}`;
    renderPage();
}

// ============================================================
// PAGINATION & TABLE
// ============================================================
function renderPage() {
    const start = (currentPage - 1) * ROWS_PER_PAGE;
    const slice = filtered.slice(start, start + ROWS_PER_PAGE);

    tableBody.innerHTML = slice.length ? slice.map((item, i) => {
        const s = parseInt(getStock(item)) || 0;
        const img = getImg(item) || 'https://placehold.co/48x48/1e293b/4f46e5?text=?';
        return `<tr data-idx="${start + i}" style="--i: ${i}">
            <td style="text-align:center; opacity:0.5;">${start + i + 1}</td>
            <td class="td-img"><img src="${img}" onerror="this.src='https://placehold.co/48x48/1e293b/4f46e5?text=?'"></td>
            <td class="td-name">
                <div class="name-main">${highlight(getName(item), searchInput.value)}</div>
                <span class="name-sku">${highlight(getSKU(item), searchInput.value)}</span>
            </td>
            <td><span class="badge-stock ${s <= 0 ? 'out' : s <= 10 ? 'low' : 'in'}">${s <= 0 ? 'Hết hàng' : s <= 10 ? 'Tồn thấp' : 'Còn hàng'}</span></td>
            <td style="font-weight:700; color:var(--primary);">
                ${s}
                ${item._breakdown?.length > 1 ? `<span class="multi-lot-hint">${item._breakdown.length} lô</span>` : ''}
            </td>
            <td><span class="badge-shelf">${getShelf(item) || '—'}</span></td>
            <td class="td-unit">${getUnit(item) || '—'}</td>
        </tr>`;
    }).join('') : '<tr><td colspan="7" class="empty-state">Không tìm thấy kết quả</td></tr>';

    tableBody.querySelectorAll('tr[data-idx]').forEach(tr => tr.onclick = () => openModal(parseInt(tr.dataset.idx)));

    const pages = Math.ceil(filtered.length / ROWS_PER_PAGE);
    paginationWrap.style.display = pages > 1 ? 'flex' : 'none';
    if (pages > 1) {
        pageInfo.innerHTML = `Trang <b>${currentPage}</b> / ${pages}`;
        pageBtns.innerHTML = `<button class="page-btn" ${currentPage === 1 ? 'disabled' : ''} onclick="goPage(${currentPage - 1})"><i class='bx bx-chevron-left'></i></button>` +
            `<button class="page-btn active">${currentPage}</button>` +
            `<button class="page-btn" ${currentPage === pages ? 'disabled' : ''} onclick="goPage(${currentPage + 1})"><i class='bx bx-chevron-right'></i></button>`;
    }
}

function goPage(p) { currentPage = p; renderPage(); window.scrollTo(0, 0); }

function setupSort() {
    ['thName', 'thStock', 'thShelf'].forEach(id => {
        document.getElementById(id).onclick = (e) => {
            const col = e.currentTarget.dataset.col;
            sortDir = (sortCol === col && sortDir === 'asc') ? 'desc' : 'asc';
            sortCol = col;
            applyFilter();
        };
    });
}

function setControls(en) { [searchInput, stockFilter, shelfFilter].forEach(el => el.disabled = !en); }

// ============================================================
// MODAL LOGIC
// ============================================================
function openModal(idx) {
    const item = filtered[idx];
    if (!item) return;

    const s = parseInt(getStock(item)) || 0;
    const img = getImg(item) || 'https://placehold.co/72x72/1e293b/4f46e5?text=?';

    modalHeader.innerHTML = `
        <img class="modal-product-img" src="${img}" onerror="this.src='https://placehold.co/72x72/1e293b/4f46e5?text=?'">
        <div class="modal-title-wrap">
            <div class="modal-product-name">${escapeHTML(getName(item))}</div>
            <div class="modal-sku-row">
                <span class="modal-sku">${escapeHTML(getSKU(item)) || '—'}</span>
                <span class="badge-stock ${s <= 0 ? 'out' : s <= 10 ? 'low' : 'in'}">${s}</span>
            </div>
        </div>`;

    let otherHtml = '';
    const ignore = [...KEY_FIELDS.name, ...KEY_FIELDS.sku, ...KEY_FIELDS.img, ...KEY_FIELDS.stock, ...KEY_FIELDS.shelf];
    Object.entries(item).forEach(([k, v]) => {
        if (k.startsWith('_') || ignore.some(kw => k.toUpperCase().includes(kw.toUpperCase()))) return;
        otherHtml += `<div class="modal-field" style="background:rgba(0,0,0,0.2); padding:12px; border-radius:12px;">
            <div style="font-size:0.65rem; color:var(--text-dim); text-transform:uppercase; font-weight:700;">${k}</div>
            <div style="font-size:0.9rem;">${escapeHTML(v) || '—'}</div>
        </div>`;
    });

    let bHtml = '';
    if (item._breakdown?.length) {
        const cards = item._breakdown.map(b => {
            // Find expiry status
            const hsdField = b.lotDetails.find(p => matchesKeyField(p.label, ['HSD', 'HẠN', 'DATE', 'DATE_EXP']));
            const { status, label } = getExpiryInfo(hsdField?.value);

            return `
                <div class="lot-card ${status}">
                    <div class="expiry-pip"></div>
                    <div class="card-top">
                        <span class="loc-badge"><i class='bx bx-map-pin'></i> ${b.shelf}</span>
                        <span class="qty-badge">${b.stock} <small style="font-size:0.6rem; opacity:0.6;">TỒN</small></span>
                    </div>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                        ${b.lotDetails.map(p => `
                            <div class="lot-info-val">
                                <span class="label">${p.label}</span>
                                <span class="value">${p.value}</span>
                            </div>
                        `).join('')}
                    </div>
                    ${label ? `<span class="lot-status-tag status-${status}">${label}</span>` : ''}
                </div>
            `;
        }).join('');

        bHtml = `<div class="modal-section-title">Chi Tiết Lô & Vị Trí</div>
                 <div class="lot-grid">${cards}</div>`;
    }

    modalBody.innerHTML = `<div class="modal-key-fields" style="display:grid; grid-template-columns:repeat(2,1fr); gap:12px; margin-bottom:20px;">
        <div class="modal-key-card accent-blue"><div class="modal-key-label">Vị Trí</div><div class="modal-key-value">${getShelf(item) || '—'}</div></div>
        <div class="modal-key-card accent-green"><div class="modal-key-label">Tổng Tồn</div><div class="modal-key-value">${s}</div></div>
    </div>${bHtml}${otherHtml ? `<div class="modal-section-title">Thông Tin Khác</div><div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">${otherHtml}</div>` : ''}`;

    modalOverlay.classList.add('open');
    document.body.style.overflow = 'hidden';
}

function closeModal() { modalOverlay.classList.remove('open'); document.body.style.overflow = ''; }

modalCloseBtn.onclick = closeModal;
modalOverlay.onclick = (e) => { if (e.target === modalOverlay) closeModal(); };
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

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
stockFilter.onchange = applyFilter;
shelfFilter.onchange = applyFilter;
refreshBtn.onclick = () => { allData = []; filtered = []; fetchData(); };

function getExpiryInfo(dateStr) {
    if (!dateStr || dateStr === '—') return { status: 'fresh', label: null };

    // Simple parser for common formats (MM/YYYY or DD/MM/YYYY)
    const parts = dateStr.split(/[/-]/);
    let expDate;
    if (parts.length === 2) { // MM/YYYY
        expDate = new Date(parts[1], parts[0] - 1, 1);
    } else if (parts.length === 3) { // DD/MM/YYYY
        expDate = new Date(parts[2], parts[1] - 1, parts[0]);
    } else {
        return { status: 'fresh', label: null };
    }

    if (isNaN(expDate)) return { status: 'fresh', label: null };

    const now = new Date();
    const diffMonths = (expDate.getFullYear() - now.getFullYear()) * 12 + (expDate.getMonth() - now.getMonth());

    if (diffMonths < 0) return { status: 'critical', label: 'Hết hạn' };
    if (diffMonths <= 3) return { status: 'critical', label: 'Cận date (< 3 tháng)' };
    if (diffMonths <= 6) return { status: 'near', label: 'Sắp hết hạn' };
    return { status: 'fresh', label: 'Hạn dùng tốt' };
}

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
            const s = parseInt(getStock(item)) || 0;
            return {
                'Tên Sản Phẩm': getName(item),
                'Mã SKU': getSKU(item),
                'Tồn Kho': s,
                'Vị Trí Kệ': getShelf(item),
                'Quy Cách': getUnit(item),
                'Ghi Chú': item['Ghi chú'] || item['GHI CHÚ'] || ''
            };
        });

        const worksheet = XLSX.utils.json_to_sheet(exportMap);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Tồn Kho PA");
        
        const d = new Date();
        const dateStr = `${d.getFullYear()}${(d.getMonth() + 1).toString().padStart(2, '0')}${d.getDate().toString().padStart(2, '0')}`;
        XLSX.writeFile(workbook, `TonKho_PA_${dateStr}.xlsx`);
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
fetchData();
