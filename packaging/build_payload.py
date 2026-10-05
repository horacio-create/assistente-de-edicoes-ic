"""Stage the Windows runtime and attach its zip to the MinGW GUI launcher."""
import shutil, struct, sys, zipfile
from pathlib import Path

app, work, build, output = map(lambda p: Path(p).resolve(), sys.argv[1:])
assert build.parent == work, 'Build directory must belong to the named work directory'
stage = build / 'stage'
stage.mkdir()
excluded = {'__pycache__', 'test', 'tests', 'idlelib', 'tkinter', 'turtledemo', 'ensurepip', 'lib2to3', 'pip', 'mupdf-devel'}
def ignore(directory, names):
    return [n for n in names if n in excluded or n.endswith(('.pyc', '.pyo'))]
shutil.copytree(work / 'python' / 'Lib', stage / 'python' / 'Lib', ignore=ignore)
shutil.copytree(work / 'python' / 'DLLs', stage / 'python' / 'DLLs', ignore=ignore)
for file in (work / 'python').iterdir():
    if file.is_file(): shutil.copy2(file, stage / 'python' / file.name)
site = stage / 'python' / 'Lib' / 'site-packages'
site.mkdir(exist_ok=True)
for wheel in sorted((work / 'wheels').glob('*.whl')):
    with zipfile.ZipFile(wheel) as z:
        if wheel.name.startswith('msvc_runtime'):
            for name in z.namelist():
                if '.data/data/' in name and name.endswith('.dll'):
                    (stage / 'python' / Path(name).name).write_bytes(z.read(name))
        else: z.extractall(site)
(stage / 'app').mkdir()
for file in app.glob('*.py'): shutil.copy2(file, stage / 'app' / file.name)
for folder in ('modules', 'static'): shutil.copytree(app / folder, stage / 'app' / folder, ignore=ignore)
with zipfile.ZipFile(build / 'payload.zip', 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for file in sorted(stage.rglob('*')):
        if file.is_file() and not any(p in excluded for p in file.relative_to(stage).parts):
            z.write(file, file.relative_to(stage).as_posix())
output.parent.mkdir(parents=True, exist_ok=True)
with output.open('wb') as f:
    f.write((build / 'launcher.exe').read_bytes())
    payload = (build / 'payload.zip').read_bytes()
    f.write(payload)
    f.write(b'ICPAYLD1' + struct.pack('<Q', len(payload)))
print('Built', output, 'version', (app/'version.py').read_text().strip())
