const http = require('http');
const https = require('https');
const url = require('url');

const PORT = 3000;

let SID = "eyJ0eXBlIjoic2lkIiwiaXNzIjoiQnV5bWVkLUFQIiwidG9rZW4iOiJxd0daS1FVMlM4aHh5dG1FS0xjdlpKVDFEN0VFWUVlOGNpQmlOVnBuV1B3MlJhZTciLCJjbGllbnQiOiI3VDZ3aGl6OXVsdFllZ0dMYWtNSUk3NWJ6cTJHdzNTZjV2REQ4OWdsOGNJNTc1ZHEiLCJzZXNzaW9uVHlwZSI6InNpbmdsZSJ9Cg==";
let TOKEN = "eyJ0eXBlIjoiYWNjZXNzX3Rva2VuIiwiaXNzIjoiQnV5bWVkLUFQIiwidG9rZW4iOiI3aWFleXVRdHhoMXBORzJ3THN2c05kQ0pzMjJBMjk2UXBwNzZlZlI1emY2QlRobVQiLCJjbGllbnQiOiI5ZjM1MkFGclVESVJTOFc0amxZQldLRHJKNjFwNHdFOHF0TDRtcDdEQUg0dkVqamkifQo=";

let PICK_ENDPOINT = "https://internal.thuocsi.vn/marketplace/fulfillment-v2/private/pick-list";

function getAuthHeaders() {
    return {
        "Authorization": `Bearer ${TOKEN}`,
        "x-session-token": TOKEN,
        "Cookie": `lang=vi; SID=${SID}; ACCOUNT_CHOOSER=dHJhbmR1Y2x1b25n; session_token=${TOKEN}`,
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
        "Referer": "https://internal.thuocsi.vn/",
        "Origin": "https://internal.thuocsi.vn",
        "sec-ch-ua": '"Google Chrome";v="135", "Not-A.Brand";v="8", "Chromium";v="135"',
        "sec-ch-ua-platform": '"macOS"',
        "sec-fetch-site": "same-origin",
        "sec-fetch-mode": "cors",
        "sec-fetch-dest": "empty"
    };
}

function setCorsHeaders(res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Content-Type", "application/json; charset=utf-8");
}

function invokeBuyMedAPI(targetUrl, queryParams) {
    return new Promise((resolve, reject) => {
        let finalUrl = targetUrl;
        if (queryParams && Object.keys(queryParams).length > 0) {
            const qs = new URLSearchParams(queryParams).toString();
            finalUrl += `?${qs}`;
        }
        
        const h = getAuthHeaders();
        console.log(`  -> GET ${finalUrl}`);
        console.log(`  -> Token: ${h['Authorization'].substring(0, 30)}...`);
        
        const req = https.request(finalUrl, {
            method: 'GET',
            headers: h
        }, (res) => {
            let data = [];
            res.on('data', chunk => data.push(chunk));
            res.on('end', () => {
                const body = Buffer.concat(data).toString();
                if (res.statusCode >= 400) {
                    console.log(`  -> HTTP ${res.statusCode}`);
                }
                resolve({ ok: res.statusCode < 400, body: body, status: res.statusCode });
            });
        });
        
        req.setTimeout(15000, () => {
            req.destroy();
            resolve({ ok: false, body: JSON.stringify({error: "Request timeout"}), status: 504 });
        });
        
        req.on('error', (e) => {
            console.error(`  -> ERROR: ${e.message}`);
            resolve({ ok: false, body: JSON.stringify({error: "Request failed", message: e.message}), status: 500 });
        });
        
        req.end();
    });
}

async function findPickListEndpoint() {
    const candidates = [
        "https://internal.thuocsi.vn/marketplace/fulfillment-v2/private/pick-list",
        "https://internal.thuocsi.vn/marketplace/fulfillment/private/pick-list",
        "https://internal.thuocsi.vn/marketplace/fulfillment-v2/private/pick-slips",
        "https://internal.thuocsi.vn/marketplace/fulfillment-v2/pick-list",
        "https://internal.thuocsi.vn/wms/v2/private/pick-list",
        "https://internal.thuocsi.vn/wms/v1/private/pick-list",
        "https://internal.thuocsi.vn/marketplace/wms/v2/private/pick-list",
        "https://internal.thuocsi.vn/marketplace/warehouse/private/pick-list",
        "https://internal.thuocsi.vn/ops/wms/private/pick-list",
        "https://internal.thuocsi.vn/marketplace/fulfillment-v2/private/orders/pick",
        "https://internal.thuocsi.vn/marketplace/fulfillment-v2/private/shipments",
        "https://internal.thuocsi.vn/marketplace/order/private/pick-list"
    ];
    
    let results = [];
    for (const url of candidates) {
        try {
            const res = await invokeBuyMedAPI(url, { offset: 0, limit: 1 });
            console.log(`  FOUND: ${res.status} ${url}`);
            results.push({ url, status: res.status, body: res.body ? res.body.substring(0, 200) : null });
            
            if (res.status < 300) {
                PICK_ENDPOINT = url;
                console.log(`  *** Updated PICK_ENDPOINT to: ${url} ***`);
            }
        } catch (e) {
            results.push({ url, status: 0, body: null });
        }
    }
    return results;
}

