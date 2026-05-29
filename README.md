# 人设层打标项目文档

## 1. 项目介绍

本项目是一个用于 TikTok 内容“人设层”分析和标签生成的 Python HTTP 服务。服务会调用 Evolink/OpenAI 兼容接口，对视频内容、视频文案、hashtag 和博主历史视频进行分析，输出可落库、可查询、可回调的结构化标签结果。

项目包含两个核心部分：

1. 视频打标
   - 输入单条视频的 `video_id`、`gcs_url`、`description` 和 `callback_url`。
   - 系统异步处理视频，生成：
     - `video_description_unit`：单视频客观描述单元。
     - `personal_tags`：单视频人设标签，包括基础人口、消费层级、气质心理、社会身份、Occasion 等。
     - `style_vector`：32 维风格向量。
     - `style_signature`：8-facet 细粒度风格指纹。
   - 处理完成后向调用方提供的 `callback_url` 推送结果状态。

2. 博主打标
   - 输入 `tiktok_blogger_id`、`callback_url`，可选输入 `min_video_count`。
   - 系统从数据库读取该博主的视频，至少需要满足指定数量的可用视频。
   - 若视频未完成打标，会自动提交内部视频打标任务，并等待足够数量的视频成功后再聚合。
   - 聚合输出账号级标签：
     - `account_personal_tags`：账号级基础人口、消费层级、气质心理、社会身份、Occasion。
     - `account_style_vector`：账号级平均 32 维风格向量。
     - `account_style_signature`：账号级 8-facet 风格指纹。
     - `aggregated_social_identity`、`aggregated_occasion`：基于多个视频分类结果聚合出的分布和最终标签。

## 2. 接口调用说明

### 2.1 API 基础地址

如果服务部署在本机，默认 API 地址为：

```text
http://127.0.0.1:4190
```

如果服务部署在线上，请将下面示例里的 `http://127.0.0.1:4190` 替换为实际域名，例如：

```text
https://your-domain.com
```

所有提交类接口请求头：

```http
Content-Type: application/json
```

### 2.2 视频打标：提交任务

API 地址：

```http
POST /api/v1/videos/tag
```

完整请求地址示例：

```text
http://127.0.0.1:4190/api/v1/videos/tag
```

输入：

```json
{
  "video_id": "11111111-1111-1111-1111-111111111111",
  "gcs_url": "gs://bucket/path/to/video.mp4",
  "description": "视频 caption、标题、hashtag 等文本",
  "callback_url": "https://example.com/video-callback"
}
```

输入字段说明：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `video_id` | string | 是 | 视频 UUID。 |
| `gcs_url` | string | 是 | 视频文件地址，支持 `gs://...` 或 GCS HTTPS URL。 |
| `description` | string | 是 | 视频文案、标题、caption、hashtag 等文本。 |
| `callback_url` | string | 是 | 任务完成后的回调地址，必须以 `http://` 或 `https://` 开头。 |

输出：

```json
{
  "code": 0,
  "message": "received",
  "task_id": "22222222-2222-2222-2222-222222222222",
  "video_id": "11111111-1111-1111-1111-111111111111",
  "status": "pending"
}
```

输出字段说明：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `code` | number | `0` 表示提交成功，非 `0` 表示失败。 |
| `message` | string | 任务接收结果，如 `received`、`already_running`、`already_processed`。 |
| `task_id` | string | 本次打标任务 ID。 |
| `video_id` | string | 调用方传入的视频 ID。 |
| `status` | string | 当前任务状态，常见值为 `pending`、`running`、`success`、`failed`。 |

curl 示例：

```bash
curl -X POST "http://127.0.0.1:4190/api/v1/videos/tag" \
  -H "Content-Type: application/json" \
  -d '{
    "video_id": "11111111-1111-1111-1111-111111111111",
    "gcs_url": "gs://bucket/path/to/video.mp4",
    "description": "视频 caption、标题、hashtag 等文本",
    "callback_url": "https://example.com/video-callback"
  }'
```

### 2.3 视频打标：查询结果

API 地址：

```http
GET /api/v1/videos/tag/{video_id}
```

完整请求地址示例：

```text
http://127.0.0.1:4190/api/v1/videos/tag/11111111-1111-1111-1111-111111111111
```

输入：

| 参数 | 位置 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `video_id` | path | string | 是 | 视频 UUID。 |

