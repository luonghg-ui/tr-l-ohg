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

function fetchUrl(method, url) {
    return new Promise((resolve, reject) => {
        https.request(url, { method, headers: getAuthHeaders() }, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => resolve({ status: res.statusCode, data }));
        }).end();
    });
}

(async () => {
    const urls = [
        "https://internal.thuocsi.vn/marketplace/warehouse/private/sku/mapping/history?sku=MEDX.GHKGEQ1P",
        "https://internal.thuocsi.vn/wms/v2/private/location-mapping/history?sku=MEDX.GHKGEQ1P&warehouseCode=HN",
        "https://internal.thuocsi.vn/marketplace/warehouse/private/location-mapping/history?sku=MEDX.GHKGEQ1P&warehouseCode=HN",
        "https://internal.thuocsi.vn/wms/BUYMED/HN/inventory/mapping-location/history?sku=MEDX.GHKGEQ1P"
    ];
    for(let u of urls) {
        let r = await fetchUrl("GET", u);
        console.log(`\nURL: ${u}\nStatus: ${r.status}\nData: ${r.data.substring(0, 150)}`);
    }
})();
