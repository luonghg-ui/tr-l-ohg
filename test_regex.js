function normKey(str) {
    if (!str) return '';
    return str.toString()
        .toUpperCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[ÐÐ]/gi, 'D')
        .trim();
}
var col = normKey('S?n lý?ng');
var kw = normKey('SAN LUONG');
WScript.Echo(col + ' == ' + kw + ' -> ' + (col.indexOf(kw) !== -1));
