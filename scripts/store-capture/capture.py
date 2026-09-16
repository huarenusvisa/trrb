"""Capture native release UI on installed Apple simulators, without mock data."""
import json
import os
from pathlib import Path
import subprocess

def run(*args):
    return subprocess.check_output(args, text=True).strip()

family = os.environ['DEVICE_FAMILY']
devices = json.loads(run('xcrun', 'simctl', 'list', 'devices', 'available', '--json'))['devices']
candidates = [(runtime, device) for runtime, values in devices.items() if 'iOS' in runtime for device in values
              if ('iPhone' in device['name'] if family == 'iphone' else 'iPad Pro 13' in device['name'])]
if not candidates:
    raise RuntimeError('Required screenshot simulator is not installed')
candidates.sort(key=lambda pair: (tuple(int(n) for n in pair[0].split('iOS-')[-1].split('-')), 'Pro Max' in pair[1]['name'], pair[1]['name']), reverse=True)
runtime, device = candidates[0]
udid = device['udid']
if device['state'] != 'Booted':
    run('xcrun', 'simctl', 'boot', udid)
run('xcrun', 'simctl', 'bootstatus', udid, '-b')
run('xcrun', 'simctl', 'status_bar', udid, 'override', '--time', '9:41', '--dataNetwork', 'wifi', '--wifiMode', 'active', '--wifiBars', '3', '--batteryState', 'charged', '--batteryLevel', '100')
app = next(Path('/tmp/store-app/unpacked').rglob('*.app'))
run('xcrun', 'simctl', 'install', udid, str(app))
Path('captures/device.json').write_text(json.dumps({'device':device['name'],'runtime':runtime,'commit':os.environ['GITHUB_SHA']}, indent=2))
maestro = str(Path.home() / '.maestro/bin/maestro')
subprocess.run([maestro, '--device', udid, 'test', '-e', f'CAPTURE_DIR={Path.cwd() / "captures"}', '--debug-output', 'captures/debug', 'scripts/store-capture/screens.yml'], check=True)
