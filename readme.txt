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