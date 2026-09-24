import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('configure_auth', Path(__file__).parents[1] / 'deploy/configure-auth.py')
setup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(setup)


class ConfigureAuthTests(unittest.TestCase):
    def test_provider_update_preserves_signing_secret_and_origin(self):
        original = '# private\nBETTER_AUTH_SECRET=unchanged\nBETTER_AUTH_URL=https://refract.example\nRESEND_API_KEY=old\nRESEND_API_KEY=duplicate\n'
        updated = setup.updated_config(original, {'RESEND_API_KEY': 're_new', 'RESEND_FROM_EMAIL': 'Refract <hello@example.com>'})
        self.assertIn('BETTER_AUTH_SECRET=unchanged\n', updated)
        self.assertIn('BETTER_AUTH_URL=https://refract.example\n', updated)
        self.assertEqual(updated.count('RESEND_API_KEY='), 1)
        self.assertIn('RESEND_FROM_EMAIL="Refract <hello@example.com>"', updated)

    def test_github_preserves_other_providers(self):
        original = 'BETTER_AUTH_SECRET=keep\nGOOGLE_CLIENT_ID=google\nRESEND_API_KEY=re_keep\n'
        updated = setup.updated_config(original, {'GITHUB_CLIENT_ID': 'Ov23liExample', 'GITHUB_CLIENT_SECRET': 'example-secret'})
        self.assertTrue(updated.startswith(original))
        self.assertIn('GITHUB_CLIENT_ID="Ov23liExample"', updated)
        self.assertIn('GITHUB_CLIENT_SECRET="example-secret"', updated)

    def test_injection_and_unrelated_changes_are_rejected(self):
        for updates in [{'BETTER_AUTH_SECRET': 'replace'}, {'RESEND_API_KEY': 'key\nNODE_ENV=development'}, {'RESEND_API_KEY': ''}, {'RESEND_FROM_EMAIL': '"quoted"'}]:
            with self.assertRaises(ValueError):
                setup.updated_config('', updates)

    def test_domain_gate_rejects_public_ips_and_non_https(self):
        for origin in ['https://18.188.82.113', 'https://[2001:db8::1]', 'http://example.com', 'https://localhost', '']:
            self.assertFalse(setup.domain_ready(origin))
        self.assertTrue(setup.domain_ready('https://register.example.com'))

    def test_atomic_save_is_private_and_readable_by_node(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'auth.env'
            content = setup.updated_config('BETTER_AUTH_SECRET=keep\n', {'RESEND_API_KEY': 're_example', 'RESEND_FROM_EMAIL': 'Refract <hello@example.com>'})
            setup.atomic_write(path, content)
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            self.assertEqual(setup.read_config(path)['RESEND_FROM_EMAIL'], 'Refract <hello@example.com>')
            self.assertEqual(len(list(Path(directory).iterdir())), 1)


if __name__ == '__main__':
    unittest.main()