const server = http.createServer(async (req, res) => {
    try {
        setCorsHeaders(res);
        
        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }
        
        const parsedUrl = url.parse(req.url, true);
        const path = parsedUrl.pathname === '/' ? '/' : parsedUrl.pathname.replace(/\/$/, '');
        const method = req.method;
        const qp = parsedUrl.query;
        
        console.log(`[${new Date().toLocaleTimeString()}] ${method} ${path}`);
        
        if (path === '/ping' && method === 'GET') {
            res.writeHead(200);
            res.end(JSON.stringify({
                ok: true,
                time: new Date().toISOString(),
                endpoint: PICK_ENDPOINT,
                tokenTail: TOKEN.substring(Math.max(0, TOKEN.length - 20))
            }));
            return;
        }
        
        if (path === '/update-token' && method === 'POST') {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                try {
                    const data = JSON.parse(body);
                    if (data.sid && data.token) {
                        SID = data.sid;
                        TOKEN = data.token;
                        console.log(`  *** TOKEN UPDATED! SID tail: ...${SID.slice(-20)} ***`);
                        res.writeHead(200);
                        res.end(JSON.stringify({ ok: true, message: "Token updated successfully" }));
                    } else {
                        res.writeHead(400);
                        res.end(JSON.stringify({ ok: false, message: "Missing sid or token field" }));
                    }
                } catch (e) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ ok: false, message: "Invalid JSON: " + e.message }));
                }
            });
            return;
        }
        
        if (path === '/discover' && method === 'GET') {
            console.log("  [DISCOVER] Scanning all pick-list endpoints...");
            const results = await findPickListEndpoint();
            res.writeHead(200);
            res.end(JSON.stringify({
                scanned: results.length,
                currentEndpoint: PICK_ENDPOINT,
                results: results
            }));
            return;
        }
        
        if (path === '/wms/pick-list' && method === 'GET') {
            const size = qp.size || "20";
            const page = qp.page || "0";
            const offset = parseInt(page) * parseInt(size);
            
            let queryParams = `?type=PICK&limit=${size}&offset=${offset}`;
            
            const statusMap = {
                waiting_hold: "WAITING_HOLD",
                picking: "PICKING",
                waiting_cs: "WAITING_CS",
                completed: "COMPLETED"
            };
            
            if (qp.status && qp.status !== "all" && statusMap[qp.status]) {
                queryParams += `&status=${statusMap[qp.status]}`;
            }
            if (qp.q && qp.q.trim()) {
                queryParams += `&q=${encodeURIComponent(qp.q.trim())}&search=${encodeURIComponent(qp.q.trim())}`;
            }
            
            const scrapeUrl = `https://internal.thuocsi.vn/wms/BUYMED/HN/ticket${queryParams}`;
            console.log(`[SCRAPE] Fetching HTML from: ${scrapeUrl}`);
            
            const result = await invokeBuyMedAPI(scrapeUrl, {});
            
            if (result.status >= 200 && result.status < 300 && result.body) {
                const match = result.body.match(/id="__NEXT_DATA__" type="application\/json">({.*?})<\/script>/);
                if (match) {
                    try {
                        const nextData = JSON.parse(match[1]);
                        const tickets = nextData?.props?.pageProps?.listTickets || {};
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({
                            data: tickets.data || [],
                            total: tickets.total || 0,
                            scraped: true
                        }));
                        return;
                    } catch(e) {
                        console.error("[SCRAPE ERROR]", e.message);
                    }
                }
            }
            
            res.writeHead(result.status);
            res.end(result.body);
            return;
        }
        
        const pickListMatch = path.match(/^\/wms\/pick-list\/(.+)$/);
        if (pickListMatch && method === 'GET') {
            const id = pickListMatch[1];
            const scrapeUrl = `https://internal.thuocsi.vn/wms/BUYMED/HN/ticket/${id}`;
            console.log(`[SCRAPE DETAIL] Fetching HTML from: ${scrapeUrl}`);
            const result = await invokeBuyMedAPI(scrapeUrl, {});
            
            if (result.status >= 200 && result.status < 300 && result.body) {
                const match = result.body.match(/id="__NEXT_DATA__" type="application\/json">({.*?})<\/script>/);
                if (match) {
                    try {
                        const nextData = JSON.parse(match[1]);
                        // Try to find the ticket object inside pageProps
                        const ticket = nextData?.props?.pageProps?.ticketData || nextData?.props?.pageProps?.initialState?.ticket || {};
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        // WMS frontend expects an array format or similar depending on the code, usually an array for details or a direct object
                        // Let's just wrap it in data array if it was single
                        res.end(JSON.stringify({ data: [ticket.data || ticket], scraped: true }));
                        return;
                    } catch(e) {
                        console.error("[SCRAPE ERROR DETAIL]", e.message);
                    }
                }
            }
            
            res.writeHead(result.status);
            res.end(result.body);
            return;
        }
        
        if (path === '/wms/inbound' && method === 'GET') {
            const size = qp.size || "20";
            const page = qp.page || "0";
            const offset = parseInt(page) * parseInt(size);
            
            let apiParams = { offset: offset.toString(), limit: size.toString() };
            if (qp.q && qp.q.trim()) {
                apiParams.code = qp.q.trim();
            }
            
            const result = await invokeBuyMedAPI("https://internal.thuocsi.vn/marketplace/warehouse/private/grn", apiParams);
            res.writeHead(result.status);
            res.end(result.body);
            return;
        }
        
        if (path === '/search' && method === 'GET') {
            const q = qp.q;
            if (!q) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: "Missing q parameter" }));
                return;
            }
            const result = await invokeBuyMedAPI("https://internal.thuocsi.vn/beehive/core/product/v1/products", { q: q, keyword: q });
            res.writeHead(result.status);
            res.end(result.body);
            return;
        }

        // ============================================================
        // MAPPING LOCATION: Tra vi tri ke theo SKU
        // GET /wms/mapping-location?sku=MEDX.XXXX[&group=BUYMED&warehouse=HN]
        // ============================================================
        if (path === '/wms/mapping-location' && method === 'GET') {
            const sku = qp.sku;
            if (!sku) {
                res.writeHead(400);
                res.end(JSON.stringify({ ok: false, error: "Missing 'sku' parameter" }));
                return;
            }
            const group = qp.group || 'BUYMED';
            const warehouse = qp.warehouse || 'HN';

            // First, fetch via HTML scraping (Next.js __NEXT_DATA__)
            const scrapeUrl = `https://internal.thuocsi.vn/wms/${group}/${warehouse}/inventory/mapping-location`;
            const scrapeParams = { group, warehouse, sku };
            console.log(`[MAPPING] SKU=${sku} -> ${scrapeUrl}`);

            // Build full url manually
            const fullScrapeUrl = `${scrapeUrl}?group=${encodeURIComponent(group)}&warehouse=${encodeURIComponent(warehouse)}&sku=${encodeURIComponent(sku)}`;
            const htmlResult = await invokeBuyMedAPI(fullScrapeUrl, {});

            if (htmlResult.status >= 200 && htmlResult.status < 300 && htmlResult.body) {
                // Try to parse __NEXT_DATA__ from HTML page
                const match = htmlResult.body.match(/id="__NEXT_DATA__" type="application\/json">({.*?})<\/script>/);
                if (match) {
                    try {
                        const nextData = JSON.parse(match[1]);
                        const pageProps = nextData?.props?.pageProps || {};

                        // Keys confirmed from live response: inventoryLevel, resListSKU
                        const inventoryLevel = pageProps.inventoryLevel || null;
                        const resListSKU     = pageProps.resListSKU || null;
                        const listZone       = pageProps.listZone || null;

                        // inventoryLevel = array of locations with qty per location
                        // resListSKU     = list of SKU details (name, barcode, etc.)
                        const mappingData = inventoryLevel || resListSKU || null;

                        res.writeHead(200);
                        res.end(JSON.stringify({
                            ok: true,
                            sku,
                            group,
                            warehouse,
                            source: 'html_scrape',
                            data: mappingData,
                            inventoryLevel,
                            resListSKU,
                            listZone,
                            pageProps: Object.keys(pageProps)
                        }));
                        return;
                    } catch (e) {
                        console.error('[MAPPING PARSE ERROR]', e.message);
                    }
                }

                // Fallback: return raw body snippet for debugging
                res.writeHead(200);
                res.end(JSON.stringify({
                    ok: false,
                    sku,
                    source: 'html_scrape_no_nextdata',
                    httpStatus: htmlResult.status,
                    bodySnippet: htmlResult.body.substring(0, 500)
                }));
                return;
            }

            res.writeHead(htmlResult.status);
            res.end(JSON.stringify({
                ok: false,
                sku,
                source: 'html_scrape_failed',
                httpStatus: htmlResult.status
            }));
            return;
        }

        // ============================================================
        // SKU DETAIL: Chi tiet SKU - so luong, vi tri ke, lot, thong tin vat ly
        // GET /wms/sku-detail?sku=MEDX.XXXX[&group=BUYMED&warehouse=HN]
        // ============================================================
        if (path === '/wms/sku-detail' && method === 'GET') {
            const sku = qp.sku;
            if (!sku) {
                res.writeHead(400);
                res.end(JSON.stringify({ ok: false, error: "Missing 'sku' parameter" }));
                return;
            }
            const group = qp.group || 'BUYMED';
            const warehouse = qp.warehouse || 'HN';

            const fullUrl = `https://internal.thuocsi.vn/wms/${group}/${warehouse}/inventory/sku/detail?sku=${encodeURIComponent(sku)}&warehouseCode=${warehouse}&group=${group}`;
            console.log(`[SKU DETAIL] ${sku} -> ${fullUrl}`);

            const htmlResult = await invokeBuyMedAPI(fullUrl, {});

            if (htmlResult.status >= 200 && htmlResult.status < 300 && htmlResult.body) {
                const match = htmlResult.body.match(/id="__NEXT_DATA__" type="application\/json">({.*?})<\/script>/);
                if (match) {
                    try {
                        const nextData = JSON.parse(match[1]);
                        const pp = nextData?.props?.pageProps || {};
                        res.writeHead(200);
                        res.end(JSON.stringify({
                            ok: true,
                            sku,
                            group,
                            warehouse,
                            skuData:       pp.skuData       || null,
                            skuLocations:  pp.skuLocations  || [],
                            skuLotDate:    pp.skuLotDate    || [],
                            skuPhysicalInfo: pp.skuPhysicalInfo || null,
                            seller:        pp.seller        || null,
                            allKeys:       Object.keys(pp),
                            mappingHistory: pp.skuMappingHistory || pp.mappingHistory || pp.skuMappingHistories || null
                        }));
                        return;
                    } catch(e) {
                        console.error('[SKU DETAIL PARSE ERROR]', e.message);
                    }
                }
            }

            res.writeHead(htmlResult.status || 500);
            res.end(JSON.stringify({
                ok: false,
                sku,
                httpStatus: htmlResult.status,
                bodySnippet: (htmlResult.body || '').substring(0, 400)
            }));
            return;
        }

        // ============================================================
        // MAPPING HISTORY: Lấy lịch sử gán vị trí (Audit log)
        // GET /wms/mapping-history?sku=MEDX.XXXX
        // ============================================================
        if (path === '/wms/mapping-history' && method === 'GET') {
            const sku = qp.sku;
            if (!sku) {
                res.writeHead(400);
                res.end(JSON.stringify({ ok: false, error: "Missing 'sku' parameter" }));
                return;
            }
            
            const qObj = {
                target: "wms-sku-location",
                primaryKey: sku,
                path: ""
            };
            const qs = encodeURIComponent(JSON.stringify(qObj));
            const fullUrl = `https://internal.thuocsi.vn/backend/core/activity/v1/activity/list?q=${qs}&offset=0&limit=50&getTotal=true`;
            
            console.log(`[MAPPING HISTORY] ${sku} -> ${fullUrl}`);
            const result = await invokeBuyMedAPI(fullUrl, {});
            
            res.writeHead(result.status);
            res.end(result.body);
            return;
        }
        
        res.writeHead(404);
        res.end(JSON.stringify({ error: "Not found", path, method }));
        
    } catch (e) {
        console.error(`[ERROR] ${e.message}`);
        res.writeHead(500);
        res.end(JSON.stringify({ error: "Server error", message: e.message }));
    }
});

