const https = require('https');
let SID = "eyJ0eXBlIjoic2lkIiwiaXNzIjoiQnV5bWVkLUFQIiwidG9rZW4iOiJ5ZjdYR2xyMTNMaUNjMU1RTEtERTVtS2ZwMmRpVEwyMmplOEl0NEc0NmRIZXg3WFoiLCJjbGllbnQiOiI3VDZ3aGl6OXVsdFllZ0dMYWtNSUk3NWJ6cTJHdzNTZjV2REQ4OWdsOGNJNTc1ZHEiLCJzZXNzaW9uVHlwZSI6InNpbmdsZSJ9Cg==";
let TOKEN = "eyJ0eXBlIjoiYWNjZXNzX3Rva2VuIiwiaXNzIjoiQnV5bWVkLUFQIiwidG9rZW4iOiJ4aXBaZVY0QzN0bXJmZVZTTkx1TVFYV2VyQmwyM2xYNjJ4OUFzbTlJZ1Zra2M5SVAiLCJjbGllbnQiOiI5ZjM1MkFGclVESVJTOFc0amxZQldLRHJKNjFwNHdFOHF0TDRtcDdEQUg0dkVqamkifQo=";

function getAuthHeaders() {
    return {
        "Authorization": `Bearer ${TOKEN}`,
        "x-session-token": TOKEN,
        "Cookie": `lang=vi; SID=${SID}; ACCOUNT_CHOOSER=dHJhbmR1Y2x1b25n; session_token=${TOKEN}`
    };
}

const sku = "MEDX.GHKGEQ1P";
const fullUrl = `https://internal.thuocsi.vn/wms/BUYMED/HN/inventory/sku/detail?sku=${sku}&warehouseCode=HN&group=BUYMED`;

https.get(fullUrl, { headers: getAuthHeaders() }, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        const match = data.match(/id="__NEXT_DATA__" type="application\/json">({.*?})<\/script>/);
        if (match) {
            const nextData = JSON.parse(match[1]);
            const pp = nextData?.props?.pageProps || {};
            console.log("Keys in pageProps:", Object.keys(pp));
            // Let's also check if there's any history object
            Object.keys(pp).forEach(k => {
                if (k.toLowerCase().includes('history') || k.toLowerCase().includes('mapping')) {
                    console.log("Found related key:", k);
                    console.log(JSON.stringify(pp[k]).substring(0, 500));
                }
            });
        } else {
            console.log("No NEXT_DATA found");
        }
    });
});
