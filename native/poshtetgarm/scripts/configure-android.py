"""Generate Flutter defines from the same public config used by Android startup."""
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
config = json.loads((root / 'android/app/google-services.json').read_text())
package = 'ir.poshtetgarm.poshtetgarm_hybrid'
client = next(c for c in config['client'] if c['client_info']['android_client_info']['package_name'] == package)
project = config['project_info']
assert project['project_id'] == 'poshtetgarm', 'Unexpected Firebase project'
options = {
    'apiKey': client['api_key'][0]['current_key'],
    'appId': client['client_info']['mobilesdk_app_id'],
    'messagingSenderId': project['project_number'],
    'projectId': project['project_id'],
}
(root / 'firebase.android.json').write_text(json.dumps({'FIREBASE_OPTIONS': json.dumps(options)}, indent=2) + '\n')
print('Android Firebase configuration ready (public app settings only).')
