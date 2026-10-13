from pathlib import Path
from tempfile import TemporaryDirectory
import os,sys,subprocess
ROOT=Path(__file__).parent.parent
with TemporaryDirectory() as td:
    env=os.environ.copy();env['JOB_COPILOT_DATA_DIR']=str(Path(td)/'state');env['PYTHONPATH']=str(ROOT/'backend')
    write="""from state_store import set_master_profile,set_memory_item,save_cv,load_state,get_saved_cv_meta,get_saved_cv_bytes
set_master_profile({'full_name':'Persistence Test','experience':[{'role':'x'}]})
set_memory_item('notice_period',{'value':'1 month','confirmed_at':'now','source':'user_confirmed'})
save_cv(b'fake-cv-bytes',filename='cv.pdf',content_type='application/pdf')
s=load_state();assert s['master_profile']['full_name']=='Persistence Test';assert s['application_memory']['notice_period']['value']=='1 month';assert get_saved_cv_meta()['name']=='cv.pdf';assert get_saved_cv_bytes()==b'fake-cv-bytes'"""
    read="""from state_store import load_state,get_saved_cv_meta,get_saved_cv_bytes
s=load_state();assert s['master_profile']['full_name']=='Persistence Test';assert s['application_memory']['notice_period']['value']=='1 month';assert get_saved_cv_meta()['name']=='cv.pdf';assert get_saved_cv_bytes()==b'fake-cv-bytes'"""
    subprocess.run([sys.executable,'-c',write],check=True,env=env)
    subprocess.run([sys.executable,'-c',read],check=True,env=env)
print('Persistent profile/Application Memory/saved CV regression passed across fresh processes')
