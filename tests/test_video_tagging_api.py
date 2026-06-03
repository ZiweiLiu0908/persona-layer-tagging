import unittest
from datetime import datetime, timedelta, timezone
from urllib.parse import quote

import app


class FakeHandler:
    def __init__(self):
        self.headers = {}
        self.body = b""
        self.http_status = None

    def send_response(self, status):
        self.http_status = status

    def send_header(self, key, value):
        self.headers[key] = value

    def end_headers(self):
        pass

    @property
    def wfile(self):
        return self

    def write(self, body):
        self.body += body


class VideoTaggingApiTests(unittest.TestCase):
    def test_api_code_response_allows_payload_status_field(self):
        handler = FakeHandler()

        app.api_code_response(handler, 0, "success", task_id="task-1", status="pending")

        self.assertEqual(handler.http_status, 200)
        self.assertIn(b'"status": "pending"', handler.body)

    def test_public_config_masks_api_key(self):
        config = app.public_config_payload()

        self.assertIn("api_key_masked", config)
        self.assertNotIn("api_key", config)
        self.assertEqual(config["blogger_min_video_count"], 15)
        self.assertIn("6", config["prompts"])
        self.assertIn("6", config["prompt_descriptions"])

    def test_validate_video_tagging_request_requires_core_fields_only(self):
        ok, error = app.validate_video_tagging_request(
            {
                "video_id": "11111111-1111-1111-1111-111111111111",
                "gcs_url": "gs://bucket/video.mp4",
                "description": "caption #tag",
                "callback_url": "https://example.com/callback",
            }
        )

        self.assertTrue(ok)
        self.assertIsNone(error)

    def test_validate_video_tagging_request_rejects_missing_description(self):
        ok, error = app.validate_video_tagging_request(
            {
                "video_id": "11111111-1111-1111-1111-111111111111",
                "gcs_url": "gs://bucket/video.mp4",
                "callback_url": "https://example.com/callback",
            }
        )

        self.assertFalse(ok)
        self.assertEqual(error["code"], 4003)

    def test_video_tagging_table_sql_only_creates_one_new_table(self):
        sql = app.video_tagging_table_sql()

        self.assertIn("create table if not exists public.video_tagging_results", sql.lower())
        self.assertEqual(sql.lower().count("create table"), 1)
        self.assertIn("video_id uuid not null", sql.lower())
        self.assertIn("gcs_url text not null", sql.lower())
        self.assertIn("description text not null", sql.lower())
        self.assertIn("source_type varchar not null default 'direct'", sql.lower())
        self.assertIn("source_tiktok_blogger_id uuid", sql.lower())
        self.assertNotIn("alter table public.video_sources", sql.lower())
        self.assertNotIn("alter table public.tiktok_bloggers", sql.lower())

    def test_video_tagging_migration_releases_legacy_local_url_constraint(self):
        sql = app.video_tagging_migration_sql().lower()

        self.assertIn("alter column local_video_url drop not null", sql)
        self.assertIn("add column if not exists gcs_url", sql)
        self.assertIn("add column if not exists source_type", sql)
        self.assertIn("add column if not exists source_tiktok_blogger_id", sql)

    def test_video_queue_claim_uses_database_locking(self):
        sql = app.video_task_claim_sql().lower()

        self.assertIn("for update skip locked", sql)
        self.assertIn("lock_until", sql)
        self.assertIn("attempts = attempts + 1", sql)
        self.assertIn("status = 'running'", sql)

    def test_queue_worker_defaults_are_bounded(self):
        self.assertEqual(app.current_video_worker_count(), 20)
        self.assertEqual(app.current_blogger_worker_count(), 5)

    def test_validate_video_tagging_request_rejects_source_url_and_request_id(self):
        ok, error = app.validate_video_tagging_request(
            {
                "video_id": "11111111-1111-1111-1111-111111111111",
                "gcs_url": "gs://bucket/video.mp4",
                "description": "caption #tag",
                "callback_url": "https://example.com/callback",
                "source_url": "https://example.com/source",
                "request_id": "req-1",
            }
        )

        self.assertFalse(ok)
        self.assertEqual(error["code"], 4006)

    def test_validate_video_tagging_request_rejects_local_video_url(self):
        ok, error = app.validate_video_tagging_request(
            {
                "video_id": "11111111-1111-1111-1111-111111111111",
                "local_video_url": "https://example.com/video.mp4",
                "description": "caption #tag",
                "callback_url": "https://example.com/callback",
            }
        )

        self.assertFalse(ok)
        self.assertEqual(error["code"], 4006)

    def test_callback_payload_success_contains_video_id_task_id_and_status(self):
        payload = app.build_video_tagging_callback_payload(
            {
                "id": "task-1",
                "video_id": "11111111-1111-1111-1111-111111111111",
                "status": "success",
                "code": 0,
                "message": "video tagging completed",
            }
        )

        self.assertEqual(payload["event"], "video_tagging.completed")
        self.assertEqual(payload["video_id"], "11111111-1111-1111-1111-111111111111")
        self.assertEqual(payload["task_id"], "task-1")
        self.assertEqual(payload["status"], "success")
        self.assertEqual(payload["code"], 0)

    def test_row_to_task_parses_jsonb_strings(self):
        task = app.row_to_task(
            {
                "id": "task-1",
                "video_id": "11111111-1111-1111-1111-111111111111",
                "personal_tags": "{\"a\": 1}",
                "style_vector": "{\"casual\": 0.5}",
            }
        )

        self.assertEqual(task["personal_tags"], {"a": 1})
        self.assertEqual(task["style_vector"], {"casual": 0.5})

    def test_row_to_task_stringifies_uuid_arrays(self):
        task = app.row_to_task(
            {
                "id": "task-1",
                "selected_video_ids": ["11111111-1111-1111-1111-111111111111"],
                "video_task_ids": ["22222222-2222-2222-2222-222222222222"],
            }
        )

        self.assertEqual(task["selected_video_ids"], ["11111111-1111-1111-1111-111111111111"])
        self.assertEqual(task["video_task_ids"], ["22222222-2222-2222-2222-222222222222"])

    def test_parse_gcs_url_supports_gs_and_https_signed_url(self):
        self.assertEqual(
            app.parse_gcs_url("gs://bucket-name/path/to/video.mp4"),
            ("bucket-name", "path/to/video.mp4"),
        )
        encoded_key = quote("folder/a video.mp4", safe="/")
        self.assertEqual(
            app.parse_gcs_url(
                f"https://storage.googleapis.com/bucket-name/{encoded_key}"
                "?X-Goog-Date=20260528T000000Z&X-Goog-Expires=604800"
            ),
            ("bucket-name", "folder/a video.mp4"),
        )

    def test_gcs_signed_url_freshness_uses_expiration_query(self):
        signed_at = (datetime.now(timezone.utc) - timedelta(hours=1)).strftime("%Y%m%dT%H%M%SZ")
        fresh_url = (
            "https://storage.googleapis.com/bucket/video.mp4"
            f"?X-Goog-Date={signed_at}&X-Goog-Expires=604800"
        )

        self.assertTrue(app.is_gcs_signed_url_fresh(fresh_url))
        self.assertFalse(app.is_gcs_signed_url_fresh("https://storage.googleapis.com/bucket/video.mp4"))

    def test_beijing_day_to_utc_range(self):
        start, end = app.beijing_day_to_utc_range("2026-05-28")

        self.assertEqual(start.isoformat(), "2026-05-27T16:00:00+00:00")
        self.assertEqual(end.isoformat(), "2026-05-28T16:00:00+00:00")


if __name__ == "__main__":
    unittest.main()
