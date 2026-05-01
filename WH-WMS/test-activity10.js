const https = require('https');

const TOKEN = "eyJ0eXBlIjoiYWNjZXNzX3Rva2VuIiwiaXNzIjoiQnV5bWVkLUFQIiwidG9rZW4iOiI3aWFleXVRdHhoMXBORzJ3THN2c05kQ0pzMjJBMjk2UXBwNzZlZlI1emY2QlRobVQiLCJjbGllbnQiOiI5ZjM1MkFGclVESVJTOFc0amxZQldLRHJKNjFwNHdFOHF0TDRtcDdEQUg0dkVqamkifQo=";
const SID = "eyJ0eXBlIjoic2lkIiwiaXNzIjoiQnV5bWVkLUFQIiwidG9rZW4iOiJxd0daS1FVMlM4aHh5dG1FS0xjdlpKVDFEN0VFWUVlOGNpQmlOVnBuV1B3MlJhZTciLCJjbGllbnQiOiI3VDZ3aGl6OXVsdFllZ0dMYWtNSUk3NWJ6cTJHdzNTZjV2REQ4OWdsOGNJNTc1ZHEiLCJzZXNzaW9uVHlwZSI6InNpbmdsZSJ9Cg==";

function getAuthHeaders() {
    return {
        "Authorization": `Bearer ${TOKEN}`,
        "x-session-token": TOKEN,
        "Cookie": `lang=vi; SID=${SID}; ACCOUNT_CHOOSER=dHJhbmR1Y2x1b25n; session_token=${TOKEN}`,
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
        "Referer": "https://internal.thuocsi.vn/",
        "Origin": "https://internal.thuocsi.vn"
    };
}

function fetchUrl(url) {
    return new Promise((resolve, reject) => {
        https.request(url, { method: 'GET', headers: getAuthHeaders() }, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => resolve({ status: res.statusCode, data }));
        }).end();
    });
}

(async () => {
    const qs = encodeURIComponent(JSON.stringify({target: "wms-sku-location", primaryKey: "MEDX.GHKGEQ1P", path: ""}));
    const fullUrl = `https://internal.thuocsi.vn/backend/core/activity/v1/activity/list?q=${qs}&offset=0&limit=50&getTotal=true`;
    console.log("Fetching:", fullUrl);
    let r = await fetchUrl(fullUrl);
    console.log(`Status: ${r.status}\nData: ${r.data.substring(0, 300)}`);
})();
