import { abortDataset, completeDataset, createDataset, uploadDatasetRows } from './api';

export const UPLOAD_CHUNK_ROWS = 500;

// Creates the dataset, streams rows in chunks (so large CSVs never hit a request-size limit),
// then closes it. If anything fails the half-written dataset is rolled back on the server.
export async function uploadDataset({ type, name, filename, headers, rows, onProgress, shouldCancel }) {
  const dataset = await createDataset({ type, name, filename, columns: headers, totalRows: rows.length });
  let accepted = 0;
  let rejected = 0;
  const errors = [];

  try {
    for (let start = 0; start < rows.length; start += UPLOAD_CHUNK_ROWS) {
      if (shouldCancel?.()) {
        await abortDataset(dataset.id);
        return { cancelled: true, accepted, rejected, errors };
      }
      const result = await uploadDatasetRows(dataset.id, rows.slice(start, start + UPLOAD_CHUNK_ROWS));
      accepted += result.accepted;
      rejected += result.rejected;
      if (errors.length < 5) errors.push(...(result.errors || []).slice(0, 5 - errors.length));
      onProgress?.({ sent: Math.min(start + UPLOAD_CHUNK_ROWS, rows.length), total: rows.length, accepted, rejected });
    }
    const finished = await completeDataset(dataset.id);
    return { cancelled: false, dataset: finished, accepted, rejected, errors };
  } catch (error) {
    try { await abortDataset(dataset.id); } catch { /* best effort rollback */ }
    throw error;
  }
}
