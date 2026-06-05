import unittest

import app


class PersonalTagsPipelineTests(unittest.TestCase):
    def test_reset_blogger_results_initializes_personal_tag_stages_only(self):
        bloggers = [
            {
                "id": "blogger_1",
                "videos": [{}, {}],
                "video_units": ["old"],
                "video_classifications": ["old"],
                "video_style_vectors": ["old"],
                "video_style_signatures": ["old"],
                "account_style_summary": {"old": True},
            }
        ]

        [blogger] = app.reset_blogger_results(bloggers)

        self.assertEqual(blogger["progress"], {"done": 0, "total": 5})
        self.assertEqual(blogger["video_units"], [None, None])
        self.assertEqual(blogger["video_classifications"], [None, None])
        self.assertNotIn("video_style_vectors", blogger)
        self.assertNotIn("video_style_signatures", blogger)
        self.assertNotIn("account_style_summary", blogger)

    def test_public_config_exposes_only_personal_tag_prompts(self):
        config = app.public_config_payload()

        self.assertEqual(sorted(config["prompts"].keys()), ["1", "2", "3", "6"])
        self.assertNotIn("4", config["prompt_descriptions"])
        self.assertNotIn("5", config["prompt_descriptions"])

    def test_video_schema_keeps_legacy_style_columns_for_db_compatibility(self):
        sql = app.video_tagging_table_sql().lower()

        self.assertIn("video_description_unit jsonb", sql)
        self.assertIn("personal_tags jsonb", sql)
        self.assertIn("style_vector jsonb", sql)
        self.assertIn("style_signature jsonb", sql)

    def test_blogger_schema_keeps_legacy_style_columns_for_db_compatibility(self):
        sql = app.blogger_tagging_table_sql().lower()

        self.assertIn("account_personal_tags jsonb", sql)
        self.assertIn("aggregated_social_identity jsonb", sql)
        self.assertIn("aggregated_occasion jsonb", sql)
        self.assertIn("account_style_vector jsonb", sql)
        self.assertIn("account_style_signature jsonb", sql)

    def test_merge_blogger_personal_tags_keeps_business_sources_separate(self):
        result = app.merge_blogger_personal_tags(
            {
                "basic_demographics": {
                    "age_range": "18-24",
                    "body_type": "Skinny",
                },
                "consumption_tier": "中端通勤：$60 - $180",
                "temperament_psychology": "自信性感型",
                "confidence": {
                    "basic_demographics": "high",
                    "consumption_tier": "high",
                    "temperament_psychology": "high",
                },
            },
            {
                "social_identity": {"final_label": "无明确社会身份型"},
                "occasion": {"final_label": "Remix Occasion"},
            },
        )

        self.assertEqual(result["basic_demographics"]["age_range"], "18-24")
        self.assertEqual(result["consumption_tier"], "中端通勤：$60 - $180")
        self.assertEqual(result["temperament_psychology"], "自信性感型")
        self.assertEqual(result["social_identity"], "无明确社会身份型")
        self.assertEqual(result["occasion"], "Remix Occasion")
        self.assertEqual(result["confidence"]["basic_demographics"], "high")

    def test_mark_saved_job_inactive_stops_stale_running_state(self):
        job = {"id": "job_1", "status": "running", "error": ""}

        marked = app.mark_saved_job_inactive(job)

        self.assertEqual(marked["status"], "interrupted")
        self.assertIn("服务已重启", marked["error"])

    def test_default_api_concurrency_is_200(self):
        self.assertEqual(app.DEFAULT_API_CONCURRENCY, 200)

    def test_read_env_file_value(self):
        text = "EVOLINK_API_KEY=\"abc123\"\nOTHER=value\n"

        self.assertEqual(app.read_env_file_value(text, "EVOLINK_API_KEY"), "abc123")


if __name__ == "__main__":
    unittest.main()
