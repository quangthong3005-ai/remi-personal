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
