# Remi cá nhân

Bản Remi chạy hoàn toàn trong trình duyệt, cài được như app trên điện thoại. Không có tài khoản, không có máy chủ trung gian: dữ liệu lưu ngay trong máy.

## Nguồn

Giao diện và tính năng (Hôm nay, Lịch, Sắp tới, Thói quen, Bếp, Thống kê, huy hiệu, bộ đọc câu tiếng Việt chạy trong máy) lấy từ thư mục `web/` của repo nhóm [Kaiser-2504/Project_Remi](https://github.com/Kaiser-2504/Project_Remi), do cả nhóm viết.
Phần riêng của bản cá nhân:

- `js/api.js`: thay lớp gọi máy chủ của nhóm bằng bản lưu trong máy (localStorage), gọi Claude trực tiếp bằng khóa của bạn nếu có, rồi mới tới bộ luật trong máy.
- `js/personal.js`: nút ⚙ ở góc dưới bên trái để nhập tên, khóa Claude (tuỳ chọn), và địa chỉ máy chủ nhắc việc.
- `worker/`: máy chủ nhắc việc riêng trên Cloudflare Workers (thông báo đẩy khi đã đóng app, hộp thư cho Siri). Xem `worker/README.md`.

Bản Remi cá nhân cũ (một file `index.html`) còn nguyên trong lịch sử git: `git checkout backup-truoc-ban-nhom`.

## Dùng

1. Mở địa chỉ Vercel của bản này. Trên iPhone: Safari, Chia sẻ, Thêm vào Màn hình chính, rồi mở từ biểu tượng.
2. Bấm ⚙: nhập tên. Tuỳ chọn: khóa Claude (hiểu câu thông minh hơn). Không có khóa thì Remi vẫn hiểu các câu thường gặp bằng bộ luật trong máy.
3. Thông báo khi đã đóng app: cài `worker/` như hướng dẫn, nhập địa chỉ và mã bí mật vào ⚙, rồi bật thông báo nền trong Hồ sơ.

Dữ liệu chỉ nằm trên thiết bị này. Cài lại trình duyệt hoặc xoá dữ liệu trang là mất; chưa có đồng bộ giữa các thiết bị.