输出：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "id": "22222222-2222-2222-2222-222222222222",
    "video_id": "11111111-1111-1111-1111-111111111111",
    "gcs_url": "gs://bucket/path/to/video.mp4",
    "description": "视频 caption、标题、hashtag 等文本",
    "status": "success",
    "result_code": 0,
    "result_message": "video tagging completed",
    "video_description_unit": {},
    "personal_tags": {},
    "style_vector": {},
    "style_signature": {},
    "raw_outputs": {},
    "callback_url": "https://example.com/video-callback",
    "callback_status": "success",
    "created_at": "2026-05-29T00:00:00+00:00",
    "updated_at": "2026-05-29T00:01:00+00:00",
    "started_at": "2026-05-29T00:00:10+00:00",
    "finished_at": "2026-05-29T00:01:00+00:00"
  }
}
```

核心输出字段说明：

| 字段 | 说明 |
| --- | --- |
| `data.status` | 任务状态。 |
| `data.video_description_unit` | 单视频客观描述单元。 |
| `data.personal_tags` | 单视频人设标签。 |
| `data.style_vector` | 32 维风格向量。 |
| `data.style_signature` | 8-facet 风格指纹。 |
| `data.callback_status` | 回调发送状态。 |

### 2.4 博主打标：提交任务

API 地址：

```http
POST /api/v1/bloggers/tag
```

完整请求地址示例：

```text
http://127.0.0.1:4190/api/v1/bloggers/tag
```

输入：

```json
{
  "tiktok_blogger_id": "33333333-3333-3333-3333-333333333333",
  "callback_url": "https://example.com/blogger-callback",
  "min_video_count": 15
}
```

输入字段说明：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `tiktok_blogger_id` | string | 是 | TikTok 博主 UUID，必须存在于数据库 `public.tiktok_bloggers` 表。 |
| `callback_url` | string | 是 | 任务完成后的回调地址，必须以 `http://` 或 `https://` 开头。 |
| `min_video_count` | number | 否 | 最少成功视频数，默认 `15`，范围 `1-50`。 |

输出：

```json
{
  "code": 0,
  "message": "received",
  "task_id": "44444444-4444-4444-4444-444444444444",
  "tiktok_blogger_id": "33333333-3333-3333-3333-333333333333",
  "status": "pending",
  "min_video_count": 15,
  "available_video_count": 20
}
```

输出字段说明：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `code` | number | `0` 表示提交成功，非 `0` 表示失败。 |
| `message` | string | 任务接收结果。 |
| `task_id` | string | 本次博主打标任务 ID。 |
| `tiktok_blogger_id` | string | 调用方传入的博主 ID。 |
| `status` | string | 当前任务状态。 |
| `min_video_count` | number | 本次任务要求的最少成功视频数。 |
| `available_video_count` | number | 系统当前查询到的可用视频数。 |

curl 示例：

```bash
curl -X POST "http://127.0.0.1:4190/api/v1/bloggers/tag" \
  -H "Content-Type: application/json" \
  -d '{
    "tiktok_blogger_id": "33333333-3333-3333-3333-333333333333",
    "callback_url": "https://example.com/blogger-callback",
    "min_video_count": 15
  }'
```

### 2.5 博主打标：查询结果

API 地址：

```http
GET /api/v1/bloggers/tag/{tiktok_blogger_id}
```

完整请求地址示例：

```text
http://127.0.0.1:4190/api/v1/bloggers/tag/33333333-3333-3333-3333-333333333333
```

输入：

| 参数 | 位置 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `tiktok_blogger_id` | path | string | 是 | TikTok 博主 UUID。 |

