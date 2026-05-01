const https = require('https');

const TOKEN = "eyJ0eXBlIjoiYWNjZXNzX3Rva2VuIiwiaXNzIjoiQnV5bWVkLUFQIiwidG9rZW4iOiI3aWFleXVRdHhoMXBORzJ3THN2c05kQ0pzMjJBMjk2UXBwNzZlZlI1emY2QlRobVQiLCJjbGllbnQiOiI5ZjM1MkFGclVESVJTOFc0amxZQldLRHJKNjFwNHdFOHF0TDRtcDdEQUg0dkVqamkifQo=";
const SID = "eyJ0eXBlIjoic2lkIiwiaXNzIjoiQnV5bWVkLUFQIiwidG9rZW4iOiJxd0daS1FVMlM4aHh5dG1FS0xjdlpKVDFEN0VFWUVlOGNpQmlOVnBuV1B3MlJhZTciLCJjbGllbnQiOiI3VDZ3aGl6OXVsdFllZ0dMYWtNSUk3NWJ6cTJHdzNTZjV2REQ4OWdsOGNJNTc1ZHEiLCJzZXNzaW9uVHlwZSI6InNpbmdsZSJ9Cg==";

function getAuthHeaders() {
    return {
        "Authorization": `Bearer ${TOKEN}`,
        "x-session-token": TOKEN,
        "Cookie": `lang=vi; SID=${SID}; ACCOUNT_CHOOSER=dHJhbmR1Y2x1b25n; session_token=${TOKEN}`,
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/135.0.0.0 Safari/537.36"
    };
}

function fetchUrl(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: getAuthHeaders() }, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => resolve({ status: res.statusCode, data }));
        }).on('error', reject);
    });
}

(async () => {
    // 1. Check template API just to see what it is
    let res1 = await fetchUrl("https://internal.thuocsi.vn/backend/core/activity/v1/template?codes=wms-mapping-sku-delete%2Cwms-mapping-sku");
    console.log("Template:", res1.data.substring(0, 300));
    
    // 2. Try to fetch the actual activities for MEDX.GHKGEQ1P
    // Let's guess the endpoint based on the template API structure
    const urls = [
        "https://internal.thuocsi.vn/backend/core/activity/v1/activity?code=wms-mapping-sku&objectId=MEDX.GHKGEQ1P",
        "https://internal.thuocsi.vn/backend/core/activity/v1/activity?target=MEDX.GHKGEQ1P",
        "https://internal.thuocsi.vn/backend/core/activity/v1/activity?search=MEDX.GHKGEQ1P",
        "https://internal.thuocsi.vn/backend/core/activity/v1/activities?target=MEDX.GHKGEQ1P"
    ];
    for(let u of urls) {
        let r = await fetchUrl(u);
        console.log(`\nURL: ${u}\nStatus: ${r.status}\nData: ${r.data.substring(0, 200)}`);
    }
})();
