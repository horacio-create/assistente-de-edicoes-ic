#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <stdio.h>
#include <string.h>
#include "miniz.h"

#define MAGIC "ICPAYLD1"

static HWND splash = NULL;

static void pump(void) {
    MSG m;
    while (PeekMessageW(&m, NULL, 0, 0, PM_REMOVE)) { TranslateMessage(&m); DispatchMessageW(&m); }
}

static void fail(const wchar_t *msg) {
    if (splash) { DestroyWindow(splash); splash = NULL; }
    MessageBoxW(NULL, msg, L"Indoor Channel", MB_OK | MB_ICONERROR);
}

static void show_splash(void) {
    WNDCLASSW wc; memset(&wc, 0, sizeof wc);
    wc.lpfnWndProc = DefWindowProcW; wc.hInstance = GetModuleHandleW(NULL);
    wc.lpszClassName = L"ICSplash"; wc.hbrBackground = (HBRUSH)(COLOR_WINDOW + 1);
    wc.hCursor = LoadCursorW(NULL, IDC_ARROW);
    RegisterClassW(&wc);
    int w = 360, h = 96;
    int x = (GetSystemMetrics(SM_CXSCREEN) - w) / 2, y = (GetSystemMetrics(SM_CYSCREEN) - h) / 2;
    splash = CreateWindowExW(WS_EX_TOPMOST | WS_EX_TOOLWINDOW, L"ICSplash", L"Indoor Channel",
                             WS_POPUP | WS_BORDER | WS_VISIBLE, x, y, w, h, NULL, NULL, wc.hInstance, NULL);
    HWND t = CreateWindowExW(0, L"STATIC", L"Abrindo o Indoor Channel...\nIsso leva alguns segundos.",
                             WS_CHILD | WS_VISIBLE | SS_CENTER, 10, 24, w - 20, 50, splash, NULL, wc.hInstance, NULL);
    SendMessageW(t, WM_SETFONT, (WPARAM)GetStockObject(DEFAULT_GUI_FONT), TRUE);
    pump();
}

static void make_dirs(wchar_t *path) {
    for (wchar_t *p = path + 3; *p; p++) {
        if (*p == L'\\') { *p = 0; CreateDirectoryW(path, NULL); *p = L'\\'; }
    }
}

static size_t write_cb(void *opaque, mz_uint64 ofs, const void *buf, size_t n) {
    (void)ofs; DWORD w = 0;
    if (!WriteFile((HANDLE)opaque, buf, (DWORD)n, &w, NULL)) return 0;
    return w;
}

static void rmtree(const wchar_t *dir) {
    wchar_t pat[MAX_PATH * 2]; WIN32_FIND_DATAW fd;
    swprintf(pat, MAX_PATH * 2, L"%ls\\*", dir);
    HANDLE h = FindFirstFileW(pat, &fd);
    if (h != INVALID_HANDLE_VALUE) {
        do {
            if (!wcscmp(fd.cFileName, L".") || !wcscmp(fd.cFileName, L"..")) continue;
            wchar_t full[MAX_PATH * 2];
            swprintf(full, MAX_PATH * 2, L"%ls\\%ls", dir, fd.cFileName);
            if (fd.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) rmtree(full);
            else { SetFileAttributesW(full, FILE_ATTRIBUTE_NORMAL); DeleteFileW(full); }
        } while (FindNextFileW(h, &fd));
        FindClose(h);
    }
    RemoveDirectoryW(dir);
}

