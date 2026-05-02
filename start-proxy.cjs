const http = require('http');
const https = require('https');
const url = require('url');

const PORT = 3000;

// Token mặc định (Sẽ được cập nhật qua POST /update-token)
let SID = "eyJ0eXBlIjoic2lkIiwiaXNzIjoiQnV5bWVkLUFQIiwidG9rZW4iOiJxd0daS1FVMlM4aHh5dG1FS0xjdlpKVDFEN0VFWUVlOGNpQmlOVnBuV1B3MlJhZTciLCJjbGllbnQiOiI3VDZ3aGl6OXVsdFllZ0dMYWtNSUk3NWJ6cTJHdzNTZjV2REQ4OWdsOGNJNTc1ZHEiLCJzZXNzaW9uVHlwZSI6InNpbmdsZSJ9Cg==";
let TOKEN = "eyJ0eXBlIjoiYWNjZXNzX3Rva2VuIiwiaXNzIjoiQnV5bWVkLUFQIiwidG9rZW4iOiI3aWFleXVRdHhoMXBORzJ3THN2c05kQ0pzMjJBMjk2UXBwNzZlZlI1emY2QlRobVQiLCJjbGllbnQiOiI5ZjM1MkFGclVESVJTOFc0amxZQldLRHJKNjFwNHdFOHF0TDRtcDdEQUg0dkVqamkifQo=";

let PICK_ENDPOINT = "https://internal.thuocsi.vn/marketplace/fulfillment-v2/private/pick-list";

function getAuthHeaders() {
    return {
        "Authorization": `Bearer ${TOKEN}`,
        "x-session-token": TOKEN,
        "Cookie": `lang=vi; SID=${SID}; session_token=${TOKEN}`,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
        "Referer": "https://internal.thuocsi.vn/",
        "Origin": "https://internal.thuocsi.vn",
        "sec-ch-ua": '"Google Chrome";v="135", "Not-A.Brand";v="8", "Chromium";v="135"',
        "sec-ch-ua-platform": '"Windows"',
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
            finalUrl += (finalUrl.includes('?') ? '&' : '?') + qs;
        }
        
        const h = getAuthHeaders();
        console.log(`  -> GET ${finalUrl}`);
        
        const req = https.request(finalUrl, {
            method: 'GET',
            headers: h
        }, (res) => {
            let data = [];
            res.on('data', chunk => data.push(chunk));
            res.on('end', () => {
                const body = Buffer.concat(data).toString();
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

const server = http.createServer(async (req, res) => {
    try {
        setCorsHeaders(res);
        
        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }
        
        const parsedUrl = url.parse(req.url, true);
        const path = parsedUrl.pathname.replace(/\/$/, '') || '/';
        const method = req.method;
        const qp = parsedUrl.query;
        
        console.log(`[${new Date().toLocaleTimeString()}] ${method} ${path}`);
        
        // --- PING ---
        if (path === '/ping' && method === 'GET') {
            res.writeHead(200);
            res.end(JSON.stringify({ ok: true, time: new Date().toISOString(), tokenTail: TOKEN.slice(-10) }));
            return;
        }
        
        // --- UPDATE TOKEN ---
        if (path === '/update-token' && method === 'POST') {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                try {
                    const data = JSON.parse(body);
                    if (data.sid && data.token) {
                        SID = data.sid;
                        TOKEN = data.token;
                        console.log(`  *** TOKEN UPDATED! ***`);
                        res.writeHead(200);
                        res.end(JSON.stringify({ ok: true, message: "Token updated successfully" }));
                    } else {
                        res.writeHead(400);
                        res.end(JSON.stringify({ ok: false, message: "Missing sid or token" }));
                    }
                } catch (e) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ ok: false, message: "Invalid JSON" }));
                }
            });
            return;
        }

        // --- MAPPING LOCATION ---
        if (path === '/wms/mapping-location' && method === 'GET') {
            const { sku, group = 'BUYMED', warehouse = 'HN' } = qp;
            if (!sku) {
                res.writeHead(400);
                res.end(JSON.stringify({ ok: false, error: "Missing sku" }));
                return;
            }
            const target = `https://internal.thuocsi.vn/wms/${group}/${warehouse}/inventory/mapping-location?group=${group}&warehouse=${warehouse}&sku=${encodeURIComponent(sku)}`;
            const result = await invokeBuyMedAPI(target, {});
            
            if (result.ok && result.body.includes('__NEXT_DATA__')) {
                const match = result.body.match(/id="__NEXT_DATA__" type="application\/json">({.*?})<\/script>/);
                if (match) {
                    const data = JSON.parse(match[1]).props.pageProps;
                    res.writeHead(200);
                    res.end(JSON.stringify({ ok: true, source: 'html_scrape', sku, inventoryLevel: data.inventoryLevel, resListSKU: data.resListSKU }));
                    return;
                }
            }
            res.writeHead(result.status);
            res.end(result.body);
            return;
        }

        // --- SKU DETAIL ---
        if (path === '/wms/sku-detail' && method === 'GET') {
            const { sku, group = 'BUYMED', warehouse = 'HN' } = qp;
            const target = `https://internal.thuocsi.vn/wms/${group}/${warehouse}/inventory/sku/detail?sku=${encodeURIComponent(sku)}&warehouseCode=${warehouse}&group=${group}`;
            const result = await invokeBuyMedAPI(target, {});
            
            if (result.ok && result.body.includes('__NEXT_DATA__')) {
                const match = result.body.match(/id="__NEXT_DATA__" type="application\/json">({.*?})<\/script>/);
                if (match) {
                    const pp = JSON.parse(match[1]).props.pageProps;
                    res.writeHead(200);
                    res.end(JSON.stringify({
                        ok: true, sku,
                        skuData: pp.skuData,
                        skuLocations: pp.skuLocations,
                        skuLotDate: pp.skuLotDate,
                        skuPhysicalInfo: pp.skuPhysicalInfo,
                        mappingHistory: pp.skuMappingHistory || pp.mappingHistory
                    }));
                    return;
                }
            }
            res.writeHead(result.status);
            res.end(result.body);
            return;
        }

        // --- OTHER WMS ENDPOINTS ---
        if (path === '/wms/pick-list' || path === '/wms/inbound' || path === '/search') {
            // Simplified proxying for other endpoints
            let target = "https://internal.thuocsi.vn";
            if (path === '/search') target += "/beehive/core/product/v1/products";
            else if (path === '/wms/inbound') target += "/marketplace/warehouse/private/grn";
            else target = PICK_ENDPOINT;

            const result = await invokeBuyMedAPI(target, qp);
            res.writeHead(result.status);
            res.end(result.body);
            return;
        }

        res.writeHead(404);
        res.end(JSON.stringify({ error: "Not found" }));

    } catch (e) {
        console.error(e);
        res.writeHead(500);
        res.end(JSON.stringify({ error: "Server error", message: e.message }));
    }
});

server.listen(PORT, () => {
    console.log(`\nBuyMed WMS Proxy (Node.js) running at http://localhost:${PORT}`);
    console.log(`Endpoints: /ping, /wms/mapping-location, /wms/sku-detail, /wms/pick-list, /wms/inbound, /search\n`);
});
