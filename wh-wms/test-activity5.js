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
    // Let's fetch the sku/detail HTML to see if __NEXT_DATA__ has the activity URL config
    let rHtml = await fetchUrl("GET", "https://internal.thuocsi.vn/wms/BUYMED/HN/inventory/sku/detail?sku=MEDX.GHKGEQ1P");
    if (rHtml.data) {
        const match = rHtml.data.match(/id="__NEXT_DATA__"[^>]*>({.*?})<\/script>/);
        if (match) {
            console.log("NEXT_DATA found!");
            // search for 'activity' or 'history' strings in the JSON string
            const jsonStr = match[1];
            const regex = /"https?:\/\/[^"]*(activity|history)[^"]*"/gi;
            let m;
            let foundUrls = new Set();
            while ((m = regex.exec(jsonStr)) !== null) {
                foundUrls.add(m[0]);
            }
            console.log("Found activity/history URLs in NEXT_DATA:", Array.from(foundUrls));
        } else {
            console.log("NEXT_DATA not found in HTML");
        }
    }
})();
