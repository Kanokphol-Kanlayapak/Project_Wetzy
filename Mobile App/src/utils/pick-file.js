import { Platform } from 'react-native';

export const canPickFiles = Platform.OS === 'web';

// Web only: opens the browser file dialog and resolves { name, size, text } (or null if cancelled).
// On native, the admin screen offers a paste-CSV box instead (no extra native module needed).
export function pickCsvFile() {
  return new Promise((resolve, reject) => {
    if (!canPickFiles) { reject(new Error('การเลือกไฟล์ใช้ได้บนเว็บเท่านั้น')); return; }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,text/csv';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) { resolve(null); return; }
      const reader = new FileReader();
      reader.onload = () => resolve({ name: file.name, size: file.size, text: String(reader.result || '') });
      reader.onerror = () => reject(new Error('อ่านไฟล์ไม่สำเร็จ'));
      reader.readAsText(file, 'utf-8');
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}
