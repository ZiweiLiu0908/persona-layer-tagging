# Persona Layer Tagging

TikTok 视频 / 博主账号级人设打标服务。

当前版本只保留 Personal Tags 业务链路：

- `basic_demographics`
- `consumption_tier`
- `temperament_psychology`
- 聚合后的 `social_identity`
- 聚合后的 `occasion`
- `confidence`
- `account_one_sentence_summary`

数据库旧字段保留兼容，但当前业务逻辑不再生成或展示风格向量类结果。

## 服务地址

线上 API：

```text
http://136.107.39.145:4190
```

本地默认：

```text
http://127.0.0.1:4190
```

## 核心业务逻辑

整条链路分成 4 步。

```text
视频 GCS URL + caption
  -> 单视频证据采集 video_description_unit
  -> 单视频 Personal Tags 分类 personal_tags
  -> 博主账号级基础画像 account_personal_tags
  -> 聚合 social_identity / occasion
```

### 1. 单视频证据采集

函数入口：

```python
analyze_video_unit(prompt1, video, video_index, api_gate)
```

输入：

```json
{
  "source_url": "原始 GCS URL",
  "file_uri": "重新签名后的可访问 GCS URL",
  "caption": "视频 caption / description",
  "hashtag": ""
}
```

它会调用视频多模态模型，看视频画面，同时结合 caption / hashtag，输出 `video_description_unit`。

这个字段不是最终标签，而是给后续判断用的证据层。

重点采集：

- 人物基础视觉：年龄感、性别呈现、族裔视觉
- 身材线索：胖瘦、肌肉感、身高感、特殊 body 部位
- 消费线索：价格、品牌、haul、try-on、商品类型
- 气质线索：表情、动作、姿态、镜头互动、文案语气
- 社会身份线索：学生、职场、创作者、运动健康等
- Occasion 场景线索：日常、通勤、度假、派对、居家等

### 2. 单视频 Personal Tags 分类

函数入口：

```python
analyze_video_classification(prompt3, video, unit, api_gate)
```

它基于 `video_description_unit` 做单视频分类，输出 `personal_tags`。

其中当前账号聚合只使用这两个字段：

```json
{
  "social_identity_classification": {
    "label": "",
    "confidence": "",
    "evidence": "",
    "secondary_signals": []
  },
  "occasion_classification": {
    "label": "",
    "confidence": "",
    "evidence": "",
    "secondary_signals": []
  }
}
```

注意：

- 不因为账号来自 TikTok 就默认判断为 `创作者/媒体型`
- `social_identity` 必须有明确身份线索
- `occasion` 优先看画面场景，其次看字幕、caption、hashtag
- 单条视频出现多个强场景且无法分主次，才用 `Remix Occasion`

### 3. 博主账号级基础画像

函数入口：

```python
analyze_blogger_lite_account(units)
```

输入是同一个博主的多个 `video_description_unit`。

它只输出 3 类账号级稳定标签：

```json
{
  "basic_demographics": {
    "gender_or_sexuality_presentation": "",
    "age_range": "",
    "visual_ethnicity": "",
    "body_type": "",
    "height_impression": "",
    "special_body_parts": []
  },
  "consumption_tier": "",
  "temperament_psychology": "",
  "confidence": {
    "basic_demographics": "",
    "consumption_tier": "",
    "temperament_psychology": ""
  }
}
```

账号级模型不直接输出：

- `social_identity`
- `occasion`
- 风格类结果

原因是：`social_identity` 和 `occasion` 更适合从多条视频的单视频分类里统计聚合，减少单次账号级 LLM 直接拍脑袋。

### 4. 聚合 social_identity / occasion

函数入口：

```python
aggregate_classifications(classifications)
```

它会读取每条视频的：

- `social_identity_classification.label`
- `occasion_classification.label`

然后分别调用：

```python
distribution_for(classifications, key, remix_label, unclear_label)
```

聚合规则：

1. 只统计成功分类的视频。
2. 对每个 label 计数。
3. `share = round(count * 100 / total) + "%"`。
4. 如果没有可用 label，返回兜底标签。
5. 如果 Top1 占比 `>= 50%` 且 Top2 占比 `<= 40%`，最终标签取 Top1。
6. 否则最终标签取 Remix。

对应兜底：

```python
social_identity:
  remix_label = "Remix 身份型"
  unclear_label = "无明确社会身份型"

occasion:
  remix_label = "Remix Occasion"
  unclear_label = "无明显Occasion"
```

## 字段来源说明

### 字段生成来源总表

