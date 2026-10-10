// Optional preprocessing in an isolated headless Edge. No user-browser connection.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';import {createRequire} from 'node:module';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),require=createRequire(import.meta.url);
const {chromium}=require(process.env.ATLAS_PLAYWRIGHT||'playwright');
const cache=path.resolve(process.env.ATLAS_POSTER_CACHE||path.join(root,'scripts/.poster-cache'));fs.mkdirSync(cache,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
try{const context=await browser.newContext({viewport:{width:720,height:560},deviceScaleFactor:2});await context.setOffline(true);const page=await context.newPage();
for(const id of['form','earth','terrain']){
 let svg=fs.readFileSync(path.join(root,`assets/posters/${id}.svg`),'utf8').replace(/<text\b[^>]*>[\s\S]*?<\/text>/g,'');
 if(id==='earth')svg=svg.replace(/<circle\b[^>]*cy="529"[^>]*\/>/g,'');
 const html=path.join(cache,`${id}.html`);fs.writeFileSync(html,`<!doctype html><style>html,body{margin:0;background:transparent;overflow:hidden}svg{width:100vw;height:100vh}</style>${svg}`);
 await page.goto(pathToFileURL(html).href);const target=path.join(root,`assets/posters/${id}.png`);await page.screenshot({path:target,omitBackground:true});console.log(`${id}.png: ${fs.statSync(target).size} bytes`);
}}finally{await browser.close()}
