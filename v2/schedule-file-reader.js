/* ControlFaltas · import files as positioned text. Data never leaves the browser.
 * Dependencies (PDF.js, Tesseract.js, Mammoth) are downloaded on demand.
 */
(function(root,factory){const api=factory(root);if(typeof module!=='undefined'&&module.exports)module.exports=api;root.ScheduleFileReader=api})(typeof window!=='undefined'?window:globalThis,function(root){
'use strict';
let cache={};
function progress(cb,message){if(typeof cb==='function')cb(message)}
function loadScript(url,exists){
  if(exists())return Promise.resolve();
  if(cache[url])return cache[url];
  cache[url]=new Promise((resolve,reject)=>{
    const tag=document.createElement('script');tag.src=url;tag.async=true;
    tag.onload=()=>exists()?resolve():reject(new Error('El motor externo no terminó de cargar.'));
    tag.onerror=()=>reject(new Error('No se puede descargar el motor de lectura. Conéctate a Internet e inténtalo otra vez.'));
    document.head.appendChild(tag);
  }).catch(e=>{delete cache[url];throw e});
  return cache[url];
}
const urls={
  pdf:'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  worker:'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
  ocr:'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js',
  word:'https://cdn.jsdelivr.net/npm/mammoth@1.9.0/mammoth.browser.min.js'
};
function fromTsv(tsv){
  if(typeof tsv!=='string')return[];
  let lines=tsv.split(/\r?\n/),out=[];
  for(const l of lines.slice(1)){
    let a=l.split('\t');if(a.length<12||a[0]!=='5')continue;
    let text=a.slice(11).join('\t').trim(),x=+a[6],y=+a[7],w=+a[8],h=+a[9],confidence=+a[10];
    if(text&&[x,y,w,h].every(Number.isFinite))out.push({text,x0:x,x1:x+w,y0:y,y1:y+h,confidence});
  }
  return out;
}
function fromBlocks(blocks){
  let out=[];
  function addWord(w){
    if(!w?.text||!w?.bbox)return;
    const {x0,y0,x1,y1}=w.bbox;
    if([x0,y0,x1,y1].every(Number.isFinite))out.push({text:w.text,x0,y0,x1,y1,confidence:w.confidence||100});
  }
  for(const block of Array.isArray(blocks)?blocks:[]){
    if(block?.paragraphs)for(const par of block.paragraphs)
      for(const line of par.lines||[])for(const word of line.words||[])addWord(word);
    else if(block?.lines)for(const line of block.lines)
      for(const word of line.words||[])addWord(word);
    else if(block?.words)for(const word of block.words)addWord(word);
  }
  return out;
}
function ocrWords(data){
  if(Array.isArray(data?.words)&&data.words.length){
    const v=data.words.filter(w=>w?.bbox&&w.text).map(w=>({text:w.text,...w.bbox,confidence:w.confidence||100}));if(v.length)return v;
  }
  const blocks=fromBlocks(data?.blocks);
  if(blocks.length)return blocks;
  return fromTsv(data?.tsv);
}
async function newOcr(onProgress){
  await loadScript(urls.ocr,()=>!!root.Tesseract?.createWorker);
  progress(onProgress,'Cargando el lector de castellano y catalán…');
  try{return await root.Tesseract.createWorker('spa+cat+eng',1,{logger:()=>{}});}
  catch(e){progress(onProgress,'No se ha descargado el paquete catalán. Probando castellano e inglés…');
    return root.Tesseract.createWorker('spa+eng',1,{logger:()=>{}});
  }
}
async function recognize(worker,image,onProgress,psm){
  if(psm&&worker.setParameters)await worker.setParameters({tessedit_pageseg_mode:String(psm)});
  progress(onProgress,'Reconociendo los encabezados, las horas y las asignaturas…');
  const result=await worker.recognize(image,{}, {text:true,blocks:true,tsv:true});
  const words=ocrWords(result?.data);
  if(!words.length)throw new Error('La imagen no devolvió palabras con coordenadas. Comprueba que se ve la cuadrícula completa.');
  return words;
}
function maybeParsed(tokens){
  try{return root.ScheduleImporter?.parseTokens(tokens)}catch(e){return null}
}
function candidate(tokens,page,method){return {tokens,page,method}}
async function imageFile(file,onProgress){
  let w=await newOcr(onProgress),candidates=[];
  try{
    for(const psm of [11,6]){
      try{
        let tokens=await recognize(w,file,onProgress,psm);
        candidates.push(candidate(tokens,1,'foto · OCR modo '+psm));
        const res=maybeParsed(tokens);
        if(res?.stats?.classes>=6&&res.stats.completeTimes>=res.stats.classes*.80)break;
      }catch(e){if(psm===6&&candidates.length===0)throw e;}
    }
  }finally{await w.terminate()}
  return candidates;
}
function pdfTextTokens(items,viewport){
  const tokens=[];
  for(const item of items){
    if(!item.str||!item.str.trim())continue;
    let matrix=(root.pdfjsLib.Util&&root.pdfjsLib.Util.transform)?root.pdfjsLib.Util.transform(viewport.transform,item.transform):item.transform;
    let x=matrix[4],y=matrix[5],fontHeight=Math.max(8,Math.abs(matrix[3])||Math.abs(matrix[0])||12);
    let width=Math.abs(item.width*viewport.scale)||item.str.length*fontHeight*.5;
    tokens.push({text:item.str,x0:x,x1:x+width,y0:y-fontHeight,y1:y+fontHeight*.18});
  }
  return tokens;
}
async function rasterPdfPage(page,onProgress,ocrWorker){
  const natural=page.getViewport({scale:1}),scale=Math.min(2.5,2300/Math.max(natural.width,1));
  const viewport=page.getViewport({scale}),canvas=document.createElement('canvas');
  canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
  if(canvas.width*canvas.height>14e6)throw new Error('Página demasiado grande. Exporta el horario a un PDF de tamaño A4 o usa una captura.');
  try{
    await page.render({canvasContext:canvas.getContext('2d',{willReadFrequently:true}),viewport}).promise;
    return await recognize(ocrWorker,canvas,onProgress,11);
  }finally{canvas.width=0;canvas.height=0}
}
async function pdfFile(file,onProgress){
  progress(onProgress,'Leyendo el texto y la cuadrícula del PDF…');
  await loadScript(urls.pdf,()=>!!root.pdfjsLib?.getDocument);
  root.pdfjsLib.GlobalWorkerOptions.workerSrc=urls.worker;
  const doc=await root.pdfjsLib.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;
  let candidates=[],worker=null,errors=[];
  try{
    const max=Math.min(doc.numPages,6);
    for(let n=1;n<=max;n++){
      progress(onProgress,'Analizando página '+n+' de '+max+'…');
      const page=await doc.getPage(n),vp=page.getViewport({scale:1});
      const tokens=pdfTextTokens((await page.getTextContent()).items,vp);
      if(tokens.length)candidates.push(candidate(tokens,n,'PDF · texto original'));
      const parsed=maybeParsed(tokens);
      // Scanned PDFs need OCR. Native PDF text is preferred when it is already
      // sufficient and positioned correctly.
      if(!parsed||parsed.stats.classes<4||parsed.stats.completeTimes<parsed.stats.classes*.5){
        try{
          if(!worker)worker=await newOcr(onProgress);
          let scanned=await rasterPdfPage(page,onProgress,worker);
          candidates.push(candidate(scanned,n,'PDF · OCR'));
        }catch(e){errors.push('Página '+n+': '+e.message);}
      }
    }
  }finally{if(worker)await worker.terminate();if(doc.destroy)await doc.destroy()}
  if(!candidates.length)throw new Error(errors.join(' · ')||'No hay texto reconocible en este PDF.');
  return candidates;
}
async function docxFile(file,onProgress){
  progress(onProgress,'Extrayendo la tabla de Word…');
  await loadScript(urls.word,()=>!!root.mammoth?.convertToHtml);
  const obj=await root.mammoth.convertToHtml({arrayBuffer:await file.arrayBuffer()});
  const html=obj?.value||'',p=new DOMParser().parseFromString(html,'text/html');
  const tables=[...p.querySelectorAll('table')].sort((a,b)=>b.querySelectorAll('td,th').length-a.querySelectorAll('td,th').length);
  const candidates=[];
  for(const table of tables.slice(0,3)){
    let tokens=[],r=0;
    for(const tr of table.querySelectorAll('tr')){
      let c=0;
      for(const cell of tr.children){if(!/^(TD|TH)$/i.test(cell.tagName))continue;
        let text=(cell.innerText||cell.textContent||'').replace(/\s+/g,' ').trim();
        if(text)tokens.push({text,x0:c*170,x1:c*170+150,y0:r*70,y1:r*70+16});
        c+=Math.max(1,Number(cell.colSpan)||1);
      }r++;
    }
    if(tokens.length)candidates.push(candidate(tokens,1,'Word · tabla'));
  }
  if(!candidates.length)throw new Error('Word no contiene una tabla reconocible. Exporta el horario como PDF o imagen.');
  return candidates;
}
async function read(file,onProgress){
  if(!file)throw new Error('Selecciona un archivo.');
  if(file.size>24e6)throw new Error('El archivo no puede superar 24 MB.');
  const name=String(file.name||'').toLowerCase();
  if(file.type.startsWith('image/')||/\.(png|jpe?g|webp|bmp)$/.test(name))return imageFile(file,onProgress);
  if(file.type==='application/pdf'||name.endsWith('.pdf'))return pdfFile(file,onProgress);
  if(name.endsWith('.docx'))return docxFile(file,onProgress);
  throw new Error('Formato no compatible. Elige una imagen JPG/PNG, PDF o DOCX.');
}
return {read,ocrWords,fromTsv,fromBlocks,pdfTextTokens};
});