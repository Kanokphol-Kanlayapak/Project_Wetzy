import { useMemo, useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { deleteDataset, fetchDatasetPreview, fetchDatasetTypes, fetchDatasets } from '../../services/api';
import { uploadDataset } from '../../services/dataset-upload';
import { useAsyncData } from '../../hooks/use-async-data';
import { parseCsv } from '../../utils/csv';
import { canPickFiles, pickCsvFile } from '../../utils/pick-file';
import {
  Badge, Button, Card, Chips, DataTable, EmptyState, ErrorBanner, ProgressBar,
  SectionTitle, Spinner, TextField, formatDate, formatNumber,
} from '../../components/admin/ui';

const STATUS = { ready: ['green', 'พร้อมใช้'], uploading: ['amber', 'กำลังนำเข้า'], failed: ['red', 'ไม่สำเร็จ'] };
const PREVIEW_COLUMNS_MAX = 8;

function analyseHeaders(type, headers) {
  const known = new Set(type.columns.map((column) => column.name));
  const present = new Set(headers);
  return {
    missing: type.required.filter((column) => !present.has(column)),
    recognised: headers.filter((header) => known.has(header)),
    ignored: headers.filter((header) => header && !known.has(header)),
  };
}

function UploadCard({ types, onUploaded }) {
  const [typeId, setTypeId] = useState('');
  const [name, setName] = useState('');
  const [file, setFile] = useState(null); // { name, size }
  const [parsed, setParsed] = useState(null); // { headers, rows }
  const [pasteText, setPasteText] = useState('');
  const [progress, setProgress] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const cancelRef = useRef(false);

  const type = types.find((item) => item.id === typeId);
  const analysis = useMemo(() => (type && parsed ? analyseHeaders(type, parsed.headers) : null), [type, parsed]);
  const canUpload = Boolean(type && parsed && parsed.rows.length > 0 && analysis?.missing.length === 0 && name.trim() && !uploading);

  function loadText(text, filename) {
    const next = parseCsv(text);
    setResult(null);
    setError('');
    if (next.headers.length === 0 || next.rows.length === 0) {
      setParsed(null);
      setError('ไม่พบข้อมูลในไฟล์ (ต้องมีหัวตารางและอย่างน้อย 1 แถว)');
      return;
    }
    setParsed(next);
    setFile({ name: filename, size: text.length });
    setName((current) => current || filename.replace(/\.csv$/i, ''));
  }

  async function handlePick() {
    try {
      const picked = await pickCsvFile();
      if (picked) loadText(picked.text, picked.name);
    } catch (e) { setError(e.message); }
  }

  function reset() {
    setFile(null); setParsed(null); setPasteText(''); setName(''); setProgress(null); setResult(null); setError('');
  }

  async function handleUpload() {
    cancelRef.current = false;
    setUploading(true); setError(''); setResult(null);
    setProgress({ sent: 0, total: parsed.rows.length, accepted: 0, rejected: 0 });
    try {
      const outcome = await uploadDataset({
        type: type.id, name: name.trim(), filename: file?.name || 'pasted.csv',
        headers: parsed.headers, rows: parsed.rows,
        onProgress: setProgress, shouldCancel: () => cancelRef.current,
      });
      setResult(outcome);
      if (!outcome.cancelled) onUploaded();
    } catch (e) {
      setError(e.message || 'นำเข้าข้อมูลไม่สำเร็จ ระบบได้ย้อนข้อมูลที่ส่งไปแล้วกลับ');
    } finally { setUploading(false); }
  }

  const previewColumns = parsed
    ? parsed.headers.filter(Boolean).slice(0, PREVIEW_COLUMNS_MAX).map((header) => ({ key: header, title: header, width: 130 }))
    : [];

  return (
    <Card className="mb-5">
      <Text className="mb-1 text-base font-extrabold text-[#0b3974]">นำเข้าชุดข้อมูลใหม่</Text>
      <Text className="mb-4 text-sm text-slate-500">เลือกประเภท → เลือกไฟล์ CSV → ตรวจสอบ → นำเข้า</Text>

      <Text className="mb-2 text-sm font-semibold text-[#0b3974]">1. ประเภทข้อมูล</Text>
      <Chips options={types.map((item) => ({ value: item.id, label: item.label }))} value={typeId} onChange={(id) => { setTypeId(id); setResult(null); }} />
      {type ? (
        <View className="mb-4 rounded-xl bg-sky-50 p-3">
          <Text className="text-sm text-[#07539d]">{type.description}</Text>
          <Text className="mt-1 text-xs text-slate-500">คอลัมน์ที่จำเป็น: {type.required.join(', ')}</Text>
        </View>
      ) : null}

      <Text className="mb-2 text-sm font-semibold text-[#0b3974]">2. ไฟล์ CSV (UTF-8)</Text>
      {canPickFiles ? (
        <View className="mb-4 flex-row items-center">
          <Button label={file ? 'เลือกไฟล์อื่น' : '📂 เลือกไฟล์ CSV'} variant="secondary" onPress={handlePick} disabled={!type || uploading} />
          {file ? <Text numberOfLines={1} className="ml-3 flex-1 text-sm text-slate-500">{file.name}</Text> : null}
        </View>
      ) : (
        <View className="mb-4">
          <TextInput
            multiline value={pasteText} onChangeText={setPasteText} editable={Boolean(type) && !uploading}
            placeholder="วางข้อความ CSV ที่นี่ (บรรทัดแรกคือหัวตาราง)" placeholderTextColor="#8ba2b8"
            className="mb-2 min-h-32 rounded-xl border border-sky-100 bg-[#f8fcff] p-3 text-sm text-[#0b3974]"
          />
          <Button label="อ่านข้อมูลที่วาง" variant="secondary" onPress={() => loadText(pasteText, 'pasted.csv')} disabled={!type || !pasteText.trim() || uploading} />
          <Text className="mt-2 text-xs text-slate-400">การเลือกไฟล์โดยตรงรองรับบนเว็บ (npm run web)</Text>
        </View>
      )}

      {parsed && analysis ? (
        <View className="mb-4">
          <View className="mb-3 flex-row flex-wrap gap-2">
            <Badge tone="blue">{formatNumber(parsed.rows.length)} แถว</Badge>
            <Badge tone="blue">{analysis.recognised.length} คอลัมน์ที่รู้จัก</Badge>
            {analysis.ignored.length > 0 ? <Badge tone="slate">ข้าม {analysis.ignored.length} คอลัมน์</Badge> : null}
            {analysis.missing.length === 0 ? <Badge tone="green">โครงสร้างถูกต้อง</Badge> : <Badge tone="red">ขาด {analysis.missing.length} คอลัมน์</Badge>}
          </View>
          {analysis.missing.length > 0 ? <ErrorBanner message={`ไฟล์นี้ไม่ตรงกับประเภท "${type.label}" — ขาดคอลัมน์: ${analysis.missing.join(', ')}`} /> : null}
          {analysis.ignored.length > 0 ? <Text className="mb-2 text-xs text-slate-400">คอลัมน์ที่จะไม่ถูกบันทึก: {analysis.ignored.join(', ')}</Text> : null}
          <Text className="mb-1 text-sm font-semibold text-[#0b3974]">ตัวอย่าง 5 แถวแรก</Text>
          <View className="overflow-hidden rounded-xl border border-sky-100">
            <DataTable columns={previewColumns} rows={parsed.rows.slice(0, 5)} />
          </View>
        </View>
      ) : null}

      <Text className="mb-2 text-sm font-semibold text-[#0b3974]">3. ตั้งชื่อชุดข้อมูล</Text>
      <TextField value={name} onChangeText={setName} placeholder="เช่น น้ำท่วมรายเดือน ม.ค.–มิ.ย. 2026" maxLength={120} editable={!uploading} autoCapitalize="sentences" />

      {progress && uploading ? (
        <View className="mb-4">
          <ProgressBar value={progress.sent / progress.total} />
          <Text className="mt-2 text-sm text-slate-500">กำลังนำเข้า {formatNumber(progress.sent)} / {formatNumber(progress.total)} แถว</Text>
        </View>
      ) : null}

      <ErrorBanner message={error} />
      {result && !result.cancelled ? (
        <View className="mb-4 rounded-xl bg-emerald-50 p-3">
          <Text className="font-bold text-emerald-800">✓ นำเข้าสำเร็จ {formatNumber(result.accepted)} แถว</Text>
          {result.rejected > 0 ? (
            <View className="mt-2">
              <Text className="text-sm text-amber-700">ข้ามแถวที่ข้อมูลไม่ถูกต้อง {formatNumber(result.rejected)} แถว</Text>
              {result.errors.map((item) => <Text key={item.row} className="text-xs text-amber-700">• แถวที่ {item.row}: {item.message}</Text>)}
            </View>
          ) : null}
        </View>
      ) : null}
      {result?.cancelled ? <Text className="mb-4 text-sm text-slate-500">ยกเลิกการนำเข้าแล้ว ข้อมูลที่ส่งไปถูกลบออก</Text> : null}

      <View className="flex-row flex-wrap gap-2">
        <Button label={uploading ? 'กำลังนำเข้า...' : `นำเข้า${parsed ? ` ${formatNumber(parsed.rows.length)} แถว` : ''}`} onPress={handleUpload} disabled={!canUpload} loading={uploading} />
        {uploading ? <Button label="ยกเลิก" variant="secondary" onPress={() => { cancelRef.current = true; }} /> : null}
        {(file || result) && !uploading ? <Button label="ล้างฟอร์ม" variant="ghost" onPress={reset} /> : null}
      </View>
    </Card>
  );
}

function DatasetRow({ dataset, typeLabel, onDeleted }) {
  const [preview, setPreview] = useState(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  const [tone, label] = STATUS[dataset.status] || ['slate', dataset.status];

  async function togglePreview() {
    if (open) { setOpen(false); return; }
    setOpen(true);
    if (preview) return;
    setBusy(true); setError('');
    try { setPreview(await fetchDatasetPreview(dataset.id)); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  async function handleDelete() {
    setBusy(true); setError('');
    try { await deleteDataset(dataset.id); onDeleted(); } catch (e) { setError(e.message); setBusy(false); setConfirming(false); }
  }

  const columns = preview?.rows[0]
    ? Object.keys(preview.rows[0]).slice(0, PREVIEW_COLUMNS_MAX).map((key) => ({ key, title: key, width: 130 }))
    : [];

  return (
    <View className="border-b border-slate-100 py-3">
      <View className="flex-row items-start justify-between">
        <View className="flex-1 pr-3">
          <Text className="font-bold text-[#0b3974]">{dataset.name}</Text>
          <Text className="mt-0.5 text-xs text-slate-500">
            {typeLabel} · {formatNumber(dataset.insertedRows)} แถว{dataset.rejectedRows ? ` (ข้าม ${formatNumber(dataset.rejectedRows)})` : ''}
          </Text>
          <Text className="text-xs text-slate-400">โดย {dataset.uploadedBy?.username || '—'} · {formatDate(dataset.createdAt)}</Text>
        </View>
        <Badge tone={tone}>{label}</Badge>
      </View>
      <View className="mt-2 flex-row items-center">
        <Button label={open ? 'ซ่อนตัวอย่าง' : 'ดูตัวอย่าง'} variant="ghost" onPress={togglePreview} className="px-0 pr-4" />
        {confirming ? (
          <>
            <Button label="ยืนยันลบ" variant="danger" onPress={handleDelete} loading={busy} className="mr-2" />
            <Button label="ยกเลิก" variant="secondary" onPress={() => setConfirming(false)} disabled={busy} />
          </>
        ) : <Button label="ลบ" variant="ghost" onPress={() => setConfirming(true)} className="px-0" />}
      </View>
      <ErrorBanner message={error} />
      {open ? (
        <View className="mt-2 overflow-hidden rounded-xl border border-sky-100">
          {busy && !preview ? <Spinner /> : preview && columns.length > 0 ? <DataTable columns={columns} rows={preview.rows} /> : <Text className="p-3 text-sm text-slate-400">ไม่มีข้อมูล</Text>}
        </View>
      ) : null}
    </View>
  );
}

export default function AdminDatasets() {
  const typesState = useAsyncData(fetchDatasetTypes, 'โหลดประเภทข้อมูลไม่สำเร็จ');
  const datasetsState = useAsyncData(fetchDatasets, 'โหลดรายการชุดข้อมูลไม่สำเร็จ');
  const types = typesState.data;
  const datasets = datasetsState.data;
  const loadDatasets = datasetsState.reload;
  const error = typesState.error || datasetsState.error;
  const retry = () => { typesState.reload(); datasetsState.reload(); };

  const typeLabels = useMemo(() => Object.fromEntries((types || []).map((item) => [item.id, item.label])), [types]);

  return (
    <View>
      <SectionTitle title="ชุดข้อมูล" subtitle="นำเข้าและจัดการ Dataset ที่เก็บใน MongoDB" />
      <ErrorBanner message={error} onRetry={retry} />
      {types?.length > 0 ? <UploadCard types={types} onUploaded={loadDatasets} /> : (error ? null : <Spinner />)}

      <Card>
        <Text className="mb-1 text-base font-extrabold text-[#0b3974]">ชุดข้อมูลที่นำเข้าแล้ว</Text>
        {datasets === null ? <Spinner /> : datasets.length === 0
          ? <EmptyState icon="▤" title="ยังไม่มีชุดข้อมูล" subtitle="เริ่มนำเข้าไฟล์ CSV ชุดแรกได้จากฟอร์มด้านบน" />
          : datasets.map((dataset) => <DatasetRow key={dataset.id} dataset={dataset} typeLabel={typeLabels[dataset.type] || dataset.type} onDeleted={loadDatasets} />)}
      </Card>
    </View>
  );
}
