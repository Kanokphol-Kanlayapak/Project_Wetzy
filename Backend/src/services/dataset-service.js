const mongoose = require('mongoose');
const Dataset = require('../models/Dataset');
const DatasetRecord = require('../models/DatasetRecord');
const User = require('../models/User');
const SystemLog = require('../models/SystemLog');
const {
  DATASET_TYPES,
  MAX_CHUNK_ROWS,
  MAX_TOTAL_ROWS,
  listDatasetTypes,
} = require('../config/dataset-schemas');

const MAX_STRING_LENGTH = 200;
const MAX_ERROR_SAMPLES = 20;

function httpError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function sanitizeDataset(dataset) {
  if (!dataset) return null;
  const record = typeof dataset.toObject === 'function' ? dataset.toObject() : dataset;
  return {
    id: String(record._id || record.id),
    name: record.name,
    type: record.type,
    filename: record.filename || '',
    columns: record.columns || [],
    totalRows: record.totalRows || 0,
    insertedRows: record.insertedRows || 0,
    rejectedRows: record.rejectedRows || 0,
    errorSamples: record.errorSamples || [],
    status: record.status,
    uploadedBy: record.uploadedBy || { id: '', username: '' },
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

// Validates and normalises one CSV row against the dataset type. Returns { data } or { error }.
function normalizeRow(rawRow, definition) {
  if (!rawRow || typeof rawRow !== 'object' || Array.isArray(rawRow)) {
    return { error: 'แถวข้อมูลไม่ถูกต้อง' };
  }

  const data = {};
  for (const [column, kind] of Object.entries(definition.columns)) {
    const raw = Object.prototype.hasOwnProperty.call(rawRow, column) ? rawRow[column] : '';
    const text = raw === null || raw === undefined ? '' : String(raw).trim();

    if (text === '') {
      if (definition.required.includes(column)) return { error: `ไม่มีค่าในคอลัมน์ที่จำเป็น "${column}"` };
      data[column] = null;
      continue;
    }

    if (kind === 'number') {
      const parsed = Number(text);
      if (!Number.isFinite(parsed)) return { error: `"${column}" ต้องเป็นตัวเลข (พบ "${text.slice(0, 30)}")` };
      data[column] = parsed;
    } else {
      data[column] = text.slice(0, MAX_STRING_LENGTH);
    }
  }
  return { data };
}

function createDatasetService(models = {}) {
  const DatasetModel = models.Dataset || Dataset;
  const RecordModel = models.DatasetRecord || DatasetRecord;
  const UserModel = models.User || User;
  const LogModel = models.SystemLog || SystemLog;
  const isValidId = models.isValidId || ((id) => mongoose.isValidObjectId(id));

  async function loadDataset(id) {
    if (!isValidId(id)) throw httpError(400, 'INVALID_DATASET_ID', 'รหัสชุดข้อมูลไม่ถูกต้อง');
    const dataset = await DatasetModel.findById(id);
    if (!dataset) throw httpError(404, 'DATASET_NOT_FOUND', 'ไม่พบชุดข้อมูลนี้');
    return dataset;
  }

  async function createDataset({ type, name, filename, columns, totalRows }, actor) {
    const definition = DATASET_TYPES[type];
    if (!definition) throw httpError(400, 'INVALID_DATASET_TYPE', 'ประเภทชุดข้อมูลไม่ถูกต้อง');

    const cleanName = String(name || '').trim().slice(0, 120);
    if (!cleanName) throw httpError(400, 'INVALID_DATASET_NAME', 'กรุณาตั้งชื่อชุดข้อมูล');

    if (!Array.isArray(columns) || columns.some((column) => typeof column !== 'string')) {
      throw httpError(400, 'INVALID_COLUMNS', 'ไม่พบหัวตารางของไฟล์');
    }
    const header = new Set(columns.map((column) => column.trim()));
    const missing = definition.required.filter((column) => !header.has(column));
    if (missing.length > 0) {
      throw httpError(422, 'MISSING_COLUMNS', `ไฟล์ขาดคอลัมน์ที่จำเป็น: ${missing.join(', ')}`);
    }

    const declaredRows = Number(totalRows);
    if (!Number.isInteger(declaredRows) || declaredRows < 1) {
      throw httpError(400, 'INVALID_ROW_COUNT', 'ไฟล์ไม่มีข้อมูล');
    }
    if (declaredRows > MAX_TOTAL_ROWS) {
      throw httpError(413, 'TOO_MANY_ROWS', `จำนวนแถวเกินกำหนด (สูงสุด ${MAX_TOTAL_ROWS.toLocaleString('en-US')} แถว)`);
    }

    const dataset = await DatasetModel.create({
      name: cleanName,
      type,
      filename: String(filename || '').trim().slice(0, 200),
      columns: Object.keys(definition.columns).filter((column) => header.has(column)),
      totalRows: declaredRows,
      status: 'uploading',
      uploadedBy: { id: String(actor?._id || actor?.id || ''), username: actor?.username || '' },
    });
    return sanitizeDataset(dataset);
  }

  async function appendRows(datasetId, rows) {
    const dataset = await loadDataset(datasetId);
    if (dataset.status !== 'uploading') {
      throw httpError(409, 'DATASET_NOT_UPLOADING', 'ชุดข้อมูลนี้ปิดรับข้อมูลแล้ว');
    }
    if (!Array.isArray(rows) || rows.length === 0) {
      throw httpError(400, 'INVALID_ROWS', 'ไม่มีแถวข้อมูลที่จะบันทึก');
    }
    if (rows.length > MAX_CHUNK_ROWS) {
      throw httpError(413, 'CHUNK_TOO_LARGE', `ส่งได้ครั้งละไม่เกิน ${MAX_CHUNK_ROWS} แถว`);
    }
    if ((dataset.insertedRows + dataset.rejectedRows + rows.length) > dataset.totalRows) {
      throw httpError(409, 'ROW_COUNT_EXCEEDED', 'จำนวนแถวที่ส่งมามากกว่าที่ประกาศไว้ตอนเริ่มอัปโหลด');
    }

    const definition = DATASET_TYPES[dataset.type];
    const baseIndex = dataset.insertedRows + dataset.rejectedRows;
    const documents = [];
    const errors = [];

    rows.forEach((rawRow, offset) => {
      const rowNumber = baseIndex + offset + 1; // 1-based data row (header excluded)
      const result = normalizeRow(rawRow, definition);
      if (result.error) {
        errors.push({ row: rowNumber, message: result.error });
      } else {
        documents.push({
          datasetId: dataset._id,
          type: dataset.type,
          rowIndex: rowNumber,
          data: result.data,
        });
      }
    });

    if (documents.length > 0) await RecordModel.insertMany(documents, { ordered: false });

    const room = Math.max(0, MAX_ERROR_SAMPLES - (dataset.errorSamples?.length || 0));
    const update = {
      $inc: { insertedRows: documents.length, rejectedRows: errors.length },
    };
    if (room > 0 && errors.length > 0) update.$push = { errorSamples: { $each: errors.slice(0, room) } };
    const updated = await DatasetModel.findByIdAndUpdate(datasetId, update, { new: true });

    return {
      accepted: documents.length,
      rejected: errors.length,
      errors: errors.slice(0, 5),
      dataset: sanitizeDataset(updated),
    };
  }

  async function completeDataset(datasetId) {
    const dataset = await loadDataset(datasetId);
    if (dataset.status !== 'uploading') return sanitizeDataset(dataset);

    const status = dataset.insertedRows > 0 ? 'ready' : 'failed';
    const updated = await DatasetModel.findByIdAndUpdate(datasetId, { $set: { status } }, { new: true });
    return sanitizeDataset(updated);
  }

  async function abortDataset(datasetId) {
    const dataset = await loadDataset(datasetId);
    if (dataset.status !== 'uploading') return sanitizeDataset(dataset);
    await RecordModel.deleteMany({ datasetId: dataset._id });
    const updated = await DatasetModel.findByIdAndUpdate(datasetId, { $set: { status: 'failed' } }, { new: true });
    return sanitizeDataset(updated);
  }

  async function listDatasets() {
    const datasets = await DatasetModel.find().sort({ createdAt: -1 }).limit(200);
    return datasets.map(sanitizeDataset);
  }

  async function previewDataset(datasetId, limit = 20) {
    const dataset = await loadDataset(datasetId);
    const size = Math.min(Math.max(Number.parseInt(limit, 10) || 20, 1), 100);
    const records = await RecordModel.find({ datasetId: dataset._id }).sort({ rowIndex: 1 }).limit(size);
    return {
      dataset: sanitizeDataset(dataset),
      rows: records.map((record) => (typeof record.toObject === 'function' ? record.toObject() : record).data),
    };
  }

  async function deleteDataset(datasetId) {
    const dataset = await loadDataset(datasetId);
    await RecordModel.deleteMany({ datasetId: dataset._id });
    await DatasetModel.findByIdAndDelete(datasetId);
    return sanitizeDataset(dataset);
  }

  async function listLogs({ limit = 50, status } = {}) {
    const size = Math.min(Math.max(Number.parseInt(limit, 10) || 50, 1), 200);
    const filter = ['success', 'failure'].includes(status) ? { status } : {};
    const logs = await LogModel.find(filter).sort({ timestamp: -1 }).limit(size);
    return logs.map((log) => {
      const record = typeof log.toObject === 'function' ? log.toObject() : log;
      return {
        id: String(record._id),
        username: record.username,
        role: record.role,
        action: record.action,
        status: record.status,
        timestamp: record.timestamp,
      };
    });
  }

  async function getOverview() {
    const [totalUsers, activeUsers, admins, datasetCount, readyDatasets] = await Promise.all([
      UserModel.countDocuments({ role: 'user' }),
      UserModel.countDocuments({ role: 'user', isActive: true }),
      UserModel.countDocuments({ role: { $in: ['admin', 'superadmin'] } }),
      DatasetModel.countDocuments({}),
      DatasetModel.countDocuments({ status: 'ready' }),
    ]);
    const readyList = await DatasetModel.find({ status: 'ready' });
    const totalRecords = readyList.reduce((sum, dataset) => sum + (dataset.insertedRows || 0), 0);
    const recentLogs = await listLogs({ limit: 8 });

    return {
      users: { total: totalUsers, active: activeUsers, staff: admins },
      datasets: { total: datasetCount, ready: readyDatasets, records: totalRecords },
      recentLogs,
    };
  }

  return {
    listTypes: listDatasetTypes,
    createDataset,
    appendRows,
    completeDataset,
    abortDataset,
    listDatasets,
    previewDataset,
    deleteDataset,
    listLogs,
    getOverview,
  };
}

module.exports = { createDatasetService, normalizeRow, sanitizeDataset };