| 最终字段 | 生成方式 | 直接输入 | 业务含义 |
| --- | --- | --- | --- |
| `basic_demographics` | 账号级 LLM 分析 | 多条 `video_description_unit` | 从多条视频证据里总结稳定的人口视觉画像。 |
| `consumption_tier` | 账号级 LLM 分析 | 多条 `video_description_unit` | 从多条视频里的价格、品牌、商品和购物线索判断稳定消费层级。 |
| `temperament_psychology` | 账号级 LLM 分析 | 多条 `video_description_unit` | 从多条视频里的表情、动作、姿态、文案语气判断稳定气质心理。 |
| `confidence` | 账号级 LLM 分析 | 多条 `video_description_unit` | 只描述上面 3 个账号级 LLM 字段的置信度。 |
| `social_identity` | 多视频统计聚合 | 每条视频的 `social_identity_classification.label` | 先做单视频身份分类，再统计 15 条视频分布得到账号级身份。 |
| `occasion` | 多视频统计聚合 | 每条视频的 `occasion_classification.label` | 先做单视频场景分类，再统计 15 条视频分布得到账号级 Occasion。 |
| `aggregated_social_identity` | 多视频统计聚合 | 每条视频的 `social_identity_classification.label` | 保存 `social_identity` 的统计过程，包括 total、distribution、final_label。 |
| `aggregated_occasion` | 多视频统计聚合 | 每条视频的 `occasion_classification.label` | 保存 `occasion` 的统计过程，包括 total、distribution、final_label。 |

简单理解：

```text
通过分析 description_unit 得到：
  basic_demographics
  consumption_tier
  temperament_psychology
  confidence

通过多条视频分类结果统计得到：
  social_identity
  occasion
  aggregated_social_identity
  aggregated_occasion
```

### consumption_tier

来源：账号级 LLM 对多个 `video_description_unit` 的重复消费线索判断。

不是直接统计每条视频的 `consumption_tier_classification`，而是把多个 `video_description_unit` 作为账号整体证据输入给账号级模型，由模型判断账号长期呈现的消费层级。

它依赖的是 description unit 中的这些证据：

- `consumption_tier_evidence.visible_brand_or_price`
- `consumption_tier_evidence.product_type`
- `consumption_tier_evidence.possible_consumption_signal`
- `social_media_info.caption`
- `social_media_info.hashtags`

主要看：

- 明确价格
- 可见品牌
- 商品类型
- try-on / haul / shopping 推荐
- caption / hashtag 中的商品或品牌线索

候选值：

```text
高性价比：$0 - $60
中端通勤：$60 - $180
轻奢：$180 - $500
奢侈品：$500+
无明显消费层级
Remix 消费型
```

没有明确价格、品牌或商品层级时，不凭主观质感猜价格，优先输出 `无明显消费层级`。

### basic_demographics

来源：账号级 LLM 对多个 `video_description_unit` 里的稳定视觉证据判断。

不是单条视频直接决定，也不是简单多数投票。模型会看多条 `video_description_unit` 中反复出现的人物视觉证据，再输出账号级稳定画像。

它依赖的是 description unit 中的这些证据：

- `basic_demographics_evidence.gender_or_sexuality_presentation`
- `basic_demographics_evidence.age_impression`
- `basic_demographics_evidence.visual_ethnicity`
- `body_and_body_part_evidence.body_type_signal`
- `body_and_body_part_evidence.height_impression`
- `body_and_body_part_evidence.special_body_focus`
- `body_and_body_part_evidence.inferred_body_or_fitness_signal`

字段：

```json
{
  "gender_or_sexuality_presentation": "女",
  "age_range": "18-24",
  "visual_ethnicity": "白人",
  "body_type": "Skinny",
  "height_impression": "Tall",
  "special_body_parts": ["belly", "屁股"]
}
```

判断原则：

- 只判断视频里的视觉呈现，不判断真实身份
- 必须来自多条视频重复出现的稳定信号
- `special_body_parts` 只有在视频明显突出展示该部位时才记录
- 只是普通入镜，不算特殊 body 部位

### temperament_psychology

来源：账号级 LLM 对多条视频里的气质表达判断。

不是统计单条视频标签，而是基于多个 `video_description_unit` 的重复气质信号做账号级总结。

它依赖的是 description unit 中的这些证据：

- `temperament_psychology_evidence.visible_temperament_signal`
- `temperament_psychology_evidence.inferred_temperament_signal`
- `temperament_psychology_evidence.facial_expression_and_pose`
- `temperament_psychology_evidence.speech_or_caption_tone`
- `inferred_signals_from_video_clues.temperament_inference`
- `single_video_signal_summary.strong_signals_for_account_level_analysis`

主要看：

- 表情
- 姿态
- 动作
- 镜头互动
- 说话方式
- caption 文案语气
- 视频想营造的生活方式

候选值：

