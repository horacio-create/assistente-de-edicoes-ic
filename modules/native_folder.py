"""Native folder dialog (Windows Explorer or macOS Finder), isolated in a short-lived process."""
import ctypes as C
import json
import os
import subprocess
import sys
import uuid


def choose_folder_mac():
    script = ('activate\n'
              'POSIX path of (choose folder with prompt "Indoor Channel — Onde salvar as mídias?" '
              'default location (path to pictures folder))')
    result = subprocess.run(['osascript', '-e', script], capture_output=True, text=True)
    if result.returncode:
        if '-128' in result.stderr: return None  # Cancelado pelo usuário.
        raise OSError('O macOS não conseguiu abrir a seleção de pasta.')
    return result.stdout.strip().rstrip('/') or '/'


def choose_folder():
    if sys.platform == 'darwin':
        return choose_folder_mac()
    if os.name != 'nt':
        raise RuntimeError('O seletor nativo requer Windows ou macOS.')
    HRESULT = C.c_long
    POINTER = C.c_void_p
    ole = C.OleDLL('ole32')
    ole.CoInitializeEx.argtypes = [POINTER, C.c_ulong]
    ole.CoInitializeEx.restype = HRESULT
    ole.CoCreateInstance.argtypes = [POINTER, POINTER, C.c_ulong, POINTER, C.POINTER(POINTER)]
    ole.CoCreateInstance.restype = HRESULT
    ole.CoTaskMemFree.argtypes = [POINTER]
    def guid(value): return (C.c_byte * 16).from_buffer_copy(uuid.UUID(value).bytes_le)
    def call(obj, index, result, args, *values):
        table = C.cast(obj, C.POINTER(C.POINTER(POINTER))).contents
        return C.WINFUNCTYPE(result, POINTER, *args)(table[index])(obj, *values)
    def check(hr):
        if hr < 0: raise OSError(f'O Windows não conseguiu abrir a seleção de pasta ({hr & 0xffffffff:08x}).')
    check(ole.CoInitializeEx(None, 2))
    dialog, item, name = POINTER(), POINTER(), POINTER()
    try:
        check(ole.CoCreateInstance(guid('DC1C5A9C-E88A-4DDE-A5A1-60F82A20AEF7'), None, 1,
                                  guid('D57C7288-D4AD-4768-BE02-9D969532D960'), C.byref(dialog)))
        # IFileDialog: FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM | FOS_PATHMUSTEXIST.
        check(call(dialog, 9, HRESULT, [C.c_ulong], 0x20 | 0x40 | 0x800))
        check(call(dialog, 17, HRESULT, [C.c_wchar_p], 'Indoor Channel — Onde salvar as mídias?'))
        check(call(dialog, 18, HRESULT, [C.c_wchar_p], 'Salvar nesta pasta'))
        # Anchor the modal dialog to the user's foreground window so it does
        # not silently appear behind the browser.
        user = C.WinDLL('user32', use_last_error=True)
        user.GetForegroundWindow.restype = POINTER
        owner = user.GetForegroundWindow()
        hr = call(dialog, 3, HRESULT, [POINTER], owner)
        if hr & 0xffffffff == 0x800704C7: return None
        check(hr)
        check(call(dialog, 20, HRESULT, [C.POINTER(POINTER)], C.byref(item)))
        # IShellItem::GetDisplayName(SIGDN_FILESYSPATH).
        check(call(item, 5, HRESULT, [C.c_ulong, C.POINTER(POINTER)], 0x80058000, C.byref(name)))
        return C.wstring_at(name)
    finally:
        if name: ole.CoTaskMemFree(name)
        if item: call(item, 2, C.c_ulong, [])
        if dialog: call(dialog, 2, C.c_ulong, [])
        ole.CoUninitialize()


if __name__ == '__main__':
    try: result = {'path': choose_folder()}
    except Exception as exc: result = {'error': str(exc)}
    sys.stdout.buffer.write(json.dumps(result, ensure_ascii=False).encode('utf-8'))
