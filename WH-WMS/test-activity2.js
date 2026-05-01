const https = require('https');

const TOKEN = "eyJ0eXBlIjoiYWNjZXNzX3Rva2VuIiwiaXNzIjoiQnV5bWVkLUFQIiwidG9rZW4iOiI3aWFleXVRdHhoMXBORzJ3THN2c05kQ0pzMjJBMjk2UXBwNzZlZlI1emY2QlRobVQiLCJjbGllbnQiOiI5ZjM1MkFGclVESVJTOFc0amxZQldLRHJKNjFwNHdFOHF0TDRtcDdEQUg0dkVqamkifQo=";
const SID = "eyJ0eXBlIjoic2lkIiwiaXNzIjoiQnV5bWVkLUFQIiwidG9rZW4iOiJxd0daS1FVMlM4aHh5dG1FS0xjdlpKVDFEN0VFWUVlOGNpQmlOVnBuV1B3MlJhZTciLCJjbGllbnQiOiI3VDZ3aGl6OXVsdFllZ0dMYWtNSUk3NWJ6cTJHdzNTZjV2REQ4OWdsOGNJNTc1ZHEiLCJzZXNzaW9uVHlwZSI6InNpbmdsZSJ9Cg==";

function getAuthHeaders() {
    return {
        "Authorization": `Bearer ${TOKEN}`,
        "x-session-token": TOKEN,
        "Cookie": `lang=vi; SID=${SID}; ACCOUNT_CHOOSER=dHJhbmR1Y2x1b25n; session_token=${TOKEN}`,
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/135.0.0.0 Safari/537.36"
    };
}

function fetchUrl(method, url, body=null) {
    return new Promise((resolve, reject) => {
        const req = https.request(url, { method, headers: getAuthHeaders() }, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => resolve({ status: res.statusCode, data }));
        });
        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

(async () => {
    const urls = [
        ["GET", "https://internal.thuocsi.vn/backend/core/activity/v1/activity?q=MEDX.GHKGEQ1P"],
        ["GET", "https://internal.thuocsi.vn/backend/core/activity/v1/activity?code=wms-mapping-sku&q=MEDX.GHKGEQ1P"],
        ["GET", "https://internal.thuocsi.vn/backend/core/activity/v1/activity?sku=MEDX.GHKGEQ1P"],
        ["GET", "https://internal.thuocsi.vn/backend/core/activity/v1/activity?search=MEDX.GHKGEQ1P&offset=0&limit=20"],
        ["POST", "https://internal.thuocsi.vn/backend/core/activity/v1/activity/search", {q: "MEDX.GHKGEQ1P"}],
        ["POST", "https://internal.thuocsi.vn/backend/core/activity/v1/activity/search", {search: "MEDX.GHKGEQ1P"}],
        ["GET", "https://internal.thuocsi.vn/backend/core/activity/v1/activity?objectId=MEDX.GHKGEQ1P"]
    ];
    for(let [m, u, b] of urls) {
        let r = await fetchUrl(m, u, b);
        console.log(`\nURL: ${m} ${u}\nStatus: ${r.status}\nData: ${r.data.substring(0, 150)}`);
    }
})();
