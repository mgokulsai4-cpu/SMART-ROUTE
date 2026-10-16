import enum
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class IncidentStatus(str, enum.Enum):
    REASSIGN_PENDING = "reassign_pending"
    REASSIGNED = "reassigned"
    RESOLVED = "resolved"


class HelmetLockIncident(Base):
    __tablename__ = "helmet_lock_incidents"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    partner_id: Mapped[int] = mapped_column(Integer, ForeignKey("delivery_partners.id"), nullable=False)
    order_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("orders.id"), nullable=True)
    lock_violation_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("violations.id"), nullable=True)
    warning_count_at_lock: Mapped[int] = mapped_column(Integer, default=5)
    status: Mapped[IncidentStatus] = mapped_column(Enum(IncidentStatus), default=IncidentStatus.REASSIGN_PENDING)
    auto_reassigned: Mapped[bool] = mapped_column(Boolean, default=False)
    escalated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    reassignment_due_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    reassigned_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    unlocked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    recovery_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    partner = relationship("DeliveryPartner")
    order = relationship("Order")
    lock_violation = relationship("Violation")
