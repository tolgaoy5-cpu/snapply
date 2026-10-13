"""Saved question answers survive a fresh process, update in place, and coexist with older state."""
from pathlib import Path
from tempfile import TemporaryDirectory
import json, os, sys, subprocess

ROOT = Path(__file__).parent.parent
with TemporaryDirectory() as td:
    data = Path(td) / 'state'
    env = os.environ.copy(); env['JOB_COPILOT_DATA_DIR'] = str(data); env['PYTHONPATH'] = str(ROOT / 'backend')
    # A state file written before saved_answers existed must load and keep its data.
    data.mkdir()
    (data / 'state.json').write_text(json.dumps({'schema_version': 1, 'master_profile': {'full_name': 'Old'}, 'application_memory': {'title': {'value': 'Ms'}}, 'saved_cv': {}}))
    write = """from state_store import upsert_saved_answer,load_state
upsert_saved_answer({'signature':'how long is your current notice period','question':'How long is your current notice period?*','value':'1 month','kind':'text','sensitivity':'normal','confirmed_at':'t1'})
upsert_saved_answer({'signature':'are you barred from working with children','question':'Are you barred from working with children?*','value':'No','kind':'choice','sensitivity':'legal','confirmed_at':'t1'})
upsert_saved_answer({'signature':'how long is your current notice period','question':'How long is your current notice period?*','value':'2 weeks','kind':'text','sensitivity':'normal','confirmed_at':'t2'})
s=load_state()
assert s['master_profile']['full_name']=='Old' and s['application_memory']['title']['value']=='Ms'
n=s['saved_answers']['how long is your current notice period']
assert n['value']=='2 weeks' and n['created_at']=='t1' and n['confirmed_at']=='t2'"""
    write_refs = """from state_store import set_referees,load_state
set_referees([{'label':'Jane Doe - Example School','fields':{'first-name':'Jane','surname':'Doe'}}])
assert load_state()['referees'][0]['fields']['surname']=='Doe'"""
    read = """from state_store import load_state,delete_saved_answer
s=load_state();a=s['saved_answers']
assert a['are you barred from working with children']['sensitivity']=='legal'
assert a['how long is your current notice period']['value']=='2 weeks'
delete_saved_answer('are you barred from working with children')
assert 'are you barred from working with children' not in load_state()['saved_answers']
assert load_state()['master_profile']['full_name']=='Old'"""
    subprocess.run([sys.executable, '-c', write], check=True, env=env)
    subprocess.run([sys.executable, '-c', write_refs], check=True, env=env)
    subprocess.run([sys.executable, '-c', read+"\nassert load_state()['referees'][0]['label']=='Jane Doe - Example School'"], check=True, env=env)
print('Saved answers persistence regression passed (upsert, fresh process, delete, legacy state)')