int WINAPI wWinMain(HINSTANCE hi, HINSTANCE hp, PWSTR cmd, int show) {
    (void)hi; (void)hp; (void)cmd; (void)show;
    wchar_t self[MAX_PATH * 2];
    GetModuleFileNameW(NULL, self, MAX_PATH * 2);
    show_splash();

    HANDLE f = CreateFileW(self, GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE, NULL, OPEN_EXISTING, 0, NULL);
    if (f == INVALID_HANDLE_VALUE) { fail(L"Não foi possível ler o próprio executável."); return 1; }
    LARGE_INTEGER sz; GetFileSizeEx(f, &sz);
    char trailer[16]; DWORD got = 0; LARGE_INTEGER pos;
    pos.QuadPart = sz.QuadPart - 16; SetFilePointerEx(f, pos, NULL, FILE_BEGIN);
    ReadFile(f, trailer, 16, &got, NULL);
    if (got != 16 || memcmp(trailer, MAGIC, 8) != 0) { fail(L"Arquivo corrompido (conteúdo embutido não encontrado)."); return 1; }
    unsigned long long psize; memcpy(&psize, trailer + 8, 8);
    pos.QuadPart = sz.QuadPart - 16 - (long long)psize; SetFilePointerEx(f, pos, NULL, FILE_BEGIN);
    unsigned char *buf = (unsigned char *)malloc((size_t)psize);
    if (!buf) { fail(L"Memória insuficiente."); return 1; }
    size_t done = 0;
    while (done < psize) {
        DWORD chunk = (DWORD)((psize - done) > (64u << 20) ? (64u << 20) : (psize - done)), r = 0;
        if (!ReadFile(f, buf + done, chunk, &r, NULL) || r == 0) { fail(L"Falha ao ler o conteúdo embutido."); return 1; }
        done += r;
    }
    CloseHandle(f);

    wchar_t base[MAX_PATH * 2], tmp[MAX_PATH];
    GetTempPathW(MAX_PATH, tmp);
    LARGE_INTEGER qpc; QueryPerformanceCounter(&qpc);
    unsigned long tag = (unsigned long)(GetTickCount64() ^ (GetCurrentProcessId() * 2654435761u) ^ qpc.LowPart);
    swprintf(base, MAX_PATH * 2, L"%lsIndoorChannel-%08lx", tmp, tag);
    CreateDirectoryW(base, NULL);

    mz_zip_archive z; memset(&z, 0, sizeof z);
    if (!mz_zip_reader_init_mem(&z, buf, (size_t)psize, 0)) { fail(L"Conteúdo embutido inválido."); rmtree(base); return 1; }
    mz_uint n = mz_zip_reader_get_num_files(&z);
    for (mz_uint i = 0; i < n; i++) {
        mz_zip_archive_file_stat st;
        if (!mz_zip_reader_file_stat(&z, i, &st)) continue;
        wchar_t rel[MAX_PATH * 2], full[MAX_PATH * 2];
        MultiByteToWideChar(CP_UTF8, 0, st.m_filename, -1, rel, MAX_PATH * 2);
        for (wchar_t *p = rel; *p; p++) if (*p == L'/') *p = L'\\';
        swprintf(full, MAX_PATH * 2, L"%ls\\%ls", base, rel);
        if (mz_zip_reader_is_file_a_directory(&z, i)) { make_dirs(full); wcscat(full, L"\\x"); make_dirs(full); continue; }
        make_dirs(full);
        HANDLE o = CreateFileW(full, GENERIC_WRITE, 0, NULL, CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, NULL);
        if (o == INVALID_HANDLE_VALUE) { fail(L"Não foi possível gravar na pasta temporária."); mz_zip_reader_end(&z); rmtree(base); return 1; }
        mz_bool ok = mz_zip_reader_extract_to_callback(&z, i, write_cb, o, 0);
        CloseHandle(o);
        if (!ok) { fail(L"Falha ao extrair arquivos temporários."); mz_zip_reader_end(&z); rmtree(base); return 1; }
        if ((i & 63) == 0) pump();
    }
    mz_zip_reader_end(&z); free(buf);

    wchar_t exe[MAX_PATH * 2], script[MAX_PATH * 2], appdir[MAX_PATH * 2], cl[MAX_PATH * 6], ready[MAX_PATH * 2];
    swprintf(exe, MAX_PATH * 2, L"%ls\\python\\python.exe", base);
    swprintf(appdir, MAX_PATH * 2, L"%ls\\app", base);
    swprintf(script, MAX_PATH * 2, L"%ls\\portable.py", appdir);
    swprintf(ready, MAX_PATH * 2, L"%ls\\ready", base);
    swprintf(cl, MAX_PATH * 6, L"\"%ls\" -B -s -X utf8 \"%ls\"", exe, script);
    SetEnvironmentVariableW(L"INDOOR_TMP", base);
    SetEnvironmentVariableW(L"PYTHONDONTWRITEBYTECODE", L"1");

    STARTUPINFOW si; PROCESS_INFORMATION pi; memset(&si, 0, sizeof si); si.cb = sizeof si;
    if (!CreateProcessW(exe, cl, NULL, NULL, FALSE, CREATE_NO_WINDOW, NULL, appdir, &si, &pi)) {
        fail(L"Não foi possível iniciar o motor do programa."); rmtree(base); return 1;
    }
    CloseHandle(pi.hThread);
    for (;;) {
        DWORD r = MsgWaitForMultipleObjects(1, &pi.hProcess, FALSE, 200, QS_ALLINPUT);
        pump();
        if (splash && GetFileAttributesW(ready) != INVALID_FILE_ATTRIBUTES) { DestroyWindow(splash); splash = NULL; }
        if (r == WAIT_OBJECT_0) break;
    }
    CloseHandle(pi.hProcess);
    if (splash) { DestroyWindow(splash); splash = NULL; }
    for (int tries = 0; tries < 20; tries++) {
        rmtree(base);
        if (GetFileAttributesW(base) == INVALID_FILE_ATTRIBUTES) break;
        Sleep(500);
    }
    return 0;
}
