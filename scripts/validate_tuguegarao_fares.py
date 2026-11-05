#!/usr/bin/env python3
"""Validate transcription structure only: NOT proof of legal rates/route scope."""
import csv
from decimal import Decimal
from pathlib import Path
p=Path(__file__).resolve().parents[1]/'data/fare-matrix/tuguegarao-fare-matrix-user-supplied.csv'
with p.open(encoding='utf-8-sig', newline='') as f: rows=list(csv.DictReader(f))
assert len(rows)==43, f'expected 42 named entries plus 1 poblacion row; found {len(rows)}'
assert sum(x['category']=='LISTED_AREA' for x in rows)==42
assert sum(x['category']=='POBLACION' for x in rows)==1
assert len({x['destination_label'].casefold() for x in rows})==43
for x in rows:
 r=Decimal(x['regular_php']);d=Decimal(x['student_senior_pwd_php'])
 assert 0 <= d <= r
 assert x['status']=='UNVERIFIED_PENDING_CITY_APPROVAL'
 assert x['effective_from']==''
pob=next(x for x in rows if x['category']=='POBLACION')
assert pob['regular_php']=='22.00' and pob['student_senior_pwd_php']=='18.00'
print('Structure valid: 42 area rows + 1 poblacion row. No legal/route/effective-date approval inferred.')