输出：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "id": "44444444-4444-4444-4444-444444444444",
    "tiktok_blogger_id": "33333333-3333-3333-3333-333333333333",
    "status": "success",
    "result_code": 0,
    "result_message": "blogger tagging completed",
    "min_video_count": 15,
    "available_video_count": 20,
    "usable_video_count": 20,
    "successful_video_count": 15,
    "failed_video_count": 0,
    "submitted_video_count": 15,
    "selected_video_ids": [],
    "video_task_ids": [],
    "account_personal_tags": {},
    "account_style_vector": {},
    "account_style_signature": {},
    "aggregated_social_identity": {},
    "aggregated_occasion": {},
    "raw_outputs": {},
    "callback_url": "https://example.com/blogger-callback",
    "callback_status": "success",
    "created_at": "2026-05-29T00:00:00+00:00",
    "updated_at": "2026-05-29T00:05:00+00:00",
    "started_at": "2026-05-29T00:00:10+00:00",
    "finished_at": "2026-05-29T00:05:00+00:00"
  }
}
```

核心输出字段说明：

| 字段 | 说明 |
| --- | --- |
| `data.status` | 博主任务状态。 |
| `data.successful_video_count` | 成功参与聚合的视频数量。 |
| `data.account_personal_tags` | 账号级人设标签。 |
| `data.account_style_vector` | 账号级平均 32 维风格向量。 |
| `data.account_style_signature` | 账号级 8-facet 风格指纹。 |
| `data.aggregated_social_identity` | 多视频聚合后的社会身份标签和分布。 |
| `data.aggregated_occasion` | 多视频聚合后的 Occasion 标签和分布。 |

### 2.6 回调输出

视频打标完成后，服务会请求调用方提供的 `callback_url`。

视频成功回调输出：

```json
{
  "event": "video_tagging.completed",
  "video_id": "11111111-1111-1111-1111-111111111111",
  "task_id": "22222222-2222-2222-2222-222222222222",
  "status": "success",
  "code": 0,
  "message": "video tagging completed",
  "error_detail": ""
}
```

博主成功回调输出：

```json
{
  "event": "blogger_tagging.completed",
  "tiktok_blogger_id": "33333333-3333-3333-3333-333333333333",
  "task_id": "44444444-4444-4444-4444-444444444444",
  "status": "success",
  "code": 0,
  "message": "blogger tagging completed",
  "error_detail": ""
}
```

失败时，`event` 会变为 `video_tagging.failed` 或 `blogger_tagging.failed`，`status` 为 `failed`，`code` 和 `error_detail` 会返回具体错误信息。

## 3. 运行方式

### 3.1 环境变量

服务依赖以下环境变量，可放在 `.env` 文件中：

```bash
EVOLINK_API_KEY=你的接口密钥
DATABASE_URL=postgresql://user:password@host:port/database
EVOLINK_TEXT_API_URL=https://direct.evolink.ai/v1/chat/completions
EVOLINK_TEXT_MODEL=gemini-3.5-flash
EVOLINK_VIDEO_API_URL=https://direct.evolink.ai/v1/chat/completions
PORT=4190
HOST=0.0.0.0
```

可选配置：

```bash
VIDEO_WORKER_COUNT=20
BLOGGER_WORKER_COUNT=5
QUEUE_POLL_SECONDS=2
INTERNAL_CALLBACK_URL=http://127.0.0.1:4190/api/internal/tagging-callback
```

### 3.2 本地启动

```bash
pip install -r requirements.txt
python app.py
```

服务默认监听：

```text
http://127.0.0.1:4190
```

### 3.3 Docker Compose 启动

```bash
docker compose up -d --build
```

## 4. 接口通用约定

### 4.1 请求格式

所有提交类接口均使用：

```http
Content-Type: application/json
```

### 4.2 通用响应格式

成功或业务失败通常返回：

```json
{
  "code": 0,
  "message": "success",
  "data": {}
}
```

其中：

- `code = 0` 表示成功。
- `code != 0` 表示校验失败、任务不存在、业务失败或服务异常。
- 部分提交接口会直接返回 `task_id`、`status` 等顶层字段。

### 4.3 任务状态

视频任务常见状态：

- `pending`：已接收，等待 Worker 处理。
- `running`：正在处理。
- `success`：处理成功。
- `failed`：处理失败。

博主任务常见状态：

- `pending`：已接收。
- `checking_videos`：正在检查博主视频。
- `waiting_videos`：等待内部视频打标任务完成。
- `aggregating`：正在聚合账号结果。
- `success`：处理成功。
- `failed`：处理失败。

## 5. 视频打标接口

### 5.1 提交视频打标任务

```http
POST /api/v1/videos/tag
```

请求体：

```json
{
  "video_id": "11111111-1111-1111-1111-111111111111",
  "gcs_url": "gs://bucket/path/to/video.mp4",
  "description": "视频 caption 和 hashtag 文本",
  "callback_url": "https://example.com/video-callback"
}
```

字段说明：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `video_id` | 是 | 视频 UUID。 |
| `gcs_url` | 是 | 视频文件地址，支持 `gs://...` 或 GCS HTTPS URL。 |
| `description` | 是 | 视频文案、caption、hashtag 等文本。 |
| `callback_url` | 是 | 任务完成后回调地址，必须以 `http://` 或 `https://` 开头。 |

