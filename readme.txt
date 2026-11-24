ลำดับตอนเปิดงาน (เปิด ML Service, Backend และ Frontend แยก PowerShell กัน)

รันเปิดML Service
uvicorn service.app:app --host 0.0.0.0 --port 8000 --reload

*//*cd Backend
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r ml_service\requirements.txt
# ทำครั้งเดียว ถ้ายังไม่ได้ authorize Google Earth Engine
.\.venv\Scripts\python.exe -c "import ee; ee.Authenticate()"
.\.venv\Scripts\python.exe -m uvicorn ml_service.app:app --host 127.0.0.1 --port 8000 *//*

รันเปิดback
cd Backend
npm run dev

รันเปิดfront
เปิดเว็บ: npm run web
เปิด Expo: npx expo start
หากต้องการล้างแคช: npx expo start -c

ไฟล์โมเดลที่ ML Service โหลด
- main_model/flood_next_day_model.joblib หรือ Backend/ml_service/flood_next_day_model.joblib
- Backend/ml_service/requirements.txt (dependencies)

ML Service ดึงขอบเขตอำเภอและพยากรณ์ GFS ผ่าน Google Earth Engine แล้วส่งข้อมูลอากาศให้หน้าเว็บ รายการผลพยากรณ์จากโมเดลยังต้องรอตาราง static features และข้อมูลพื้นที่ต้นน้ำให้ครบก่อน