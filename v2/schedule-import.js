/* ControlFaltas · Geometry-first timetable parser.
 * Independent of OCR/PDF libraries. Browser and Node-compatible for tests.
 * No invented lessons or times: incomplete cells are marked for human review.
 */
(function(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ScheduleImporter = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const DAYS = [
    ['lunes','lun','dilluns','dil','dl','monday','mon'],
    ['martes','mar','dimarts','dt','tuesday','tue'],
    ['miercoles','mie','mierc','dimecres','dc','wednesday','wed'],
    ['jueves','jue','dijous','dj','thursday','thu'],
    ['viernes','vie','divendres','dv','friday','fri'],
    ['sabado','sab','dissabte','ds','saturday','sat'],
    ['domingo','dom','diumenge','dg','sunday','sun']
  ];
  const norm = s => String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^\p{L}\p{N}]/gu,'');
  function dayOf(s) {
    const t=norm(s);
    for(let d=0;d<7;d++)if(DAYS[d].includes(t))return d;
    return -1;
  }
  const TIME=/(?:^|[^\d])([01]?\d|2[0-3])\s*(?:[:.]|h)\s*([0-5]\d)(?:\s*h)?(?=$|[^\d])/gi;
  function times(s) {
    let ret=[],m;
    TIME.lastIndex=0;
    while((m=TIME.exec(String(s||'')))!==null)ret.push(m[1].padStart(2,'0')+':'+m[2]);
    return ret;
  }
  const minute=s=>{let a=String(s||'').split(':').map(Number);return a[0]*60+a[1]};
  const median=a=>{const b=a.slice().filter(Number.isFinite).sort((x,y)=>x-y);return b.length?b[Math.floor(b.length/2)]:0};
  const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));
  const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
  function box(raw) {
    const text=clean(raw.text||raw.str);
    let x0=Number(raw.x0??raw.bbox?.x0??raw.x),x1=Number(raw.x1??raw.bbox?.x1??(x0+Math.max(6,text.length*6))),
        y0=Number(raw.y0??raw.bbox?.y0??raw.y),y1=Number(raw.y1??raw.bbox?.y1??(y0+13));
    if(!text||![x0,x1,y0,y1].every(Number.isFinite))return null;
    if(x1<x0)[x0,x1]=[x1,x0];
    if(y1<y0)[y0,y1]=[y1,y0];
    return {text,x0,x1,y0,y1,x:(x0+x1)/2,y:(y0+y1)/2,w:Math.max(1,x1-x0),h:Math.max(1,y1-y0),confidence:raw.confidence??100};
  }
  function splitHeaderWords(boxes){
    const result=[];
    for(const w of boxes){
      const parts=w.text.split(/\s+/);
      if(parts.length>1&&parts.filter(x=>dayOf(x)>=0).length>=2){
        let x=w.x0;const full=parts.reduce((a,p)=>a+p.length+1,0);
        for(const part of parts){
          const wth=w.w*(part.length+1)/full;
          result.push(box({text:part,x0:x,x1:x+wth,y0:w.y0,y1:w.y1}));
          x+=wth;
        }
      }else result.push(w);
    }
    return result;
  }
  function headerCandidate(boxes){
    const daywords=splitHeaderWords(boxes).map(w=>({...w,day:dayOf(w.text)})).filter(w=>w.day>=0);
    if(daywords.length<3)throw Error('No puedo identificar las columnas de lunes a viernes. Asegúrate de que los días se ven completos.');
    const h=median(boxes.map(w=>w.h))||12, epsilon=clamp(h*1.65,9,36);
    const candidates=daywords.map(a=>{
      const same=daywords.filter(b=>Math.abs(a.y-b.y)<=epsilon).sort((x,y)=>x.x-y.x);
      const map=new Map();same.forEach(w=>{if(!map.has(w.day))map.set(w.day,w)});
      let distinct=[...map.values()].sort((x,y)=>x.x-y.x);
      let uniqueCenters=distinct.filter((w,i)=>!i||w.x-distinct[i-1].x>=Math.max(8,h*.7));
      let asc=uniqueCenters.reduce((n,w,i)=>n+(i&&w.day>uniqueCenters[i-1].day?1:0),0);
      return {words:uniqueCenters,score:uniqueCenters.length*10+asc-(a.y/100000)};
    }).sort((a,b)=>b.score-a.score);
    if(candidates[0].words.length<3)throw Error('Se reconocen días sueltos, pero no una fila completa de encabezados.');
    const sorted=candidates[0].words.sort((a,b)=>a.x-b.x);
    const spacings=sorted.slice(1).map((w,i)=>w.x-sorted[i].x);
    if(median(spacings)<10)throw Error('Las columnas del horario están demasiado juntas o el texto está desordenado.');
    const cells=sorted.map((w,i)=>{
      let left=i===0?w.x-median(spacings)*.57:(sorted[i-1].x+w.x)/2;
      let right=i===sorted.length-1?w.x+median(spacings)*.57:(w.x+sorted[i+1].x)/2;
      return {day:w.day,x:w.x,left,right};
    });
    return {cells,headerY:median(sorted.map(w=>w.y)),medianH:h,gap:median(spacings)};
  }
  function sortRead(words){
    const sorted=words.slice().sort((a,b)=>a.y-b.y||a.x0-b.x0);
    const height=median(words.map(w=>w.h))||12, tolerance=clamp(height*.63,4,14),lines=[];
    for(const w of sorted){
      let line=lines.find(l=>Math.abs(l.y-w.y)<=tolerance);
      if(!line){line={y:w.y,words:[]};lines.push(line)}
      line.words.push(w);
      line.y=median(line.words.map(x=>x.y));
    }
    return lines.sort((a,b)=>a.y-b.y).map(l=>({...l,words:l.words.sort((a,b)=>a.x0-b.x0),text:l.words.map(w=>w.text).join(' ')}));
  }
  // GestIB and most modern school PDFs use a time/subject pair INSIDE
  // EACH weekday column, often with different starting hours per day.
  function parseColumnTimetables(boxes,header){
    const {cells,headerY,medianH,gap}=header;
    let directRows=[],warnings=[],columnsWithTimes=0,ambiguous=0;
    for(const col of cells){
      const words=boxes.filter(w=>w.x>=col.left&&w.x<col.right&&w.y>headerY+medianH*.65);
      const lines=sortRead(words);
      let anchors=[];
      for(const line of lines){
        const t=times(line.text);
        if(t.length<2)continue;
        const duration=minute(t[1])-minute(t[0]);
        if(duration<=0||duration>240)continue;
        anchors.push({y:line.y,start:t[0],end:t[1],text:line.text});
      }
      if(anchors.length<2)continue;
      anchors.sort((a,b)=>a.y-b.y);
      anchors=anchors.filter((a,i)=>!i||a.y-anchors[i-1].y>Math.max(4,medianH*.48));
      if(anchors.length<2)continue;
      columnsWithTimes++;
      const separations=anchors.slice(1).map((a,i)=>a.y-anchors[i].y).filter(x=>x>medianH);
      const spacing=median(separations)||Math.max(25,medianH*4);
      for(let i=0;i<anchors.length;i++){
        const a=anchors[i],next=anchors[i+1];
        const lo=a.y+Math.max(2,medianH*.4);
        const hi=next?next.y-Math.max(2,medianH*.36):a.y+spacing*.94;
        const subjectWords=words.filter(w=>w.y>lo&&w.y<hi);
        let subject=parseSubject(subjectWords);
        // Word/HTML exports sometimes put both the time and class name in
        // the same cell/line. Recover the label after the inline time range.
        if(!subject){
          const inline=clean(a.text.replace(/(?:[01]?\d|2[0-3])\s*[:.h]\s*[0-5]\d\s*(?:-|–|—|a|to)\s*(?:[01]?\d|2[0-3])\s*[:.h]\s*[0-5]\d/i,'').replace(/^[-–—\s]+/,''));
          if(inline&&times(inline).length===0)subject=parseSubject([box({text:inline,x0:col.left+1,x1:col.right-1,y0:a.y+2,y1:a.y+medianH})]);
        }
        if(subject){
          directRows.push({day:col.day,start:a.start,end:a.end,subject:subject.subject,teacher:subject.teacher});
        }else{
          ambiguous++;
          warnings.push('Falta asignatura en '+(['lunes','martes','miércoles','jueves','viernes','sábado','domingo'][col.day])+' '+a.start+'–'+a.end+'.');
        }
      }
    }
    if(columnsWithTimes>=Math.max(3,cells.length*.6)&&directRows.length>=6){
      if(columnsWithTimes<cells.length)warnings.push('Algunos días no tienen suficientes horas legibles; revisa que no falten clases.');
      if(ambiguous)warnings.push('Hay '+ambiguous+' franjas sin asignatura reconocible.');
      return {directRows,warnings,columnsWithTimes};
    }
    return null;
  }
  function getRows(boxes,header){
    const direct=parseColumnTimetables(boxes,header);
    if(direct)return {anchors:[],directRows:direct.directRows,warnings:direct.warnings};
    const {cells,headerY,medianH,gap}=header;
    const leftBound=Math.min(...cells.map(c=>c.left));
    const onlyBelow=boxes.filter(w=>w.y>headerY+medianH*.75);
    const leftWords=onlyBelow.filter(w=>w.x0<leftBound+gap*.06);
    const lines=sortRead(leftWords);
    let anchors=[];
    for(const line of lines){
      const t=times(line.text);
      if(t.length>=2&&minute(t[1])>minute(t[0])&&minute(t[1])-minute(t[0])<=240){
        anchors.push({y:line.y,start:t[0],end:t[1],source:'range'});
      }else if(t.length===1){
        anchors.push({y:line.y,start:t[0],end:'',source:'single'});
      }
    }
    anchors.sort((a,b)=>a.y-b.y);
    let seen=new Set();anchors=anchors.filter(a=>{const k=a.start+'@'+Math.round(a.y/7);if(seen.has(k))return false;seen.add(k);return true});
    // A line displaying only a start time can get its end from the next distinct
    // start-time label, but never from an assumed duration.
    anchors.forEach((a,i)=>{if(!a.end&&anchors[i+1]&&minute(anchors[i+1].start)>minute(a.start)&&minute(anchors[i+1].start)-minute(a.start)<=240)a.end=anchors[i+1].start});
    if(!anchors.length) return {anchors:[],warnings:['No se detectaron rangos horarios. Completa las horas manualmente antes de guardar.']};
    const gapYs=anchors.slice(1).map((a,i)=>a.y-anchors[i].y).filter(n=>n>0);
    const g=median(gapYs)||Math.max(45,medianH*3);
    anchors=anchors.filter((a,i)=>!i||a.y-anchors[i-1].y>=Math.max(5,medianH*.65));
    anchors.forEach((a,i)=>{a.top=i===0?headerY+medianH*.85:(a.y+anchors[i-1].y)/2;a.bottom=i===anchors.length-1?a.y+g*.78:(a.y+anchors[i+1].y)/2});
    return {anchors,warnings:[]};
  }
  function parseSubject(words){
    const lines=sortRead(words).map(l=>clean(l.text)).filter(Boolean);
    let used=[],teacher='';
    for(const [i,line] of lines.entries()){
      if(/^(?:prof(?:esor(?:a)?)?\.?\s*[:\-]|docente\s*[:\-]|tutor(?:a)?\s*[:\-])/i.test(line)){
        teacher=clean(line.replace(/^[^:\-]*[:\-]\s*/,'')).slice(0,80);continue;
      }
      if(/^(?:aula\s*[:\-]|grupo\s*[:\-]|clase\s*[:\-]|horario\s*[:\-])/i.test(line))continue;
      if(/^(?:pati|patio|esplai|recreo|descans(?:o)?|pausa)$/i.test(line))return null;
      if(dayOf(line)>=0)continue;
      // Some PDFs put '(teacher)' below the subject.
      if(i>0&&/^\([A-ZÀ-Ü][\p{L} .'\-]{3,60}\)$/u.test(line)){
        teacher=teacher||line.slice(1,-1);continue;
      }
      if(!times(line).length)used.push(line);
    }
    const subject=clean(used.join(' ')).slice(0,110);
    if(!subject||subject.length<2||/^[\d:\s\-.,]+$/.test(subject))return null;
    return {subject,teacher};
  }
  function cellContent(boxes,col,top,bottom,headerY){
    return boxes.filter(w=>w.y>Math.max(top,headerY+4)&&w.y<bottom&&w.x>=col.left&&w.x<col.right);
  }
  function extract(boxes,header,rowspec) {
    const {cells,headerY,medianH}=header;let rows=[],warnings=[...rowspec.warnings];
    if(rowspec.directRows){
      rows=rowspec.directRows.slice();
    }else if(rowspec.anchors.length){
      for(const anchor of rowspec.anchors){
        for(const col of cells){
          const words=cellContent(boxes,col,anchor.top,anchor.bottom,headerY);
          if(!words.length)continue;
          const parsed=parseSubject(words);
          if(!parsed)continue;
          rows.push({day:col.day,start:anchor.start||'',end:anchor.end||'',subject:parsed.subject,teacher:parsed.teacher});
        }
      }
    }else{
      // For timetables that omit an hour column, derive subject bands only.
      // These rows are *not* assigned imaginary time slots.
      const below=boxes.filter(w=>w.y>headerY+medianH*1.5&&cells.some(c=>w.x>=c.left&&w.x<c.right));
      const h=median(below.map(w=>w.h))||12;
      const lines=sortRead(below),bands=[];
      for(const line of lines){
        const last=bands.at(-1);
        if(!last||line.y-last.y>Math.max(24,h*1.85))bands.push({y:line.y,lines:[line]});
        else last.lines.push(line);
      }
      for(const band of bands){
        for(const col of cells){
          const words=band.lines.flatMap(l=>l.words.filter(w=>w.x>=col.left&&w.x<col.right));
          if(!words.length)continue;
          const parsed=parseSubject(words);if(!parsed)continue;
          rows.push({day:col.day,start:'',end:'',subject:parsed.subject,teacher:parsed.teacher});
        }
      }
    }
    // Duplicate PDF glyph fragments or two OCR words on top of each other
    // should never create repeated timetable sessions.
    rows=rows.filter((r,i)=>rows.findIndex(x=>x.day===r.day&&x.start===r.start&&x.end===r.end&&norm(x.subject)===norm(r.subject))===i);
    rows.sort((a,b)=>a.day-b.day||(a.start||'99').localeCompare(b.start||'99'));
    const bad=rows.filter(r=>!r.start||!r.end||minute(r.end)<=minute(r.start));
    if(bad.length)warnings.push('Faltan horas válidas en '+bad.length+' clase(s). Es obligatorio completarlas al revisar.');
    if(rows.length<3)warnings.push('Se han encontrado muy pocas clases; el documento puede necesitar otro tipo de extracción.');
    const days=new Set(rows.map(r=>r.day)).size;
    const valid=rows.filter(r=>r.start&&r.end&&minute(r.end)>minute(r.start)).length;
    let score=days*8+valid*3+rows.length-bad.length*2;
    return {rows,warnings,stats:{days,classes:rows.length,completeTimes:valid,timeBands:rowspec.anchors.length,columns:cells.length,score}};
  }
  function parseTokens(input){
    let boxes=(input||[]).map(box).filter(Boolean);
    if(boxes.length<8)throw Error('El documento contiene muy poco texto reconocible.');
    const header=headerCandidate(boxes);
    const spec=getRows(boxes,header);
    const result=extract(boxes,header,spec);
    if(!result.rows.length)throw Error('Se detectaron los días, pero no clases bajo ellos. Comprueba que la imagen muestra el horario completo.');
    return result;
  }
  function chooseBest(pages){
    let candidates=[],errors=[];
    for(const p of pages){
      try{
        const found=parseTokens(p.tokens||p);
        candidates.push({...found,page:p.page||1,method:p.method||'texto'});
      }catch(e){errors.push(e.message);}
    }
    if(!candidates.length)throw Error(errors[0]||'No se reconoce un horario en el archivo.');
    candidates.sort((a,b)=>b.stats.score-a.stats.score);
    return candidates[0];
  }
  return {parseTokens,chooseBest,dayOf,times,norm};
});