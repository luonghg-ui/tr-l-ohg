// ============================================================
// CONFIGURATION: Google Sheets Data
// ============================================================
const SHEET_ID = '1Atqwv9UdG_Ro_CBbamctGENgf-ZiUl73NrQeOaQFbK4';
const GID_PROD = '2012066668'; // Dữ liệu đối soát

// GViz URLs
const GVIZ_PROD_URL    = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?gid=${GID_PROD}`;
// Sheet "Danh sách lỗi vi phạm" – chứa cột K: Số tiền phạt
const GVIZ_PENALTY_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?sheet=Danh%20s%C3%A1ch%20l%E1%BB%97i%20vi%20ph%E1%BA%A1m`;

// ============================================================
// STATE MANAGEMENT
// ============================================================
let productionData = [];
let penaltyData    = [];   // rows from Danh sách lỗi vi phạm
let vendorAggr = {};
let filteredData = [];
let currentPage = 1;
const ROWS_PER_PAGE = 30;
let _prodLoaded    = false;
let _penaltyLoaded = false;

// ============================================================
// KEYWORD MAPPING (Adopted from script-pa.js for robustness)
// ============================================================
const KEY_FIELDS = {
    name:    ['HỌ VÀ TÊN', 'HO VA TEN', 'TEN', 'NAME', 'TÊN', 'NHÂN VIÊN', 'NHAN VIEN'],
    msnv:    ['MÃ NV', 'MA NV', 'MSNV', 'EMPLOYEE ID', 'MÃ NHÂN VIÊN', 'ID'],
    dept:    ['BỘ PHẬN', 'BO PHAN', 'VỊ TRÍ', 'VI TRI', 'DEPARTMENT', 'VENDOR', 'BP', 'PHẬN'],
    shift:   ['CA LÀM', 'CA LAM', 'CA', 'SHIFT', 'KIP'],
    output:  ['SẢN LƯỢNG', 'SAN LUONG', 'QUANTITY', 'OUTPUT', 'SL', 'THỰC TẾ', 'THUC TE'],
    date:    ['NGÀY', 'NGAY', 'DATE', 'TIME'],
    penalty: ['SỐ TIỀN PHẠT', 'SO TIEN PHAT', 'SỐ TIỀN PH', 'PHAT', 'PENALTY', 'TIỀN PHẠT'],
    timeIn:  ['GIờ VÀO', 'GIO VAO', 'IN TIME', 'CHECK IN', 'VAO'],
    timeOut: ['GIờ RA', 'GIO RA', 'OUT TIME', 'CHECK OUT', 'RA'],
};

// ============================================================
// DOM ELEMENTS
// ============================================================
const vendorGrid = document.getElementById('vendorGrid');
const tableBody = document.getElementById('tableBody');
const searchInput = document.getElementById('searchInput');
const resultBadge = document.getElementById('resultBadge');
const refreshBtn = document.getElementById('refreshBtn');
const refreshCardsBtn = document.getElementById('refreshCardsBtn');
const statusBanner = document.getElementById('statusBanner');
const bannerInner = document.getElementById('bannerInner');
const modalOverlay = document.getElementById('modalOverlay');
const modalCloseBtn = document.getElementById('modalCloseBtn');
const reconcileDetailContent = document.getElementById('reconcileDetailContent');
const paginationWrap = document.getElementById('paginationWrap');
const pageInfo = document.getElementById('pageInfo');
const pageBtns = document.getElementById('pageBtns');

// ============================================================
// INITIALIZATION
// ============================================================
function init() {
    fetchData();
    setupEventListeners();
}

function setupEventListeners() {
    searchInput.addEventListener('input', () => {
        currentPage = 1; // Reset to page 1 on search
        applyFilter();
    });
    refreshBtn.addEventListener('click', fetchData);
    refreshCardsBtn.addEventListener('click', fetchData);
    modalCloseBtn.addEventListener('click', closeModal);
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) closeModal();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeModal();
    });
    
    const exportAllBtn = document.getElementById('exportAllBtn');
    if (exportAllBtn) {
        exportAllBtn.addEventListener('click', () => exportAllVendorData());
    }
}