server.listen(PORT, () => {
    console.log("");
    console.log('\x1b[32m%s\x1b[0m', "BuyMed WMS Proxy Server (Node.js) v2 - RUNNING");
    console.log('\x1b[90m%s\x1b[0m', "====================================================");
    console.log('\x1b[36m%s\x1b[0m', `  http://localhost:${PORT}/ping            Health check`);
    console.log('\x1b[36m%s\x1b[0m', `  http://localhost:${PORT}/wms/pick-list          Phieu PICK`);
    console.log('\x1b[36m%s\x1b[0m', `  http://localhost:${PORT}/wms/inbound            Phieu nhap GRN`);
    console.log('\x1b[36m%s\x1b[0m', `  http://localhost:${PORT}/search                 Tim kiem SP`);
    console.log('\x1b[36m%s\x1b[0m', `  http://localhost:${PORT}/wms/mapping-location    Mapping vi tri ke (sku=XXX)`);
    console.log('\x1b[36m%s\x1b[0m', "  POST /update-token                              Cap nhat token moi");
    console.log('\x1b[36m%s\x1b[0m', "  GET  /discover                         Tim dung endpoint");
    console.log('\x1b[90m%s\x1b[0m', "====================================================");
    console.log('\x1b[33m%s\x1b[0m', "  Nhan Ctrl+C de dung server");
    console.log("");
});