不支持字段：

- `source_url`
- `request_id`
- `local_video_url`

成功响应：

```json
{
  "code": 0,
  "message": "received",
  "task_id": "22222222-2222-2222-2222-222222222222",
  "video_id": "11111111-1111-1111-1111-111111111111",
  "status": "pending"
}
```

如果同一个 `video_id` 已经成功处理，会返回：

```json
{
  "code": 0,
  "message": "already_processed",
  "task_id": "22222222-2222-2222-2222-222222222222",
  "video_id": "11111111-1111-1111-1111-111111111111",
  "status": "success"
}
```

常见错误：

| code | message |
| --- | --- |
| `4001` | `video_id is required` |
| `4002` | `gcs_url is required` |
| `4003` | `description is required` |
| `4004` | `callback_url is required` 或 `callback_url must start with http:// or https://` |
| `4005` | `video_id must be a UUID` |
| `4006` | `unsupported fields: ...` |
| `5000` | 服务异常。 |

### 5.2 查询单个视频打标结果

```http
GET /api/v1/videos/tag/{video_id}
```

示例：

```bash
curl "http://127.0.0.1:4190/api/v1/videos/tag/11111111-1111-1111-1111-111111111111"
```

成功响应：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "id": "22222222-2222-2222-2222-222222222222",
    "video_id": "11111111-1111-1111-1111-111111111111",
    "gcs_url": "gs://bucket/path/to/video.mp4",
    "description": "视频 caption 和 hashtag 文本",
    "status": "success",
    "result_code": 0,
    "result_message": "video tagging completed",
    "video_description_unit": {},
    "personal_tags": {},
    "style_vector": {},
    "style_signature": {},
    "callback_url": "https://example.com/video-callback",
    "callback_status": "success",
    "created_at": "2026-05-29T00:00:00+00:00",
    "updated_at": "2026-05-29T00:01:00+00:00"
  }
}
```

未找到：

```json
{
  "code": 4041,
  "message": "video tagging result not found"
}
```

### 5.3 查询视频任务列表

```http
GET /api/v1/video-tagging/tasks
```

查询参数：

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `status` | 否 | 按状态过滤，如 `pending`、`running`、`success`、`failed`。 |
| `limit` | 否 | 返回数量，默认 `100`，最大 `500`。 |
| `date` | 否 | 按北京时间日期过滤，格式 `YYYY-MM-DD`。 |

示例：

```bash
curl "http://127.0.0.1:4190/api/v1/video-tagging/tasks?status=success&limit=50&date=2026-05-29"
```

响应：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "tasks": []
  }
}
```

### 5.4 获取视频新签名 GCS URL

```http
GET /api/v1/videos/signed-url/{video_id}
```

用途：

- 当原始 `gcs_url` 是 GCS 地址时，服务会生成或刷新可访问的签名 URL。
- 如果 URL 已经是新鲜的签名 URL，会直接返回原 URL。

响应：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "video_id": "11111111-1111-1111-1111-111111111111",
    "gcs_url": "gs://bucket/path/to/video.mp4",
    "signed_gcs_url": "https://storage.googleapis.com/...",
    "fresh": true
  }
}
```

## 6. 博主打标接口

### 6.1 提交博主打标任务

```http
POST /api/v1/bloggers/tag
```

请求体：

```json
{
  "tiktok_blogger_id": "33333333-3333-3333-3333-333333333333",
  "callback_url": "https://example.com/blogger-callback",
  "min_video_count": 15
}
```

字段说明：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `tiktok_blogger_id` | 是 | TikTok 博主 UUID，必须存在于 `public.tiktok_bloggers` 表。 |
| `callback_url` | 是 | 任务完成后回调地址，必须以 `http://` 或 `https://` 开头。 |
| `min_video_count` | 否 | 最少成功视频数，默认 `15`，范围 `1-50`。 |

成功响应：