// ============================================================
// DATA FETCHING (JSONP)
// ============================================================
function fetchData() {
    showLoading(true, 'Đang đồng bộ dữ liệu đối soát...');
    _prodLoaded    = false;
    _penaltyLoaded = false;

    // Clear old scripts if any
    const oldScripts = document.querySelectorAll('script[data-type="jsonp-gviz"]');
    oldScripts.forEach(s => s.remove());

    const ts = Date.now();

    // --- Sheet 1: Dữ liệu đối soát (sản lượng) ---
    const cbProd = 'gviz_prod_' + ts;
    window[cbProd] = function(json) {
        parseSheetRows(json, rows => { productionData = rows; });
        delete window[cbProd];
        _prodLoaded = true;
        tryFinalize();
    };
    appendScript(GVIZ_PROD_URL, cbProd);

    // --- Sheet 2: Danh sách lỗi vi phạm (số tiền phạt) ---
    const cbPenalty = 'gviz_penalty_' + ts;
    window[cbPenalty] = function(json) {
        parseSheetRows(json, rows => { penaltyData = rows; });
        delete window[cbPenalty];
        _penaltyLoaded = true;
        tryFinalize();
    };
    appendScript(GVIZ_PENALTY_URL, cbPenalty);
}

function appendScript(baseUrl, callbackName) {
    const script = document.createElement('script');
    script.setAttribute('data-type', 'jsonp-gviz');
    script.src = `${baseUrl}&tqx=out:json;responseHandler:${callbackName}`;
    document.body.appendChild(script);
}

function tryFinalize() {
    if (!_prodLoaded || !_penaltyLoaded) return; // wait for both
    try {
        aggregateData();
        applyFilter();
        renderVendorCards();
        showLoading(false);
    } catch(err) {
        console.error('Finalize error:', err);
        showLoading(false);
    }
}

function showLoading(isLoading, msg = '') {
    statusBanner.style.display = isLoading ? 'block' : 'none';
    if (isLoading) {
        bannerInner.innerHTML = `<i class='bx bx-loader-alt bx-spin'></i> <span>${msg}</span>`;
        refreshBtn.classList.add('bx-spin');
        refreshCardsBtn.querySelector('i').classList.add('bx-spin');
    } else {
        refreshBtn.classList.remove('bx-spin');
        refreshCardsBtn.querySelector('i').classList.remove('bx-spin');
    }
}

// ============================================================
// GViz DATE / TIME FORMATTER
// Gviz returns raw dates as strings like "Date(2026,3,1)" (date)
// or "Date(1899,11,30,17,0,0)" / "Date(2026,3,1,17,0,0)" (time/datetime)
// If cell.f (formatted) is available we prefer that; otherwise we
// parse the Date() string ourselves.
// ============================================================
function formatGvizValue(raw, fmt) {
    // Prefer the sheet's own formatted string
    if (fmt && fmt.trim() !== '') return fmt.trim();

    if (typeof raw === 'string' && raw.startsWith('Date(')) {
        const parts = raw.slice(5, -1).split(',').map(Number);
        if (parts.length >= 6) {
            // Has time component → return HH:MM
            const h = String(parts[3]).padStart(2, '0');
            const m = String(parts[4]).padStart(2, '0');
            return `${h}:${m}`;
        } else if (parts.length >= 3) {
            // Date only → DD/MM/YYYY (gviz months are 0-indexed)
            const y  = parts[0];
            const mo = String(parts[1] + 1).padStart(2, '0');
            const d  = String(parts[2]).padStart(2, '0');
            return `${d}/${mo}/${y}`;
        }
    }
    return raw !== null && raw !== undefined ? raw.toString().trim() : '';
}

/**
 * Parses gviz JSON response into an array of row objects.
 * Stores both formatted string (.header) and raw value (.header__raw).
 * @param {object} json - gviz JSON response
 * @param {function} onSuccess - callback(rows[])
 */
function parseSheetRows(json, onSuccess) {
    try {
        if (!json || !json.table) {
            console.warn('parseSheetRows: no table in response');
            onSuccess([]);
            return;
        }
        const headers = json.table.cols.map(c => (c && c.label) ? c.label.trim() : '');
        console.log('📋 Sheet Columns:', headers);

        const rows = (json.table.rows || []).map(r => {
            const item = {};
            r.c.forEach((cell, i) => {
                if (!headers[i]) return;
                const raw = cell ? cell.v : null;
                const fmt = cell ? (cell.f || '') : '';
                if (raw !== null && raw !== undefined && raw !== '') {
                    item[headers[i]]          = formatGvizValue(raw, fmt);
                    item[headers[i] + '__raw'] = raw;
                } else {
                    item[headers[i]]          = '';
                    item[headers[i] + '__raw'] = 0;
                }
            });
            return item;
        }).filter(item => Object.values(item).some(v => v !== '' && v !== null && v !== undefined));

        onSuccess(rows);
    } catch (err) {
        console.error('parseSheetRows error:', err);
        onSuccess([]);
    }
}

