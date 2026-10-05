"""Portable Windows launcher; user data lives beside the executable."""
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent

def worker():
    import runpy
    name, folder = sys.argv[2:4]
    if name not in ('logo_decode', 'native_folder'): return 2
    base = Path(folder)
    with (base/'in').open('r', encoding='utf-8') as source, (base/'out').open('w', encoding='utf-8') as target, (base/'err').open('w', encoding='utf-8') as error:
        sys.stdin, sys.stdout, sys.stderr = source, target, error
        runpy.run_path(str(ROOT/'modules'/f'{name}.py'), run_name='__main__')
    return 0

def main():
    # This is a desktop editor: retain renderer priority when another window covers it.
    flags = os.environ.get('QTWEBENGINE_CHROMIUM_FLAGS', '')
    os.environ['QTWEBENGINE_CHROMIUM_FLAGS'] = flags + ' --disable-renderer-backgrounding --disable-background-timer-throttling --disable-backgrounding-occluded-windows'
    import threading
    import json
    from PySide6.QtCore import QUrl, QTimer, Qt
    from PySide6.QtGui import QIcon
    from PySide6.QtWidgets import QApplication, QMainWindow, QMessageBox
    from PySide6.QtWebEngineWidgets import QWebEngineView
    from PySide6.QtWebEngineCore import QWebEnginePage
    from waitress import create_server
    portable = Path(sys.executable).parent if getattr(sys, 'frozen', False) else ROOT
    os.environ.setdefault('INDOOR_DATA', str(portable/'dados'))
    qt = QApplication([sys.argv[0]])
    qt.setApplicationName('Assistente de Edições')
    qt.setWindowIcon(QIcon(str(ROOT/'static'/'indoor.ico')))
    port = int(os.environ.get('INDOOR_PORT', '8080'))
    service = None
    try:
        from server import app, init, MAX_UPLOAD
        init()
        service = create_server(app, host=os.environ.get('INDOOR_HOST','0.0.0.0'), port=port, threads=6, max_request_body_size=MAX_UPLOAD, channel_timeout=300)
        threading.Thread(target=service.run, daemon=True).start()
    except Exception as exc:
        QMessageBox.critical(None, 'Não foi possível iniciar', f'Encerre a versão anterior e confira se esta pasta permite salvar arquivos.\n\n{exc}')
        return
    class Editor(QMainWindow):
        def closeEvent(self, event):
            if os.environ.get('INDOOR_DESKTOP_TEST'):
                event.accept(); return
            answer = QMessageBox.question(self, 'Encerrar o sistema?', 'Encerrar também fecha o acesso dos colegas pela rede. Deseja encerrar?', QMessageBox.Yes | QMessageBox.No, QMessageBox.No)
            event.accept() if answer == QMessageBox.Yes else event.ignore()
    window = Editor()
    window.setWindowTitle('Assistente de Edições')
    window.resize(1440, 960)
    window.setMinimumSize(720, 600)
    view = QWebEngineView(window)
    window.setCentralWidget(view)
    def resume(state):
        if state == Qt.ApplicationState.ApplicationActive:
            view.page().setLifecycleState(QWebEnginePage.LifecycleState.Active)
            view.update()
    qt.applicationStateChanged.connect(resume)

    def loaded(ok):
        if not ok:
            QMessageBox.warning(window, 'Não foi possível carregar', 'Não foi possível abrir o editor. Feche e abra novamente o aplicativo.')
        test = os.environ.get('INDOOR_DESKTOP_TEST')
        if test:
            def record(title):
                Path(test).write_text(json.dumps({'loaded':ok,'title':title,'window':window.windowTitle()}), encoding='utf-8')
            view.page().runJavaScript('document.title', record)
    view.loadFinished.connect(loaded)
    view.setUrl(QUrl(f'http://localhost:{port}'))
    window.showMaximized()
    try: qt.exec()
    finally: service.close()

if __name__ == '__main__':
    if '--worker' in sys.argv: sys.exit(worker())
    try:
        main()
    except Exception:
        import traceback
        location = Path(sys.executable).parent if getattr(sys, "frozen", False) else ROOT
        (location / "erro-inicializacao.txt").write_text(traceback.format_exc(), encoding="utf-8")
        raise

