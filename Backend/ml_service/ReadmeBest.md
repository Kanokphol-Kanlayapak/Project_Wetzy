# ReadmeBest — วิธีรัน Wetzy

## ระบบเชื่อมต่อกันอย่างไร

`Mobile App → Express Backend (3000) → ML Service/FastAPI (8000) → Google Earth Engine`

ML Service ดึงขอบเขตอำเภอและ GFS จาก Earth Engine ประกอบข้อมูลเข้ากับโมเดล แล้วส่งผลกลับผ่าน Backend ไปยังแอป ข้อมูลพยากรณ์รอบแรกอาจใช้เวลามากกว่า 1 นาที; ระบบ cache ผลไว้ 30 นาที

## ตั้งค่าครั้งแรก

เปิด PowerShell ที่โฟลเดอร์หลักของโปรเจกต์

1. เตรียม Backend:

   ```powershell
   Set-Location .\Backend
   if (-not (Test-Path .env)) { Copy-Item .env.example .env }
   npm install
   ```

   ตรวจค่าใน `Backend/.env`:
   - `MONGODB_URI` ต้องชี้ไปยัง MongoDB ที่เปิดใช้งานอยู่ (ค่าเริ่มต้นคือ `mongodb://127.0.0.1:27017/Wetzy_DB`)
   - ตั้ง `JWT_SECRET` ให้ยาวอย่างน้อย 32 ตัวอักษร
   - `ML_SERVICE_URL=http://127.0.0.1:8000`
   - `GEE_PROJECT_ID=hybrid-heaven-515215-h0` หรือ Project ID ที่บัญชีของคุณใช้ได้
   - สร้างค่า `JWT_SECRET` แบบสุ่มด้วยคำสั่งนี้ แล้วใส่ผลลัพธ์ลงใน `.env`:

     ```powershell
     $bytes = New-Object byte[] 48
     [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
     [Convert]::ToBase64String($bytes)
     ```

2. เตรียมแอป:

   ```powershell
   Set-Location '..\Mobile App'
   if (-not (Test-Path .env)) { Copy-Item .env.example .env }
   npm install
   ```

   ค่าเริ่มต้นใน `Mobile App/.env` คือ `EXPO_PUBLIC_API_URL=http://127.0.0.1:3000/api` สำหรับรันบนคอมเครื่องเดียวกัน

3. อนุญาต Google Earth Engine หนึ่งครั้ง (ข้ามได้หากเคยอนุญาตแล้ว):

   ```powershell
   Set-Location ..\Backend
   py -m venv .venv
   .\.venv\Scripts\python.exe -m pip install -r ml_service\requirements.txt
   .\.venv\Scripts\python.exe -c "import ee; ee.Authenticate()"
   ```

   ML Service ใช้ `ee.Initialize(project=GEE_PROJECT_ID)` และ credentials จากบัญชีที่อนุญาตไว้ ลงชื่อเข้าใช้ Google บัญชีที่มีสิทธิ์ใช้ Earth Engine และ Cloud Project ที่ตั้งไว้ใน `.env` อย่าเก็บ credentials หรือไฟล์กุญแจไว้ใน repository

## เปิดระบบ

เปิด **3 หน้าต่าง PowerShell** แยกกัน โดยเริ่มจากโฟลเดอร์หลักของโปรเจกต์

**หน้าต่าง 1 — ML Service**

```powershell
Set-Location .\Backend
.\.venv\Scripts\python.exe -m uvicorn ml_service.app:app --host 127.0.0.1 --port 8000
```

**หน้าต่าง 2 — Backend** (ต้องมี MongoDB ทำงานอยู่)

```powershell
Set-Location .\Backend
npm run dev
```

**หน้าต่าง 3 — Mobile App**

```powershell
Set-Location '.\Mobile App'
npm run web
```

ถ้าจะเปิด Expo Go บนโทรศัพท์ ให้เปลี่ยน `EXPO_PUBLIC_API_URL` ใน `Mobile App/.env` เป็น `http://<IP-ของคอม>:3000/api` แล้วรัน `npx expo start` โทรศัพท์และคอมต้องอยู่เครือข่ายเดียวกัน

## ตรวจการเชื่อมต่อ

เปิด PowerShell อีกหน้าต่างแล้วเรียก:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/health
Invoke-RestMethod http://127.0.0.1:3000/health
Invoke-RestMethod http://127.0.0.1:3000/api/areas
```

คำขอ `/api/areas` ครั้งแรกอาจช้าเพราะ GEE คำนวณข้อมูลอำเภอและต้นน้ำ หากสำเร็จจะได้รายการพื้นที่พร้อมสถานะพยากรณ์ของโมเดล

## ฝึกโมเดลใหม่ (เมื่อจำเป็น)

คำสั่งนี้ใช้ไฟล์ `all_clean_data_merged.csv` สำหรับฝึกเท่านั้น และเรียก GEE เพื่อสร้างข้อมูลย้อนหลังให้ตรงกับระบบปัจจุบัน ไม่ต้องรันทุกครั้งที่เปิดแอป:

```powershell
Set-Location .\Backend
.\.venv\Scripts\python.exe -m ml_service.train_model
```

สคริปต์จะแทนที่ `ml_service/flood_next_day_model.joblib` เมื่อผลทดสอบแยกตามเวลาผ่านเกณฑ์เท่านั้น ขณะรันระบบ Backend ไม่อ่าน CSV แต่ดึงข้อมูลปัจจุบันจาก GEE คะแนนเปอร์เซ็นต์ผ่านการทดสอบกับ label จากดาวเทียม แต่ยังไม่ได้ยืนยันกับรายงานน้ำท่วมภาคสนาม
