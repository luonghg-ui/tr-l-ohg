// ============================================================
// CONFIGURATION: Google Sheets Data
// ============================================================
const SHEET_ID = '1Atqwv9UdG_Ro_CBbamctGENgf-ZiUl73NrQeOaQFbK4';
const GID_PROD = '2012066668'; // Dữ liệu đối soát 

// GViz URL
const GVIZ_PROD_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?gid=${GID_PROD}`;

// ============================================================
// STATE MANAGEMENT
// ============================================================
let productionData = [];
let vendorAggr = {};
let filteredData = [];
let currentPage = 1;
const ROWS_PER_PAGE = 30;

// ============================================================
// KEYWORD MAPPING (Adopted from script-pa.js for robustness)
// ============================================================
const KEY_FIELDS = {
    name:    ['HỌ VÀ TÊN', 'HO VA TEN', 'TEN', 'NAME', 'TÊN'],
    msnv:    ['MÃ NV', 'MA NV', 'MSNV', 'EMPLOYEE ID', 'MÃ NHÂN VIÊN'],
    dept:    ['BỘ PHẬN', 'BO PHAN', 'VỊ TRÍ', 'VI TRI', 'DEPARTMENT', 'VENDOR'],
    shift:   ['CA LÀM', 'CA LAM', 'CA', 'SHIFT'],
    output:  ['SẢN LƯỢNG', 'SAN LUONG', 'QUANTITY', 'OUTPUT'],
    date:    ['NGÀY', 'NGAY', 'DATE'],
    penalty: ['SỐ TIỀN PHẠT', 'SO TIEN PHAT', 'SỐ TIỀN PH', 'PHAT', 'PENALTY', 'TIỀN PHẠT'],
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
}

// ============================================================
// DATA FETCHING (JSONP)
// ============================================================
function fetchData() {
    showLoading(true, 'Đang đồng bộ dữ liệu đối soát...');
    
    // Clear old scripts if any
    const oldScripts = document.querySelectorAll('script[data-type="jsonp-gviz"]');
    oldScripts.forEach(s => s.remove());

    const callbackName = 'gviz_reconcile_' + Date.now();
    window[callbackName] = function(json) {
        processProductionData(json);
        delete window[callbackName];
    };

    const script = document.createElement('script');
    script.setAttribute('data-type', 'jsonp-gviz');
    script.src = `${GVIZ_PROD_URL}&tqx=out:json;responseHandler:${callbackName}`;
    document.body.appendChild(script);
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
// DATA PROCESSING
// ============================================================
function processProductionData(json) {
    try {
        if (!json || !json.table) throw new Error('Dữ liệu không hợp lệ hoặc không có quyền truy cập.');

        const headers = json.table.cols.map(c => (c && c.label) ? c.label.trim() : '');
        // DEBUG: open DevTools (F12) → Console to see column names
        console.log('📋 GID Columns:', headers);
        const rows = (json.table.rows || []).map(r => {
            const item = {};
            // Store both raw value and formatted value so penalty picks up pure numbers
            r.c.forEach((cell, i) => {
                if (headers[i]) {
                    const raw = cell ? cell.v : null;
                    const fmt = cell ? (cell.f || '') : '';
                    // Prefer raw numeric value for numeric cells, fallback to formatted then raw string
                    if (raw !== null && raw !== undefined && raw !== '') {
                        item[headers[i]] = fmt !== '' ? fmt : raw.toString().trim();
                        item[headers[i] + '__raw'] = raw; // store raw separately
                    } else {
                        item[headers[i]] = '';
                        item[headers[i] + '__raw'] = 0;
                    }
                }
            });
            return item;
        }).filter(item => Object.values(item).some(v => v !== '' && v !== null && v !== undefined));

        productionData = rows;
        aggregateData();
        applyFilter();
        renderVendorCards();
        showLoading(false);
    } catch (err) {
        console.error('Error processing data:', err);
        showLoading(false, 'Lỗi: ' + err.message);
        bannerInner.className = 'banner error';
        statusBanner.style.display = 'block';
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

function aggregateData() {
    vendorAggr = {};
    
    productionData.forEach(item => {
        let vendor = (getVal(item, 'dept') || 'KHÁC').toUpperCase();
        // Clean vendor name (standardize)
        if (vendor.includes('VIN')) vendor = 'VIN';
        if (vendor.includes('VIET') || vendor.includes('WROK')) vendor = 'VIETWORK';
        if (vendor.includes('BPD')) vendor = 'BPD';

        const shift = (getVal(item, 'shift') || '').toUpperCase();
        const output = parseInt((getVal(item, 'output') || '0').toString().replace(/[^0-9]/g, '')) || 0;

        // Penalty: try raw numeric value first (column K stores as number), fallback to string parse
        const penaltyKey = Object.keys(item).find(k => !k.endsWith('__raw') && matchesKeyField(k, KEY_FIELDS.penalty));
        let penalty = 0;
        if (penaltyKey) {
            const rawVal = item[penaltyKey + '__raw'];
            if (typeof rawVal === 'number' && !isNaN(rawVal)) {
                penalty = rawVal;
            } else {
                penalty = parseInt((item[penaltyKey] || '0').toString().replace(/[^0-9]/g, '')) || 0;
            }
        }

        if (!vendorAggr[vendor]) {
            vendorAggr[vendor] = {
                skuCount: 0,
                caNgay: 0,
                caDem: 0,
                penalty: 0,
                details: []
            };
        }

        vendorAggr[vendor].skuCount += output; 
        
        // Ca ngày: Shift 1, Shift 2, HC
        if (shift.includes('1') || shift.includes('2') || shift.includes('HC') || shift.includes('HÀNH CHÍNH')) {
            vendorAggr[vendor].caNgay += output;
        } else if (shift.includes('3') || shift.includes('ĐÊM') || shift.includes('DEM')) {
            vendorAggr[vendor].caDem += output;
        }

        vendorAggr[vendor].penalty += penalty;
        vendorAggr[vendor].details.push(item);
    });

    // DEBUG: check penalty sums per vendor
    Object.entries(vendorAggr).forEach(([v, d]) =>
        console.log(`💰 ${v} → penalty: ${d.penalty}, caNgay: ${d.caNgay}, caDem: ${d.caDem}`)
    );
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
            <div class="vendor-badge"><i class='bx bx-buildings'></i>VENDOR</div>
            <div class="vendor-name">${vendor}</div>
            <div class="vendor-divider"></div>
            <div class="vendor-stats">
                <span class="vendor-stat-label">Tổng sản lượng</span>
                <div class="vendor-stat-value">${data.skuCount.toLocaleString('vi-VN')}</div>
            </div>
            <div class="hint-text"><i class='bx bx-mouse'></i> nhấn để xem chi tiết</div>
        `;
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
        <div class="reconcile-item" style="--item-accent: #FCD34D;">
            <div class="reconcile-icon day"><i class='bx bxs-sun'></i></div>
            <div class="reconcile-info">
                <div class="reconcile-label">Ca ngày</div>
                <div class="reconcile-sub">CA 1 &nbsp;·&nbsp; HC &nbsp;·&nbsp; CA 2</div>
            </div>
            <div class="reconcile-value day-val">${data.caNgay.toLocaleString('vi-VN')}</div>
        </div>
        <div class="reconcile-item" style="--item-accent: #818CF8;">
            <div class="reconcile-icon night"><i class='bx bxs-moon'></i></div>
            <div class="reconcile-info">
                <div class="reconcile-label">Ca đêm</div>
                <div class="reconcile-sub">CA 3 &nbsp;·&nbsp; CA ĐÊM</div>
            </div>
            <div class="reconcile-value night-val">${data.caDem.toLocaleString('vi-VN')}</div>
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
    
    modalOverlay.classList.add('active');
}

function closeModal() {
    modalOverlay.classList.remove('active');
}

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

// Start
init();