```text
温柔亲和型
自信性感型
冷感高级型
活力阳光型
搞笑混乱型
安静内向型
精英利落型
叛逆个性型
无明显气质类型
Remix 气质型
```

### social_identity

来源：不是账号级 LLM 直接判断，而是多条单视频 `social_identity_classification.label` 聚合出来。

生成链路：

```text
每条视频 video_description_unit
  -> analyze_video_classification()
  -> social_identity_classification.label
  -> aggregate_classifications()
  -> aggregated_social_identity.final_label
  -> account_personal_tags.social_identity
```

也就是说，`social_identity` 是通过视频统计得到的，不是通过账号级模型直接分析 `description_unit` 得到的。

为什么这么做：

- 社会身份经常是单视频场景信号，例如校园、办公室、健身、派对。
- 如果直接让账号级模型判断，容易把少数强视频误当成账号身份。
- 先单视频分类，再看 15 条视频分布，更能反映账号长期稳定身份。

候选值：

```text
学生/校园型
职场/专业型
创作者/媒体型
家庭/关系型
运动/健康型
艺术/文化型
社交/派对型
无明确社会身份型
Remix 身份型
```

例子：

```json
{
  "total": 15,
  "final_label": "无明确社会身份型",
  "distribution": [
    { "count": 12, "label": "无明确社会身份型", "share": "80%" },
    { "count": 3, "label": "创作者/媒体型", "share": "20%" }
  ]
}
```

这里 Top1 是 `无明确社会身份型`，占比 80%，Top2 只有 20%，所以最终标签就是 `无明确社会身份型`。

### occasion

来源：不是账号级 LLM 直接判断，而是多条单视频 `occasion_classification.label` 聚合出来。

生成链路：

```text
每条视频 video_description_unit
  -> analyze_video_classification()
  -> occasion_classification.label
  -> aggregate_classifications()
  -> aggregated_occasion.final_label
  -> account_personal_tags.occasion
```

也就是说，`occasion` 是通过视频统计得到的，不是通过账号级模型直接分析 `description_unit` 得到的。

为什么这么做：

- Occasion 本质上是每条视频的穿搭/内容场景。
- 一个账号可能同时有日常、度假、派对、约会等多个场景。
- 用分布统计可以判断账号是单一场景型，还是 Remix Occasion。

候选值：

```text
Work / Office
School / Campus
Everyday Casual
At-home / Cozy
Café / Brunch
Date
Party / Night-out
Travel / Transit
Vacation / Resort
Sport / Active
Special Occasion
无明显Occasion
Remix Occasion
```

例子：

```json
{
  "total": 15,
  "final_label": "Remix Occasion",
  "distribution": [
    { "count": 7, "label": "Everyday Casual", "share": "47%" },
    { "count": 5, "label": "Vacation / Resort", "share": "33%" },
    { "count": 1, "label": "Party / Night-out", "share": "7%" },
    { "count": 1, "label": "Date", "share": "7%" },
    { "count": 1, "label": "At-home / Cozy", "share": "7%" }
  ]
}
```

这里 Top1 是 47%，没有达到 50%，所以最终标签是 `Remix Occasion`。

### confidence

来源：账号级 LLM 对 3 个账号基础字段的置信度判断。

它只跟通过 `description_unit` 分析得到的字段绑定：

- `basic_demographics`
- `consumption_tier`
- `temperament_psychology`

它不评价统计聚合字段：

- `social_identity`
- `occasion`

这两个字段的可信度应该看 `distribution` 是否集中。

只包含：

```json
{
  "basic_demographics": "high",
  "consumption_tier": "high",
  "temperament_psychology": "high"
}
```

`social_identity` 和 `occasion` 的可信度不放在这里，因为它们来自统计聚合，可信度看 `distribution`。

## 最终结果结构

博主任务成功后，重点读取：

```json
{
  "account_personal_tags": {
    "consumption_tier": "中端通勤：$60 - $180",
    "basic_demographics": {
      "age_range": "18-24",
      "body_type": "Skinny",
      "visual_ethnicity": "白人",
      "height_impression": "Tall",
      "special_body_parts": ["belly", "屁股"],
      "gender_or_sexuality_presentation": "女"
    },
    "temperament_psychology": "自信性感型",
    "social_identity": "无明确社会身份型",
    "occasion": "Remix Occasion",
    "confidence": {
      "consumption_tier": "high",
      "basic_demographics": "high",
      "temperament_psychology": "high"
    }
  },
  "aggregated_social_identity": {},
  "aggregated_occasion": {},
  "account_one_sentence_summary": ""
}
```

## API 使用

### 提交单视频打标

```http
POST /api/v1/videos/tag
```

请求：