```json
{
  "code": 0,
  "message": "received",
  "task_id": "44444444-4444-4444-4444-444444444444",
  "tiktok_blogger_id": "33333333-3333-3333-3333-333333333333",
  "status": "pending",
  "min_video_count": 15,
  "available_video_count": 20
}
```

常见错误：

| code | message |
| --- | --- |
| `4001` | `tiktok_blogger_id is required` |
| `4002` | `callback_url is required` |
| `4003` | `tiktok_blogger_id must be a UUID` |
| `4004` | `callback_url must start with http:// or https://` |
| `4201` | `blogger not found` |
| `4202` | `insufficient videos` |
| `5000` | 服务异常。 |

视频不足时响应示例：

```json
{
  "code": 4202,
  "message": "insufficient videos",
  "available_video_count": 8,
  "required_video_count": 15
}
```

### 6.2 查询单个博主打标结果

```http
GET /api/v1/bloggers/tag/{tiktok_blogger_id}
```

示例：

```bash
curl "http://127.0.0.1:4190/api/v1/bloggers/tag/33333333-3333-3333-3333-333333333333"
```

成功响应：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "id": "44444444-4444-4444-4444-444444444444",
    "tiktok_blogger_id": "33333333-3333-3333-3333-333333333333",
    "status": "success",
    "result_code": 0,
    "result_message": "blogger tagging completed",
    "min_video_count": 15,
    "available_video_count": 20,
    "successful_video_count": 15,
    "selected_video_ids": [],
    "video_task_ids": [],
    "account_personal_tags": {},
    "account_style_vector": {},
    "account_style_signature": {},
    "aggregated_social_identity": {},
    "aggregated_occasion": {},
    "callback_url": "https://example.com/blogger-callback",
    "callback_status": "success"
  }
}
```

未找到：

```json
{
  "code": 4042,
  "message": "blogger tagging result not found"
}
```

### 6.3 查询博主任务列表

```http
GET /api/v1/blogger-tagging/tasks
```

查询参数：

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `status` | 否 | 按状态过滤。 |
| `limit` | 否 | 返回数量，默认 `100`，最大 `500`。 |
| `date` | 否 | 按北京时间日期过滤，格式 `YYYY-MM-DD`。 |

示例：

```bash
curl "http://127.0.0.1:4190/api/v1/blogger-tagging/tasks?status=success&limit=50"
```

响应：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "tasks": []
  }
}
```

### 6.4 查询某个博主关联的视频打标任务

```http
GET /api/v1/bloggers/{tiktok_blogger_id}/video-tagging/tasks
```

查询参数：

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `status` | 否 | 按视频任务状态过滤。 |
| `limit` | 否 | 返回数量，默认 `100`，最大 `500`。 |
| `date` | 否 | 按北京时间日期过滤，格式 `YYYY-MM-DD`。 |

示例：

```bash
curl "http://127.0.0.1:4190/api/v1/bloggers/33333333-3333-3333-3333-333333333333/video-tagging/tasks"
```

响应：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "tasks": []
  }
}
```

## 7. 综合任务查询接口

### 7.1 查询视频和博主任务

```http
GET /api/v1/tagging/tasks
```

查询参数：

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `type` | 否 | `video` 只查视频任务，`blogger` 只查博主任务，不传则都查。 |
| `status` | 否 | 按状态过滤。 |
| `limit` | 否 | 每类任务返回数量，默认 `100`，最大 `500`。 |
| `date` | 否 | 按北京时间日期过滤，格式 `YYYY-MM-DD`。 |

示例：

```bash
curl "http://127.0.0.1:4190/api/v1/tagging/tasks?type=video&status=success&limit=20"
```

响应：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "video_tasks": [],
    "blogger_tasks": []
  }
}
```

## 8. 回调说明

### 8.1 视频打标回调

视频任务完成或失败后，服务会向提交任务时传入的 `callback_url` 发送 `POST` 请求。

成功回调：

```json
{
  "event": "video_tagging.completed",
  "video_id": "11111111-1111-1111-1111-111111111111",
  "task_id": "22222222-2222-2222-2222-222222222222",
  "status": "success",
  "code": 0,
  "message": "video tagging completed",
  "error_detail": ""
}
```

失败回调：

```json
{
  "event": "video_tagging.failed",
  "video_id": "11111111-1111-1111-1111-111111111111",
  "task_id": "22222222-2222-2222-2222-222222222222",
  "status": "failed",
  "code": 5001,
  "message": "Missing EVOLINK_API_KEY",
  "error_detail": "Missing EVOLINK_API_KEY"
}
```

