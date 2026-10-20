/* Lector local de horarios en PDF, DOCX, Excel, CSV y TXT.
   Mantiene la revisión manual y nunca modifica faltas por su cuenta. */
'use strict';
(function () {
  const CDN = {
    pdf: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
    pdfWorker: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
    word: 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.9.0/mammoth.browser.min.js',
    excel: 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
  };
  const dayKeys = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'];
  const normalize = value => String(value == null ? '' : value).toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
  const dayOf = value => dayKeys.findIndex(day => new RegExp('(?:^|[^a-z])' + day + '(?:$|[^a-z])').test(normalize(value)));
  const cell = value => String(value == null ? '' : value).replace(/\s+/g, ' ').trim();

  function loadLibrary(url, globalName) {
    if (window[globalName]) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = url;
      script.onload = () => window[globalName] ? resolve() : reject(Error('No se ha podido iniciar el lector'));
      script.onerror = () => reject(Error('No se pudo cargar el lector. Comprueba tu conexión a internet.'));
      document.head.appendChild(script);
    });
  }

  function splitDelimited(text, delimiter) {
    const rows = [];
    let row = [], value = '', quoted = false;
    text = text.replace(/^\uFEFF/, '');
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '"') {
        if (quoted && text[i + 1] === '"') { value += '"'; i++; }
        else quoted = !quoted;
      } else if (ch === delimiter && !quoted) {
        row.push(value); value = '';
      } else if ((ch === '\n' || ch === '\r') && !quoted) {
        row.push(value); rows.push(row); row = []; value = '';
        if (ch === '\r' && text[i + 1] === '\n') i++;
      } else value += ch;
    }
    if (value || row.length) { row.push(value); rows.push(row); }
    return rows.map(row => row.map(cell)).filter(row => row.some(Boolean)).slice(0, 220);
  }

  function parseText(text) {
    const first = text.split(/\r?\n/).find(line => line.trim()) || '';
    const separators = ['\t', ';', '|', ','];
    const delimiter = separators.sort((a, b) => first.split(b).length - first.split(a).length)[0];
    if (first.split(delimiter).length < 4) throw Error('El documento necesita una tabla con columnas para los días de la semana.');
    return splitDelimited(text, delimiter);
  }

  function extractTableScore(rows) {
    let best = 0;
    for (const row of rows) best = Math.max(best, new Set(row.map(dayOf).filter(d => d >= 0)).size);
    return best;
  }

  function interpretGrid(rows) {
    let headerIndex = -1, header = [], score = 0;
    for (let i = 0; i < rows.length; i++) {
      const mapping = rows[i].map(dayOf);
      const count = new Set(mapping.filter(day => day >= 0)).size;
      if (count > score) { score = count; headerIndex = i; header = mapping; }
    }
    if (score < 3) return null;
    const draft = SCHEDULE.map(day => day.map(slot => slot[2] || null));
    let detected = 0, unrecognized = 0, rowIndex = 0, changed = 0;
    for (const row of rows.slice(headerIndex + 1, headerIndex + 70)) {
      if (!row.some(Boolean)) continue;
      if (new Set(row.map(dayOf).filter(d => d >= 0)).size >= 3) break;
      const time = cell(row.slice(0, Math.max(1, header.findIndex(d => d >= 0))).join(' '));
      const timeMatch = time.match(/(?:^|\D)(\d{1,2})[:.](\d{2})(?=\D|$)/);
      const start = timeMatch ? timeMatch[1].padStart(2, '0') + ':' + timeMatch[2] : null;
      let anyClass = false, anyValue = false;
      header.forEach((day, col) => {
        if (day < 0 || !row[col]) return;
        const value = cell(row[col]);
        if (!value) return;
        anyValue = true;
        if (/recreo|descanso|patio|break/i.test(normalize(value))) return;
        let moduleId = guessModule(value);
        if (moduleId == null) {
          unrecognized++;
          return;
        }
        anyClass = true;
        let slotIndex = start ? SCHEDULE[day].findIndex(slot => slot[0] === start) : -1;
        if (slotIndex < 0) slotIndex = rowIndex;
        if (slotIndex < 0 || slotIndex >= draft[day].length) return;
        detected++;
        if (draft[day][slotIndex] !== moduleId) changed++;
        draft[day][slotIndex] = moduleId;
      });
      if (anyClass || (anyValue && !/recreo|descanso|patio/i.test(normalize(row.join(' '))))) rowIndex++;
    }
    return {draft, detected, changed, unrecognized, columns: score};
  }

  function bestInterpretation(tables) {
    let best = null;
    for (const rows of tables) {
      const candidate = interpretGrid(rows);
      if (!candidate) continue;
      if (!best || candidate.detected > best.detected || (candidate.detected === best.detected && candidate.columns > best.columns)) best = candidate;
    }
    return best;
  }

  async function docxTables(file) {
    await loadLibrary(CDN.word, 'mammoth');
    const converted = await mammoth.convertToHtml({arrayBuffer: await file.arrayBuffer()});
    const dom = new DOMParser().parseFromString(converted.value, 'text/html');
    const tables = Array.from(dom.querySelectorAll('table')).map(table =>
      Array.from(table.rows).map(row => Array.from(row.cells).map(td => cell(td.textContent))));
    if (!tables.length) tables.push(parseText(dom.body.textContent || ''));
    return tables;
  }

  async function excelTables(file) {
    await loadLibrary(CDN.excel, 'XLSX');
    const book = XLSX.read(await file.arrayBuffer(), {type: 'array'});
    return book.SheetNames.slice(0, 12).map(name =>
      XLSX.utils.sheet_to_json(book.Sheets[name], {header: 1, defval: '', raw: false})
        .slice(0, 220).map(row => row.map(cell)));
  }

  async function pdfTables(file) {
    await loadLibrary(CDN.pdf, 'pdfjsLib');
    pdfjsLib.GlobalWorkerOptions.workerSrc = CDN.pdfWorker;
    const documentRef = await pdfjsLib.getDocument({data: new Uint8Array(await file.arrayBuffer())}).promise;
    const tables = [];
    let scanned = true;
    try {
      for (let pageNumber = 1; pageNumber <= Math.min(documentRef.numPages, 10); pageNumber++) {
        const page = await documentRef.getPage(pageNumber);
        const data = await page.getTextContent();
        const items = data.items.filter(item => cell(item.str)).map(item => ({
          x: item.transform[4], y: item.transform[5], str: cell(item.str)
        }));
        if (items.length >= 10) scanned = false;
        const lines = [];
        for (const item of items.sort((a, b) => b.y - a.y || a.x - b.x)) {
          let line = lines.find(l => Math.abs(l.y - item.y) <= 3.5);
          if (!line) { line = {y: item.y, items: []}; lines.push(line); }
          line.items.push(item);
        }
        for (const line of lines) line.items.sort((a, b) => a.x - b.x);
        let headerLine = null, columns = [];
        for (const line of lines) {
          const matches = line.items.map(it => ({...it, day: dayOf(it.str)})).filter(it => it.day >= 0);
          if (matches.length > columns.length) {headerLine = line; columns = matches;}
        }
        if (!headerLine || columns.length < 3) continue;
        columns.sort((a, b) => a.x - b.x);
        const rows = [columns.map(it => it.str)];
        const bodyLines = lines.filter(l => l.y < headerLine.y - 4).sort((a, b) => b.y - a.y);
        for (const line of bodyLines.slice(0, 90)) {
          const row = Array(columns.length).fill('');
          let time = '';
          for (const it of line.items) {
            if (it.x < columns[0].x - 8) {time += ' ' + it.str; continue;}
            let index = 0, distance = Infinity;
            for (let c = 0; c < columns.length; c++) {
              const diff = Math.abs(it.x - columns[c].x);
              if (diff < distance) {distance = diff; index = c;}
            }
            row[index] += (row[index] ? ' ' : '') + it.str;
          }
          if (time.trim()) row.unshift(time.trim());
          rows.push(row);
        }
        // Los encabezados de PDF no siempre incluyen la columna de horas.
        const hasTimes = rows.slice(1).some(row => /^\d{1,2}[:.]\d{2}/.test(row[0]));
        if (hasTimes) rows[0].unshift('Hora');
        tables.push(rows);
      }
      if (scanned || tables.length === 0) {
        const page = await documentRef.getPage(1);
        const canvas = document.createElement('canvas');
        const viewport = page.getViewport({scale: 2});
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        await page.render({canvasContext: canvas.getContext('2d'), viewport}).promise;
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        if (!blob) throw Error('No se pudo convertir el PDF a imagen');
        const transfer = new DataTransfer();
        transfer.items.add(new File([blob], 'horario-del-pdf.png', {type: 'image/png'}));
        byId('timetable-photo').files = transfer.files;
        ocrStatus('El PDF contiene una imagen. Analizando con reconocimiento OCR...');
        await readTimetable();
        return null;
      }
      return tables;
    } finally {
      await documentRef.destroy();
    }
  }

  window.readDocumentTimetable = async function (file) {
    if (!file) return;
    if (file.size > 12 * 1024 * 1024) {
      ocrStatus('El documento supera el límite de 12 MB.');
      return;
    }
    const name = file.name.toLowerCase();
    try {
      ocrStatus('Leyendo el documento en este dispositivo...');
      let tables;
      if (name.endsWith('.pdf')) tables = await pdfTables(file);
      else if (name.endsWith('.docx')) tables = await docxTables(file);
      else if (name.endsWith('.xlsx') || name.endsWith('.xls')) tables = await excelTables(file);
      else if (name.endsWith('.csv') || name.endsWith('.txt')) tables = [parseText(await file.text())];
      else throw Error('Formato no compatible. Usa PDF, DOCX, XLSX, CSV o TXT.');
      if (!tables) return; // PDF escaneado: se ha enviado a OCR.
      const found = bestInterpretation(tables);
      if (!found || !found.detected) throw Error('No encontré una tabla con los días de la semana y asignaturas reconocibles. Prueba con otra versión del horario o una foto.');
      ocrDraft = found.draft;
      ocrStatus('Se han identificado ' + found.detected + ' celdas del horario. ' +
        'Las no reconocidas mantienen su valor anterior. Revisa todas las asignaturas y confirma para guardar.');
      ocrPreview();
    } catch (err) {
      ocrStatus('No se pudo leer el documento: ' + err.message);
    }
  };
})();
