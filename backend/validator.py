def validate_claim(claim: str, evidence: list[str]) -> dict:
    """V0.1 conservative validator. AI semantic validator will replace this later."""
    normalized = claim.lower()
    hits = [e for e in evidence if any(token in e.lower() for token in normalized.split() if len(token) > 5)]
    return {
        'claim': claim,
        'supported': bool(hits),
        'evidence': hits,
        'action': 'allow' if hits else 'needs_confirmation'
    }
