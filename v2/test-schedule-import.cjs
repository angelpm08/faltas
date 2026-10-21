/* Run: node v2/test-schedule-import.cjs
   Synthetic positional fixture reproduces the 5 columns, 31 subject/time
   cells, including the extra Wednesday hour, of a Baleares FP timetable.
   It contains no personal student data or school identifiers.
*/
const assert=require('node:assert/strict');
const {parseTokens,dayOf,times,chooseBest}=require('./schedule-import.js');
const columns=[
['15:05-16:00|Seguretat informàtica-A','16:00-16:55|Itinerari personal II','16:55-17:50|Sist. op. xarxa-B','18:15-19:10|Sist. op. xarxa-B','19:10-20:05|Serveis en xarxa-B','20:05-21:00|Serveis en xarxa-B'],
['15:05-16:00|Serveis en xarxa-B','16:00-16:55|Serveis en xarxa-B','16:55-17:50|Aplicacions web-B','18:15-19:10|Aplicacions web-B','19:10-20:05|Sist. op. xarxa-B','20:05-21:00|Sist. op. xarxa-B'],
['14:05-15:00|Sist. op. xarxa-B','15:05-16:00|TUT-B','16:00-16:55|Serveis en xarxa-B','16:55-17:50|Serveis en xarxa-B','18:15-19:10|Introducció a la programació','19:10-20:05|Seguretat informàtica-A','20:05-21:00|Seguretat informàtica-A'],
['15:05-16:00|Itinerari personal II','16:00-16:55|Sist. op. xarxa-B','17:00-17:55|Sist. op. xarxa-B','18:15-19:10|Introducció a la programació','19:10-20:05|Aplicacions web-B','20:05-21:00|Aplicacions web-B'],
['15:05-16:00|Aplicacions web-B','16:00-16:55|Sostenibilitat aplicada','16:55-17:50|Seguretat informàtica-A','17:50-18:45|Seguretat informàtica-A','19:10-20:05|Projecte intermodular','20:05-21:00|Serveis en xarxa-B']
];
const names=['Dilluns','Dimarts','Dimecres','Dijous','Divendres'],actual=[],expected=[];
const starts=[32,139,246,353,460];
function item(text,x,y,width=65,h=6){return{text,x0:x,x1:x+width,y0:y,y1:y+h}}
for(let d=0;d<5;d++){
 actual.push(item(names[d],starts[d],127.667,35));
 for(let i=0;i<columns[d].length;i++){
  const [span,subject]=columns[d][i].split('|'),[from,to]=span.split('-'),y=137.528+i*20.5;
  actual.push(item(span,starts[d],y,28,5.5),item(subject,starts[d],y+11,Math.min(100,subject.length*3.3),5.5));
  expected.push({day:d,start:from,end:to,subject});
 }
}
const res=parseTokens(actual);
assert.equal(res.rows.length,31,'all 31 sessions must be read');
assert.equal(res.stats.completeTimes,31,'all 31 times must be exact');
for(const x of expected)assert(res.rows.some(y=>Object.keys(x).every(key=>x[key]===y[key])),JSON.stringify(x));
assert.equal(res.rows.filter(x=>x.day===2).length,7,'Wednesday seventh lesson');
assert.equal(res.rows.find(x=>x.day===3&&x.start==='17:00').end,'17:55');
assert.equal(res.rows.find(x=>x.day===4&&x.start==='17:50').end,'18:45');
assert.equal(dayOf('DIMECRES'),2);assert.deepEqual(times('15:05-16:00'),['15:05','16:00']);
assert.equal(chooseBest([{tokens:actual,page:1,method:'PDF'}]).stats.classes,31);
const word=names.flatMap((n,d)=>[item(n,d*170,0,75,12),...Array.from({length:3},(_,i)=>item('08:00-08:55 Matemàtiques',d*170,70+i*70,147,16))]);
assert.equal(parseTokens(word).rows.length,15,'Word inline cells');
const noHours=names.flatMap((n,d)=>[item(n,d*170,0,75,12),...Array.from({length:2},(_,i)=>item('Matemàtiques',d*170,70+i*70,110,16))]);
const partial=parseTokens(noHours);assert.equal(partial.stats.classes,10);assert.equal(partial.stats.completeTimes,0,'Do not invent class hours');
assert.throws(()=>parseTokens([item('no timetable',0,0)]),/poco texto/);
console.log('PASS: 31/31 GestIB-layout classes and hours, catalan days, PDF, Word and missing-time safety');
