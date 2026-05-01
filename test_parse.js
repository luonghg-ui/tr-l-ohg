const fs = require('fs');
const https = require('https');

const KEY_FIELDS = {
    dept:    ['BO PHAN', 'VI TRI', 'DEPARTMENT', 'VENDOR', 'BP', 'PHAN'],
    shift:   ['CA LAM', 'CA', 'SHIFT', 'KIP'],
    output:  ['SAN LUONG', 'QUANTITY', 'OUTPUT', 'THUC TE'],
};

function normKey(str) {
    if (!str) return '';
    return str.toString()
        .toUpperCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[ÐÐ]/gi, 'D')
        .trim();
}

function matchesKeyField(colName, keywords) {
    const col = normKey(colName);
    return keywords.some(kw => col.includes(normKey(kw)));
}

function getVal(item, fieldName) {
    const keywords = KEY_FIELDS[fieldName];
    if (!keywords) return '';
    const matches = Object.keys(item).filter(k => !k.endsWith('__raw') && matchesKeyField(k, keywords));
    if (matches.length === 0) return '';
    matches.sort((a, b) => a.length - b.length);
    return item[matches[0]] ?? '';
}

function parseNumericValue(item, fieldName) {
    if (!item) return 0;
    const keywords = KEY_FIELDS[fieldName];
    if (!keywords) return 0;

    const rawMatches = Object.keys(item).filter(k =>
        k.endsWith('__raw') && matchesKeyField(k.replace('__raw', ''), keywords)
    );
    if (rawMatches.length > 0) {
        rawMatches.sort((a, b) => a.length - b.length);
        const rawKey = rawMatches[0];
        const rawVal = item[rawKey];
        if (typeof rawVal === 'number' && !isNaN(rawVal)) return rawVal;
    }
    const val = getVal(item, fieldName);
    if (!val || val === '') return 0;
    const cleaned = val.toString().replace(/[^0-9]/g, '');
    return cleaned ? parseInt(cleaned) : 0;
}

https.get('https://docs.google.com/spreadsheets/d/1Atqwv9UdG_Ro_CBbamctGENgf-ZiUl73NrQeOaQFbK4/gviz/tq?gid=2012066668', (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        const jsonStr = data.match(/google\.visualization\.Query\.setResponse\((.*)\);/)[1];
        const json = JSON.parse(jsonStr);
        const headers = json.table.cols.map(c => c && c.label ? c.label.trim() : '');
        
        const rows = (json.table.rows || []).map(r => {
            const item = {};
            r.c.forEach((cell, i) => {
                if (!headers[i]) return;
                const raw = cell ? cell.v : null;
                if (raw !== null && raw !== undefined && raw !== '') {
                    item[headers[i] + '__raw'] = raw;
                    item[headers[i]] = String(raw);
                }
            });
            return item;
        });

        console.log('Sample row raw:', Object.keys(rows[0]));
        console.log('Sample row items:', rows[0]);
        console.log('Parsed output for 5 rows:');
        rows.slice(0, 5).forEach(r => {
            console.log('Dept:', getVal(r, 'dept'), 'Shift:', getVal(r, 'shift'), 'Output:', parseNumericValue(r, 'output'));
        });
    });
});
