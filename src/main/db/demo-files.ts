/**
 * File veri per la demo del cassetto documenti (AGENTS.md §10.13): un PDF, un
 * foglio Excel, un documento Word e una presentazione PowerPoint, costruiti qui
 * senza librerie — così la demo mostra i visualizzatori al lavoro sia sul
 * computer sia sul telefono, dove il backend non ha ExcelJS.
 *
 * I file Office sono archivi ZIP di XML (Office Open XML): qui si scrive lo ZIP
 * più semplice che esista, senza compressione, che Office, LibreOffice e i
 * visualizzatori leggono senza problemi. Il PDF è un PDF 1.4 di testo, con
 * Helvetica e la codifica WinAnsi per gli accenti.
 */

const enc = new TextEncoder()

// --- ZIP senza compressione ---------------------------------------------------

const CRC = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < data.length; i++) c = CRC[(c ^ data[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

export function zip(files: { name: string; data: Uint8Array | string }[]): Uint8Array {
  const parti: Uint8Array[] = []
  const centrale: Uint8Array[] = []
  let offset = 0
  for (const f of files) {
    const nome = enc.encode(f.name)
    const dati = typeof f.data === 'string' ? enc.encode(f.data) : f.data
    const crc = crc32(dati)
    const locale = new Uint8Array(30 + nome.length)
    const v = new DataView(locale.buffer)
    v.setUint32(0, 0x04034b50, true)
    v.setUint16(4, 20, true) // versione minima
    v.setUint16(6, 0x0800, true) // nomi in UTF-8
    v.setUint16(8, 0, true) // nessuna compressione
    v.setUint16(10, 0, true)
    v.setUint16(12, 0x21, true) // 1 gen 1980
    v.setUint32(14, crc, true)
    v.setUint32(18, dati.length, true)
    v.setUint32(22, dati.length, true)
    v.setUint16(26, nome.length, true)
    locale.set(nome, 30)
    const c = new Uint8Array(46 + nome.length)
    const w = new DataView(c.buffer)
    w.setUint32(0, 0x02014b50, true)
    w.setUint16(4, 20, true)
    w.setUint16(6, 20, true)
    w.setUint16(8, 0x0800, true)
    w.setUint16(12, 0, true)
    w.setUint16(14, 0x21, true)
    w.setUint32(16, crc, true)
    w.setUint32(20, dati.length, true)
    w.setUint32(24, dati.length, true)
    w.setUint16(28, nome.length, true)
    w.setUint32(42, offset, true)
    c.set(nome, 46)
    parti.push(locale, dati)
    centrale.push(c)
    offset += locale.length + dati.length
  }
  const dimCentrale = centrale.reduce((s, c) => s + c.length, 0)
  const fine = new Uint8Array(22)
  const e = new DataView(fine.buffer)
  e.setUint32(0, 0x06054b50, true)
  e.setUint16(8, files.length, true)
  e.setUint16(10, files.length, true)
  e.setUint32(12, dimCentrale, true)
  e.setUint32(16, offset, true)
  const tutto = [...parti, ...centrale, fine]
  const out = new Uint8Array(tutto.reduce((s, p) => s + p.length, 0))
  let pos = 0
  for (const p of tutto) {
    out.set(p, pos)
    pos += p.length
  }
  return out
}

const xml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const RELS_NS = 'http://schemas.openxmlformats.org/package/2006/relationships'
const OFFDOC = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument'
const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

// --- PDF ----------------------------------------------------------------------

/** Da testo a byte WinAnsi (latin1): basta per le lettere accentate italiane. */
function latin1(s: string): Uint8Array {
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    out[i] = c === 0x20ac ? 0x80 : c === 0x2019 ? 0x92 : c === 0x2014 ? 0x97 : c < 256 ? c : 0x3f
  }
  return out
}

export function pdf(titolo: string, righe: string[]): Uint8Array {
  const testo = (s: string): string => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
  const flusso = [
    'BT',
    '/F2 20 Tf',
    '56 780 Td',
    `(${testo(titolo)}) Tj`,
    '/F1 11 Tf',
    '0 -34 Td',
    '15 TL',
    ...righe.map((r) => `(${testo(r)}) '`),
    'ET'
  ].join('\n')
  const oggetti = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${latin1(flusso).length} >>\nstream\n${flusso}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'
  ]
  let corpo = '%PDF-1.4\n%âãÏÓ\n'
  const offsets: number[] = []
  oggetti.forEach((o, i) => {
    offsets.push(latin1(corpo).length)
    corpo += `${i + 1} 0 obj\n${o}\nendobj\n`
  })
  const xref = latin1(corpo).length
  corpo += `xref\n0 ${oggetti.length + 1}\n0000000000 65535 f \n`
  corpo += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')
  corpo += `trailer\n<< /Size ${oggetti.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return latin1(corpo)
}

// --- Excel ----------------------------------------------------------------------

export type Valore = string | number | null

/** Un foglio: la prima riga in grassetto, i numeri con due decimali e il simbolo dell'euro. */
export function xlsx(fogli: { nome: string; righe: Valore[][]; larghezze?: number[] }[]): Uint8Array {
  const colonna = (n: number): string => {
    let s = ''
    for (let x = n + 1; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s
    return s
  }
  const files: { name: string; data: string }[] = [
    {
      name: '[Content_Types].xml',
      data:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        fogli
          .map(
            (_, i) =>
              `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
          )
          .join('') +
        '</Types>'
    },
    {
      name: '_rels/.rels',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${RELS_NS}"><Relationship Id="rId1" Type="${OFFDOC}" Target="xl/workbook.xml"/></Relationships>`
    },
    {
      name: 'xl/workbook.xml',
      data:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${R_NS}"><sheets>` +
        fogli.map((f, i) => `<sheet name="${xml(f.nome)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') +
        '</sheets></workbook>'
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${RELS_NS}">` +
        fogli
          .map(
            (_, i) =>
              `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`
          )
          .join('') +
        `<Relationship Id="rId${fogli.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
        '</Relationships>'
    },
    {
      name: 'xl/styles.xml',
      data:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
        '<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00 &quot;€&quot;"/></numFmts>' +
        '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
        '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
        '<fill><patternFill patternType="solid"><fgColor rgb="FFDCE6F1"/></patternFill></fill></fills>' +
        '<borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs>' +
        '<cellXfs count="3"><xf/><xf fontId="1" fillId="2" applyFont="1" applyFill="1"/><xf numFmtId="164" applyNumberFormat="1"/></cellXfs>' +
        '</styleSheet>'
    }
  ]
  fogli.forEach((f, i) => {
    const cols = f.larghezze
      ? `<cols>${f.larghezze.map((w, c) => `<col min="${c + 1}" max="${c + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`
      : ''
    const righe = f.righe
      .map(
        (riga, r) =>
          `<row r="${r + 1}">` +
          riga
            .map((v, c) => {
              const ref = `${colonna(c)}${r + 1}`
              if (v === null) return ''
              const stile = r === 0 ? ' s="1"' : typeof v === 'number' ? ' s="2"' : ''
              return typeof v === 'number'
                ? `<c r="${ref}"${stile}><v>${v}</v></c>`
                : `<c r="${ref}" t="inlineStr"${stile}><is><t xml:space="preserve">${xml(v)}</t></is></c>`
            })
            .join('') +
          '</row>'
      )
      .join('')
    files.push({
      name: `xl/worksheets/sheet${i + 1}.xml`,
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${cols}<sheetData>${righe}</sheetData></worksheet>`
    })
  })
  return zip(files)
}

// --- Word -----------------------------------------------------------------------

export function docx(titolo: string, paragrafi: string[]): Uint8Array {
  const p = (testo: string, grande = false): string =>
    `<w:p>${grande ? '<w:pPr><w:spacing w:after="240"/></w:pPr>' : '<w:pPr><w:spacing w:after="120"/></w:pPr>'}<w:r>${
      grande ? '<w:rPr><w:b/><w:sz w:val="36"/><w:color w:val="1F4E79"/></w:rPr>' : '<w:rPr><w:sz w:val="22"/></w:rPr>'
    }<w:t xml:space="preserve">${xml(testo)}</w:t></w:r></w:p>`
  return zip([
    {
      name: '[Content_Types].xml',
      data:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'
    },
    {
      name: '_rels/.rels',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${RELS_NS}"><Relationship Id="rId1" Type="${OFFDOC}" Target="word/document.xml"/></Relationships>`
    },
    {
      name: 'word/document.xml',
      data:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
        p(titolo, true) +
        paragrafi.map((t) => p(t)).join('') +
        '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1417" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>' +
        '</w:body></w:document>'
    }
  ])
}

// --- PowerPoint ----------------------------------------------------------------

const A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
const P = 'http://schemas.openxmlformats.org/presentationml/2006/main'

const TEMA =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:theme xmlns:a="${A}" name="DaProd"><a:themeElements>` +
  '<a:clrScheme name="DaProd"><a:dk1><a:srgbClr val="1F2937"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1>' +
  '<a:dk2><a:srgbClr val="1F4E79"/></a:dk2><a:lt2><a:srgbClr val="E7ECF3"/></a:lt2><a:accent1><a:srgbClr val="3B82F6"/></a:accent1>' +
  '<a:accent2><a:srgbClr val="10B981"/></a:accent2><a:accent3><a:srgbClr val="F59E0B"/></a:accent3><a:accent4><a:srgbClr val="EF4444"/></a:accent4>' +
  '<a:accent5><a:srgbClr val="8B5CF6"/></a:accent5><a:accent6><a:srgbClr val="06B6D4"/></a:accent6><a:hlink><a:srgbClr val="2563EB"/></a:hlink>' +
  '<a:folHlink><a:srgbClr val="7C3AED"/></a:folHlink></a:clrScheme>' +
  '<a:fontScheme name="DaProd"><a:majorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>' +
  '<a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>' +
  '<a:fmtScheme name="DaProd"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>' +
  '<a:lnStyleLst><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst>' +
  '<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>' +
  '<a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst>' +
  '</a:fmtScheme></a:themeElements></a:theme>'

const SP_TREE_VUOTO =
  '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>'

function casella(id: number, nome: string, x: number, y: number, w: number, h: number, corpo: string): string {
  return (
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${nome}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>` +
    `<p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>` +
    `<p:txBody><a:bodyPr wrap="square" lIns="0" rIns="0"/><a:lstStyle/>${corpo}</p:txBody></p:sp>`
  )
}

