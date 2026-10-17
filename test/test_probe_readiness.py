import importlib.util
from pathlib import Path
spec=importlib.util.spec_from_file_location('probe_matrix',Path(__file__).parents[1]/'scripts/probe_matrix.py')
probe=importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


def test_portfolio_landing_does_not_wait_for_a_dashboard_table():
    assert not probe.board_wait_needed('portfolio',False)
    assert probe.board_wait_needed('dashboard',False)
    assert probe.board_wait_needed(None,False)
    assert not probe.board_wait_needed('watchlists',True)
