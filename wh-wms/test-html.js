const https = require('https');
const TOKEN = "eyJ0eXBlIjoiYWNjZXNzX3Rva2VuIiwiaXNzIjoiQnV5bWVkLUFQIiwidG9rZW4iOiI3aWFleXVRdHhoMXBORzJ3THN2c05kQ0pzMjJBMjk2UXBwNzZlZlI1emY2QlRobVQiLCJjbGllbnQiOiI5ZjM1MkFGclVESVJTOFc0amxZQldLRHJKNjFwNHdFOHF0TDRtcDdEQUg0dkVqamkifQo=";
const SID = "eyJ0eXBlIjoic2lkIiwiaXNzIjoiQnV5bWVkLUFQIiwidG9rZW4iOiJxd0daS1FVMlM4aHh5dG1FS0xjdlpKVDFEN0VFWUVlOGNpQmlOVnBuV1B3MlJhZTciLCJjbGllbnQiOiI3VDZ3aGl6OXVsdFllZ0dMYWtNSUk3NWJ6cTJHdzNTZjV2REQ4OWdsOGNJNTc1ZHEiLCJzZXNzaW9uVHlwZSI6InNpbmdsZSJ9Cg==";

function getAuthHeaders() {
    return {
        "Authorization": `Bearer ${TOKEN}`,
        "x-session-token": TOKEN,
        "Cookie": `lang=vi; SID=${SID}; ACCOUNT_CHOOSER=dHJhbmR1Y2x1b25n; session_token=${TOKEN}`,
        "User-Agent": "Mozilla/5.0",
        "Referer": "https://internal.thuocsi.vn/",
        "Origin": "https://internal.thuocsi.vn"
    };
}

https.request("https://internal.thuocsi.vn/wms/BUYMED/HN/inventory/sku/detail?sku=MEDX.GHKGEQ1P", { method: "GET", headers: getAuthHeaders() }, (res) => {
    let data = '';
    res.on('data', c => data += c);
    res.on('end', () => {
        console.log("HTML length:", data.length);
        console.log("Contains wms-mapping-sku?", data.includes("wms-mapping-sku"));
        console.log("Contains Nguyễn Tiến Đạt?", data.includes("Nguyễn Tiến Đạt"));
        console.log("Contains I1A74PA24?", data.includes("I1A74PA24"));
    });
}).end();
