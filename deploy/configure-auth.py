#!/usr/bin/env python3
"""Configure provider credentials privately on the existing AWS host."""
import argparse
import getpass
import ipaddress
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import time
from urllib.parse import urlsplit
from urllib.request import urlopen

CONFIG = Path('/etc/refract/refract.env')
PROVIDER_KEYS = {'RESEND_API_KEY', 'RESEND_FROM_EMAIL', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'}


def read_config(path):
    # Node parses the same env file that the application uses. Capture privately;
    # credentials never become command arguments, console output or shell code.
    result = subprocess.run([
        'node', '--input-type=module', '-e',
        "import {readFileSync} from 'node:fs'; import {parseEnv} from 'node:util';"
        "process.stdout.write(JSON.stringify(parseEnv(readFileSync(process.argv[1],'utf8'))));",
        str(path),
    ], capture_output=True, text=True, check=True)
    return json.loads(result.stdout)


def domain_ready(origin):
    hostname = urlsplit(origin).hostname
    if not hostname or urlsplit(origin).scheme != 'https':
        return False
    try:
        ipaddress.ip_address(hostname)
        return False
    except ValueError:
        return '.' in hostname and hostname != 'localhost'


def updated_config(original, updates):
    if not updates or not set(updates).issubset(PROVIDER_KEYS):
        raise ValueError('Only provider credentials can be changed by this helper.')
    for value in updates.values():
        if not value or any(char in value for char in "\n\r\0\\\"'"):
            raise ValueError('Use a nonempty value without quotes, backslashes or line breaks.')
    remaining = dict(updates)
    output = []
    for line in original.splitlines():
        match = re.match(r'^\s*([A-Z_]+)\s*=', line)
        key = match.group(1) if match else None
        if key in updates:
            if key in remaining:
                output.append(f'{key}="{remaining.pop(key)}"')
        else:
            output.append(line)
    output.extend(f'{key}="{value}"' for key, value in remaining.items())
    return '\n'.join(output) + '\n'


def atomic_write(path, content):
    descriptor, temporary = tempfile.mkstemp(prefix='.refract-config-', dir=path.parent)
    try:
        with os.fdopen(descriptor, 'w') as stream:
            os.fchmod(stream.fileno(), 0o600)
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def restart():
    subprocess.run(['systemctl', 'restart', 'refract'], check=True, capture_output=True)


def healthy(expected):
    for _ in range(15):
        try:
            with urlopen('http://127.0.0.1:3001/api/registration/config', timeout=1) as response:
                if json.load(response) == expected:
                    return True
        except (OSError, ValueError):
            pass
        time.sleep(0.4)
    return False


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['status', 'resend', 'google'], nargs='?', default='status')
    args = parser.parse_args()
    if os.geteuid() != 0:
        raise ValueError('Run this helper with sudo on the AWS server.')
    if CONFIG.is_symlink() or not CONFIG.is_file():
        raise ValueError('The private configuration is missing or is a symlink. Deploy the service first.')
    config = read_config(CONFIG)
    domain = domain_ready(config.get('BETTER_AUTH_URL', ''))
    print('Website:', config.get('BETTER_AUTH_URL', '(not configured)'))
    print('Resend credentials:', 'present' if config.get('RESEND_API_KEY') and config.get('RESEND_FROM_EMAIL') else 'missing')
    print('Google credentials:', 'present' if config.get('GOOGLE_CLIENT_ID') and config.get('GOOGLE_CLIENT_SECRET') else 'missing')
    print('Domain for Google:', 'configured' if domain else 'a public HTTPS domain is still needed')
    if args.action == 'status':
        return
    if not sys.stdin.isatty():
        raise ValueError('Use an interactive SSH terminal. Do not put keys in command arguments.')
    if args.action == 'google' and not domain:
        raise ValueError('Connect your domain and HTTPS certificate before adding Google credentials.')
    if args.action == 'resend':
        print('Use a sending key and an address on a domain you have verified in Resend.')
        key = getpass.getpass('Resend API key (hidden): ').strip()
        sender = input('Verified sender email address: ').strip()
        if not re.fullmatch(r're_[A-Za-z0-9_-]+', key):
            raise ValueError('The Resend key format is invalid. Nothing was changed.')
        if not re.fullmatch(r'[A-Za-z0-9.!#$%&*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', sender) or len(sender) > 254:
            raise ValueError('Enter a plain sender email address. Nothing was changed.')
        updates = {'RESEND_API_KEY': key, 'RESEND_FROM_EMAIL': f'Refract <{sender}>'}
    else:
        print('Google callback:', config['BETTER_AUTH_URL'] + '/api/auth/callback/google')
        client = input('Google Web application client ID: ').strip()
        secret = getpass.getpass('Google client secret (hidden): ').strip()
        if not re.fullmatch(r'[A-Za-z0-9_-]+\.apps\.googleusercontent\.com', client) or not re.fullmatch(r'[A-Za-z0-9_.-]+', secret):
            raise ValueError('The Google credential format is invalid. Nothing was changed.')
        updates = {'GOOGLE_CLIENT_ID': client, 'GOOGLE_CLIENT_SECRET': secret}
    original = CONFIG.read_text()
    replacement = updated_config(original, updates)
    combined = {**config, **updates}
    expected = {
        'emailEnabled': bool(combined.get('RESEND_API_KEY') and combined.get('RESEND_FROM_EMAIL')),
        'googleEnabled': bool(domain and combined.get('GOOGLE_CLIENT_ID') and combined.get('GOOGLE_CLIENT_SECRET')),
    }
    try:
        atomic_write(CONFIG, replacement)
        restart()
        if not healthy(expected):
            raise RuntimeError('The application did not become healthy.')
    except BaseException:
        atomic_write(CONFIG, original)
        restart()
        raise RuntimeError('Setup failed. The previous private configuration was restored.') from None
    print('Private configuration saved; the service is healthy.')
    print('Provider credentials still need an actual sign-in test. No email was sent by this helper.')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, RuntimeError, subprocess.SubprocessError):
        # Never print exception values: subprocess output or provider input may
        # contain secrets. This message also keeps automated logs safe.
        print('Setup could not complete. Check the domain, input format, file permissions and service status. Existing credentials are kept unless setup succeeds.', file=sys.stderr)
        sys.exit(1)
    except (KeyboardInterrupt, EOFError):
        print('\nSetup cancelled.', file=sys.stderr)
        sys.exit(1)
