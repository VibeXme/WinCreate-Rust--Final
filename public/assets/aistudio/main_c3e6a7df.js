const electron=require('electron'),{app,BrowserWindow}=electron,path=require('node:path');
const runtime=require('./engine-runtime.cjs').boot(electron);
function createWindow(){
 const win=new BrowserWindow({width:1440,height:900,minWidth:900,minHeight:620,backgroundColor:'#0b0d12',autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:!runtime.backgroundRendering}});
 runtime.installMenu();win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 win.webContents.on('will-navigate',(event,url)=>{if(url!==win.webContents.getURL())event.preventDefault();});
 win.loadFile(path.join(__dirname,'app','index.html'));
 return win;
}
app.whenReady().then(()=>{createWindow();app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow();});});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