function matchesKeyField(colName, keywords) {
    return keywords.some(kw => colName.toUpperCase().includes(kw.toUpperCase()));
}

function getVal(item, fieldName) {
    const keywords = KEY_FIELDS[fieldName];
    if (!keywords) return '';
    const key = Object.keys(item).find(k => matchesKeyField(k, keywords));
    return key ? item[key] : '';
}

function normalizeVendor(raw) {
    const v = (raw || 'KHÁC').toString().toUpperCase().trim();
    if (v.includes('VIN') || v.includes('VIN-HR')) return 'VIN';
    if (v.includes('VIET') || v.includes('WROK') || v.includes('WORK')) return 'VIETWORK';
    if (v.includes('BPD')) return 'BPD';
    if (v === '' || v === '0') return 'KHÁC';
    return v;
}

function parseNumericValue(item, fieldName) {
    const rawKey = Object.keys(item).find(k => k.endsWith('__raw') && matchesKeyField(k.replace('__raw',''), KEY_FIELDS[fieldName]));
    if (rawKey) {
        const rawVal = item[rawKey];
        if (typeof rawVal === 'number' && !isNaN(rawVal)) return rawVal;
    }
    const val = getVal(item, fieldName);
    if (!val) return 0;
    // Strip everything except digits and decimal point
    return parseInt(val.toString().replace(/[^0-9]/g, '')) || 0;
}

function aggregateData() {
    vendorAggr = {};

    // ── Step 1: Aggregate sản lượng từ sheet Dữ liệu đối soát ──
    productionData.forEach(item => {
        const vendor = normalizeVendor(getVal(item, 'dept'));
        const shift  = (getVal(item, 'shift') || '').toUpperCase();
        const output = parseNumericValue(item, 'output');

        if (!vendorAggr[vendor]) {
            vendorAggr[vendor] = { skuCount: 0, ca1: 0, ca2: 0, ca3: 0, penalty: 0, details: [] };
        }

        vendorAggr[vendor].skuCount += output;

        if (shift.includes('1') || shift.includes('HC') || shift.includes('HÀNH CHÍNH')) {
            vendorAggr[vendor].ca1 += output;
        } else if (shift.includes('2')) {
            vendorAggr[vendor].ca2 += output;
        } else if (shift.includes('3') || shift.includes('ĐÊM') || shift.includes('DEM')) {
            vendorAggr[vendor].ca3 += output;
        }

        vendorAggr[vendor].details.push(item);
    });

    // ── Step 2: Aggregate số tiền phạt từ sheet Danh sách lỗi vi phạm ──
    console.log('📌 penaltyData rows:', penaltyData.length);
    penaltyData.forEach(item => {
        // "Vị trí" column holds the vendor/dept info in this sheet
        const vendor = normalizeVendor(getVal(item, 'dept'));

        const penaltyKey = Object.keys(item).find(k => !k.endsWith('__raw') && matchesKeyField(k, KEY_FIELDS.penalty));
        let penalty = 0;
        if (penaltyKey) {
            const rawVal = item[penaltyKey + '__raw'];
            if (typeof rawVal === 'number' && !isNaN(rawVal) && rawVal > 0) {
                penalty = rawVal;
            } else {
                penalty = parseFloat((item[penaltyKey] || '0').toString().replace(/[^0-9.]/g, '')) || 0;
            }
        }

        if (penalty <= 0) return; // skip rows with no penalty

        // Ensure vendor bucket exists (may not have production data)
        if (!vendorAggr[vendor]) {
            vendorAggr[vendor] = { skuCount: 0, ca1: 0, ca2: 0, ca3: 0, penalty: 0, details: [] };
        }
        vendorAggr[vendor].penalty += penalty;
    });

    // ── DEBUG & TRANSPARENCY ──
    console.log('📊 DATA SYNC SUMMARY:');
    console.log(` - Total Rows productionData: ${productionData.length}`);
    Object.entries(vendorAggr).forEach(([v, d]) => {
        console.log(` - [${v}] -> Rows: ${d.details.length}, Total Output: ${d.skuCount}, Penalty: ${d.penalty}`);
    });
    
    const unclassifiedRows = productionData.filter(item => normalizeVendor(getVal(item, 'dept')) === 'KHÁC');
    if (unclassifiedRows.length > 0) {
        console.warn(`⚠️ Warning: ${unclassifiedRows.length} rows were unclassified (KHÁC). Check your "Bộ phận" column keywords.`);
    }
}

