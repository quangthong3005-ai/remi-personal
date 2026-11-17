# Remi push: máy chủ nhắc việc riêng (Cloudflare Workers, miễn phí)

Máy chủ nhỏ này giữ danh sách nhắc của bạn và gửi **thông báo đẩy** tới iPhone đúng giờ, kể cả khi Remi đã đóng. Nó cũng có một "hộp thư" để Siri/Phím tắt gửi câu nói cho Remi.

## 1. Triển khai (làm một lần)

Cần: tài khoản Cloudflare miễn phí (cloudflare.com) và Node.js.

```bash
cd ~/remi-personal/worker
npm install
npx wrangler login
npx wrangler kv namespace create REMI
```

Lệnh cuối in ra một `id`. Mở `wrangler.toml`, thay `DAN_ID_KV_VAO_DAY` bằng id đó và đổi `SUBJECT` thành email của bạn (dạng `mailto:ban@gmail.com`).

Tạo mã bí mật rồi lưu vào máy chủ (dán mã khi được hỏi):

```bash
openssl rand -hex 24          # copy dòng này, đây là "mã bí mật" của bạn
npx wrangler secret put TOKEN # dán mã vừa tạo
npx wrangler deploy
```

Lệnh `deploy` in địa chỉ dạng `https://remi-push.<tên-bạn>.workers.dev`. Thử: `curl <địa chỉ>/vapid` phải trả về một chuỗi `publicKey`.

## 2. Bật trong Remi (trên iPhone)

1. Mở Remi bằng **Safari**, bấm Chia sẻ → **Thêm vào Màn hình chính**.
2. Mở Remi **từ biểu tượng ở Màn hình chính** (bắt buộc, iOS chỉ cho thông báo đẩy ở chế độ này; cần iOS 16.4 trở lên).
3. Bấm avatar → mục **Thông báo ngoài app** → dán địa chỉ máy chủ và mã bí mật → **Bật thông báo** → chọn **Cho phép**.
4. Bấm **Gửi thử**, khóa màn hình và chờ vài giây.

Từ đó, mỗi khi bạn thêm, sửa hoặc xóa việc, Remi tự đồng bộ danh sách nhắc (14 ngày tới) lên máy chủ. Mỗi phút máy chủ kiểm tra và đẩy các nhắc đã tới giờ.

## 3. Nói với Siri

Tạo Phím tắt tên **Remi** (Ứng dụng Phím tắt → dấu +), gồm 2 hành động:

1. **Đọc chính tả văn bản** (Dictate Text), ngôn ngữ Tiếng Việt.
2. **Lấy nội dung của URL** (Get Contents of URL):
   - URL: `<địa chỉ máy chủ>/inbox`
   - Phương thức: **POST**
   - Tiêu đề (Headers): `Authorization` = `Bearer <mã bí mật>`
   - Nội dung yêu cầu: **JSON**, thêm một khóa `text` (Văn bản) với giá trị là **Văn bản được đọc chính tả**.

Dùng: nói **"Hey Siri, Remi"**, rồi nói câu của bạn (ví dụ "mai 9h họp nhóm"). Một thông báo "Remi đã nhận" hiện ra; chạm vào, Remi mở lên và hỏi bạn xác nhận trước khi thêm vào lịch. Có thể gán Phím tắt này vào **Action Button** hoặc **Chạm vào mặt lưng** (Cài đặt → Trợ năng → Cảm ứng).

## Lưu ý
- Máy chủ lưu nội dung các lời nhắc của bạn trong tài khoản Cloudflare của bạn. Không chia sẻ mã bí mật.
- Quên mã: chạy lại `npx wrangler secret put TOKEN`, rồi nhập mã mới trong Remi.
- Nhắc đã trễ hơn 20 phút sẽ bị bỏ qua (ví dụ điện thoại tắt nguồn lâu).
- Gói miễn phí của Cloudflare đủ cho việc dùng cá nhân; xem giới hạn hiện hành trên trang của Cloudflare.
