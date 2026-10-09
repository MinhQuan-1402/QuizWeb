# QuizWeb

Ứng dụng học trên web: quiz chấm điểm, flashcard, học theo lượt 5 câu và lặp câu sai, quiz ngẫu nhiên, ôn câu gần giống và nhập bộ đề.

## Chạy trên Windows

Cài Node.js 22 trở lên. Mở PowerShell tại thư mục QuizWeb:

```powershell
npm run setup
npm run dev
```

Mở http://localhost:5173. Ctrl+C để dừng. Khi đã cài thư viện, các lần sau chỉ cần npm run dev.

API mặc định lưu bộ đề trong data/exams.json. Ở lần chạy đầu, tự nhập các cặp file có cùng tên trong output_text và answer. Dữ liệu mẫu được kế thừa từ dự án gốc theo quyền sử dụng đã được xác nhận.

Muốn dùng MongoDB: sao chép web/quiz-server/.env.example thành web/quiz-server/.env, đặt MONGODB_URI rồi chạy npm run import:exams. Hai chế độ lưu trữ độc lập; import đọc file đề/đáp án chứ không chuyển JSON sang MongoDB.

## Build

Chạy npm run build. Kết quả ở web/dist. Cấu hình hiện tại phục vụ chạy cục bộ; khi đưa lên Internet cần cấu hình hosting, URL API và quyền truy cập.

## Nhập bộ đề

Vào Nhập bộ đề, chọn câu hỏi TXT và đáp án TXT/CSV. Nhập cùng tên sẽ cập nhật bộ đề cũ. Câu hỏi cần dấu phân cách ===== Q1.webp =====, lựa chọn A., B. và dòng (Choose 2 answers) cho câu nhiều đáp án. Đáp án TXT: Q1: A hoặc Q2: A, C. CSV chứa đáp án theo thứ tự câu, có thể có một dòng tiêu đề.

Chấm điểm cần đúng toàn bộ tập đáp án, không có điểm từng phần. Phiên học nằm trong bộ nhớ trang; tải lại trang sẽ mất tiến độ. Backend lưu bộ đề, chưa lưu lịch sử học.

## OCR ảnh

Python chỉ dùng để xử lý dữ liệu. Cài Python và Tesseract có ngôn ngữ eng/vie. Chạy từ thư mục gốc:

```powershell
pip install -r requirements.txt
python tools/auto_crop_questions.py "img/TenDe" -o "img_cropped/TenDe"
python tools/ocr_scan.py "img_cropped/TenDe" -o output_text --tesseract-cmd "C:\Program Files\Tesseract-OCR\tesseract.exe"
python tools/normalize_ocr_text.py output_text --in-place
python tools/export_same_questions.py
```

Ảnh sạch có thể OCR trực tiếp từ img/TenDe. Kiểm tra text trước khi nhập. Đáp án do bạn cung cấp riêng; OCR không tự tìm đáp án. Web hiện hiển thị văn bản, chưa hiển thị hình minh họa gốc.

same-question.txt được đồng bộ vào web khi dev/build. Ôn câu gần giống ghép câu với bộ đề theo tên và số Q, nên cần giữ tên khớp.

## Cấu trúc

- web/src: React + TypeScript.
- web/quiz-server: Express API, MongoDB tùy chọn hoặc JSON cục bộ.
- tools: OCR, cắt ảnh, chuẩn hóa, gom câu gần giống.
- img, img_cropped: thư mục để bạn thêm ảnh gốc và ảnh cắt.
- output_text, answer: câu hỏi và đáp án mẫu.

Logic đọc câu hỏi, chế độ học và công cụ OCR kế thừa từ dự án gốc. Giao diện, nhập đề, lưu JSON và lệnh khởi chạy được bổ sung cho QuizWeb. Không sao chép ảnh gốc hay thông tin kết nối database.