// ============================================================
// RENDERING
// ============================================================
function renderVendorCards() {
    vendorGrid.innerHTML = '';
    const vendors = Object.keys(vendorAggr).sort();
    
    if (vendors.length === 0) {
        vendorGrid.innerHTML = '<div style="grid-column: 1/-1; text-align:center; padding: 40px; color: var(--text-dim);">Chưa có dữ liệu nhà cung cấp</div>';
        return;
    }

    vendors.forEach(vendor => {
        const data = vendorAggr[vendor];
        const card = document.createElement('div');
        card.className = 'vendor-card';
        card.innerHTML = `
            <div class="vendor-card-header">
                <div class="vendor-badge"><i class='bx bx-buildings'></i>VENDOR</div>
                <button class="btn-export-card" title="Xuất Excel ${vendor}">
                    <i class='bx bxs-file-export'></i> Xuất excel
                </button>
            </div>
            <div class="vendor-name">${vendor}</div>
            <div class="vendor-divider"></div>
            <div class="vendor-stats">
                <span class="vendor-stat-label">Tổng sản lượng</span>
                <div class="vendor-stat-value">${data.skuCount.toLocaleString('vi-VN')}</div>
            </div>
            <div class="hint-text"><i class='bx bx-mouse'></i> nhấn để xem chi tiết</div>
        `;
        
        // Cần tách event click của button và click của card
        card.querySelector('.btn-export-card').onclick = (e) => {
            e.stopPropagation();
            exportVendorData(vendor);
        };
        
        card.onclick = () => openVendorDetail(vendor);
        vendorGrid.appendChild(card);
    });
}

function openVendorDetail(vendor) {
    const data = vendorAggr[vendor];
    if (!data) return;

    const penaltyFormatted = data.penalty.toLocaleString('vi-VN') + ' ₫';

    reconcileDetailContent.innerHTML = `
        <div class="reconcile-modal-header">
            <div class="reconcile-modal-vendor-badge"><i class='bx bx-buildings'></i>${vendor}</div>
            <h3 class="reconcile-detail-title">Chi tiết đối soát</h3>
            <div class="reconcile-detail-subtitle">Tổng hợp sản lượng &amp; phạt</div>
        </div>
        <div class="modal-separator"></div>

        <div class="reconcile-item clickable" style="--item-accent: #FCD34D;" onclick="showShiftDetail('${vendor}', 'ca1')">
            <div class="reconcile-icon day"><i class='bx bxs-sun'></i></div>
            <div class="reconcile-info">
                <div class="reconcile-label">Ca 1</div>
                <div class="reconcile-sub">CA 1 &nbsp;·&nbsp; HC &nbsp;·&nbsp; HÀNH CHÍNH</div>
            </div>
            <div class="reconcile-value day-val">${data.ca1.toLocaleString('vi-VN')}</div>
            <i class='bx bx-chevron-right reconcile-chevron'></i>
        </div>

        <div class="reconcile-item clickable" style="--item-accent: #F59E0B;" onclick="showShiftDetail('${vendor}', 'ca2')">
            <div class="reconcile-icon" style="background: rgba(245,158,11,0.1); color: #F59E0B;"><i class='bx bxs-brightness-half'></i></div>
            <div class="reconcile-info">
                <div class="reconcile-label">Ca 2</div>
                <div class="reconcile-sub">CA 2</div>
            </div>
            <div class="reconcile-value" style="color: #F59E0B;">${data.ca2.toLocaleString('vi-VN')}</div>
            <i class='bx bx-chevron-right reconcile-chevron'></i>
        </div>

        <div class="reconcile-item clickable" style="--item-accent: #818CF8;" onclick="showShiftDetail('${vendor}', 'ca3')">
            <div class="reconcile-icon night"><i class='bx bxs-moon'></i></div>
            <div class="reconcile-info">
                <div class="reconcile-label">Ca 3</div>
                <div class="reconcile-sub">CA 3 &nbsp;·&nbsp; CA ĐÊM</div>
            </div>
            <div class="reconcile-value night-val">${data.ca3.toLocaleString('vi-VN')}</div>
            <i class='bx bx-chevron-right reconcile-chevron'></i>
        </div>

        <div class="reconcile-item" style="--item-accent: #F87171;">
            <div class="reconcile-icon money"><i class='bx bx-money-withdraw'></i></div>
            <div class="reconcile-info">
                <div class="reconcile-label">Số tiền phạt</div>
                <div class="reconcile-sub">VI PHẠM &amp; THIếu HỤT</div>
            </div>
            <div class="reconcile-value penalty">${penaltyFormatted}</div>
        </div>
    `;

    document.querySelector('.modal-box').classList.remove('drill-mode');
    modalOverlay.classList.add('active');
}

