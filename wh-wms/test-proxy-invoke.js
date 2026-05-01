const https = require('https');

let SID = "eyJ0eXBlIjoic2lkIiwiaXNzIjoiQnV5bWVkLUFQIiwidG9rZW4iOiJxd0daS1FVMlM4aHh5dG1FS0xjdlpKVDFEN0VFWUVlOGNpQmlOVnBuV1B3MlJhZTciLCJjbGllbnQiOiI3VDZ3aGl6OXVsdFllZ0dMYWtNSUk3NWJ6cTJHdzNTZjV2REQ4OWdsOGNJNTc1ZHEiLCJzZXNzaW9uVHlwZSI6InNpbmdsZSJ9Cg==";
let TOKEN = "eyJ0eXBlIjoiYWNjZXNzX3Rva2VuIiwiaXNzIjoiQnV5bWVkLUFQIiwidG9rZW4iOiI3aWFleXVRdHhoMXBORzJ3THN2c05kQ0pzMjJBMjk2UXBwNzZlZlI1emY2QlRobVQiLCJjbGllbnQiOiI5ZjM1MkFGclVESVJTOFc0amxZQldLRHJKNjFwNHdFOHF0TDRtcDdEQUg0dkVqamkifQo=";

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

function invokeBuyMedAPI(targetUrl, queryParams) {
    return new Promise((resolve, reject) => {
        let finalUrl = targetUrl;
        if (queryParams && Object.keys(queryParams).length > 0) {
            const qs = new URLSearchParams(queryParams).toString();
            finalUrl += `?${qs}`;
        }
        
        console.log(`  -> GET ${finalUrl}`);
        
        const req = https.request(finalUrl, {
            method: 'GET',
            headers: getAuthHeaders()
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
        
        req.on('error', (e) => {
            console.error(`  -> ERROR: ${e.message}`);
            resolve({ ok: false, body: JSON.stringify({error: e.message}), status: 500 });
        });
        
        req.setTimeout(15000, () => {
            req.destroy();
            resolve({ ok: false, body: JSON.stringify({error: "Request timeout"}), status: 504 });
        });
        
        req.end();
    });
}

(async () => {
    const sku = "MEDX.GHKGEQ1P";
    const qObj = {
        target: "wms-sku-location",
        primaryKey: sku,
        path: ""
    };
    const qs = encodeURIComponent(JSON.stringify(qObj));
    const fullUrl = `https://internal.thuocsi.vn/backend/core/activity/v1/activity/list?q=${qs}&offset=0&limit=50&getTotal=true`;
    
    console.log(`[MAPPING HISTORY] ${sku} -> ${fullUrl}`);
    const result = await invokeBuyMedAPI(fullUrl, {});
    console.log("Status:", result.status);
    console.log("Body:", result.body.substring(0, 100));
})();