```json
{
  "video_id": "11111111-1111-1111-1111-111111111111",
  "gcs_url": "gs://bucket/path/video.mp4",
  "description": "caption text",
  "callback_url": "https://example.com/callback"
}
```

返回：

```json
{
  "code": 0,
  "message": "video tagging task submitted",
  "task_id": "",
  "video_id": "",
  "status": "pending"
}
```

查询：

```http
GET /api/v1/videos/tag/{video_id}
```

成功后重点读取：

- `data.video_description_unit`
- `data.personal_tags`

### 提交博主账号打标

```http
POST /api/v1/bloggers/tag
```

请求：

```json
{
  "tiktok_blogger_id": "33333333-3333-3333-3333-333333333333",
  "callback_url": "https://example.com/callback",
  "min_video_count": 15
}
```

返回：

```json
{
  "code": 0,
  "message": "blogger tagging task submitted",
  "task_id": "",
  "tiktok_blogger_id": "",
  "status": "pending",
  "min_video_count": 15,
  "available_video_count": 20
}
```

查询：

```http
GET /api/v1/bloggers/tag/{tiktok_blogger_id}
```

成功后重点读取：

- `data.account_personal_tags`
- `data.aggregated_social_identity`
- `data.aggregated_occasion`
- `data.account_one_sentence_summary`

## Python 调用示例

```python
import time
import requests

BASE_URL = "http://136.107.39.145:4190"


def submit_blogger_tagging(tiktok_blogger_id, callback_url, min_video_count=15):
    response = requests.post(
        f"{BASE_URL}/api/v1/bloggers/tag",
        json={
            "tiktok_blogger_id": tiktok_blogger_id,
            "callback_url": callback_url,
            "min_video_count": min_video_count,
        },
        timeout=20,
    )
    response.raise_for_status()
    payload = response.json()
    if payload["code"] != 0:
        raise RuntimeError(payload["message"])
    return payload


def get_blogger_result(tiktok_blogger_id):
    response = requests.get(
        f"{BASE_URL}/api/v1/bloggers/tag/{tiktok_blogger_id}",
        timeout=20,
    )
    response.raise_for_status()
    payload = response.json()
    if payload["code"] != 0:
        raise RuntimeError(payload["message"])
    return payload["data"]


def wait_blogger_result(tiktok_blogger_id, interval=10, max_wait=1800):
    deadline = time.time() + max_wait
    while time.time() < deadline:
        task = get_blogger_result(tiktok_blogger_id)
        if task["status"] in ("success", "failed"):
            return task
        time.sleep(interval)
    raise TimeoutError("blogger tagging timeout")


if __name__ == "__main__":
    blogger_id = "33333333-3333-3333-3333-333333333333"
    submit_blogger_tagging(
        tiktok_blogger_id=blogger_id,
        callback_url="https://example.com/callback",
    )
    result = wait_blogger_result(blogger_id)

    print(result["account_personal_tags"])
    print(result["aggregated_social_identity"])
    print(result["aggregated_occasion"])
```

## curl 示例

```bash
curl -X POST "http://136.107.39.145:4190/api/v1/bloggers/tag" \
  -H "Content-Type: application/json" \
  -d '{
    "tiktok_blogger_id": "33333333-3333-3333-3333-333333333333",
    "callback_url": "https://example.com/callback",
    "min_video_count": 15
  }'
```

```bash
curl "http://136.107.39.145:4190/api/v1/bloggers/tag/33333333-3333-3333-3333-333333333333"
```

## 回调格式

视频任务完成：

```json
{
  "event": "video_tagging.completed",
  "video_id": "",
  "task_id": "",
  "status": "success",
  "code": 0,
  "message": "video tagging completed",
  "error_detail": ""
}
```

博主任务完成：

```json
{
  "event": "blogger_tagging.completed",
  "tiktok_blogger_id": "",
  "task_id": "",
  "status": "success",
  "code": 0,
  "message": "blogger tagging completed",
  "error_detail": ""
}
```

## 最小代码结构

核心后端函数：

```text
app.py
  analyze_video_unit()
  analyze_video_classification()
  analyze_blogger_lite_account()
  aggregate_classifications()
  distribution_for()
  merge_blogger_personal_tags()
  run_video_tagging_task()
  run_blogger_tagging_task()
```

核心 Prompt：

```text
static/prompts.js
  DEFAULT_PROMPT_1: 单视频证据采集
  DEFAULT_PROMPT_2: 账号级基础画像
  DEFAULT_PROMPT_3: 单视频 Personal Tags 分类
  DEFAULT_PROMPT_6: 博主一句话总结
```

## 本地运行

```bash
pip install -r requirements.txt
python app.py
```

打开：

```text
http://127.0.0.1:4190
```
