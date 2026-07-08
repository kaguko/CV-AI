# CareerAI UEH 🎯

> Công cụ phân tích CV hướng nghệp, hỗ trợ bởi Gemini AI. Dành cho sinh viên UEH và người tìm việc.

## 🛠️ Cài đặt

**Yêu cầu:** Node.js ≥ 18

```bash
# Clone repo
git clone https://github.com/kaguko/CV-AI.git
cd CV-AI
```

## 🚀 Chạy server

```bash
# Chạy cơ bản (không cần cài gì thêm)
node server.js

# hoặc dùng npm
npm start

# Chạy chế độ dev (tự động restart khi đổi code)
npm run dev
```

Mở trình duyệt tại: **http://localhost:3000**

## 🤖 Bật Gemini AI (tùy chọn)

Nếu có Gemini API key, server sẽ phân tích CV thật thay vì dùng điểm cố định:

1. Lấy key miễn phí tại [Google AI Studio](https://aistudio.google.com/apikey)
2. Chạy server kèm biến môi trường:

```bash
GEMINI_API_KEY=your_key_here node server.js
```

## 🔒 Bật API Auth (tùy chọn, nên dùng khi deploy)

```bash
API_SECRET=matkhau_bi_mat ALLOWED_ORIGIN=https://yourdomain.com node server.js
```

Sau khi đặt `API_SECRET`, mọi request ghi dữ liệu (POST/PUT/PATCH) phải gửi kèm header:
```
X-API-Key: matkhau_bi_mat
```

## 📁 Cấu trúc dự án

```
CV-AI/
├── index.html              # Hub — trang chọn nhanh màn hình
├── careerai-ueh-pixel.html # Trang chủ chính
├── jobs.html               # Chọn ngành nghề
├── upload.html             # Tải CV lên
├── analysis.html           # Trang phân tích
├── result.html             # Kết quả phân tích
├── roadmap.html            # Lộ trình phát triển
├── dashboard.html          # Tổng quan lịch sử
├── about.html              # Giới thiệu
├── contact.html            # Liên hệ
├── careerai.js             # Logic frontend (state + UI)
├── careerai-ueh-pixel.css  # Stylesheet chính
├── server.js               # Backend Node.js
├── jobs-data.json          # Dữ liệu ngành nghề (nguồn sự thật)
├── careerai-data.json      # State runtime (tự động tạo)
└── sample-cv.pdf           # CV mẫu để test
```

## 🌐 API Endpoints

| Method | Endpoint | Mô tả |
|--------|----------|---------|
| GET | `/api/state` | Lấy trạng thái hiện tại |
| PUT | `/api/state` | Cập nhật trạng thái |
| POST | `/api/analyze` | Phân tích CV (có Gemini nếu đã đặt key) |
| GET | `/api/jobs` | Lấy danh sách ngành nghề |
| POST | `/api/messages` | Gửi tin nhắn liên hệ |

## 🚨 Deploy lên Render (miễn phí)

1. Vo vào [render.com](https://render.com) → New Web Service
2. Kết nối repo này
3. Build Command: *(để trống)*
4. Start Command: `node server.js`
5. Thêm Environment Variables: `GEMINI_API_KEY`, `API_SECRET`, `ALLOWED_ORIGIN`