export function pptx(slides: { titolo: string; punti: string[] }[]): Uint8Array {
  const W = 12192000
  const H = 6858000
  const files: { name: string; data: string }[] = [
    {
      name: '[Content_Types].xml',
      data:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>' +
        '<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>' +
        '<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>' +
        '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>' +
        slides
          .map(
            (_, i) =>
              `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`
          )
          .join('') +
        '</Types>'
    },
    {
      name: '_rels/.rels',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${RELS_NS}"><Relationship Id="rId1" Type="${OFFDOC}" Target="ppt/presentation.xml"/></Relationships>`
    },
    {
      name: 'ppt/presentation.xml',
      data:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation xmlns:a="${A}" xmlns:r="${R_NS}" xmlns:p="${P}">` +
        '<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>' +
        slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 3}"/>`).join('') +
        `</p:sldIdLst><p:sldSz cx="${W}" cy="${H}"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`
    },
    {
      name: 'ppt/_rels/presentation.xml.rels',
      data:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${RELS_NS}">` +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>' +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>' +
        slides
          .map(
            (_, i) =>
              `<Relationship Id="rId${i + 3}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`
          )
          .join('') +
        '</Relationships>'
    },
    { name: 'ppt/theme/theme1.xml', data: TEMA },
    {
      name: 'ppt/slideMasters/slideMaster1.xml',
      data:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldMaster xmlns:a="${A}" xmlns:r="${R_NS}" xmlns:p="${P}">` +
        `<p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree>${SP_TREE_VUOTO}</p:spTree></p:cSld>` +
        '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>' +
        '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>'
    },
    {
      name: 'ppt/slideMasters/_rels/slideMaster1.xml.rels',
      data:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${RELS_NS}">` +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>' +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>'
    },
    {
      name: 'ppt/slideLayouts/slideLayout1.xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldLayout xmlns:a="${A}" xmlns:r="${R_NS}" xmlns:p="${P}" type="blank"><p:cSld name="Vuota"><p:spTree>${SP_TREE_VUOTO}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`
    },
    {
      name: 'ppt/slideLayouts/_rels/slideLayout1.xml.rels',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${RELS_NS}"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`
    }
  ]
  slides.forEach((s, i) => {
    const titolo = `<a:p><a:r><a:rPr lang="it-IT" sz="3600" b="1"><a:solidFill><a:srgbClr val="1F4E79"/></a:solidFill><a:latin typeface="Calibri"/></a:rPr><a:t>${xml(s.titolo)}</a:t></a:r></a:p>`
    const punti = s.punti
      .map(
        (t) =>
          `<a:p><a:pPr marL="342900" indent="-342900"><a:buFont typeface="Arial"/><a:buChar char="•"/></a:pPr><a:r><a:rPr lang="it-IT" sz="2200"><a:solidFill><a:srgbClr val="374151"/></a:solidFill><a:latin typeface="Calibri"/></a:rPr><a:t>${xml(t)}</a:t></a:r></a:p>`
      )
      .join('')
    const banda =
      '<p:sp><p:nvSpPr><p:cNvPr id="4" name="Banda"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="0" y="0"/>' +
      `<a:ext cx="${W}" cy="228600"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="3B82F6"/></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr></p:sp>`
    files.push({
      name: `ppt/slides/slide${i + 1}.xml`,
      data:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:a="${A}" xmlns:r="${R_NS}" xmlns:p="${P}"><p:cSld><p:spTree>${SP_TREE_VUOTO}` +
        banda +
        casella(2, 'Titolo', 685800, 609600, W - 1371600, 1143000, titolo) +
        casella(3, 'Testo', 685800, 1905000, W - 1371600, H - 2514600, punti) +
        '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>'
    })
    files.push({
      name: `ppt/slides/_rels/slide${i + 1}.xml.rels`,
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${RELS_NS}"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>`
    })
  })
  return zip(files)
}
