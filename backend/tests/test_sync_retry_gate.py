# backend/tests/test_sync_retry_gate.py — exercises the background sync engine's retry gating logic (Step 3); no dedicated screen consumes this in MVP0, but Settings or a future admin view could
def test_retry_blocked_before_any_failure(retry_now_fn):
    result = retry_now_fn(is_connected=True, failed_once=False)
    assert result == {"ok": False, "error": "no_prior_failure"}  # EXC-SB08-002

def test_retry_blocked_with_no_connectivity(retry_now_fn):
    result = retry_now_fn(is_connected=False, failed_once=True)
    assert result == {"ok": False, "error": "no_connectivity"}  # EXC-SB08-001

def test_retry_allowed_after_prior_failure_and_connectivity(retry_now_fn):
    result = retry_now_fn(is_connected=True, failed_once=True)
    assert result["ok"] is True  # BR-SB08-002/003
