import importlib.util
import pathlib
import unittest

MODULE_PATH = pathlib.Path(__file__).resolve().parents[1] / "ports" / "kplayer" / "news_fetch.py"
SPEC = importlib.util.spec_from_file_location("news_fetch", MODULE_PATH)
assert SPEC and SPEC.loader
news_fetch = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(news_fetch)


class NewsFetchTests(unittest.TestCase):
    def test_parse_newsdata_strips_paid_plan_and_preserves_media(self):
        payload = {
            "status": "success",
            "results": [
                {
                    "title": "Final do campeonato agita domingo",
                    "description": "Resumo esportivo completo para o torcedor.",
                    "content": "ONLY AVAILABLE IN PAID PLANS",
                    "source_name": "Portal Esporte",
                    "pubDate": "2026-11-23 14:25:00",
                    "category": ["sports"],
                    "image_url": "https://cdn.example.com/foto.jpg",
                    "video_url": "https://cdn.example.com/gols.mp4",
                },
                {
                    "title": "Final do campeonato agita domingo",
                    "description": "Duplicata deve ser ignorada.",
                    "category": ["sports"],
                },
                {
                    "title": "Cúpula internacional debate clima",
                    "description": "Líderes se reúnem em encontro global.",
                    "content": "Texto completo disponível da matéria internacional.",
                    "source_id": "mundo_br",
                    "pubDate": "2026-11-23 09:05:00",
                    "category": ["world"],
                    "image_url": "http://127.0.0.1/blocked.jpg",
                    "video_url": "javascript:alert(1)",
                },
            ],
        }
        rows = news_fetch.parse_newsdata_payload(payload, "all")
        self.assertEqual(len(rows), 2)
        cat, label, title, source, pub, summary, body, img_url, vid_url = rows[0]
        self.assertEqual(cat, "sports")
        self.assertEqual(label, "Esportes")
        self.assertEqual(source, "Portal Esporte")
        self.assertEqual(pub, "23/11 14:25")
        self.assertEqual(summary, "Resumo esportivo completo para o torcedor.")
        self.assertEqual(body, "Resumo esportivo completo para o torcedor.")
        self.assertEqual(img_url, "https://cdn.example.com/foto.jpg")
        self.assertEqual(vid_url, "https://cdn.example.com/gols.mp4")
        self.assertNotIn("PAID PLANS", body)

        # Unsafe loopback / javascript URLs must be stripped
        self.assertEqual(rows[1][0], "world")
        self.assertEqual(rows[1][7], "")
        self.assertEqual(rows[1][8], "")

    def test_parse_rss_xml_extracts_images_and_videos_and_sanitizes_html(self):
        xml = """<?xml version="1.0" encoding="UTF-8"?>
        <rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">
          <channel>
            <item>
              <title>Chuva forte\tatinge capital</title>
              <description><![CDATA[<img src="https://s2-g1.glbimg.com/capa.jpg" /><p>Defesa Civil emite <b>alerta</b>.</p>]]></description>
              <media:content medium="video" url="https://cdn.example.com/boletim.mp4" />
              <pubDate>Mon, 23 Nov 2026 08:30:00 -0300</pubDate>
            </item>
          </channel>
        </rss>"""
        rows = news_fetch.parse_rss_xml(xml, "breaking")
        self.assertEqual(len(rows), 1)
        cat, label, title, source, pub, summary, body, img_url, vid_url = rows[0]
        self.assertEqual(cat, "breaking")
        self.assertEqual(label, "Urgente")
        self.assertEqual(title, "Chuva forte atinge capital")
        self.assertEqual(source, "G1 Brasil")
        self.assertEqual(pub, "23/11 08:30")
        self.assertEqual(summary, "Defesa Civil emite alerta .")
        self.assertEqual(img_url, "https://s2-g1.glbimg.com/capa.jpg")
        self.assertEqual(vid_url, "https://cdn.example.com/boletim.mp4")
        self.assertEqual(len(news_fetch.rows_to_tsv(rows).strip().split("\t")), 9)

    def test_safe_url_and_image_magic_detection(self):
        self.assertTrue(news_fetch.is_safe_http_url("https://s2-g1.glbimg.com/foto.jpg"))
        self.assertFalse(news_fetch.is_safe_http_url("http://127.0.0.1/internal.jpg"))
        self.assertFalse(news_fetch.is_safe_http_url("http://169.254.169.254/latest/meta-data"))
        self.assertFalse(news_fetch.is_safe_http_url("file:///etc/passwd"))
        self.assertFalse(news_fetch.is_safe_http_url("javascript:alert(1)"))

        self.assertEqual(news_fetch.detect_image_ext(b"\xff\xd8\xff\xe0" + b"0" * 16), ".jpg")
        self.assertEqual(news_fetch.detect_image_ext(b"\x89PNG\r\n\x1a\n" + b"0" * 16), ".png")
        self.assertEqual(news_fetch.detect_image_ext(b"<html>not an image</html>"), "")

    def test_format_date_br_handles_iso_and_rfc2822(self):
        self.assertEqual(news_fetch.format_date_br("2026-11-23 06:52:00"), "23/11 06:52")
        self.assertEqual(news_fetch.format_date_br("Mon, 23 Nov 2026 19:40:00 GMT"), "23/11 19:40")
        self.assertEqual(news_fetch.format_date_br(""), "")


if __name__ == "__main__":
    unittest.main()
