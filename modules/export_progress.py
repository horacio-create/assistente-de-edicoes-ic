"""Thread-safe, ephemeral progress for the synchronous local export endpoint."""
import threading
import time

LOCK = threading.Lock()
STATES = {}


def start(token, name):
    with LOCK:
        expired = [key for key, value in STATES.items() if time.monotonic()-value['started'] > 7200]
        for key in expired: del STATES[key]
        if len(STATES) >= 100:
            oldest = min(STATES, key=lambda key: STATES[key]['started']);del STATES[oldest]
        cancelled = STATES.get(token, {}).get('cancelRequested', False)
        STATES[token] = dict(percent=0, name=name, remaining=None, state='running', detail='', started=time.monotonic(), cancelRequested=cancelled)


def update(token, fraction, name, retry=0, detail=''):
    with LOCK:
        value = STATES[token]
        value['name'] = name
        value['percent'] = max(value['percent'], min(99, max(0, fraction*100)))
        value['detail'] = ' · '.join(part for part in (detail, 'Ajustando o tamanho do arquivo…' if retry else '') if part)
        elapsed = time.monotonic()-value['started']
        value['remaining'] = round(elapsed*(100/value['percent']-1)) if value['percent'] >= 2 and elapsed >= 1 and not retry else None


def finish(token, success, cancelled=False):
    with LOCK:
        STATES[token].update(percent=100 if success and not cancelled else STATES[token]['percent'], remaining=0,
                             state='cancelled' if cancelled else 'complete' if success else 'failed')


def cancel(token, pending=False):
    with LOCK:
        value = STATES.get(token)
        if value is None and pending:
            value = dict(percent=0, name='', remaining=None, state='waiting', detail='', started=time.monotonic())
            STATES[token] = value
        if value and value['state'] in ('running', 'waiting', 'cancelling'):
            value.update(cancelRequested=True, state='cancelling', remaining=None)
            return True
        return False


def is_cancelled(token):
    with LOCK:
        return bool(STATES.get(token, {}).get('cancelRequested'))


def get(token):
    with LOCK:
        value = STATES.get(token)
        return {key: data for key, data in value.items() if key not in ('started', 'cancelRequested')} if value else None
