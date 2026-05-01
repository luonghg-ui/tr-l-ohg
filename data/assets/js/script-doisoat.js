// ============================================================
// CONFIGURATION: Google Sheets Data
// ============================================================
const SHEET_ID = '1Atqwv9UdG_Ro_CBbamctGENgf-ZiUl73NrQeOaQFbK4';
const GID_PROD = '2012066668'; // Dữ liệu đối soát

// GViz URLs
const GVIZ_PROD_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?gid=${GID_PROD}`;
// Sheet "Danh sách lỗi vi phạm" – chứa cột K: Số tiền phạt
const GVIZ_PENALTY_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?sheet=Danh%20s%C3%A1ch%20l%E1%BB%97i%20vi%20ph%E1%BA%A1m`;

// ============================================================
// STATE MANAGEMENT
// ============================================================
let productionData = [];
let penaltyData = [];   // rows from Danh sách lỗi vi phạm
let vendorAggr = {};
let filteredData = [];
let currentPage = 1;
const ROWS_PER_PAGE = 30;
let _prodLoaded = false;
let _penaltyLoaded = false;

// ============================================================
// KEYWORD MAPPING (Adopted from script-pa.js for robustness)
// ============================================================
const KEY_FIELDS = {
    name: ['HO VA TEN', 'HO TEN', 'TEN', 'NAME', 'NHAN VIEN'],
    msnv: ['MA NV', 'MSNV', 'EMPLOYEE ID', 'MA NHAN VIEN', 'ID'],
    dept: ['BO PHAN', 'VI TRI', 'DEPARTMENT', 'VENDOR', 'BP', 'PHAN'],
    shift: ['CA LAM', 'CA', 'SHIFT', 'KIP'],
    output: ['SAN LUONG', 'QUANTITY', 'OUTPUT', 'THUC TE'],
    date: ['NGAY', 'DATE', 'TIME'],
    penalty: ['SO TIEN PHAT', 'SO TIEN PH', 'PHAT', 'PENALTY', 'TIEN PHAT'],
    timeIn: ['GIO VAO', 'IN TIME', 'CHECK IN', 'VAO'],
    timeOut: ['GIO RA', 'OUT TIME', 'CHECK OUT'],
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
    _prodLoaded = false;
    _penaltyLoaded = false;
    productionData = []; // Clear previous data

    // Clear old scripts if any
    const oldScripts = document.querySelectorAll('script[data-type="jsonp-gviz"]');
    oldScripts.forEach(s => s.remove());

    const ts = Date.now();

    // Define all potential production data sources
    const prodSources = [
        GVIZ_PROD_URL,
        `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?sheet=VIETWORK`,
        `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?sheet=BPD`,
        `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?sheet=VIN`
    ];

    let sourcesLoaded = 0;

    prodSources.forEach((url, index) => {
        const cbProd = 'gviz_prod_' + index + '_' + ts;
        window[cbProd] = function (json) {
            console.log(`📦 Received Production Data from source ${index}`);
            parseSheetRows(json, rows => {
                // Merge rows, avoiding duplicates based on name + date + output
                rows.forEach(newRow => {
                    const isDup = productionData.some(existing =>
                        getVal(existing, 'name') === getVal(newRow, 'name') &&
                        getVal(existing, 'msnv') === getVal(newRow, 'msnv') &&
                        getVal(existing, 'date') === getVal(newRow, 'date') &&
                        getVal(existing, 'output') === getVal(newRow, 'output') &&
                        getVal(existing, 'shift') === getVal(newRow, 'shift')
                    );
                    if (!isDup) productionData.push(newRow);
                });
            });
            delete window[cbProd];
            sourcesLoaded++;
            if (sourcesLoaded === prodSources.length) {
                _prodLoaded = true;
                tryFinalize();
            }
        };
        appendScript(url, cbProd);
    });

    // --- Sheet 2: Danh sách lỗi vi phạm (số tiền phạt) ---
    const cbPenalty = 'gviz_penalty_' + ts;
    window[cbPenalty] = function (json) {
        console.log('📦 Received Penalty Data');
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
    if (!_prodLoaded || !_penaltyLoaded) {
        console.log(`⏳ Waiting for sheets: Prod=${_prodLoaded}, Penalty=${_penaltyLoaded}`);
        return;
    }
    try {
        console.log('🚀 Finalizing data aggregation...');
        aggregateData();
        applyFilter();
        renderVendorCards();
        showLoading(false);
        console.log('✅ Dashboard ready.');
    } catch (err) {
        console.error('❌ Finalize error:', err);
        showLoading(false);
        // Fallback render to hide skeletons
        if (vendorGrid) vendorGrid.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding: 40px; color: #f87171;">Lỗi xử lý dữ liệu: ${err.message}</div>`;
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
            const y = parts[0];
            const mo = String(parts[1] + 1).padStart(2, '0');
            const d = String(parts[2]).padStart(2, '0');
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
                    item[headers[i]] = formatGvizValue(raw, fmt);
                    item[headers[i] + '__raw'] = raw;
                } else {
                    item[headers[i]] = '';
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

/**
 * Strip Vietnamese diacritics + uppercase for robust column matching.
 * e.g. "Sản lượng" → "SAN LUONG", "Họ và tên" → "HO VA TEN"
 */
function normKey(str) {
    if (!str) return '';
    return str.toString()
        .toUpperCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[ĐĐ]/gi, 'D')
        .trim();
}

function matchesKeyField(colName, keywords) {
    const col = normKey(colName);
    return keywords.some(kw => col.includes(normKey(kw)));
}

function getVal(item, fieldName) {
    const keywords = KEY_FIELDS[fieldName];
    if (!keywords) return '';
    // Prefer shortest matching column (avoids "Sản lượng thực" over "Sản lượng")
    const matches = Object.keys(item).filter(k => !k.endsWith('__raw') && matchesKeyField(k, keywords));
    if (matches.length === 0) return '';
    matches.sort((a, b) => a.length - b.length);
    return item[matches[0]] ?? '';
}

function normalizeVendor(raw, item = {}) {
    let v = (raw || '').toString().toUpperCase().trim();
    
    // Nếu rỗng hoặc là 'KHÁC', thử tra cứu từ cột Mã NV (MSNV)
    if (!v || v === 'KHÁC' || v === '0') {
        const msnv = (getVal(item, 'msnv') || '').toString().toUpperCase().trim();
        if (msnv.includes('VIN')) v = 'VIN';
        else if (msnv.includes('VIET') || msnv.includes('WORK') || msnv.includes('WROK')) v = 'VIETWORK';
        else if (msnv.includes('BPD')) v = 'BPD';
    }

    if (v.includes('VIN') || v.includes('VIN-HR')) return 'VIN';
    if (v.includes('VIET') || v.includes('WROK') || v.includes('WORK')) return 'VIETWORK';
    if (v.includes('BPD')) return 'BPD';
    
    return v || 'KHÁC';
}

function parseNumericValue(item, fieldName) {
    if (!item) return 0;
    const keywords = KEY_FIELDS[fieldName];
    if (!keywords) return 0;

    // Prefer shortest matching raw column (avoids ambiguous columns like "Sản lượng thực")
    const rawMatches = Object.keys(item).filter(k =>
        k.endsWith('__raw') && matchesKeyField(k.replace('__raw', ''), keywords)
    );
    if (rawMatches.length > 0) {
        rawMatches.sort((a, b) => a.length - b.length);
        const rawKey = rawMatches[0];
        const rawVal = item[rawKey];
        if (typeof rawVal === 'number' && !isNaN(rawVal)) return rawVal;
    }
    const val = getVal(item, fieldName);
    if (!val || val === '') return 0;
    const cleaned = val.toString().replace(/[^0-9]/g, '');
    return cleaned ? parseInt(cleaned) : 0;
}

function aggregateData() {
    vendorAggr = {};

    // ── DEBUG: In ra cột nào đang được match cho row đầu tiên ──
    if (productionData.length > 0) {
        const sample = productionData[0];
        const allCols = Object.keys(sample).filter(k => !k.endsWith('__raw'));
        console.log('📋 Tất cả cột trong sheet:', allCols);
        ['name', 'msnv', 'dept', 'shift', 'output', 'date'].forEach(field => {
            const keywords = KEY_FIELDS[field];
            const matches = allCols.filter(k => matchesKeyField(k, keywords));
            matches.sort((a, b) => a.length - b.length);
            console.log(`🔑 [${field}] → Cột khớp: [${matches.join(', ')}] → Dùng: "${matches[0] || 'KHÔNG TÌM THẤY'}" = "${sample[matches[0]] ?? ''}"`);
        });
    }

    // ── Step 1: Aggregate sản lượng từ sheet Dữ liệu đối soát ──
    productionData.forEach(item => {

        const vendor = normalizeVendor(getVal(item, 'dept'), item);
        const shift = (getVal(item, 'shift') || '').toUpperCase();
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
        const vendor = normalizeVendor(getVal(item, 'dept'), item);

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

    const unclassifiedRows = productionData.filter(item => normalizeVendor(getVal(item, 'dept'), item) === 'KHÁC');
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

    const caNgay = data.ca1 + data.ca2;
    const caDem = data.ca3;
    const tongSanLuong = data.skuCount;
    const penaltyFormatted = data.penalty.toLocaleString('vi-VN') + ' đ';

    reconcileDetailContent.innerHTML = `
        <div class="reconcile-modal-header">
            <div class="reconcile-modal-vendor-badge"><i class='bx bx-buildings'></i>${vendor}</div>
            <h3 class="reconcile-detail-title">Chi tiết đối soát</h3>
            <div class="reconcile-detail-subtitle">Tổng hợp sản lượng &amp; phạt</div>
        </div>

        <div class="reconcile-total-stat">
            <div class="reconcile-total-label"><i class='bx bx-bar-chart-alt-2'></i>TỔNG SẢN LƯỢNG</div>
            <div class="reconcile-total-value">${tongSanLuong.toLocaleString('vi-VN')}</div>
        </div>

        <div class="modal-separator"></div>

        <div class="reconcile-item clickable" style="--item-accent: #FCD34D;" onclick="showShiftDetail('${vendor}', 'cangay')">
            <div class="reconcile-icon day"><i class='bx bxs-sun'></i></div>
            <div class="reconcile-info">
                <div class="reconcile-label">Ca ngày</div>
                <div class="reconcile-sub">CA 1 &nbsp;·&nbsp; HC &nbsp;·&nbsp; CA 2</div>
            </div>
            <div class="reconcile-value day-val">${caNgay.toLocaleString('vi-VN')}</div>
            <i class='bx bx-chevron-right reconcile-chevron'></i>
        </div>

        <div class="reconcile-item clickable" style="--item-accent: #818CF8;" onclick="showShiftDetail('${vendor}', 'cadem')">
            <div class="reconcile-icon night"><i class='bx bxs-moon'></i></div>
            <div class="reconcile-info">
                <div class="reconcile-label">Ca đêm</div>
                <div class="reconcile-sub">CA 3 &nbsp;·&nbsp; CA ĐÊM</div>
            </div>
            <div class="reconcile-value night-val">${caDem.toLocaleString('vi-VN')}</div>
            <i class='bx bx-chevron-right reconcile-chevron'></i>
        </div>

        <div class="reconcile-item" style="--item-accent: #F87171;">
            <div class="reconcile-icon money"><i class='bx bx-money-withdraw'></i></div>
            <div class="reconcile-info">
                <div class="reconcile-label">Số tiền phạt</div>
                <div class="reconcile-sub">VI PHẠM &amp; THIẾU HỤT</div>
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
    let shiftLabel = 'Ca ngày';
    let shiftIconCls = 'day';
    let shiftBxIcon = 'bxs-sun';
    let shiftColor = '#FCD34D';
    let shiftSub = 'CA 1 · HC · CA 2';

    if (shiftType === 'cadem') {
        shiftLabel = 'Ca đêm';
        shiftIconCls = 'night';
        shiftBxIcon = 'bxs-moon';
        shiftColor = '#818CF8';
        shiftSub = 'CA 3 · CA ĐÊM';
    }

    const employees = productionData.filter(item => {
        if (normalizeVendor(getVal(item, 'dept'), item) !== vendor) return false;
        const s = (getVal(item, 'shift') || '').toUpperCase();
        if (shiftType === 'cangay') return s.includes('1') || s.includes('HC') || s.includes('HÀNH CHÍNH') || s.includes('2');
        if (shiftType === 'cadem') return s.includes('3') || s.includes('ĐÊM') || s.includes('DEM');
        return false;
    });

    const hasTimeIn = employees.some(i => getVal(i, 'timeIn'));
    const hasTimeOut = employees.some(i => getVal(i, 'timeOut'));

    // Tính tổng sản lượng
    const totalOutput = employees.reduce((sum, item) => {
        return sum + parseNumericValue(item, 'output');
    }, 0);

    const theadExtra = `
        ${hasTimeIn ? '<th>Giờ vào</th>' : ''}
        ${hasTimeOut ? '<th>Giờ ra</th>' : ''}
    `;

    const rows = employees.map(item => {
        const tIn = hasTimeIn ? `<td style="color:var(--text-muted);">${getVal(item, 'timeIn') || '—'}</td>` : '';
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

window.showShiftDetail = showShiftDetail;
window.openVendorDetail = openVendorDetail;

// ============================================================
// TABLE & FILTERS
// ============================================================
function applyFilter() {
    const query = normalize(searchInput.value);
    filteredData = productionData.filter(item => {
        const name = normalize(getVal(item, 'name'));
        const msnv = normalize(getVal(item, 'msnv'));
        const dept = normalize(normalizeVendor(getVal(item, 'dept'), item));
        return name.includes(query) || msnv.includes(query) || dept.includes(query);
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
        ca1Total += v.ca1;
        ca2Total += v.ca2;
        ca3Total += v.ca3;
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
    const dataRows = productionData.filter(item => normalizeVendor(getVal(item, 'dept'), item) === vendor);
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
            if (styleObj.fill) cell.fill = styleObj.fill;
            if (styleObj.font) cell.font = styleObj.font;
            if (styleObj.alignment) cell.alignment = styleObj.alignment;
            if (styleObj.border) cell.border = styleObj.border;
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


        // Row 3: Ca 1, HC, Ca 2
        const r3 = summarySheet.getRow(3);
        r3.height = 25;
        r3.values = [1, 'SKU CA 1 ,HC , CA 2', (summary.ca1 || 0) + (summary.ca2 || 0)];
        r3.eachCell({ includeEmpty: true }, (cell, col) => {
            applyStyle(cell, normalCell);
            cell.alignment = { vertical: 'middle', horizontal: col === 1 ? 'center' : col === 2 ? 'left' : 'right' };
        });

        // Row 4: Ca 3
        const r4 = summarySheet.getRow(4);
        r4.height = 25;
        r4.values = [2, 'SKU CA 3', summary.ca3 || 0];
        r4.eachCell({ includeEmpty: true }, (cell, col) => {
            applyStyle(cell, normalCell);
            cell.alignment = { vertical: 'middle', horizontal: col === 1 ? 'center' : col === 2 ? 'left' : 'right' };
        });

        // Row 5: TỔNG SKU PICK (light blue)
        const r5 = summarySheet.getRow(5);
        r5.height = 25;
        r5.values = ['', 'TỔNG SKU PICK', summary.totalSku || 0];
        r5.eachCell({ includeEmpty: true }, (cell, col) => {
            applyStyle(cell, lightBlueFill);
            cell.alignment = { vertical: 'middle', horizontal: col === 2 ? 'left' : (col === 3 ? 'right' : 'center') };
        });

        // Row 6: TỔNG SỐ TIỀN PHẠT
        const r6 = summarySheet.getRow(6);
        r6.height = 25;
        r6.values = ['', 'TỔNG SỐ TIỀN PHẠT', summary.penalty || 0];
        r6.eachCell({ includeEmpty: true }, (cell, col) => {
            applyStyle(cell, normalCell);
            cell.alignment = { vertical: 'middle', horizontal: col === 2 ? 'left' : (col === 3 ? 'right' : 'center') };
            if (col === 3) cell.numFmt = '#,##0';
        });

        // ─── SHEET 2: CHI TIẾT ───────────────────────────────────
        const detailSheet = workbook.addWorksheet('Chi tiết');
        detailSheet.columns = [
            { header: 'Ngày', key: 'date', width: 15 },
            { header: 'Mã NV', key: 'msnv', width: 25 },
            { header: 'Họ tên', key: 'name', width: 30 },
            { header: 'Bộ phận', key: 'dept', width: 15 },
            { header: 'Ca làm', key: 'shift', width: 15 },
            { header: 'Giờ vào', key: 'timeIn', width: 12 },
            { header: 'Giờ ra', key: 'timeOut', width: 12 },
            { header: 'Sản lượng thực tế', key: 'output', width: 20 }
        ];

        // Style header row
        const detailHeader = detailSheet.getRow(1);
        detailHeader.height = 30;
        detailHeader.eachCell({ includeEmpty: true }, cell => applyStyle(cell, blueHeader));

        // Add data rows
        rows.forEach(item => {
            const row = detailSheet.addRow({
                date: getVal(item, 'date'),
                msnv: getVal(item, 'msnv'),
                name: getVal(item, 'name'),
                dept: getVal(item, 'dept'),
                shift: getVal(item, 'shift'),
                timeIn: getVal(item, 'timeIn'),
                timeOut: getVal(item, 'timeOut'),
                output: parseNumericValue(item, 'output')
            });
            row.height = 20;
            row.eachCell({ includeEmpty: true }, (cell, col) => {
                applyStyle(cell, normalCell);
                // col: 1=Ngày, 2=MãNV, 3=Tên, 4=BộPhận, 5=Ca, 6=GiờVào, 7=GiờRa, 8=SảnLượng
                const center = [1, 4, 5, 6, 7];
                const right = [8];
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
