import subprocess
import sys
import tempfile
from pathlib import Path

def run_worker(name, raw=b'', timeout=90):
    root = Path(__file__).resolve().parent
    flags = getattr(subprocess, 'CREATE_NO_WINDOW', 0)
    if not getattr(sys, 'frozen', False):
        return subprocess.run([sys.executable, str(root/'modules'/f'{name}.py')], input=raw, capture_output=True, timeout=timeout, creationflags=flags)
    with tempfile.TemporaryDirectory(prefix='indoor-worker-') as folder:
        base = Path(folder)
        (base/'in').write_bytes(raw)
        result = subprocess.run([sys.executable, '--worker', name, folder], timeout=timeout, creationflags=flags)
        return subprocess.CompletedProcess(result.args, result.returncode, (base/'out').read_bytes(), (base/'err').read_bytes())
