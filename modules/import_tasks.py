"""Bounded, job-scoped cancellation for one file; completed imports stay intact."""
import re
import threading
import time
from contextlib import contextmanager

LOCK = threading.RLock()
TASKS = {}

class Cancelled(Exception):
    pass

class Task:
    def __init__(self, job):
        self.job = job
        self.event = threading.Event()
        self.started = time.monotonic()
        self.running = False
        self.finished = False

    def cancelled(self):
        return self.event.is_set()

    def check(self):
        if self.cancelled():
            raise Cancelled('Importação cancelada.')

    @contextmanager
    def commit(self):
        # Cancel cannot be acknowledged between the last check and DB commit.
        with LOCK:
            self.check()
            yield
            self.finished = True

    def finish(self):
        with LOCK:
            self.finished = True


def validate(token):
    if not re.fullmatch(r'[a-f0-9]{32}', token or ''):
        raise ValueError('Identificador de importação inválido.')


def task_for(token, job):
    validate(token)
    with LOCK:
        task = TASKS.get(token)
        if task:
            if task.job != job:
                raise ValueError('Esta importação pertence a outra edição.')
            return task
        expired = [key for key, value in TASKS.items()
                   if (value.finished or not value.running) and time.monotonic()-value.started > 600]
        for key in expired:
            del TASKS[key]
        if len(TASKS) >= 100:
            removable = [key for key, value in TASKS.items() if value.finished or not value.running]
            if not removable:
                raise ValueError('Aguarde uma importação terminar.')
            del TASKS[min(removable, key=lambda key: TASKS[key].started)]
        task = TASKS[token] = Task(job)
        return task


def start(token, job):
    if not token:
        return Task(job)  # Compatibility with clients without cancel support.
    with LOCK:
        task = task_for(token, job)
        if task.running or task.finished:
            raise ValueError('Esta importação já foi utilizada.')
        task.running = True
        return task


def cancel(token, job):
    with LOCK:
        task = task_for(token, job)
        if task.finished:
            return False
        task.event.set()
        return True
