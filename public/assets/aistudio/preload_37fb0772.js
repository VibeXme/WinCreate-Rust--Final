const {contextBridge}=require('electron');contextBridge.exposeInMainWorld('WinCreateDesktop',{platform:process.platform,version:'6.6.0'});
