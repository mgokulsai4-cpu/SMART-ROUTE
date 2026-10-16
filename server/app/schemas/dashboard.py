from datetime import datetime

from pydantic import BaseModel


class DashboardStats(BaseModel):
    total_orders: int = 0
    active_orders: int = 0
    active_partners: int = 0
    avg_delivery_minutes: float = 0
    violations_today: int = 0
    revenue_today: float = 0
    delivered_today: int = 0


class SafetyTrendPoint(BaseModel):
    bucket: str
    warnings: int = 0
    locks: int = 0
    recoveries: int = 0


class SafetyIncidentOut(BaseModel):
    id: int
    partner_id: int
    partner_name: str
    order_id: int | None
    order_number: str | None
    status: str
    warning_count_at_lock: int
    auto_reassigned: bool
    created_at: datetime
    escalated_at: datetime | None
    reassignment_due_at: datetime | None
    reassigned_at: datetime | None
    unlocked_at: datetime | None
    recovery_seconds: int | None
    note: str | None


class SafetyInsightsOut(BaseModel):
    window_hours: int = 24
    warning_count_24h: int = 0
    lock_count_24h: int = 0
    warning_rate_per_hour: float = 0
    lock_rate_percent: float = 0
    false_positive_rate_percent: float = 0
    avg_recovery_seconds: float = 0
    pending_escalations: int = 0
    auto_reassigned_count_24h: int = 0
    trend: list[SafetyTrendPoint] = []
    recent_incidents: list[SafetyIncidentOut] = []


class RouteStop(BaseModel):
    sequence: int
    order_id: int
    order_number: str
    food_name: str
    food_emoji: str
    priority: int
    priority_reason: str | None
    stop_type: str = "dropoff"
    distance_km: float
    lat: float | None
    lng: float | None


class OptimizedRoute(BaseModel):
    stops: list[RouteStop]
    total_distance_km: float
    estimated_minutes: int
    algorithm: str = "Nearest Distance First"
