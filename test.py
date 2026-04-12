import urllib.request
import json
import re

url = 'https://docs.google.com/spreadsheets/d/1Xhtmq2Y_YVC3qrd2y1RrONmuUxssHoN6vAJjOWFgHrA/gviz/tq?gid=366393828&tqx=out:json'
req = urllib.request.Request(url)
with urllib.request.urlopen(req) as response:
    data = response.read().decode('utf-8')
    match = re.search(r'google\.visualization\.Query\.setResponse\((.*?)\);', data, re.DOTALL)
    if match:
        json_str = match.group(1)
        data_json = json.loads(json_str)
        cols = data_json['table'].get('cols', [])
        print("COLS:")
        for idx, c in enumerate(cols):
            print(f"  Col {idx}: id={c.get('id') if c else None}, label={c.get('label') if c else None}")
