ลำดับตอนเปิดงาน

รันเปิดML
uvicorn service.app:app --host 0.0.0.0 --port 8000 --reload

รันเปิดback
node server.js
npm run dev หรือ npm start

รันเปิดfront
เปิดเว็บ: npm run web
เปิด Expo: npx expo start
หากต้องการล้างแคช: npx expo start -c

ไฟล์ที่ ML Service ต้องมีในเครื่อง
- Machine Learning/merge_dataset/NST_merged_clean_data_2020_2025.csv (ข้อมูลย้อนหลัง)
- Machine Learning/merge_dataset/all_clean_data_merged.csv (ข้อมูลสำหรับพยากรณ์)
- Machine Learning/main_model/flood_next_day_model.joblib (โมเดล)

ชุดข้อมูล CSV จะไม่ถูกเก็บใน GitHub ให้เตรียมไฟล์จากชุดข้อมูลสำรองที่ได้รับอนุญาต แล้ววางไว้ตาม path ข้างต้นก่อนรัน ML Service ส่วนโค้ด Notebook และ Source Code ยังคงอยู่ใน Repository