import unittest
import asyncio
from unittest.mock import patch

import app


class FakeAsyncConn:
    def __init__(self):
        self.statements = []
        self.closed = False

    async def execute(self, statement):
        self.statements.append(statement)

    async def close(self):
        self.closed = True


class BloggerTaggingApiTests(unittest.TestCase):
    def test_validate_blogger_tagging_request_uses_uuid_and_default_min_count(self):
        ok, error, data = app.validate_blogger_tagging_request(
            {
                "tiktok_blogger_id": "11111111-1111-1111-1111-111111111111",
                "callback_url": "https://example.com/callback",
            }
        )

        self.assertTrue(ok)
        self.assertIsNone(error)
        self.assertEqual(data["min_video_count"], 15)

    def test_current_blogger_min_video_count_default(self):
        self.assertEqual(app.current_blogger_min_video_count(), 15)

    def test_validate_blogger_tagging_request_rejects_bad_uuid(self):
        ok, error, data = app.validate_blogger_tagging_request(
            {"tiktok_blogger_id": "bad", "callback_url": "https://example.com/callback"}
        )

        self.assertFalse(ok)
        self.assertEqual(error["code"], 4003)
        self.assertIsNone(data)

    def test_blogger_tagging_table_sql_only_creates_blogger_result_table(self):
        sql = app.blogger_tagging_table_sql().lower()

        self.assertIn("create table if not exists public.blogger_tagging_results", sql)
        self.assertIn("account_one_sentence_summary text", sql)
        self.assertNotIn("alter table public.tiktok_bloggers", sql)
        self.assertNotIn("alter table public.video_sources", sql)

    def test_blogger_tagging_migration_only_touches_result_table(self):
        sql = app.blogger_tagging_migration_sql().lower()

        self.assertIn("alter table public.blogger_tagging_results", sql)
        self.assertIn("add column if not exists lock_until", sql)
        self.assertIn("add column if not exists account_one_sentence_summary text", sql)
        self.assertNotIn("alter table public.tiktok_bloggers", sql)
        self.assertNotIn("alter table public.video_sources", sql)

    def test_build_blogger_callback_payload(self):
        payload = app.build_blogger_tagging_callback_payload(
            {
                "id": "task-1",
                "tiktok_blogger_id": "11111111-1111-1111-1111-111111111111",
                "status": "success",
                "result_code": 0,
                "result_message": "blogger tagging completed",
            }
        )

        self.assertEqual(payload["event"], "blogger_tagging.completed")
        self.assertEqual(payload["task_id"], "task-1")
        self.assertEqual(payload["tiktok_blogger_id"], "11111111-1111-1111-1111-111111111111")
        self.assertEqual(payload["code"], 0)

    def test_merge_blogger_personal_tags_uses_llm_and_aggregates(self):
        result = app.merge_blogger_personal_tags(
            {
                "basic_demographics": {"age_range": "25-34"},
                "consumption_tier": "中端通勤：$60 - $180",
                "temperament_psychology": "精英利落型",
            },
            {
                "social_identity": {"final_label": "职场/专业型"},
                "occasion": {"final_label": "Work / Office"},
            },
        )

        self.assertEqual(result["basic_demographics"]["age_range"], "25-34")
        self.assertEqual(result["social_identity"], "职场/专业型")
        self.assertEqual(result["occasion"], "Work / Office")

    def test_extract_account_one_sentence_summary_uses_json_field(self):
        summary = app.extract_account_one_sentence_summary(
            {
                "parsed": {
                    "account_one_sentence_summary": "这是一个 clean girl 气质的职场通勤博主。"
                },
                "error": "",
            }
        )

        self.assertEqual(summary, "这是一个 clean girl 气质的职场通勤博主。")

    def test_extract_account_one_sentence_summary_is_non_blocking_on_error(self):
        self.assertEqual(
            app.extract_account_one_sentence_summary({"parsed": None, "error": "timeout"}),
            "",
        )

    def test_build_blogger_one_sentence_summary_prompt_appends_units(self):
        prompt = app.build_blogger_one_sentence_summary_prompt(
            "请只输出 JSON",
            [{"appearance": "office girl", "content": "GRWM"}],
        )

        self.assertIn("请只输出 JSON", prompt)
        self.assertIn("video_description_unit", prompt)
        self.assertIn("office girl", prompt)

    def test_internal_callback_url_defaults_to_service_port(self):
        with patch.dict("os.environ", {}, clear=True):
            self.assertEqual(
                app.internal_callback_url(),
                "http://127.0.0.1:4190/api/internal/tagging-callback",
            )

    def test_blogger_queue_claim_handles_waiting_rechecks(self):
        sql = app.blogger_task_claim_sql().lower()

        self.assertIn("for update skip locked", sql)
        self.assertIn("waiting_videos", sql)
        self.assertIn("next_retry_at", sql)
        self.assertIn("status = 'checking_videos'", sql)

    def test_ensure_all_tagging_tables_runs_blogger_migration(self):
        conn = FakeAsyncConn()

        async def fake_connect():
            return conn

        with patch.object(app, "db_connect", fake_connect):
            asyncio.run(app.ensure_all_tagging_tables_async())

        combined = "\n".join(conn.statements).lower()
        self.assertIn("add column if not exists account_one_sentence_summary text", combined)
        self.assertTrue(conn.closed)


if __name__ == "__main__":
    unittest.main()
