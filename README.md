# BUMD - OpenAPI & AsyncAPI Documentation Platform

BUMD là nền tảng tự động hóa việc quản lý, so sánh và hiển thị các đặc tả OpenAPI và AsyncAPI thành cổng tài liệu (documentation portals) bất biến, hỗ trợ phát hiện thay đổi (change detection), tìm kiếm, thông báo qua Webhook, và tích hợp phản hồi trong Pull Request.

Để biết thêm chi tiết về thiết kế hệ thống và ranh giới nghiệp vụ, vui lòng đọc các tài liệu sau:
- [ARCHITECTURE.md](ARCHITECTURE.md) - Kiến trúc hệ thống và luồng dữ liệu.
- [SYSTEM_DESIGN.md](SYSTEM_DESIGN.md) - Thiết kế mô hình dữ liệu (Domain Models) và đặc tả API.
- [AGENTS.md](AGENTS.md) - Các quy tắc phát triển phần mềm và nguyên tắc cốt lõi của dự án.

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

Dự án sử dụng **PostgreSQL** làm cơ sở dữ liệu chính và **Redis** cho hàng đợi BullMQ. Cấu hình Docker Compose bên dưới chỉ dành cho phát triển local: mật khẩu mẫu không phù hợp cho production. Khi thiếu `REDIS_URL`, một số deploy/webhook providers có thể chọn adapter in-memory, nhưng việc có consumer tự động phụ thuộc từng worker; xem phần khởi chạy backend bên dưới để biết behavior chính xác.

Chạy lệnh sau tại thư mục gốc của dự án để khởi động cả hai dịch vụ:

```bash
docker compose up -d
```

Sau khi container sẵn sàng, chạy Prisma migrations để tạo bảng và dữ liệu mẫu:

```bash
DATABASE_URL=postgresql://bumd:bumd@localhost:5436/bumd \
  pnpm exec prisma migrate deploy --schema apps/backend/prisma/schema.prisma
```

Dữ liệu mẫu cho organization, doc và branch được nạp qua migration `insert_mock_data`. Migration này không tạo API token; token phải được cấp qua surface quản trị phù hợp.

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

### 3. Khởi chạy Backend (Manual Server phục vụ phát triển/QA)

Sau khi build, có thể chạy entry point manual hiện có:
```bash
pnpm --filter @bumd/backend dev:server
```

Máy chủ lắng nghe tại `http://127.0.0.1:3100` theo mặc định (`PORT` có thể ghi đè). Với `DATABASE_URL`, backend dùng PostgreSQL cho deploy/auth data; thiếu `DATABASE_URL` thì một số adapter deploy fallback in-memory nhưng các surface dashboard/GitHub OAuth vẫn cần PostgreSQL.

Docker Compose publish Redis tại port local `6380`, vì vậy cấu hình development tương ứng là:

```bash
export REDIS_URL=redis://127.0.0.1:6380
```

Khi có `REDIS_URL`, deploy, webhook và test-workflow BullMQ workers được bootstrap trong cùng tiến trình NestJS. Khi không có Redis, behavior không đồng nhất:

- manual server tự xử lý deploy queue và GitHub integration queue in-memory trong cùng tiến trình;
- webhook queue có thể fallback in-memory nhưng manual server không cấu hình consumer tự động cho queue đó;
- test-workflow dispatcher ghi log rằng workflow sẽ chạy “synchronously in background”, nhưng hiện không gọi runner và run vẫn ở `queued` (gap theo dõi: `WF-RUN-007`).

Vì vậy không dùng cấu hình thiếu Redis để chứng minh worker lifecycle hoàn chỉnh.

Hiện repo chưa có production server entry point, worker-only start script, hoặc endpoint `/health`. Vì vậy `manual-server-ready` chỉ xác nhận tiến trình development đã bind port, không phải production readiness. Kiểm tra an toàn:

```bash
# 401 là kết quả dự kiến khi không có dashboard session; nó chỉ xác nhận HTTP listener phản hồi.
curl -i http://127.0.0.1:3100/v1/dashboard/me
```

### 4. Khởi chạy Frontend (Next.js)
Để khởi chạy ứng dụng frontend Next.js trong chế độ phát triển:
```bash
pnpm --filter @bumd/frontend dev
```
Truy cập ứng dụng frontend tại `http://localhost:3000`.

```bash
curl -I http://127.0.0.1:3000/login
```

Không coi hai lệnh HTTP trên là health check phụ thuộc đầy đủ. Production vẫn cần health/readiness endpoints cho PostgreSQL, Redis, object storage, search và worker consumption.

### 5. Chạy Kiểm thử (Tests)

Root script dự định build rồi chạy bộ test tích hợp của API, CLI và frontend:
```bash
pnpm test
```

Tại audit ngày 2026-07-17, lệnh này chạy một phần rồi treo trong teardown sau `api-token-auth` với log Redis `Connection is closed`; các file còn lại bị hủy chứ không phải đã pass. Không báo cáo focused tests hoặc build phase là một lần chạy full-suite thành công cho đến khi teardown được sửa.

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

CLI cũng có GitHub device flow. Bản build hiện tại dùng tên lệnh oclif dạng `auth:login`, `auth:status`, và `auth:logout`; xem [hướng dẫn CLI auth](docs/guides/cli-auth.md) trước khi dùng. `--gh-token` chưa được triển khai.

## GitHub Actions và OIDC

- [Deploy và diff bằng GitHub Action](docs/guides/github-actions-deploy.md)
- [Cấu hình GitHub Actions OIDC](docs/guides/oidc-setup.md)

OIDC hiện phải được bật rõ bằng `auth_mode: oidc` và workflow phải cấp `permissions: id-token: write`. Authorization mapping hiện đến từ biến `GITHUB_OIDC_AUTHORIZATIONS`, chưa có Prisma mapping/audit model. Xem phần giới hạn trong guide trước khi dùng ngoài môi trường thử nghiệm.

---

## 🔒 Nguyên tắc Phát triển Không thể Thương lượng

Nếu bạn đóng góp mã nguồn cho dự án này, vui lòng tuân thủ nghiêm ngặt các quy định trong [AGENTS.md](AGENTS.md):
1. **TypeScript nghiêm ngặt**: Không sử dụng `any`, `@ts-ignore`, hoặc `@ts-expect-error`.
2. **Tính bất biến (Immutability)**: Không bao giờ sửa đổi trực tiếp dữ liệu nguồn của một phiên bản đã tạo. Mọi cập nhật spec/metadata phải tạo phiên bản mới.
3. **Bảo mật**: Không commit các tệp cấu hình chứa secret thực tế. Không in token ra màn hình hoặc ghi đè mật khẩu trong logs.
4. **Tên tệp tin**: Dùng `kebab-case` cho mã nguồn TypeScript thường và các suffix của NestJS chuẩn (`.service.ts`, `.controller.ts`, v.v.).
