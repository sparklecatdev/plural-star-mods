from io import BytesIO
import json
import unittest
from unittest import mock

from PIL import Image, PngImagePlugin

from photos import PhotoPublisher, UPLOAD_URL


class PhotoTests(unittest.TestCase):
    def setUp(self):
        encoded = BytesIO()
        info = PngImagePlugin.PngInfo()
        info.add_text('Private', 'private original metadata')
        Image.new('RGB', (600, 300), 'blue').save(encoded, format='PNG', pnginfo=info)
        self.photo = encoded.getvalue()
        self.url = 'https://n.uguu.se/abcdefgh.png'

    def response(self, opener, value):
        opener.return_value.open.return_value.__enter__.return_value.read.return_value = json.dumps({'success': True, 'files': [{'url': value}]}).encode()

    @mock.patch('photos.urllib.request.build_opener')
    @mock.patch('photos.time.monotonic')
    def test_upload_strips_metadata_and_caches_until_renewal(self, clock, opener):
        clock.return_value = 100
        self.response(opener, self.url)
        publisher = PhotoPublisher()
        self.assertEqual(publisher.publish(self.photo), self.url)
        request = opener.return_value.open.call_args.args[0]
        self.assertEqual(request.full_url, UPLOAD_URL)
        self.assertEqual(request.get_method(), 'POST')
        self.assertEqual(set(request.headers), {'Content-type', 'User-agent'})
        self.assertIn(b'name="files[]"; filename="avatar.png"', request.data)
        self.assertNotIn(b'private original metadata', request.data)
        raw = request.data.split(b'Content-Type: image/png\r\n\r\n')[1].rsplit(b'\r\n--', 1)[0]
        with Image.open(BytesIO(raw)) as photo:
            self.assertEqual(photo.size, (512, 256))
            self.assertEqual(set(photo.info), {'Upload'})
            self.assertRegex(photo.info['Upload'], r'^[a-f0-9]{32}$')
        publisher.publish(self.photo)
        opener.return_value.open.assert_called_once()
        clock.return_value += 150 * 60
        publisher.publish(self.photo)
        self.assertEqual(opener.return_value.open.call_count, 2)
        renewed = opener.return_value.open.call_args.args[0].data.split(b'Content-Type: image/png\r\n\r\n')[1].rsplit(b'\r\n--', 1)[0]
        self.assertNotEqual(raw, renewed)

    def test_only_uploads_first_photo_after_local_consent_and_image_selection(self):
        publisher = PhotoPublisher()
        members = [{'name': 'Alex', 'avatar': 'cloud:photo', 'photo': self.photo},
                   {'name': 'Sam', 'avatar': 'cloud:other', 'photo': b'other'}]
        with mock.patch.object(publisher, 'publish', return_value=self.url) as publish:
            self.assertIs(publisher.for_activity(members, {'large_image': '{avatar}'}, False), members)
            self.assertIs(publisher.for_activity(members, {}, True), members)
            self.assertEqual(publisher.for_activity([], {'large_image': '{avatar}'}, True), [])
            public = [{**members[0], 'avatar': 'https://example.com/photo.png'}]
            self.assertIs(publisher.for_activity(public, {'large_image': '{avatar}'}, True), public)
            publish.assert_not_called()
            result = publisher.for_activity(members, {'small_image': '{avatar}'}, True)
            publish.assert_called_once_with(self.photo)
            self.assertEqual(result[0]['avatar'], self.url)
            self.assertEqual(members[0]['avatar'], 'cloud:photo')
            self.assertEqual(result[1], members[1])

    @mock.patch('photos.urllib.request.build_opener')
    @mock.patch('photos.time.monotonic', return_value=100)
    def test_invalid_response_backs_off_and_recovers(self, clock, opener):
        self.response(opener, 'https://other.example/photo.png')
        publisher = PhotoPublisher()
        with self.assertRaises(ValueError):
            publisher.publish(self.photo)
        with self.assertRaises(ValueError):
            publisher.publish(self.photo)
        opener.return_value.open.assert_called_once()
        clock.return_value += 300
        self.response(opener, self.url)
        self.assertEqual(publisher.publish(self.photo), self.url)

    @mock.patch('photos.urllib.request.build_opener')
    def test_invalid_photo_never_uploads(self, opener):
        with self.assertRaises(ValueError):
            PhotoPublisher().publish(b'not an image')
        opener.assert_not_called()


if __name__ == '__main__':
    unittest.main()
