# BUMD - OpenAPI & AsyncAPI Documentation Platform

BUMD là nền tảng tự động hóa việc quản lý, so sánh và hiển thị các đặc tả OpenAPI và AsyncAPI thành cổng tài liệu (documentation portals) bất biến, hỗ trợ phát hiện thay đổi (change detection), tìm kiếm, thông báo qua Webhook, và tích hợp phản hồi trong Pull Request.

Để biết thêm chi tiết về thiết kế hệ thống và ranh giới nghiệp vụ, vui lòng đọc các tài liệu sau:
- [ARCHITECTURE.md](file:///home/duckviet/bumd/ARCHITECTURE.md) - Kiến trúc hệ thống và luồng dữ liệu.
- [SYSTEM_DESIGN.md](file:///home/duckviet/bumd/SYSTEM_DESIGN.md) - Thiết kế mô hình dữ liệu (Domain Models) và đặc tả API.
- [AGENTS.md](file:///home/duckviet/bumd/AGENTS.md) - Các quy tắc phát triển phần mềm và nguyên tắc cốt lõi của dự án.

---

## 📂 Cấu trúc dự án (Monorepo)

Dự án sử dụng cấu trúc Monorepo quản lý bởi `pnpm workspace`:

```text
bumd/
├── apps/
│   ├── backend/      # API NestJS (Fastify), Workers, Prisma, Webhook Delivery
│   ├── frontend/     # Cổng tài liệu và Dashboard sử dụng Next.js 16 (Feature-Sliced Design)
│   └── cli/          # Command Line Interface viết bằng oclif để deploy spec
├── packages/
│   ├── diff-engine/  # Thư viện TypeScript wrapper quanh Go oasdiff để so sánh spec
│   └── github-action/# GitHub Action tích hợp deploy và viết comment vào PR
└── tests/            # Bộ kiểm thử tích hợp toàn diện của hệ thống
```

---

## 🛠️ Yêu cầu hệ thống

Trước khi bắt đầu, hãy đảm bảo bạn đã cài đặt các công cụ sau:
- **Node.js**: Phiên bản `24.x` trở lên.
- **pnpm**: Phiên bản `10.12.1` trở lên (được cấu hình trong `package.json`).
- **PostgreSQL**: Cơ sở dữ liệu chính. Mặc định kết nối tới: `postgresql://bumd:bumd@localhost:5436/bumd`.
- **oasdiff**: Công cụ so sánh OpenAPI viết bằng Go (tùy chọn, diff-engine sẽ tự động bỏ qua nếu không tìm thấy binary trong PATH).

---

## 🐳 Cài đặt cơ sở dữ liệu với Docker

Dự án sử dụng **PostgreSQL** làm cơ sở dữ liệu chính và **Redis** cho hàng đợi BullMQ (tùy chọn, fallback về in-memory nếu không có).

Chạy lệnh sau tại thư mục gốc của dự án để khởi động cả hai dịch vụ:

```bash
docker compose up -d
```

Sau khi container sẵn sàng, chạy Prisma migrations để tạo bảng và dữ liệu mẫu:

```bash
DATABASE_URL=postgresql://bumd:bumd@localhost:5436/bumd \
  npx prisma migrate deploy --schema apps/backend/prisma/schema.prisma
```

Dữ liệu mẫu (organizations, docs, branches, API tokens) sẽ được tự động nạp qua migration `insert_mock_data`.

### Kiểm tra kết nối

```bash
# PostgreSQL
docker compose exec postgres psql -U bumd -d bumd -c '\dt'

# Redis
docker compose exec redis redis-cli ping
# → PONG
```

---

## 🚀 Hướng dẫn Cài đặt & Phát triển

### 1. Cài đặt Dependencies
Chạy lệnh sau tại thư mục gốc của dự án để cài đặt tất cả các thư viện của monorepo:
```bash
pnpm install
```

### 2. Build dự án
Build toàn bộ các gói và ứng dụng trong monorepo:
```bash
pnpm build
```
*Lưu ý: Lệnh này cũng sẽ chạy prisma validate trên database URL mặc định.*

### 3. Khởi chạy Backend (Manual Server phục vụ thử nghiệm/QA)
Sau khi build xong, bạn có thể chạy một máy chủ backend tối giản chạy trên bộ nhớ trong (in-memory queues & store) để thử nghiệm nhanh mà không cần cấu hình đầy đủ PostgreSQL/Redis:
```bash
node apps/backend/dist/testing/manual-server.js
```
Máy chủ sẽ lắng nghe tại `http://127.0.0.1:3100`.

### 4. Khởi chạy Frontend (Next.js)
Để khởi chạy ứng dụng frontend Next.js trong chế độ phát triển:
```bash
pnpm --filter @bumd/frontend dev
```
Truy cập ứng dụng frontend tại `http://localhost:3000`.

### 5. Chạy Kiểm thử (Tests)
Để chạy toàn bộ các bài kiểm thử tích hợp (integration tests) cho API, CLI, và Frontend:
```bash
pnpm test
```

### 6. Kiểm tra lỗi cú pháp và Linting
Đảm bảo mã nguồn tuân thủ các chuẩn TypeScript nghiêm ngặt và kiểm tra schema của Prisma:
```bash
pnpm lint
```

---

## 💻 Sử dụng CLI để Triển khai (Deploy)

Bạn có thể chạy thử công cụ CLI để deploy một spec mẫu lên backend đang chạy cục bộ.

Ví dụ lệnh deploy:
```bash
BUMD_API_TOKEN=test_token_not_secret \
node apps/cli/dist/index.js deploy \
  --api-url http://127.0.0.1:3100 \
  --org acme \
  --doc payments \
  --branch main \
  --file tests/fixtures/openapi.yaml \
  --json
```

---

## 🔒 Nguyên tắc Phát triển Không thể Thương lượng

Nếu bạn đóng góp mã nguồn cho dự án này, vui lòng tuân thủ nghiêm ngặt các quy định trong [AGENTS.md](file:///home/duckviet/bumd/AGENTS.md):
1. **TypeScript nghiêm ngặt**: Không sử dụng `any`, `@ts-ignore`, hoặc `@ts-expect-error`.
2. **Tính bất biến (Immutability)**: Không bao giờ sửa đổi trực tiếp dữ liệu nguồn của một phiên bản đã tạo. Mọi cập nhật spec/metadata phải tạo phiên bản mới.
3. **Bảo mật**: Không commit các tệp cấu hình chứa secret thực tế. Không in token ra màn hình hoặc ghi đè mật khẩu trong logs.
4. **Tên tệp tin**: Dùng `kebab-case` cho mã nguồn TypeScript thường và các suffix của NestJS chuẩn (`.service.ts`, `.controller.ts`, v.v.).
