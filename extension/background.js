// Opens the welcome page once, right after Snapply is installed (it also hands over any invite code).
chrome.runtime.onInstalled.addListener(({reason})=>{
  if(reason==='install')chrome.tabs.create({url:'https://snapply.co.uk/welcome'});
});

// Which frames of a tab hold a fillable form (reported by content.js), so the panel can talk to an
// application form embedded in an iframe. Session storage, because the worker may be stopped.
const framesKey=id=>'frames:'+id;
chrome.runtime.onMessage.addListener((m,sender,send)=>{
  // The in-page panel (an extension frame inside the page) asks which tab it sits in.
  if(m.type==='SNAPPLY_MY_TAB'){send(sender.tab||null);return}
  if(m.type==='SNAPPLY_FORM_FRAME'&&sender.tab){
    const id=sender.tab.id,fid=sender.frameId||0;
    chrome.storage.session.get(framesKey(id)).then(async r=>{
      const f=r[framesKey(id)]||{};f[fid]={fields:m.fields,known:m.known};
      await chrome.storage.session.set({[framesKey(id)]:f});
      // A recognisable form inside a frame: let the top page open the panel.
      if(fid!==0&&m.known>=3)chrome.tabs.sendMessage(id,{type:'SNAPPLY_FORM_IN_FRAME'},{frameId:0}).catch(()=>{});
    });
    return false;
  }
  if(m.type==='SNAPPLY_FORM_FRAMES'){chrome.storage.session.get(framesKey(m.tabId)).then(r=>send(r[framesKey(m.tabId)]||{}));return true}
});
chrome.tabs.onUpdated.addListener((id,info)=>{if(info.status==='loading')chrome.storage.session.remove(framesKey(id))});
chrome.tabs.onRemoved.addListener(id=>chrome.storage.session.remove(framesKey(id)));
