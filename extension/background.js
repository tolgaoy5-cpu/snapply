// Opens the welcome page once, right after Snapply is installed (it also hands over any invite code).
chrome.runtime.onInstalled.addListener(({reason})=>{
  if(reason==='install')chrome.tabs.create({url:'https://snapply.co.uk/welcome'});
});
