import unittest
from release_check import inspect_release


class ReleaseCheckTests(unittest.TestCase):
    def release(self, tag="v1.0.1"):
        return {"tag_name": tag, "draft": False, "prerelease": False, "assets": [{
            "name": f"KPlayer-{tag}-R36S.zip",
            "browser_download_url": f"https://github.com/kaiaum01/KPLAYER-v1.0.0/releases/download/{tag}/KPlayer-{tag}-R36S.zip"
        }]}

    def test_newer(self):
        self.assertTrue(inspect_release(self.release())["newer"])

    def test_equal(self):
        self.assertFalse(inspect_release(self.release("v1.0.0"))["newer"])

    def test_invalid_release(self):
        data = self.release()
        data["prerelease"] = True
        with self.assertRaises(ValueError): inspect_release(data)

    def test_wrong_asset(self):
        data = self.release()
        data["assets"][0]["name"] = "android.apk"
        with self.assertRaises(ValueError): inspect_release(data)

    def test_wrong_url(self):
        data = self.release()
        data["assets"][0]["browser_download_url"] = "https://example.com/app.zip"
        with self.assertRaises(ValueError): inspect_release(data)


if __name__ == "__main__":
    unittest.main()
