const assert=require('node:assert/strict');
const M=require('./module-reconcile.js');
const p={name:'Prueba',cycle:'Sistemas Microinformáticos y Redes',grade:'Medio',region:'baleares',level:'2.º',courseHours:2000,yearHours:1015};
assert.equal(M.level(p),2);
assert.equal(M.officialTotals(p).year,1015);
const pairs=[
 ['Seguretat informàtica-A','Seguridad informática'],
 ['Serveis en xarxa-B','Servicios en red'],
 ['Sist. op. xarxa-B','Sistemas operativos en red'],
 ['Itinerari personal II','Itinerario personal para la empleabilidad II'],
 ['Aplicacions web-B','Aplicaciones web'],
 ['Sostenibilitat aplicada','Sostenibilidad aplicada al sistema productivo'],
 ['Projecte intermodular','Proyecto intermodular'],
 ['Introducció a la programació','Introducción a la programación'],
 ['TUT-B','Tutoría']
];
for(const [a,b] of pairs)assert.equal(M.canonical(a),M.canonical(b),a+' vs '+b);
assert.notEqual(M.canonical('Itinerario personal I'),M.canonical('Itinerario personal II'));
assert.notEqual(M.canonical('Sistemas operativos monopuesto'),M.canonical('Sistemas operativos en red'));
assert.equal(M.officialHour('Sist. op. xarxa-B',p).hours,215);
assert.equal(M.officialHour('TUT-B',p),null);
assert.equal(M.officialHour('Introducció a la programació',p),null);
assert.equal(M.officialHour('Seguretat informàtica-A',{...p,region:'otra'}),null);
const oldNames=['Sistemas operativos en red','Servicios en red','Seguridad informática','Aplicaciones web','Itinerario personal para la empleabilidad II','Sostenibilidad aplicada al sistema productivo','Proyecto intermodular','Módulo optativo (revisar)'];
const oldHours=[215,220,180,180,60,30,50,80];
const originals=oldNames.map((name,i)=>({id:'old'+i,name,hours:oldHours[i],teacher:'',archived:false}));
const later=oldNames.slice(0,7).map((name,i)=>({id:'ocr'+i,name:[...pairs][i%pairs.length]?.[0]||name,hours:0,teacher:'',archived:false}));
later[0].name='Sist. op. xarxa-B';
later[1].name='Serveis en xarxa-B';
later[2].name='Seguretat informàtica-A';
later[3].name='Aplicacions web-B';
later[4].name='Itinerari personal II';
later[5].name='Sostenibilitat aplicada';
later[6].name='Projecte intermodular';
const orig={v:2,setup:true,profile:p,modules:[...originals,...later],schedule:[[{id:'existing-slot',start:'15:05',end:'16:00',moduleId:'ocr2',teacher:''}],[],[],[],[],[],[]],attendance:[{date:'2026-10-19',lessonId:'existing-slot',moduleId:'ocr2',status:'unjustified'}],events:[{id:'event',title:'Examen',moduleId:'ocr2',date:'2026-11-04'}]};
const classes=[
 {day:0,start:'15:05',end:'16:00',subject:'Seguretat informàtica-A'},
 {day:0,start:'16:00',end:'16:55',subject:'Itinerari personal II'},
 {day:1,start:'15:05',end:'16:00',subject:'Serveis en xarxa-B'},
 {day:2,start:'14:05',end:'15:00',subject:'Sist. op. xarxa-B'},
 {day:2,start:'15:05',end:'16:00',subject:'TUT-B'},
 {day:3,start:'19:10',end:'20:05',subject:'Aplicacions web-B'},
 {day:4,start:'19:10',end:'20:05',subject:'Projecte intermodular'},
 {day:4,start:'20:05',end:'21:00',subject:'Introducció a la programació'}
];
let count=0;
const result=M.reconcile(orig,classes,{archiveUnused:true,uid:()=>('fresh'+(++count)),hours:{'introduccion a la programacion':80}});
const state=result.state,active=state.modules.filter(m=>!m.archived);
assert.equal(result.report.periods,classes.length);
assert.equal(active.length,8,'only the eight imported modules should remain active');
assert.equal(new Set(active.map(m=>M.canonical(m.name))).size,8,'no duplicates of active modules');
assert.equal(state.schedule[0][0].id,'existing-slot','keep attendance lesson identity');
assert.equal(state.schedule[0][0].moduleId,'old2','retain original verified module');
assert.equal(state.attendance[0].moduleId,'old2','migrate absence from OCR duplicate');
assert.equal(state.events[0].moduleId,'old2','migrate exam to retained module');
assert.equal(active.find(m=>M.canonical(m.name)==='seguridad informatica').hours,180);
assert.equal(active.find(m=>M.canonical(m.name)==='introduccion a la programacion').hours,80);
assert.equal(active.find(m=>M.canonical(m.name)==='tutoria').hours,0);
assert(state.modules.find(m=>m.id==='old7').archived,'unused optativo should be archived');
assert.equal(orig.modules[2].hours,180,'immutable source data');
const again=M.reconcile(state,M.lessonsFromSchedule(state),{archiveUnused:true,uid:()=>('again'+(++count))});
assert.equal(again.report.created.length,0,'second import should not create more modules');
assert.equal(again.report.merged,0,'already reconciled');
assert.equal(again.state.attendance[0].moduleId,'old2');
assert.equal(again.state.schedule[0][0].id,'existing-slot');
console.log('PASS module reconcile: aliases, verified hours, preserves records, no duplicates, idempotent');
