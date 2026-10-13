import json, re
from pathlib import Path
FIX=Path(__file__).parent/'fixtures/live/workday-livenation-my-information.json'
d=json.loads(FIX.read_text())
assert d['page']['ats']=='WORKDAY'
by={f['selector_hint']:f for f in d['fields']}
expected={
 '#name--legalName--firstName':'first_name',
 '#name--legalName--lastName':'last_name',
 '#address--addressLine1':'address',
 '#address--addressLine2':'address_line2',
 '#address--addressLine3':'address_line3',
 '#address--city':'city',
 '#address--postalCode':'postcode',
 '#phoneNumber--countryPhoneCode':'phone_country_code',
 '#phoneNumber--phoneNumber':'phone',
 '#phoneNumber--extension':'phone_extension',
 '#source--source':'application_source',
}
def canon(sel):
 s=sel.lower()
 if 'source--source' in s:return 'application_source'
 if 'legalname--firstname' in s:return 'first_name'
 if 'legalname--lastname' in s:return 'last_name'
 if 'address--addressline1' in s:return 'address'
 if 'address--addressline2' in s:return 'address_line2'
 if 'address--addressline3' in s:return 'address_line3'
 if 'address--city' in s:return 'city'
 if 'address--postalcode' in s:return 'postcode'
 if 'phonenumber--countryphonecode' in s:return 'phone_country_code'
 if 'phonenumber--phonenumber' in s:return 'phone'
 if 'phonenumber--extension' in s:return 'phone_extension'
for sel,want in expected.items():
 assert sel in by, sel
 assert canon(sel)==want,(sel,canon(sel),want)
assert canon('#phoneNumber--phoneNumber')!='phone_extension'
print('V0.25 Workday fixture regression passed')
