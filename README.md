# Remi (bản cá nhân)

Bản dùng riêng của ứng dụng Remi: **một trang HTML tĩnh**, chạy hoàn toàn trên thiết bị, dữ liệu lưu trong trình duyệt. Không có máy chủ, tài khoản hay đồng bộ.

Gốc: nhóm Remi (`Kaiser-2504/Project_Remi`, thư mục `standalone/`). Bản này chỉ thêm manifest, service worker (dùng offline) và cấu hình Vercel.

## Dùng trên iPhone
1. Mở địa chỉ Vercel của dự án bằng **Safari**.
2. Chia sẻ → **Thêm vào Màn hình chính**.
3. Mở một lần khi có mạng; sau đó dùng được không cần mạng.

Dữ liệu nằm riêng trên từng thiết bị/trình duyệt. Xóa dữ liệu trang web của Safari sẽ mất dữ liệu.

## Cập nhật
Sửa `index.html`, đổi `VERSION` trong `sw.js`, rồi push; Vercel tự deploy.

## Tính năng AI (cần khóa Claude trong Hồ sơ)
- **Gửi ảnh lịch hoặc dán tin nhắn dài:** Remi tìm các sự kiện, hiện khung để sửa tên, ngày giờ hoặc bỏ tick trước khi thêm vào lịch.
- **Chụp món ăn (nút máy ảnh):** nhận ra món, gợi ý nguyên liệu (tick sẵn, sửa được) và giờ đi chợ.
- **Nói “tối nay tôi muốn nấu …”:** gợi ý giờ đi chợ (khoảng 2 tiếng trước giờ nấu) và danh sách nguyên liệu.
Ảnh được thu nhỏ rồi gửi tới Claude để đọc, không lưu lại trong app.

## Thông báo ngoài app và Siri
Xem `worker/README.md`: máy chủ nhắc việc riêng (Cloudflare Workers) gửi thông báo đẩy tới iPhone khi Remi đã đóng, và nhận câu nói từ Siri/Phím tắt.
