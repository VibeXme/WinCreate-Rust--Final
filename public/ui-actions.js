/*! WinCreate application code. All rights reserved by its respective authors. No redistribution license is granted for original application code. Third-party components retain their own licenses. */
'use strict';
const WC_UI_ACTIONS={
'0':function(event){goToPage('pageStudio');}
,'1':function(event){goToPage('pageSetup');}
,'2':function(event){goToPage('pageStudio');}
,'3':function(event){togglePop('layers');}
,'4':function(event){$('layerMenuSheet').classList.remove('open');}
,'5':function(event){togglePop('color');}
,'6':function(event){generateAiPalette('obsidian');}
,'7':function(event){generateAiPalette('cyber');}
,'8':function(event){generateAiPalette('forest');}
,'9':function(event){generateAiPalette('solar');}
,'10':function(event){togglePop('settings');}
,'11':function(event){switchSettingsTab('appearance',this);}
,'12':function(event){switchSettingsTab('antialias',this);}
,'13':function(event){switchSettingsTab('rendering',this);}
,'14':function(event){switchSettingsTab('smudge',this);}
,'15':function(event){switchSettingsTab('keybinds',this);}
,'16':function(event){togglePop('trace');}
,'17':function(event){loadSampleReference('anime');}
,'18':function(event){loadSampleReference('car');}
,'19':function(event){loadSampleReference('lotus');}
,'20':function(event){loadSampleReference('wolf');}
,'21':function(event){togglePop('brush');}
,'22':function(event){togglePop('actions');}
,'23':function(event){goToPage('pageSetup');}
,'24':function(event){togglePop('trace');}
,'25':function(event){spawnInteractiveShape('star');closePops();}
,'26':function(event){togglePop('adjust');}
,'27':function(event){switchSettingsTab('gpu',this);}
};
document.querySelectorAll('[data-wc-action]').forEach(el=>el.addEventListener('click',e=>WC_UI_ACTIONS[el.dataset.wcAction]?.call(el,e)));
