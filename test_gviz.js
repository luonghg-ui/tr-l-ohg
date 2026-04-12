const https = require('https');

const SHEET_ID = '1Xhtmq2Y_YVC3qrd2y1RrONmuUxssHoN6vAJjOWFgHrA';
const GID = '366393828';
const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?gid=${GID}&tqx=out:json`;

https.get(url, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    // google gviz usually wraps in syntax like /*O_o*/\ngoogle.visualization.Query.setResponse({...})
    const jsonStr = data.match(/google\.visualization\.Query\.setResponse\((.*)\);/)[1];
    const json = JSON.parse(jsonStr);
    
    console.log("COLS:", json.table.cols.map(c => c ? c.label : null));
    console.log("ROW 1:", json.table.rows[0].c.map(c => c ? c.v : null));
    console.log("ROW 2:", json.table.rows[1].c.map(c => c ? c.v : null));
    console.log("ROW 6:", json.table.rows[5].c.map(c => c ? c.v : null));
  });
});
