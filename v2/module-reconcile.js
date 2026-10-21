/* ControlFaltas · equivalencias y horas de FP. No envía datos al servidor.
 * Las equivalencias conservan faltas y exámenes; los módulos retirados se archivan.
 */
(function(root, factory) {
  const api=factory();
  if(typeof module !== 'undefined' && module.exports) module.exports=api;
  root.CFModules=api;
})(typeof window !== 'undefined' ? window : globalThis, function(){
  'use strict';
  function norm(s){
    return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
      .replace(/[.,;:()[\]]/g,' ').replace(/[\u2013\u2014]/g,'-')
      .replace(/\s*-\s*[a-z]\s*$/i,'').replace(/\s+grup(?:o)?\s+[a-z]\s*$/i,'')
      .replace(/\s+/g,' ').trim();
  }
  function canonical(s){
    const n=norm(s);
    if(!n)return '';
    const matches=[
      ['sistemas operativos en red',/^(?:sist(?:emas|emes)?\s*(?:op(?:erativos|eratius|eratius|eratius|eratius)?|operatius|operativos)?\s*(?:en)?\s*(?:xarxa|xarxes|red)|sistemas? operativos? (?:en )?red|sistemes? operatius? (?:en )?xarxa)/i],
      ['servicios en red',/^(?:serveis? (?:en |de )?xarxa|servicios? (?:en |de )?red)/i],
      ['seguridad informatica',/^(?:seguretat|seguridad)\s+informatica/i],
      ['aplicaciones web',/^(?:aplicacions?|aplicaciones?)\s+web/i],
      ['itinerario personal ii',/^(?:itinerari(?:o)? personal)(?:\s+(?:per a l ocupabilitat|para la empleabilidad|per a l ocupabilitat))?\s+(?:ii|2)$/i],
      ['itinerario personal i',/^(?:itinerari(?:o)? personal)(?:\s+(?:per a l ocupabilitat|para la empleabilidad))?\s+(?:i|1)$/i],
      ['sostenibilidad aplicada',/^(?:sostenibilitat|sostenibilidad)(?:\s+aplicad[ao])?/i],
      ['proyecto intermodular',/^(?:projecte|proyecto)\s+intermodular/i],
      ['introduccion a la programacion',/^(?:introduccio|introduccion)\s+a\s+(?:la\s+)?programacio(?:n)?/i],
      ['tutoria',/^(?:tut|tutoria|tutorias?|tutor[ií]a)$/i],
      ['modulo optativo',/^(?:modul(?:o)?\s+optati(?:u|vo))(?:\s+revisar)?$/i],
    ];
    for(const [key,rx] of matches)if(rx.test(n))return key;
    return n;
  }
  function niceName(s){
    const n=String(s||'').replace(/\s*[-–—]\s*[A-Z]\s*$/,'').replace(/\s+grup(?:o)?\s+[A-Z]\s*$/i,'').trim();
    return canonical(s)==='tutoria'?'Tutoría':n.slice(0,85);
  }
  function isTutoria(s){return canonical(s)==='tutoria'}
  function isSMR(p){
    const s=norm(p?.cycle||'');
    return (s.includes('sistemas microinformaticos')||s.includes('sistemes microinformatics'))
      &&(s.includes('redes')||s.includes('xarxes'));
  }
  function isBalearic(p){return p?.region==='baleares'}
  function level(p){const s=norm(p?.level||'');return /^\s*2(?:o|r|º)?(?:\b|$)/.test(s)?2:/^\s*1(?:o|r|º)?(?:\b|$)/.test(s)?1:0}
  // Illes Balears, LOIFP: ficha IFC21 (segundo curso) 2025-2026.
  // El ciclo completo tiene 2.000 horas, segundo 1.015 y primero 985.
  // La hora de tutoría NO es un módulo profesional con carga oficial.
  const SMR_HOURS_2={
    'sistemas operativos en red':215,
    'seguridad informatica':180,
    'servicios en red':220,
    'aplicaciones web':180,
    'sostenibilidad aplicada':30,
    'itinerario personal ii':60,
    'proyecto intermodular':50,
    'modulo optativo':80
  };
  const SMR_HOURS_1={
    'montatge i manteniment d equips':190,'montaje y mantenimiento de equipos':190,
    'sistemas operativos monopuesto':155,'sistemes operatius monolloc':155,
    'aplicaciones ofimaticas':210,'aplicacions ofimatiques':210,
    'redes locales':190,'xarxes locals':190,'ingles profesional':120,'angles professional':120,
    'digitalizacion aplicada':30,'digitalizacion aplicada a los sectores productivos':30,'digitalitzacio aplicada':30,'digitalitzacio aplicada als sectors productius':30,
    'itinerario personal i':90
  };
  const SOURCE='Currículo LOIFP del Govern de les Illes Balears (IFC21).';
  const SOURCE_URL='https://caib.es/sites/fp/ca/sistemes_microinformatics_i_xarxes/';
  function officialHour(name,profile){
    if(!isSMR(profile)||!isBalearic(profile)||isTutoria(name))return null;
    const k=canonical(name),year=level(profile);
    const map=year===2?SMR_HOURS_2:year===1?SMR_HOURS_1:null;
    return map&&Object.prototype.hasOwnProperty.call(map,k)?{hours:map[k],source:SOURCE,url:SOURCE_URL}:null;
  }
  function officialTotals(profile){
    if(!isSMR(profile)||!isBalearic(profile))return null;
    return {cycle:2000,year:level(profile)===1?985:level(profile)===2?1015:null,source:SOURCE,url:SOURCE_URL};
  }
  function existingFor(modules,key){
    return(modules||[]).filter(m=>canonical(m.name)===key).sort((a,b)=>{
      const score=m=>(m.hours>0?100:0)+(m.archived?0:10);
      return score(b)-score(a);
    })[0]||null;
  }
  function suggestedHours(name,profile,modules){
    if(isTutoria(name))return {hours:0,source:'La tutoría no es un módulo profesional.'};
    const key=canonical(name),m=existingFor(modules,key);
    if(m&&Number(m.hours)>0)return {hours:Number(m.hours),source:'Horas ya guardadas (modificables).'};
    return officialHour(name,profile)||{hours:0,source:'Sin horas verificadas. Pregunta a tu centro.'};
  }
  function newId(){return 'mod'+Math.random().toString(36).slice(2,10)+Date.now().toString(36)}
  function reconcile(current,lessons,opts){
    const options=opts||{},next=JSON.parse(JSON.stringify(current));
    if(!Array.isArray(next.modules))next.modules=[];
    if(!Array.isArray(next.attendance))next.attendance=[];
    if(!Array.isArray(next.events))next.events=[];
    if(!Array.isArray(next.schedule))next.schedule=Array.from({length:7},()=>[]);
    const oldSchedule=next.schedule;
    const hoursInput=options.hours||{},makeId=options.uid||newId;
    const byKey=new Map(),used=new Set(),merged={},created=[],updated=[],archived=[];
    const priorities=m=>{
      const referenced=next.attendance.filter(x=>x.moduleId===m.id).length+next.events.filter(x=>x.moduleId===m.id).length;
      const scheduled=oldSchedule.flat().filter(x=>x.moduleId===m.id).length;
      const nameLooksImported=/\s*[-–—]\s*[A-Z]\s*$/.test(String(m.name||''));
      return (Number(m.hours)>0?100000:0)+(nameLooksImported?0:50000)+referenced*100+scheduled*3+(!m.archived?4:0);
    };
    for(const m of next.modules){
      const key=canonical(m.name);if(!key)continue;
      const group=byKey.get(key)||[];group.push(m);byKey.set(key,group);
    }
    // Merge ONLY known name equivalences, never different modules by similarity score.
    // Resolves the 0-hour OCR clone against the existing record with validated hours.
    for(const [key,group] of byKey){
      if(group.length<2)continue;
      group.sort((a,b)=>priorities(b)-priorities(a));
      const main=group[0];for(const other of group.slice(1)){
        const stillReferenced=next.attendance.some(a=>a.moduleId===other.id)||next.events.some(e=>e.moduleId===other.id)||oldSchedule.some(week=>week.some(sl=>sl.moduleId===other.id));
        if(other.archived&&!stillReferenced)continue;
        if(!main.teacher&&other.teacher)main.teacher=other.teacher;
        if(!(main.hours>0)&&other.hours>0)main.hours=other.hours;
        merged[other.id]=main.id;other.archived=true;
      }
    }
    if(Object.keys(merged).length){
      for(const a of next.attendance)if(merged[a.moduleId])a.moduleId=merged[a.moduleId];
      for(const e of next.events)if(merged[e.moduleId])e.moduleId=merged[e.moduleId];
      for(const week of oldSchedule)for(const sl of week)if(merged[sl.moduleId])sl.moduleId=merged[sl.moduleId];
    }
    const masters=new Map();
    for(const [key,list] of byKey)masters.set(key,list[0]);
    const schedule=Array.from({length:7},()=>[]);
    for(const sl of lessons){
      const k=canonical(sl.subject);
      if(!k||!(sl.day>=0&&sl.day<7))continue;
      let m=masters.get(k);
      if(!m){
        m={id:makeId(),name:niceName(sl.subject),teacher:String(sl.teacher||''),hours:0,archived:false};
        masters.set(k,m);next.modules.push(m);created.push(m.name);
      }
      m.archived=false;used.add(m.id);
      if(!m.teacher&&sl.teacher)m.teacher=String(sl.teacher).slice(0,80);
      if(options.renameToImported)m.name=niceName(sl.subject);
      const choice=hoursInput[k];
      if(choice!==undefined){
        const h=Number(choice);
        if(Number.isFinite(h)&&h>=0&&h<=9999)m.hours=h;
      }else if(!(m.hours>0)){
        const official=officialHour(sl.subject,next.profile);
        if(official)m.hours=official.hours;
      }
      // Preserve previously recorded lesson IDs if day, time AND canonical subject match.
      const old=oldSchedule[sl.day]?.find(x=>x.start===sl.start&&x.end===sl.end&&canonical(next.modules.find(m=>m.id===x.moduleId)?.name)===k);
      schedule[sl.day].push({id:old?.id||makeId(),start:sl.start,end:sl.end,moduleId:m.id,teacher:String(sl.teacher||'').slice(0,80)});
      updated.push(m.name);
    }
    // An OCR replacement should hide former modules absent from the *new*
    // timetable, while retaining all historic attendance and event records.
    if(options.archiveUnused){
      for(const m of next.modules){
        if(!used.has(m.id)&&!m.archived){m.archived=true;archived.push(m.name);}
      }
    }
    next.schedule=schedule.map(week=>week.sort((a,b)=>a.start.localeCompare(b.start)));
    return {state:next,report:{
      merged:Object.keys(merged).length,created,archived,active:next.modules.filter(m=>!m.archived).length,
      periods:schedule.reduce((a,b)=>a+b.length,0),
      missingHours:[...used].map(id=>next.modules.find(m=>m.id===id)).filter(m=>m&&m.hours===0&&!isTutoria(m.name)).map(m=>m.name)
    }};
  }
  function lessonsFromSchedule(s){return (s.schedule||[]).flatMap((week,day)=>week.map(sl=>{
    const module=s.modules.find(m=>m.id===sl.moduleId);
    return {day,start:sl.start,end:sl.end,subject:module?.name||'',teacher:sl.teacher||module?.teacher||''};
  })).filter(sl=>sl.subject);}
  return {norm,canonical,niceName,isTutoria,isSMR,isBalearic,level,
    officialHour,officialTotals,existingFor,suggestedHours,reconcile,lessonsFromSchedule};
});