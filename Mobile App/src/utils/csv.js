// Minimal RFC 4180 CSV parser (quoted fields, escaped quotes, CRLF/LF, BOM). No dependencies.
export function parseCsv(input) {
  const text = String(input || '').replace(/^\uFEFF/, '');
  const records = [];
  let field = '';
  let record = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; } else inQuotes = false;
      } else field += char;
    } else if (char === '"') inQuotes = true;
    else if (char === ',') { record.push(field); field = ''; }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      record.push(field); field = '';
      records.push(record); record = [];
    } else field += char;
  }
  if (field !== '' || record.length > 0) { record.push(field); records.push(record); }

  const nonEmpty = records.filter((row) => row.some((cell) => cell.trim() !== ''));
  if (nonEmpty.length === 0) return { headers: [], rows: [] };

  const headers = nonEmpty[0].map((header) => header.trim());
  const rows = nonEmpty.slice(1).map((cells) => {
    const row = {};
    headers.forEach((header, index) => { if (header) row[header] = cells[index] ?? ''; });
    return row;
  });
  return { headers, rows };
}
