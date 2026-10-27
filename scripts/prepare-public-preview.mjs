import { mkdir, cp, writeFile } from 'node:fs/promises';
import { resolve,dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const dist=resolve(root,'dist');
await mkdir(dist,{recursive:true});
for(const item of ['index.html','coaching','method','about-robin','client-stories','resources','start-here','faq','contact','guides','privacy.html','404.html','sitemap.xml','robots.txt','assets','ads/blueprint-landing/assets','kingdom-vitality-scan.html','godhealth-config.js','styles.css','luxury.css','script.js','client/index.html']){
 await cp(resolve(root,item),resolve(dist,item),{recursive:true,filter:(name)=>!name.split('/').at(-1).startsWith('.')});
}
// Preview-only device frames. These are never committed or deployed to Vercel.
for(const [file,path] of [['mobile-home','/'],['mobile-coaching','/coaching/'],['mobile-guide','/guides/christian-fat-loss/']]){
 await writeFile(resolve(dist,`${file}.html`),`<!doctype html><html><head><meta name="robots" content="noindex"><title>GodHealth · 390px mobile QA</title><style>body{margin:0;background:#e1e4df;display:flex;justify-content:center;align-items:start}iframe{width:390px;height:844px;border:0;background:white}</style></head><body><iframe src="${path}" title="GodHealth mobile preview" width="390" height="844"></iframe></body></html>`);
}
console.log('Preview copy prepared in dist. Do not commit dist or .openai.');
await writeFile(resolve(dist,'qa-responsive.html'),`<!doctype html><html><head><meta name="robots" content="noindex"><title>GodHealth responsive QA</title><style>body{margin:0;background:#e1e4df;display:flex;justify-content:center;align-items:start}iframe{height:844px;border:0;background:white;flex-shrink:0}</style></head><body><iframe title="GodHealth responsive preview" height="844"></iframe><script>const q=new URLSearchParams(location.search);const f=document.querySelector('iframe');const p=q.get('path')||'/';f.src=p.startsWith('/')&&!p.startsWith('//')?p:'/';f.style.width=Math.max(300,Math.min(1200,Number(q.get('width'))||390))+'px';</script></body></html>`);
