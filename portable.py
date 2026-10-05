"""Indoor Channel portátil: tudo vive numa pasta temporária que é apagada ao fechar a janela."""
import os, sys, shlex, shutil, socket, subprocess, tempfile, threading, time, traceback
from pathlib import Path

TMP = Path(os.environ.get('INDOOR_TMP') or tempfile.mkdtemp(prefix='IndoorChannel-'))
os.environ['INDOOR_TMP'] = str(TMP)
os.environ['INDOOR_DATA'] = str(TMP / 'dados')
os.environ['INDOOR_PORTABLE'] = '1'
os.environ['PYTHONDONTWRITEBYTECODE'] = '1'
sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))


def alert(text):
    try:
        import ctypes
        ctypes.windll.user32.MessageBoxW(None, text, 'Indoor Channel', 0x10)
    except Exception:
        print(text, file=sys.stderr)


def free_port():
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0))
        return s.getsockname()[1]


def find_browser():
    if os.environ.get('INDOOR_BROWSER_EXE'):  # usado nos testes
        return os.environ['INDOOR_BROWSER_EXE']
    roots = [os.environ.get(k) for k in ('PROGRAMFILES', 'PROGRAMFILES(X86)', 'LOCALAPPDATA')]
    rel = ['Microsoft/Edge/Application/msedge.exe', 'Google/Chrome/Application/chrome.exe']
    for r in rel:
        for root in filter(None, roots):
            p = Path(root) / r
            if p.exists():
                return str(p)
    return None


def browser_command(url):
    custom = os.environ.get('INDOOR_BROWSER_CMD')  # usado nos testes
    if custom:
        return [a.replace('{url}', url) for a in shlex.split(custom, posix=False)]
    exe = find_browser()
    if not exe:
        raise RuntimeError('Não encontrei o Microsoft Edge nem o Google Chrome neste computador.')
    return [exe, f'--app={url}', f'--user-data-dir={TMP / "perfil"}', '--window-size=1440,900',
            '--no-first-run', '--no-default-browser-check', '--disable-sync', '--disable-extensions',
            '--disable-background-networking', '--disable-background-mode', '--disable-breaking-news-feed', '--disable-features=Translate,msEdgeSidebarV2,msEdgeShopping']


def profile_in_use():
    """O Chromium mantém perfil/lockfile aberto enquanto qualquer janela estiver aberta."""
    lock = TMP / 'perfil' / 'lockfile'
    if not lock.exists():
        return False
    try:
        with open(lock, 'ab'):
            return False
    except OSError:
        return True


def wait_for_window_close(proc):
    # O Edge/Chrome pode repassar a janela a outro processo e encerrar o primeiro logo de cara.
    deadline = time.monotonic() + 30
    while not profile_in_use():
        if time.monotonic() >= deadline:
            raise RuntimeError('O navegador não abriu o perfil temporário. Tente abrir novamente.')
        time.sleep(0.25)
    while profile_in_use():
        time.sleep(1)


def wipe(path):
    for _ in range(20):
        shutil.rmtree(path, ignore_errors=True)
        if not Path(path).exists():
            return
        time.sleep(0.5)


def main():
    import server
    from waitress import create_server
    server.init()
    port = free_port()
    httpd = create_server(server.app, host='127.0.0.1', port=port, threads=6,
                          max_request_body_size=server.MAX_UPLOAD, channel_timeout=300)
    threading.Thread(target=httpd.run, daemon=True).start()
    url = f'http://127.0.0.1:{port}/'
    (TMP / 'ready').write_text(url)
    proc = subprocess.Popen(browser_command(url))
    if os.environ.get('INDOOR_BROWSER_CMD'):
        proc.wait()
    else:
        wait_for_window_close(proc)
    httpd.close()
    wipe(TMP / 'perfil')
    wipe(TMP / 'dados')


if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        (TMP / 'erro.txt').write_text(traceback.format_exc(), encoding='utf-8')
        alert(f'Não foi possível iniciar o Indoor Channel.\n\n{e}')
        sys.exit(1)
