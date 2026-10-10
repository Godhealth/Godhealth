const { chromium, devices } = require('playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=__dirname;const mime={'.html':'text/html','.js':'application/javascript','.json':'application/json'};
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!file.startsWith(root+path.sep)&&file!==root){res.writeHead(403).end();return}fs.readFile(file,(e,bytes)=>{if(e){res.writeHead(404).end();return}res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'}).end(bytes)})});
(async()=>{await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url='http://127.0.0.1:'+server.address().port+'/index.html';const browser=await chromium.launch({headless:true});try{
for(const [label,options] of [['desktop',{viewport:{width:1440,height:900}}],['mobile',devices['iPhone 13']]]){
 const context=await browser.newContext({...options,acceptDownloads:true});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(url);await page.locator('#app h1').waitFor();assert.equal(await page.locator('header strong').innerText(),'GODHEALTH');assert.equal(await page.locator('body').evaluate(el=>el.scrollWidth<=innerWidth+2),true,label+' horizontal overflow');
 // Exercise a complete browser questionnaire using the actual UI.
 let finished=false;for(let step=0;step<180;step++){
  if(await page.getByText('Your Kingdom Capacity Results').count()){finished=true;break}
  const choice=page.locator('.choice');if(await choice.count()){
   const texts=await choice.allTextContents();let i=texts.findIndex(t=>/^no$|^none$|^never$|^not applicable$/i.test(t.trim()));if(i<0)i=0;await choice.nth(i).click();await page.waitForTimeout(470);
  }else{
   const free=page.locator('#free');if(!await free.count())throw Error(label+': questionnaire ended unexpectedly');
   const question=(await page.locator('article h1').innerText()).toLowerCase();const value=/height|tall|centimet/.test(question)?'175':/age|old are you/.test(question)?'30':/weight|kilogram|waist|circumference/.test(question)?'75':'No';await free.fill(value);await page.locator('#next').click();
  }
 }
 assert.ok(finished,label+' assessment did not finish');const [download]=await Promise.all([page.waitForEvent('download'),page.getByText('Download printable report').click()]);const filename=download.suggestedFilename();assert.ok(filename.endsWith('.html'));const file=path.join(require('node:os').tmpdir(),label+'-godhealth-report.html');await download.saveAs(file);const html=fs.readFileSync(file,'utf8');assert.match(html,/12-Week Action Workbook/);assert.match(html,/Official USDA Nutrient Calculations/);
 const reportPage=await context.newPage();await reportPage.goto('http://127.0.0.1:'+server.address().port+'/index.html');await reportPage.setContent(html,{waitUntil:'load'});const pdf=await reportPage.pdf({format:'A4',printBackground:true});assert.ok(pdf.length>15000,label+' PDF suspiciously small');fs.writeFileSync(path.join(require('node:os').tmpdir(),label+'-godhealth-report.pdf'),pdf);assert.equal(errors.length,0,label+': '+errors.join('; '));console.log(label+' browser assessment + USDA HTML + real PDF passed; bytes='+pdf.length);await context.close();
 }
}finally{await browser.close();server.close()}})().catch(e=>{console.error(e);server.close();process.exitCode=1});