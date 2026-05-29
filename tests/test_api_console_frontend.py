from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]


class ApiConsoleFrontendTests(unittest.TestCase):
    def test_homepage_is_microservice_console_not_csv_batch_ui(self):
        html = (ROOT / "static" / "index.html").read_text(encoding="utf-8")
        js = (ROOT / "static" / "app.js").read_text(encoding="utf-8")
        detail_html = (ROOT / "static" / "task-detail.html").read_text(encoding="utf-8")
        detail_js = (ROOT / "static" / "task-detail.js").read_text(encoding="utf-8")
        blogger_videos_html = (ROOT / "static" / "blogger-videos.html").read_text(encoding="utf-8")
        blogger_videos_js = (ROOT / "static" / "blogger-videos.js").read_text(encoding="utf-8")
        combined = html + js

        for old_text in (
            "Excel",
            "CSV",
            "重新抽样",
            "一键运行",
            "固定博主",
            "bloggerCount",
            "videoCount",
            "concurrency",
            "apiConcurrency",
            "/api/sample",
            "/api/run",
            "local_video_url",
        ):
            self.assertNotIn(old_text, combined)

        self.assertIn("视频打标任务中心", html)
        self.assertIn("博主打标任务中心", html)
        self.assertIn("videoTabBtn", html)
        self.assertIn("bloggerTabBtn", html)
        self.assertIn("配置中心", html)
        self.assertIn("新签名 GCS URL", detail_js)
        self.assertIn("32 风格向量", detail_js)
        self.assertIn("StyleSignature 8 Facets", detail_js)
        self.assertIn('href="/prompts.html"', html)
        self.assertNotIn("提交视频打标", html + js)
        self.assertNotIn("提交博主打标", html + js)
        self.assertIn("/api/v1/video-tagging/tasks", js)
        self.assertIn("/api/v1/blogger-tagging/tasks", js)
        self.assertIn("task-detail.html?type=", js)
        self.assertIn("blogger-videos.html?blogger_id=", js)
        self.assertIn("blogger-video-btn", js)
        self.assertIn("博主视频打标任务", blogger_videos_html)
        self.assertIn("/api/v1/bloggers/", blogger_videos_js)
        self.assertIn("/video-tagging/tasks", blogger_videos_js)
        self.assertIn("task-detail.html?type=video", blogger_videos_js)
        self.assertIn("/api/v1/videos/signed-url/", detail_js)
        self.assertIn("查看该博主视频任务", detail_js)
        self.assertIn("返回任务中心", detail_html)

    def test_config_page_contains_prompt_api_key_and_concurrency_settings(self):
        html = (ROOT / "static" / "prompts.html").read_text(encoding="utf-8")
        js = (ROOT / "static" / "prompt-page.js").read_text(encoding="utf-8")
        combined = html + js

        for text in (
            "配置中心",
            "EVOLINK_API_KEY",
            "EVOLINK_TEXT_API_URL",
            "EVOLINK_VIDEO_API_URL",
            "默认 API 并发",
            "博主打标最少成功视频数",
            "视频 Worker 数量",
            "博主 Worker 数量",
            "负责生成单视频描述单元",
            "负责生成账号基础人口、消费层级、气质心理",
            "负责输出 32 维风格向量",
            "/api/config",
            "video_worker_count",
            "blogger_worker_count",
        ):
            self.assertIn(text, combined)


if __name__ == "__main__":
    unittest.main()
