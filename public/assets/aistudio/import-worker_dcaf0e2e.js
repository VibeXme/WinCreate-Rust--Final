/*! WinCreate application code. All rights reserved by its respective authors. No redistribution license is granted for original application code. Third-party components retain their own licenses. */
'use strict';importScripts('security.js?v=6.5.2');self.onmessage=e=>{try{self.postMessage({project:WCGuard.cleanProject(JSON.parse(e.data))});}catch(error){self.postMessage({error:error.message});}};
