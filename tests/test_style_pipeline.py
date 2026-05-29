import unittest

import app


class StylePipelineTests(unittest.TestCase):
    def test_reset_blogger_results_initializes_four_video_stages(self):
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

        self.assertEqual(blogger["progress"], {"done": 0, "total": 9})
        self.assertEqual(blogger["video_units"], [None, None])
        self.assertEqual(blogger["video_classifications"], [None, None])
        self.assertEqual(blogger["video_style_vectors"], [None, None])
        self.assertEqual(blogger["video_style_signatures"], [None, None])
        self.assertIsNone(blogger["account_style_summary"])

    def test_aggregate_style_results_summarizes_vectors_and_signatures(self):
        vectors = [
            {"parsed": {"casual": 0.8, "streetwear": 0.4, "clean": 0.2}, "error": ""},
            {"parsed": {"casual": 0.6, "streetwear": 0.8, "clean": 0.4}, "error": ""},
        ]
        signatures = [
            {
                "parsed": {
                    "color_palette": {
                        "dominant_colors": ["black", "white"],
                        "temperature": "neutral",
                    },
                    "material_profile": {"primary_materials": ["denim", "cotton"]},
                    "silhouette_profile": {"fit_preference": "oversized"},
                    "aesthetic_mood": {"mood_keywords": ["effortless"]},
                    "occasion_vector": {"everyday": 0.9, "active": 0.2},
                    "price_positioning": {"tier": "mid-range"},
                    "era_influence": {"primary_era": "contemporary"},
                },
                "error": "",
            },
            {
                "parsed": {
                    "color_palette": {
                        "dominant_colors": ["black", "denim blue"],
                        "temperature": "cool",
                    },
                    "material_profile": {"primary_materials": ["denim", "fleece"]},
                    "silhouette_profile": {"fit_preference": "oversized"},
                    "aesthetic_mood": {"mood_keywords": ["sporty"]},
                    "occasion_vector": {"everyday": 0.7, "active": 0.6},
                    "price_positioning": {"tier": "mid-range"},
                    "era_influence": {"primary_era": "contemporary"},
                },
                "error": "",
            },
        ]

        summary = app.aggregate_style_results(vectors, signatures)

        self.assertEqual(summary["top_styles"][0]["style"], "casual")
        self.assertAlmostEqual(summary["top_styles"][0]["score"], 0.7)
        self.assertEqual(summary["dominant_colors"][:2], ["black", "white"])
        self.assertEqual(summary["primary_materials"][:2], ["denim", "cotton"])
        self.assertEqual(summary["fit_preference"], "oversized")
        self.assertEqual(summary["price_tier"], "mid-range")
        self.assertEqual(summary["primary_era"], "contemporary")
        self.assertEqual(summary["top_occasions"][0]["occasion"], "everyday")
        account_sig = summary["account_style_signature"]
        self.assertEqual(account_sig["color_palette"]["dominant_colors"][:2], ["black", "white"])
        self.assertEqual(account_sig["color_palette"]["temperature"], "neutral")
        self.assertEqual(account_sig["material_profile"]["primary_materials"][:2], ["denim", "cotton"])
        self.assertEqual(account_sig["silhouette_profile"]["fit_preference"], "oversized")
        self.assertEqual(account_sig["aesthetic_mood"]["mood_keywords"][:2], ["effortless", "sporty"])
        self.assertAlmostEqual(account_sig["occasion_vector"]["everyday"], 0.8)
        self.assertEqual(account_sig["price_positioning"]["tier"], "mid-range")
        self.assertEqual(account_sig["era_influence"]["primary_era"], "contemporary")

    def test_aggregate_style_signature_uses_thresholds_and_mixed_tier(self):
        signatures = [
            {
                "parsed": {
                    "color_palette": {
                        "dominant_colors": ["black", "white"],
                        "temperature": "neutral",
                        "saturation": "muted",
                        "contrast": "medium",
                        "signature_combos": ["black+white"],
                        "monochromatic_tendency": 0.8,
                    },
                    "material_profile": {
                        "primary_materials": ["denim", "cotton"],
                        "texture_preference": "smooth",
                        "weight_preference": "medium",
                        "transparency_level": "opaque",
                        "hardware_affinity": 0.1,
                    },
                    "silhouette_profile": {
                        "fit_preference": "regular",
                        "proportion_play": "balanced",
                        "structure_level": "semi-structured",
                        "length_preference": {"top": "crop", "bottom": "wide-leg"},
                        "layering_complexity": "minimal",
                    },
                    "pattern_profile": {
                        "pattern_types": ["solid", "stripes"],
                        "pattern_scale": "small",
                        "pattern_frequency": 0.2,
                        "logo_visibility": "none",
                        "print_mixing": False,
                    },
                    "aesthetic_mood": {
                        "energy": "balanced",
                        "formality_range": ["casual", "semi-formal"],
                        "gender_expression": "feminine",
                        "cultural_references": ["old money"],
                        "mood_keywords": ["polished", "clean"],
                    },
                    "occasion_vector": {"everyday": 0.8, "work": 0.4},
                    "price_positioning": {
                        "tier": "budget",
                        "investment_vs_trend": 0.3,
                        "brand_consciousness": 0.1,
                    },
                    "era_influence": {
                        "primary_era": None,
                        "era_authenticity": None,
                        "retro_futurism": 0.2,
                    },
                },
                "error": "",
            },
            {
                "parsed": {
                    "color_palette": {
                        "dominant_colors": ["black", "red"],
                        "temperature": "neutral",
                        "saturation": "muted",
                        "contrast": "medium",
                        "signature_combos": ["black+white"],
                        "monochromatic_tendency": 0.6,
                    },
                    "material_profile": {
                        "primary_materials": ["denim", "leather"],
                        "texture_preference": "smooth",
                        "weight_preference": "medium",
                        "transparency_level": "opaque",
                        "hardware_affinity": 0.3,
                    },
                    "silhouette_profile": {
                        "fit_preference": "regular",
                        "proportion_play": "balanced",
                        "structure_level": "semi-structured",
                        "length_preference": {"top": "crop", "bottom": "straight"},
                        "layering_complexity": "minimal",
                    },
                    "pattern_profile": {
                        "pattern_types": ["solid"],
                        "pattern_scale": "small",
                        "pattern_frequency": 0.4,
                        "logo_visibility": "none",
                        "print_mixing": True,
                    },
                    "aesthetic_mood": {
                        "energy": "balanced",
                        "formality_range": ["casual", "semi-formal"],
                        "gender_expression": "feminine",
                        "cultural_references": ["old money"],
                        "mood_keywords": ["polished", "edgy"],
                    },
                    "occasion_vector": {"everyday": 0.6, "work": 0.2},
                    "price_positioning": {
                        "tier": "luxury",
                        "investment_vs_trend": 0.7,
                        "brand_consciousness": 0.5,
                    },
                    "era_influence": {
                        "primary_era": "y2k",
                        "era_authenticity": "subtle-nod",
                        "retro_futurism": 0.4,
                    },
                },
                "error": "",
            },
            {
                "parsed": {
                    "color_palette": {
                        "dominant_colors": ["black", "blue"],
                        "temperature": "cool",
                        "saturation": "medium",
                        "contrast": "high",
                        "signature_combos": ["black+blue"],
                        "monochromatic_tendency": 0.4,
                    },
                    "material_profile": {
                        "primary_materials": ["denim", "silk"],
                        "texture_preference": "mixed",
                        "weight_preference": "light",
                        "transparency_level": "semi-sheer",
                        "hardware_affinity": 0.5,
                    },
                    "silhouette_profile": {
                        "fit_preference": "oversized",
                        "proportion_play": "top-heavy",
                        "structure_level": "unstructured",
                        "length_preference": {"top": "longline", "dress": "mini"},
                        "layering_complexity": "moderate",
                    },
                    "pattern_profile": {
                        "pattern_types": ["floral"],
                        "pattern_scale": "large",
                        "pattern_frequency": 0.6,
                        "logo_visibility": "prominent",
                        "print_mixing": False,
                    },
                    "aesthetic_mood": {
                        "energy": "dynamic",
                        "formality_range": ["casual", "formal"],
                        "gender_expression": "fluid",
                        "cultural_references": ["festival"],
                        "mood_keywords": ["playful"],
                    },
                    "occasion_vector": {"everyday": 0.3, "work": 0.1},
                    "price_positioning": {
                        "tier": "premium",
                        "investment_vs_trend": 0.5,
                        "brand_consciousness": 0.2,
                    },
                    "era_influence": {
                        "primary_era": None,
                        "era_authenticity": None,
                        "retro_futurism": 0.6,
                    },
                },
                "error": "",
            },
        ]

        account_sig = app.aggregate_style_results([], signatures)["account_style_signature"]

        self.assertEqual(account_sig["color_palette"]["dominant_colors"], ["black"])
        self.assertEqual(account_sig["color_palette"]["temperature"], "neutral")
        self.assertAlmostEqual(account_sig["color_palette"]["monochromatic_tendency"], 0.6)
        self.assertEqual(account_sig["material_profile"]["primary_materials"], ["denim"])
        self.assertAlmostEqual(account_sig["material_profile"]["hardware_affinity"], 0.3)
        self.assertEqual(account_sig["silhouette_profile"]["length_preference"]["top"], "crop")
        self.assertEqual(account_sig["pattern_profile"]["pattern_types"], ["solid"])
        self.assertAlmostEqual(account_sig["pattern_profile"]["pattern_frequency"], 0.4)
        self.assertFalse(account_sig["pattern_profile"]["print_mixing"])
        self.assertEqual(account_sig["price_positioning"]["tier"], "mixed")
        self.assertEqual(account_sig["era_influence"]["primary_era"], "y2k")

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

    def test_refresh_derived_fields_recomputes_account_style_signature(self):
        job = {
            "bloggers": [
                {
                    "video_style_vectors": [{"parsed": {"casual": 0.8}, "error": ""}],
                    "video_style_signatures": [
                        {
                            "parsed": {
                                "color_palette": {"dominant_colors": ["black"]},
                                "occasion_vector": {"everyday": 0.7},
                            },
                            "error": "",
                        }
                    ],
                    "account_style_summary": None,
                }
            ]
        }

        app.refresh_derived_fields(job)

        self.assertEqual(
            job["bloggers"][0]["account_style_summary"]["account_style_signature"]["color_palette"]["dominant_colors"],
            ["black"],
        )

    def test_frequent_values_handles_unhashable_model_values(self):
        values = [["black", "white"], ["black", "white"], {"bad": "shape"}]

        self.assertEqual(app.frequent_values(values, total=3), ['["black", "white"]'])


if __name__ == "__main__":
    unittest.main()
