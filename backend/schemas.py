from dataclasses import dataclass, field
from typing import Optional, Literal

Confidence = Literal['high','medium','low']

@dataclass
class Evidence:
    source: str
    text: str
    confidence: Confidence = 'high'

@dataclass
class Experience:
    employer: str
    role: str
    start_date: Optional[str]
    end_date: Optional[str]
    country: Optional[str]
    evidence: list[Evidence] = field(default_factory=list)
    needs_confirmation: bool = False

@dataclass
class MasterProfile:
    full_name: str
    email: Optional[str]
    phone: Optional[str]
    location: Optional[str]
    work_authorisation: Optional[str]
    experiences: list[Experience]
    education: list[dict]
    certifications: list[str]
    languages: list[dict]
    unresolved: list[dict] = field(default_factory=list)
