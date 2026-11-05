// Actual cold-cache browser/Lighthouse measurement; never changes preview indexing.
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {createServer} from 'node:http';
import {gzipSync} from 'node:zlib';
import {existsSync} from 'node:fs';
import os from 'node:os';

const input=process.argv[2];
if(!input)throw new Error('Usage: npm run test:menu-performance -- http://127.0.0.1:8793/m/SYNTHETIC-SLUG [output] [--gzip-local]');
const target=new URL(input),out=process.argv[3]||'output/playwright/next-menu/performance';
const compress=process.argv.includes('--gzip-local');
if(compress&&!['localhost','127.0.0.1'].includes(target.hostname))throw new Error('Compression proxy is restricted to a local synthetic Worker');
await mkdir(out,{recursive:true});
let server,url=input;
if(compress){
 server=createServer(async(req,res)=>{
  try{
   const upstream=await fetch(new URL(req.url,target.origin),{headers:{'accept-encoding':'identity'}});
   const body=Buffer.from(await upstream.arrayBuffer());
   const headers=Object.fromEntries(upstream.headers);
   delete headers['content-length'];delete headers['transfer-encoding'];delete headers['content-encoding'];
   const type=headers['content-type']||'';
   const encode=/text|javascript|json|xml|svg/.test(type)&&body.length>256;
   const bytes=encode?gzipSync(body):body;
   if(encode)headers['content-encoding']='gzip';
   headers['content-length']=String(bytes.length);
   res.writeHead(upstream.status,headers);res.end(bytes);
  }catch(e){res.writeHead(502);res.end(String(e));}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 url=`http://127.0.0.1:${server.address().port}${target.pathname}${target.search}`;
}
const executablePath=process.env.CHROMIUM_PATH||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':chromium.executablePath());
const browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox','--disable-dev-shm-usage','--remote-debugging-port=0']});
try{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,deviceScaleFactor:1,hasTouch:true,serviceWorkers:'block'});
 const page=await context.newPage(),cdp=await context.newCDPSession(page),requests=new Map(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await cdp.send('Network.enable');await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
 cdp.on('Network.responseReceived',({requestId,type,response})=>requests.set(requestId,{url:response.url,type,mime:response.mimeType,status:response.status,cache:response.fromDiskCache||response.fromServiceWorker||false,headers:response.headers}));
 cdp.on('Network.loadingFinished',({requestId,encodedDataLength})=>{const row=requests.get(requestId);if(row)row.encodedTransferBytes=encodedDataLength;});
 const response=await page.goto(url,{waitUntil:'networkidle'});
 await page.locator('.dish').first().waitFor();
 await page.evaluate(()=>document.fonts.ready);
 await page.waitForTimeout(1500); // bounded settling window; no scroll/interactions/poll interval
 const rows=[...requests.values()];
 const nonImages=rows.filter(r=>r.type!=='Image'&&!r.mime.startsWith('image/')&&!/\.(png|jpe?g|webp|avif|gif|svg|ico)(?:$|[?#])/i.test(r.url));
 const bytes=nonImages.reduce((n,r)=>n+(r.encodedTransferBytes||0),0);
 const recipe=await page.evaluate(()=>({title:document.title,lang:document.documentElement.lang,bodyClass:document.body.className,firstDish:getComputedStyle(document.querySelector('.dish')).display,visibleImages:document.querySelectorAll('.dish img').length,fontFamily:getComputedStyle(document.body).fontFamily,background:getComputedStyle(document.body).backgroundColor,theme:document.documentElement.dataset.theme||document.documentElement.className,menuClass:document.querySelector('.menu-grid,.menu-list,.dishes')?.className||null}));
 const transfer={url:input,measuredURL:url,transport:compress?'explicit local gzip proxy preserving all response headers including robots':'direct Worker response',window:'cold navigation through networkidle + document.fonts.ready + 1500ms; no scroll',cache:'fresh context; HTTP cache disabled; service workers blocked',viewport:{width:390,height:844,deviceScaleFactor:1},encodedNonImageTransferBytes:bytes,limitBytes:150000,pass:bytes<150000,accounting:'CDP Network.loadingFinished.encodedDataLength summed for every non-image response including document, fonts, CSS, JS and API; includes HTTP headers (conservative). Failed/unfinished requests listed with missing byte counts.',responseHeaders:await response.allHeaders(),recipe,errors,requests:rows};
 await writeFile(`${out}/transfer.json`,JSON.stringify(transfer,null,2));
 await context.close();
 // Lighthouse gets its own cold navigation and its standard mobile simulation.
 const require=createRequire(import.meta.url);
 const lighthouseModule=process.env.LIGHTHOUSE_MODULE||require.resolve('lighthouse');
 const {default:lighthouse}=await import(pathToFileURL(lighthouseModule));
 const portProbe=createServer();
 await new Promise(resolve=>portProbe.listen(0,'127.0.0.1',resolve));
 const debugPort=portProbe.address().port;await new Promise(resolve=>portProbe.close(resolve));
 const lhBrowser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox','--disable-dev-shm-usage',`--remote-debugging-port=${debugPort}`]});
 let result;
 try{
 result=await lighthouse(url,{port:debugPort,output:['json','html'],onlyCategories:['performance','accessibility','seo'],logLevel:'error',formFactor:'mobile',throttlingMethod:'simulate',disableStorageReset:false});
 }finally{await lhBrowser.close();}
 await writeFile(`${out}/lighthouse.json`,result.report[0]);
 await writeFile(`${out}/lighthouse.html`,result.report[1]);
 const lhr=result.lhr;
 const summary={timestamp:new Date().toISOString(),target:input,transport:transfer.transport,node:process.version,platform:`${os.platform()} ${os.release()} ${os.arch()}`,browser:lhr.environment,lighthouseVersion:lhr.lighthouseVersion,config:lhr.configSettings,recipe,scores:Object.fromEntries(Object.entries(lhr.categories).map(([k,v])=>[k,Math.round(v.score*100)])),encodedNonImageTransferBytes:bytes,nonImageLimitBytes:150000,runtimeError:lhr.runtimeError||null,warnings:lhr.runWarnings,failedAudits:Object.entries(lhr.audits).filter(([,v])=>v.score!==null&&v.score<1).map(([id,v])=>({id,title:v.title,score:v.score,displayValue:v.displayValue,details:v.details}))};
 await writeFile(`${out}/summary.json`,JSON.stringify(summary,null,2));
 console.log(JSON.stringify({...summary,failedAudits:summary.failedAudits.map(({id,title,score,displayValue})=>({id,title,score,displayValue})),config:summary.config},null,2));
 if(lhr.runtimeError||Object.values(summary.scores).some(s=>s<90)||!transfer.pass||errors.length)process.exitCode=1;
}finally{await browser.close();if(server)await new Promise(resolve=>server.close(resolve));}