function closeModal() {
    modalOverlay.classList.remove('active');
    document.querySelector('.modal-box').classList.remove('drill-mode');
}

// ============================================================
// DRILL-DOWN: Shift Employee Detail
// ============================================================
function showShiftDetail(vendor, shiftType) {
    let shiftLabel = 'Ca 1';
    let shiftIconCls = 'day';
    let shiftBxIcon = 'bxs-sun';
    let shiftColor = '#FCD34D';
    let shiftSub = 'CA 1 · HC';

    if (shiftType === 'ca2') {
        shiftLabel = 'Ca 2';
        shiftIconCls = 'day';
        shiftBxIcon = 'bxs-brightness-half';
        shiftColor = '#F59E0B';
        shiftSub = 'CA 2';
    } else if (shiftType === 'ca3') {
        shiftLabel = 'Ca 3';
        shiftIconCls = 'night';
        shiftBxIcon = 'bxs-moon';
        shiftColor = '#818CF8';
        shiftSub = 'CA 3 · CA ĐÊM';
    }

    const employees = productionData.filter(item => {
        if (normalizeVendor(getVal(item, 'dept')) !== vendor) return false;
        const s = (getVal(item, 'shift') || '').toUpperCase();
        if (shiftType === 'ca1') return s.includes('1') || s.includes('HC') || s.includes('HÀNH CHÍNH');
        if (shiftType === 'ca2') return s.includes('2');
        if (shiftType === 'ca3') return s.includes('3') || s.includes('ĐÊM') || s.includes('DEM');
        return false;
    });

    const hasTimeIn  = employees.some(i => getVal(i, 'timeIn'));
    const hasTimeOut = employees.some(i => getVal(i, 'timeOut'));

    // Tính tổng sản lượng
    const totalOutput = employees.reduce((sum, item) => {
        return sum + parseNumericValue(item, 'output');
    }, 0);

    const theadExtra = `
        ${hasTimeIn  ? '<th>Giờ vào</th>' : ''}
        ${hasTimeOut ? '<th>Giờ ra</th>'  : ''}
    `;

    const rows = employees.map(item => {
        const tIn  = hasTimeIn  ? `<td style="color:var(--text-muted);">${getVal(item, 'timeIn')  || '—'}</td>` : '';
        const tOut = hasTimeOut ? `<td style="color:var(--text-muted);">${getVal(item, 'timeOut') || '—'}</td>` : '';
        return `<tr>
            <td style="font-size:0.78rem; color:var(--text-dim);">${getVal(item, 'date') || '—'}</td>
            <td style="font-weight:700; color:#fff;">${getVal(item, 'name') || '—'}</td>
            <td><span class="product-sku">${getVal(item, 'msnv') || '—'}</span></td>
            <td><span class="badge-shelf" style="background:rgba(255,255,255,0.05); color:#fff;">${getVal(item, 'shift') || '—'}</span></td>
            ${tIn}${tOut}
            <td style="font-weight:800; color:${shiftColor}; font-size:1rem;">${getVal(item, 'output') || '0'}</td>
        </tr>`;
    }).join('') || `<tr><td colspan="7" style="text-align:center; padding:40px; color:var(--text-dim);">Không có dữ liệu</td></tr>`;

    reconcileDetailContent.innerHTML = `
        <div class="drill-header">
            <button class="modal-back-btn" onclick="openVendorDetail('${vendor}')">
                <i class='bx bx-arrow-back'></i> Quay lại
            </button>
            <div class="drill-title-wrap">
                <div class="reconcile-icon ${shiftIconCls}" style="margin:0 auto 10px; width:48px; height:48px;">
                    <i class='bx ${shiftBxIcon}'></i>
                </div>
                <div class="drill-title-row">
                    <span class="drill-title">${shiftLabel}</span>
                    <span class="drill-total-badge" style="color:${shiftColor};">
                        Tổng sl: <b>${totalOutput.toLocaleString('vi-VN')}</b>
                    </span>
                </div>
                <div class="drill-sub">${shiftSub} &nbsp;·&nbsp; <b style="color:#fff;">${employees.length}</b> nhân viên</div>
            </div>
        </div>
        <div class="drill-table-wrap">
            <table class="drill-table">
                <thead>
                    <tr>
                        <th>Ngày</th>
                        <th>Họ và tên</th>
                        <th>Mã NV</th>
                        <th>Ca làm</th>
                        ${theadExtra}
                        <th>Sản lượng</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
    `;
    document.querySelector('.modal-box').classList.add('drill-mode');
}