### 8.2 博主打标回调

博主任务完成或失败后，服务会向提交任务时传入的 `callback_url` 发送 `POST` 请求。

成功回调：

```json
{
  "event": "blogger_tagging.completed",
  "tiktok_blogger_id": "33333333-3333-3333-3333-333333333333",
  "task_id": "44444444-4444-4444-4444-444444444444",
  "status": "success",
  "code": 0,
  "message": "blogger tagging completed",
  "error_detail": ""
}
```

失败回调：

```json
{
  "event": "blogger_tagging.failed",
  "tiktok_blogger_id": "33333333-3333-3333-3333-333333333333",
  "task_id": "44444444-4444-4444-4444-444444444444",
  "status": "failed",
  "code": 4202,
  "message": "insufficient videos",
  "error_detail": "available videos 8 < required 15"
}
```

### 8.3 回调接收要求

调用方的回调服务需要：

- 接收 `POST` 请求。
- 支持 `Content-Type: application/json`。
- 建议返回 `2xx` 状态码表示接收成功。

服务会记录：

- `callback_status`
- `callback_response_code`
- `callback_response_body`
- `callback_attempts`
- `last_callback_at`

## 9. 配置接口

### 9.1 查询当前配置

```http
GET /api/config
```

响应包含：

- 文本模型接口地址。
- 视频模型接口地址。
- 模型名称。
- API Key 是否已配置和脱敏展示。
- 默认并发。
- 博主最少视频数。
- 视频 Worker 数量。
- 博主 Worker 数量。
- 5 个 Prompt 的当前内容和说明。

### 9.2 更新配置

```http
POST /api/config
```

请求体示例：

```json
{
  "api_key": "new-api-key",
  "text_api_url": "https://direct.evolink.ai/v1/chat/completions",
  "text_model": "gemini-3.5-flash",
  "video_api_url": "https://direct.evolink.ai/v1/chat/completions",
  "default_api_concurrency": 200,
  "blogger_min_video_count": 15,
  "video_worker_count": 20,
  "blogger_worker_count": 5,
  "prompts": {
    "1": "Prompt 1 内容",
    "2": "Prompt 2 内容",
    "3": "Prompt 3 内容",
    "4": "Prompt 4 内容",
    "5": "Prompt 5 内容"
  }
}
```

配置会保存到：

```text
data/service_config.json
```

## 10. 数据库表

服务会自动创建或迁移两个结果表：

### 10.1 `public.video_tagging_results`

用于保存视频打标任务和结果，核心字段包括：

- `id`
- `video_id`
- `gcs_url`
- `description`
- `status`
- `result_code`
- `result_message`
- `video_description_unit`
- `personal_tags`
- `style_vector`
- `style_signature`
- `raw_outputs`
- `callback_url`
- `callback_status`
- `source_type`
- `source_blogger_task_id`
- `source_tiktok_blogger_id`
- `created_at`
- `updated_at`

### 10.2 `public.blogger_tagging_results`

用于保存博主打标任务和聚合结果，核心字段包括：

- `id`
- `tiktok_blogger_id`
- `status`
- `result_code`
- `result_message`
- `min_video_count`
- `available_video_count`
- `successful_video_count`
- `failed_video_count`
- `selected_video_ids`
- `video_task_ids`
- `account_personal_tags`
- `account_style_vector`
- `account_style_signature`
- `aggregated_social_identity`
- `aggregated_occasion`
- `raw_outputs`
- `callback_url`
- `callback_status`
- `created_at`
- `updated_at`

博主打标还依赖已有业务表：

- `public.tiktok_bloggers`
- `public.video_sources`
- `public.candidate_videos`

## 11. 前端页面

项目自带轻量级管理页面：

| 页面 | 说明 |
| --- | --- |
| `/` | 任务中心，展示视频打标和博主打标任务。 |
| `/task-detail.html?type=video&id={video_id}` | 视频任务详情。 |
| `/task-detail.html?type=blogger&id={tiktok_blogger_id}` | 博主任务详情。 |
| `/blogger-videos.html?blogger_id={tiktok_blogger_id}` | 某个博主关联的视频打标任务。 |
| `/prompts.html` | 配置中心和 Prompt 管理。 |
