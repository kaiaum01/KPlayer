import unittest
from kplayer_pc import MAX_BYTES, parse_m3u


class PlaylistTests(unittest.TestCase):
    def test_http_and_reject_local(self):
        data = b'#EXTM3U\n#EXTINF:-1 tvg-id="x",TV Teste\nhttps://example.org/live.m3u8\n#EXTINF:-1,Ignored\nfile:///test\nhttp://example.org/stream\n'
        self.assertEqual(parse_m3u(data), [("TV Teste", "https://example.org/live.m3u8"), ("Canal 2", "http://example.org/stream")])

    def test_bom_and_unicode(self):
        self.assertEqual(parse_m3u('\ufeff#EXTM3U\n#EXTINF:-1,Rádio\nhttps://example.org/x\n'.encode()), [("Rádio", "https://example.org/x")])

    def test_size_limit(self):
        with self.assertRaises(ValueError): parse_m3u(b'x' * (MAX_BYTES + 1))

    def test_invalid_url_does_not_abort_catalog(self):
        self.assertEqual(parse_m3u(b'#EXTM3U\nhttp://[bad\nhttps://example.org/live\n'), [("Canal 1", "https://example.org/live")])


if __name__ == '__main__': unittest.main()