window.showShiftDetail   = showShiftDetail;
window.openVendorDetail  = openVendorDetail;

// ============================================================
// TABLE & FILTERS
// ============================================================
function applyFilter() {
    const query = normalize(searchInput.value);
    filteredData = productionData.filter(item => {
        const name = normalize(getVal(item, 'name'));
        const msnv = normalize(getVal(item, 'msnv'));
        return name.includes(query) || msnv.includes(query);
    });

    resultBadge.textContent = `Tìm thấy ${filteredData.length} nhân viên`;
    renderTable();
}

function renderTable() {
    const totalPages = Math.ceil(filteredData.length / ROWS_PER_PAGE);
    const start = (currentPage - 1) * ROWS_PER_PAGE;
    const end = start + ROWS_PER_PAGE;
    const slice = filteredData.slice(start, end);

    tableBody.innerHTML = slice.map(item => `
        <tr>
            <td style="font-size: 0.8rem; color: var(--text-dim);">${getVal(item, 'date')}</td>
            <td style="font-weight:700; color:#fff;">${getVal(item, 'name')}</td>
            <td><span class="product-sku">${getVal(item, 'msnv')}</span></td>
            <td style="font-weight: 500;">${getVal(item, 'dept')}</td>
            <td><span class="badge-shelf" style="background: rgba(255,255,255,0.05); color: #fff;">${getVal(item, 'shift')}</span></td>
            <td style="font-weight:800; color:var(--primary); font-size: 1.1rem;">${getVal(item, 'output')}</td>
        </tr>
    `).join('') || '<tr><td colspan="6" style="padding:100px; text-align:center; color: var(--text-dim);">Không có dữ liệu phù hợp</td></tr>';

    // Pagination UI
    paginationWrap.style.display = totalPages > 1 ? 'flex' : 'none';
    if (totalPages > 1) {
        pageInfo.innerHTML = `Trang <b>${currentPage}</b> / ${totalPages}`;
        pageBtns.innerHTML = `
            <button class="page-btn" ${currentPage === 1 ? 'disabled' : ''} onclick="changePage(${currentPage - 1})"><i class='bx bx-chevron-left'></i></button>
            <button class="page-btn active">${currentPage}</button>
            <button class="page-btn" ${currentPage === totalPages ? 'disabled' : ''} onclick="changePage(${currentPage + 1})"><i class='bx bx-chevron-right'></i></button>
        `;
    }
}

function changePage(page) {
    currentPage = page;
    renderTable();
    window.scrollTo({ top: vendorGrid.offsetTop - 100, behavior: 'smooth' });
}

function normalize(str) {
    if (!str) return '';
    return str.toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').trim();
}

// Export changePage for onclick
window.changePage = changePage;

// ============================================================
// EXCEL EXPORT LOGIC (SheetJS)
// ============================================================
function exportAllVendorData() {
    if (!productionData || productionData.length === 0) {
        alert("Không có dữ liệu để xuất!");
        return;
    }

    // Calculate Summary for All Vendors
    let ca1Total = 0;
    let ca2Total = 0;
    let ca3Total = 0;
    let totalPenalty = 0;

    Object.values(vendorAggr).forEach(v => {
        ca1Total     += v.ca1;
        ca2Total     += v.ca2;
        ca3Total     += v.ca3;
        totalPenalty += v.penalty;
    });

    const summaryData = {
        ca1: ca1Total,
        ca2: ca2Total,
        ca3: ca3Total,
        totalSku: ca1Total + ca2Total + ca3Total,
        penalty: totalPenalty
    };

    exportToExcel(productionData, `Tong_San_Luong_Vender_${getTodayStr()}.xlsx`, summaryData);
}

