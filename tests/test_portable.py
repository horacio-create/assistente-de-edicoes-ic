import importlib.util
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

class PortableTests(unittest.TestCase):
    def test_browser_handoff_is_tracked_by_profile_lock_not_initial_process(self):
        with tempfile.TemporaryDirectory() as root, patch.dict(os.environ, {'INDOOR_TMP':root}):
            spec = importlib.util.spec_from_file_location('portable_test_module', Path(__file__).resolve().parents[1] / 'portable.py')
            portable = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(portable)
            profile = Path(root) / 'perfil'
            profile.mkdir()
            (profile / 'lockfile').touch()
            process = Mock()
            process.wait.side_effect = AssertionError('Do not wait for the browser launch process')
            with patch.object(portable, 'profile_in_use', side_effect=[True, True, False]), patch.object(portable.time, 'sleep'):
                portable.wait_for_window_close(process)
            process.wait.assert_not_called()
