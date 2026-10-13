from dataclasses import dataclass
from typing import Optional

@dataclass
class ATSField:
    label: str
    field_type: str
    required: bool = False
    canonical_key: Optional[str] = None
    confidence: float = 0.0
    source_evidence: Optional[str] = None
    status: str = "ASK_USER"

# Never infer unknown candidate facts. READY requires stored profile evidence.
def decision(value, evidence, confidence=0.99):
    if value and evidence:
        return {"status": "READY", "value": value, "confidence": confidence, "evidence": evidence}
    return {"status": "ASK_USER", "value": None, "confidence": 0.0, "evidence": None}
