import importlib.util
import pathlib
import unittest

MODULE_PATH = pathlib.Path(__file__).resolve().parents[1] / "ports" / "kplayer" / "news_fetch.py"
SPEC = importlib.util.spec_from_file_location("news_fetch", MODULE_PATH)
assert SPEC and SPEC.loader
news_fetch = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(news_fetch)


class NewsFetchTests(unittest.TestCase):
    def test_parse_newsdata_strips_paid_plan_placeholder(self):
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
                },
            ],
        }
        rows = news_fetch.parse_newsdata_payload(payload, "all")
        self.assertEqual(len(rows), 2)
        cat, label, title, source, pub, summary, body = rows[0]
        self.assertEqual(cat, "sports")
        self.assertEqual(label, "Esportes")
        self.assertEqual(source, "Portal Esporte")
        self.assertEqual(pub, "23/11 14:25")
        self.assertEqual(summary, "Resumo esportivo completo para o torcedor.")
        self.assertEqual(body, "Resumo esportivo completo para o torcedor.")
        self.assertNotIn("PAID PLANS", body)

        self.assertEqual(rows[1][0], "world")
        self.assertEqual(rows[1][1], "Mundo")
        self.assertEqual(rows[1][6], "Texto completo disponível da matéria internacional.")

    def test_parse_rss_xml_sanitizes_html_and_tabs(self):
        xml = """<?xml version="1.0" encoding="UTF-8"?>
        <rss version="2.0">
          <channel>
            <item>
              <title>Chuva forte\tatinge capital</title>
              <description>&lt;p&gt;Defesa Civil emite &lt;b&gt;alerta&lt;/b&gt;.&lt;/p&gt;</description>
              <pubDate>Mon, 23 Nov 2026 08:30:00 -0300</pubDate>
            </item>
          </channel>
        </rss>"""
        rows = news_fetch.parse_rss_xml(xml, "breaking")
        self.assertEqual(len(rows), 1)
        cat, label, title, source, pub, summary, body = rows[0]
        self.assertEqual(cat, "breaking")
        self.assertEqual(label, "Urgente")
        self.assertEqual(title, "Chuva forte atinge capital")
        self.assertEqual(source, "G1 Brasil")
        self.assertEqual(pub, "23/11 08:30")
        self.assertEqual(summary, "Defesa Civil emite alerta .")
        self.assertNotIn("\t", news_fetch.rows_to_tsv(rows).split("\t")[2])

    def test_format_date_br_handles_iso_and_rfc2822(self):
        self.assertEqual(news_fetch.format_date_br("2026-11-23 06:52:00"), "23/11 06:52")
        self.assertEqual(news_fetch.format_date_br("Mon, 23 Nov 2026 19:40:00 GMT"), "23/11 19:40")
        self.assertEqual(news_fetch.format_date_br(""), "")


if __name__ == "__main__":
    unittest.main()
