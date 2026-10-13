from __future__ import annotations
from copy import deepcopy
from typing import Any

ALLOWED_RESOLUTION_FIELDS={"dates","employer","role","institution","degree","country","evidence"}

def review_items(profile:dict[str,Any])->list[dict[str,Any]]:
    out=[]
    for i,item in enumerate(profile.get('unresolved') or []):
        out.append({
            'id':item.get('id') or f'unresolved-{i}',
            'field':item.get('field'),
            'reason':item.get('reason'),
            'source_value':item.get('source_value'),
            'status':item.get('status','OPEN')
        })
    return out

def resolve_profile(profile:dict[str,Any], unresolved_id:str, value:str)->dict[str,Any]:
    p=deepcopy(profile)
    unresolved=p.get('unresolved') or []
    target=None
    for i,u in enumerate(unresolved):
        uid=u.get('id') or f'unresolved-{i}'
        if uid==unresolved_id:
            target=(i,u);break
    if not target:
        raise ValueError('Unresolved item not found')
    i,u=target
    field=str(u.get('field') or '')
    # Supports paths like experience[2].dates and education[0].institution.
    import re
    m=re.fullmatch(r'(experience|education)\[(\d+)\]\.([a-z_]+)',field)
    if not m or m.group(3) not in ALLOWED_RESOLUTION_FIELDS:
        raise ValueError('Field cannot be resolved through this endpoint')
    coll,idx,key=m.group(1),int(m.group(2)),m.group(3)
    if idx>=len(p.get(coll) or []):
        raise ValueError('Profile record index out of range')
    p[coll][idx][key]=value
    p[coll][idx].pop('needs_confirmation',None)
    unresolved[i]={**u,'id':unresolved_id,'status':'RESOLVED','resolved_value':value}
    p['unresolved']=[x for x in unresolved if x.get('status')!='RESOLVED']
    p.setdefault('import_meta',{})['requires_user_review']=bool(p['unresolved'])
    return p
