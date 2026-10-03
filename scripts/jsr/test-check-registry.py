"""Offline release-guard tests: no network, browser access or publication."""
import contextlib
import io
import json
import pathlib
import runpy
import subprocess
import unittest
from unittest.mock import patch

SCRIPT = pathlib.Path(__file__).with_name('check-registry.py')
URL = 'https://jsr.io/@zodiacs/engine/meta.json'
METADATA = {
    'scope': 'zodiacs', 'name': 'engine',
    'githubRepository': {'owner': 'zodiacs-org', 'name': 'engine'},
    'versions': {},
}


class RegistryGuardTests(unittest.TestCase):
    def run_guard(self, metadata=METADATA, *, status='200', code=0, raw=None, error=None):
        response = subprocess.CompletedProcess([], code,
            (json.dumps(metadata) if raw is None else raw) + '\n' + status, '')
        output = io.StringIO()
        with patch('subprocess.run', return_value=response, side_effect=error) as request:
            with contextlib.redirect_stdout(output):
                runpy.run_path(str(SCRIPT), run_name='__main__')
        request.assert_called_once_with([
            'curl', '--disable', '--proto', '=https', '--silent', '--show-error',
            '--fail', '--max-time', '30', '--write-out', '\n%{http_code}', URL
        ], capture_output=True, text=True, timeout=35, check=False)
        return output.getvalue()

    def test_absent_version_passes(self):
        self.assertIn('rc.16 absent', self.run_guard())

    def test_other_versions_do_not_prevent_rc16(self):
        self.assertIn('rc.16 absent', self.run_guard({**METADATA, 'versions': {'0.1.1-rc.15': {}}}))

    def test_existing_version_is_refused_even_when_yanked(self):
        for value in ({}, {'yanked': True}):
            with self.subTest(value=value), self.assertRaisesRegex(SystemExit, 'version exists'):
                self.run_guard({**METADATA, 'versions': {'0.1.1-rc.16': value}})

    def test_unknown_versions_are_refused(self):
        for value in (None, [], 'unknown', 0):
            with self.subTest(value=value), self.assertRaises(SystemExit):
                self.run_guard({**METADATA, 'versions': value})
        with self.assertRaises(SystemExit):
            self.run_guard({key: value for key, value in METADATA.items() if key != 'versions'})

    def test_wrong_package_is_refused(self):
        for key, value in (('scope', 'other'), ('name', 'other')):
            with self.subTest(key=key), self.assertRaisesRegex(SystemExit, 'wrong registry package'):
                self.run_guard({**METADATA, key: value})

    def test_wrong_or_missing_repository_is_refused(self):
        for value in (None, {}, {'owner': 'other', 'name': 'engine'}, {'owner': 'zodiacs-org', 'name': 'other'}):
            with self.subTest(value=value), self.assertRaisesRegex(SystemExit, 'repository link'):
                self.run_guard({**METADATA, 'githubRepository': value})

    def test_non_200_responses_and_redirects_are_refused(self):
        for status in ('201', '204', '301', '302', '403', '404', '429', '500', ''):
            with self.subTest(status=status), self.assertRaisesRegex(SystemExit, 'unexpected registry response'):
                self.run_guard(status=status)

    def test_curl_failures_are_refused(self):
        for code in (6, 22, 28, 60):
            with self.subTest(code=code), self.assertRaisesRegex(SystemExit, 'curl exit'):
                self.run_guard(code=code, status='403')

    def test_missing_client_and_timeout_are_refused(self):
        for error in (FileNotFoundError('curl'), subprocess.TimeoutExpired('curl', 35)):
            with self.subTest(error=type(error).__name__), self.assertRaisesRegex(SystemExit, 'state is unknown'):
                self.run_guard(error=error)

    def test_malformed_json_and_challenge_html_are_refused(self):
        for raw in ('', '{', '<html>Challenge required</html>'):
            with self.subTest(raw=raw), self.assertRaisesRegex(SystemExit, 'unexpected registry response'):
                self.run_guard(raw=raw)

    def test_non_object_metadata_is_refused(self):
        for metadata in (None, [], 'unexpected', 0):
            with self.subTest(metadata=metadata), self.assertRaisesRegex(SystemExit, 'unexpected registry metadata'):
                self.run_guard(metadata)


if __name__ == '__main__':
    unittest.main(verbosity=2)