function exportVendorData(vendor) {
    const dataRows = productionData.filter(item => normalizeVendor(getVal(item, 'dept')) === vendor);
    if (dataRows.length === 0) {
        alert(`Không có dữ liệu cho vender ${vendor}!`);
        return;
    }

    // Get Summary for specific vendor
    const vAggr = vendorAggr[vendor] || { ca1: 0, ca2: 0, ca3: 0, penalty: 0, skuCount: 0 };
    const summaryData = {
        ca1: vAggr.ca1,
        ca2: vAggr.ca2,
        ca3: vAggr.ca3,
        totalSku: vAggr.skuCount,
        penalty: vAggr.penalty
    };

    exportToExcel(dataRows, `San_Luong_${vendor}_${getTodayStr()}.xlsx`, summaryData);
}

/**
 * Prepares and downloads a multi-sheet Excel file using ExcelJS for styling.
 */
async function exportToExcel(rows, fileName, summary) {
    try {
        const workbook = new ExcelJS.Workbook();
        
        // ─── HELPER STYLES ───────────────────────────────────────
        const blueHeader = {
            fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } },
            font: { name: 'Arial', bold: true, size: 11, color: { argb: 'FFFFFFFF' } },
            alignment: { vertical: 'middle', horizontal: 'center', wrapText: true },
            border: {
                top: { style: 'thin', color: { argb: 'FF000000' } },
                left: { style: 'thin', color: { argb: 'FF000000' } },
                bottom: { style: 'thin', color: { argb: 'FF000000' } },
                right: { style: 'thin', color: { argb: 'FF000000' } }
            }
        };

        const lightBlueFill = {
            fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB8CCE4' } },
            font: { name: 'Arial', bold: false, size: 11 },
            border: {
                top: { style: 'thin', color: { argb: 'FF000000' } },
                left: { style: 'thin', color: { argb: 'FF000000' } },
                bottom: { style: 'thin', color: { argb: 'FF000000' } },
                right: { style: 'thin', color: { argb: 'FF000000' } }
            }
        };

        const normalCell = {
            font: { name: 'Arial', size: 11 },
            border: {
                top: { style: 'thin', color: { argb: 'FF000000' } },
                left: { style: 'thin', color: { argb: 'FF000000' } },
                bottom: { style: 'thin', color: { argb: 'FF000000' } },
                right: { style: 'thin', color: { argb: 'FF000000' } }
            }
        };

        function applyStyle(cell, styleObj) {
            if (styleObj.fill)      cell.fill = styleObj.fill;
            if (styleObj.font)      cell.font = styleObj.font;
            if (styleObj.alignment) cell.alignment = styleObj.alignment;
            if (styleObj.border)    cell.border = styleObj.border;
        }

        // ─── SHEET 1: TỔNG SỐ SKU ────────────────────────────────
        const summarySheet = workbook.addWorksheet('Tổng số sku', {
            views: [{ showGridLines: false }]
        });
        summarySheet.columns = [
            { width: 10 }, // A (STT)
            { width: 40 }, // B (NỘI DUNG)
            { width: 20 }  // C (SỐ LƯỢNG)
        ];

        // Row 1: blank
        summarySheet.getRow(1).height = 10;

        // Row 2: Header
        const hRow = summarySheet.getRow(2);
        hRow.height = 30;
        hRow.values = ['STT', 'NỘI DUNG', 'SỐ LƯỢNG'];
        hRow.eachCell({ includeEmpty: true }, cell => applyStyle(cell, blueHeader));

        // Row 3: Ca ngày
        const r3 = summarySheet.getRow(3);
        r3.height = 25;
        r3.values = [1, 'PICK CA 1 ,2,HC', summary.day || 0];
        r3.eachCell({ includeEmpty: true }, (cell, col) => {
            applyStyle(cell, normalCell);
            cell.alignment = { vertical: 'middle', horizontal: col === 1 ? 'center' : col === 2 ? 'left' : 'right' };
        });

        // Row 3: Ca 1
        const r3 = summarySheet.getRow(3);
        r3.height = 25;
        r3.values = [1, 'PICK CA 1 ,HC', summary.ca1 || 0];
        r3.eachCell({ includeEmpty: true }, (cell, col) => {
            applyStyle(cell, normalCell);
            cell.alignment = { vertical: 'middle', horizontal: col === 1 ? 'center' : col === 2 ? 'left' : 'right' };
        });

        // Row 4: Ca 2
        const r4 = summarySheet.getRow(4);
        r4.height = 25;
        r4.values = [2, 'PICK CA 2', summary.ca2 || 0];
        r4.eachCell({ includeEmpty: true }, (cell, col) => {
            applyStyle(cell, normalCell);
            cell.alignment = { vertical: 'middle', horizontal: col === 1 ? 'center' : col === 2 ? 'left' : 'right' };
        });

        // Row 5: Ca 3
        const r5 = summarySheet.getRow(5);
        r5.height = 25;
        r5.values = [3, 'PICK CA 3 ,ĐÊM', summary.ca3 || 0];
        r5.eachCell({ includeEmpty: true }, (cell, col) => {
            applyStyle(cell, normalCell);
            cell.alignment = { vertical: 'middle', horizontal: col === 1 ? 'center' : col === 2 ? 'left' : 'right' };
        });

        // Row 6: TỔNG SKU PICK (light blue)
        const r6 = summarySheet.getRow(6);
        r6.height = 25;
        r6.values = ['', 'TỔNG SKU PICK', summary.totalSku || 0];
        r6.eachCell({ includeEmpty: true }, (cell, col) => {
            applyStyle(cell, lightBlueFill);
            cell.alignment = { vertical: 'middle', horizontal: col === 2 ? 'left' : (col === 3 ? 'right' : 'center') };
        });

        // Row 7: TỔNG SỐ TIỀN PHẠT
        const r7 = summarySheet.getRow(7);
        r7.height = 25;
        r7.values = ['', 'TỔNG SỐ TIỀN PHẠT', summary.penalty || 0];
        r7.eachCell({ includeEmpty: true }, (cell, col) => {
            applyStyle(cell, normalCell);
            cell.alignment = { vertical: 'middle', horizontal: col === 2 ? 'left' : (col === 3 ? 'right' : 'center') };
            if (col === 3) cell.numFmt = '#,##0';
        });

        // ─── SHEET 2: CHI TIẾT ───────────────────────────────────
        const detailSheet = workbook.addWorksheet('Chi tiết');
        detailSheet.columns = [
            { header: 'Ngày',              key: 'date',    width: 15 },
            { header: 'Mã NV',             key: 'msnv',    width: 25 },
            { header: 'Họ tên',            key: 'name',    width: 30 },
            { header: 'Bộ phận',           key: 'dept',    width: 15 },
            { header: 'Ca làm',            key: 'shift',   width: 15 },
            { header: 'Giờ vào',           key: 'timeIn',  width: 12 },
            { header: 'Giờ ra',            key: 'timeOut', width: 12 },
            { header: 'Sản lượng thực tế', key: 'output',  width: 20 }
        ];

        // Style header row
        const detailHeader = detailSheet.getRow(1);
        detailHeader.height = 30;
        detailHeader.eachCell({ includeEmpty: true }, cell => applyStyle(cell, blueHeader));

        // Add data rows
        rows.forEach(item => {
            const row = detailSheet.addRow({
                date:    getVal(item, 'date'),
                msnv:    getVal(item, 'msnv'),
                name:    getVal(item, 'name'),
                dept:    getVal(item, 'dept'),
                shift:   getVal(item, 'shift'),
                timeIn:  getVal(item, 'timeIn'),
                timeOut: getVal(item, 'timeOut'),
                output:  parseNumericValue(item, 'output')
            });
            row.height = 20;
            row.eachCell({ includeEmpty: true }, (cell, col) => {
                applyStyle(cell, normalCell);
                // col: 1=Ngày, 2=MãNV, 3=Tên, 4=BộPhận, 5=Ca, 6=GiờVào, 7=GiờRa, 8=SảnLượng
                const center = [1, 4, 5, 6, 7];
                const right  = [8];
                cell.alignment = {
                    vertical: 'middle',
                    horizontal: right.includes(col) ? 'right' : center.includes(col) ? 'center' : 'left'
                };
            });
        });

        // Auto-filter and freeze header
        detailSheet.autoFilter = 'A1:H1';
        detailSheet.views = [{ state: 'frozen', ySplit: 1 }];

        // Write and download
        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        saveAs(blob, fileName);

    } catch (err) {
        console.error("Export error:", err);
        alert("Lỗi khi xuất file Excel! Xem console để biết chi tiết.");
    }
}

function getTodayStr() {
    const d = new Date();
    return `${d.getFullYear()}${(d.getMonth() + 1).toString().padStart(2, '0')}${d.getDate().toString().padStart(2, '0')}`;
}

// Export functions for global access
window.exportAllVendorData = exportAllVendorData;
window.exportVendorData = exportVendorData;

// Start
init();
