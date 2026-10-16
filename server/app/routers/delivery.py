import asyncio
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db, SessionLocal
from app.models.delivery_partner import DeliveryPartner, LocationUpdate, PartnerStatus
from app.models.helmet_lock_incident import HelmetLockIncident, IncidentStatus
from app.models.order import Order, OrderStatus
from app.models.user import User, UserRole
from app.models.violation import Violation, ViolationSeverity, ViolationType
from app.schemas.dashboard import SafetyIncidentOut, SafetyInsightsOut, SafetyTrendPoint
from app.schemas.delivery_partner import (
    DeliveryPartnerOut,
    DeliveryPartnerUpdate,
    DeliverySafetyUpdate,
    HelmetMonitorStatus,
    HelmetMonitorUpdate,
    LocationUpdateCreate,
    LocationUpdateOut,
)
from app.schemas.violation import ViolationOut
from app.routers.auth import get_current_user, require_role

router = APIRouter(prefix="/delivery", tags=["Delivery"])

ACTIVE_ORDER_STATUSES = (
    OrderStatus.CONFIRMED,
    OrderStatus.PREPARING,
    OrderStatus.READY,
    OrderStatus.PICKED_UP,
    OrderStatus.IN_TRANSIT,
)

_pending_reassign_tasks: dict[int, asyncio.Task] = {}


def _safe_rate(numerator: int | float, denominator: int | float) -> float:
    if denominator <= 0:
        return 0.0
    return round((numerator / denominator) * 100, 2)


def _to_naive_utc(dt: datetime) -> datetime:
    if dt.tzinfo is not None:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


async def _emit_helmet_alert(payload: dict):
    from app.sio_server import sio

    try:
        await sio.emit("helmet_alert", payload, room=f"partner_{payload['partner_id']}")
        await sio.emit("helmet_alert", payload, room="admin")
    except Exception:
        pass


async def _emit_escalation_alert(payload: dict):
    from app.sio_server import sio

    try:
        await sio.emit("helmet_escalation", payload, room="admin")
        partner_id = payload.get("partner_id")
        if partner_id:
            await sio.emit("helmet_escalation", payload, room=f"partner_{partner_id}")
    except Exception:
        pass


async def _emit_order_update(order_id: int, status: str, partner_id: int | None = None):
    from app.sio_server import sio

    try:
        await sio.emit(
            "order_update",
            {
                "order_id": order_id,
                "status": status,
                "partner_id": partner_id,
            },
            room=f"order_{order_id}",
        )
    except Exception:
        pass


def _find_active_order_for_partner(db: Session, partner_id: int) -> Order | None:
    return (
        db.query(Order)
        .filter(Order.partner_id == partner_id)
        .filter(Order.status.in_(ACTIVE_ORDER_STATUSES))
        .order_by(Order.created_at.asc())
        .first()
    )


def _schedule_reassignment(incident_id: int):
    if incident_id in _pending_reassign_tasks:
        return

    async def runner():
        try:
            await asyncio.sleep(max(30, settings.HELMET_ESCALATION_REASSIGN_DELAY_SECONDS))
            db = SessionLocal()
            try:
                incident = db.query(HelmetLockIncident).filter(HelmetLockIncident.id == incident_id).first()
                if not incident:
                    return
                if incident.status != IncidentStatus.REASSIGN_PENDING:
                    return

                order = db.query(Order).filter(Order.id == incident.order_id).first() if incident.order_id else None
                if not order:
                    incident.status = IncidentStatus.RESOLVED
                    incident.note = "No active order found for reassignment."
                    db.commit()
                    return

                if order.status not in ACTIVE_ORDER_STATUSES:
                    incident.status = IncidentStatus.RESOLVED
                    incident.note = "Order already completed before reassignment."
                    db.commit()
                    return

                locked_partner = db.query(DeliveryPartner).filter(DeliveryPartner.id == incident.partner_id).first()
                available_partner = (
                    db.query(DeliveryPartner)
                    .filter(DeliveryPartner.id != incident.partner_id)
                    .filter(DeliveryPartner.status == PartnerStatus.ONLINE)
                    .filter(DeliveryPartner.is_active == True)
                    .order_by(DeliveryPartner.safety_score.desc(), DeliveryPartner.rating.desc())
                    .first()
                )

                if not available_partner:
                    incident.note = "Escalated: no online partner available for reassignment."
                    db.commit()
                    asyncio.create_task(
                        _emit_escalation_alert(
                            {
                                "event": "reassign_unavailable",
                                "incident_id": incident.id,
                                "partner_id": incident.partner_id,
                                "order_id": incident.order_id,
                                "message": "No online partner available for auto reassignment.",
                            }
                        )
                    )
                    return

                previous_partner_id = order.partner_id
                order.partner_id = available_partner.id
                order.status = OrderStatus.CONFIRMED
                order.confirmed_at = datetime.now(timezone.utc)

                available_partner.status = PartnerStatus.BUSY

                if locked_partner:
                    active_for_locked = _find_active_order_for_partner(db, locked_partner.id)
                    if active_for_locked is None:
                        locked_partner.status = PartnerStatus.ONLINE

                incident.status = IncidentStatus.REASSIGNED
                incident.auto_reassigned = True
                incident.reassigned_at = datetime.now(timezone.utc)
                incident.note = f"Order auto reassigned from partner {previous_partner_id} to {available_partner.id}."
                db.commit()

                asyncio.create_task(_emit_order_update(order.id, order.status.value, order.partner_id))

                asyncio.create_task(
                    _emit_escalation_alert(
                        {
                            "event": "reassigned",
                            "incident_id": incident.id,
                            "partner_id": incident.partner_id,
                            "order_id": incident.order_id,
                            "new_partner_id": available_partner.id,
                            "message": "Order auto reassigned after helmet lock escalation.",
                        }
                    )
                )
            finally:
                db.close()
        finally:
            _pending_reassign_tasks.pop(incident_id, None)

    _pending_reassign_tasks[incident_id] = asyncio.create_task(runner())


def _resolve_open_incidents_for_partner(db: Session, partner: DeliveryPartner) -> list[HelmetLockIncident]:
    open_incidents = (
        db.query(HelmetLockIncident)
        .filter(HelmetLockIncident.partner_id == partner.id)
        .filter(HelmetLockIncident.status == IncidentStatus.REASSIGN_PENDING)
        .all()
    )

    if not open_incidents:
        return []

    now = datetime.now(timezone.utc)
    for incident in open_incidents:
        incident.status = IncidentStatus.RESOLVED
        incident.unlocked_at = now
        if incident.escalated_at:
            incident.recovery_seconds = int((now - incident.escalated_at).total_seconds())
        incident.note = "Helmet compliance restored before auto reassignment."

        task = _pending_reassign_tasks.pop(incident.id, None)
        if task:
            task.cancel()

    return open_incidents


@router.get("/me", response_model=DeliveryPartnerOut)
def get_my_partner(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.DELIVERY)),
):
    partner = db.query(DeliveryPartner).filter(DeliveryPartner.user_id == current_user.id).first()
    if not partner:
        raise HTTPException(status_code=404, detail="Partner profile not found")
    return partner


@router.get("/partners", response_model=list[DeliveryPartnerOut])
def list_partners(
    status: PartnerStatus | None = None,
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    _: User = Depends(require_role(UserRole.ADMIN)),
):
    q = db.query(DeliveryPartner)
    if status:
        q = q.filter(DeliveryPartner.status == status)
    return q.offset(skip).limit(limit).all()


@router.get("/partners/{partner_id}", response_model=DeliveryPartnerOut)
def get_partner(partner_id: int, db: Session = Depends(get_db)):
    partner = db.query(DeliveryPartner).filter(DeliveryPartner.id == partner_id).first()
    if not partner:
        raise HTTPException(status_code=404, detail="Partner not found")
    return partner


@router.patch("/partners/{partner_id}", response_model=DeliveryPartnerOut)
def update_partner(
    partner_id: int,
    data: DeliveryPartnerUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_role(UserRole.ADMIN, UserRole.DELIVERY)),
):
    partner = db.query(DeliveryPartner).filter(DeliveryPartner.id == partner_id).first()
    if not partner:
        raise HTTPException(status_code=404, detail="Partner not found")
    for key, val in data.model_dump(exclude_unset=True).items():
        setattr(partner, key, val)
    db.commit()
    db.refresh(partner)
    return partner


@router.post("/location", response_model=LocationUpdateOut)
def update_location(
    data: LocationUpdateCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.DELIVERY)),
):
    partner = db.query(DeliveryPartner).filter(DeliveryPartner.user_id == current_user.id).first()
    if not partner:
        raise HTTPException(status_code=404, detail="Partner profile not found")

    loc = LocationUpdate(
        partner_id=partner.id,
        lat=data.lat,
        lng=data.lng,
        speed_kmh=data.speed_kmh,
        bearing=data.bearing,
    )
    db.add(loc)

    partner.current_lat = data.lat
    partner.current_lng = data.lng

    db.commit()
    db.refresh(loc)
    return loc


@router.patch("/me/safety", response_model=DeliveryPartnerOut)
def update_my_safety(
    data: DeliverySafetyUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.DELIVERY)),
):
    partner = db.query(DeliveryPartner).filter(DeliveryPartner.user_id == current_user.id).first()
    if not partner:
        raise HTTPException(status_code=404, detail="Partner profile not found")

    updates = data.model_dump(exclude_unset=True)
    if not updates:
        return partner

    for key, val in updates.items():
        setattr(partner, key, val)

    if updates.get("helmet_detected") is True:
        partner.helmet_warning_count = 0
        partner.navigation_locked = False

    db.commit()
    db.refresh(partner)
    return partner


@router.post("/me/helmet-monitor", response_model=HelmetMonitorStatus)
async def report_helmet_monitor(
    data: HelmetMonitorUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.DELIVERY)),
):
    partner = db.query(DeliveryPartner).filter(DeliveryPartner.user_id == current_user.id).first()
    if not partner:
        raise HTTPException(status_code=404, detail="Partner profile not found")

    warning_limit = settings.HELMET_WARNING_LIMIT

    partner.helmet_detected = data.helmet_detected
    partner.camera_active = data.camera_active

    should_stop_navigation = False
    message = "Helmet monitoring active."
    alert_payload: dict | None = None
    incident_to_schedule: HelmetLockIncident | None = None

    if data.helmet_detected:
        if partner.helmet_warning_count > 0 or partner.navigation_locked:
            partner.helmet_warning_count = 0
            partner.navigation_locked = False
            message = "Helmet detected. Navigation unlocked."

            resolved_incidents = _resolve_open_incidents_for_partner(db, partner)
            alert_payload = {
                "partner_id": partner.id,
                "partner_name": partner.user.name if partner.user else f"Partner #{partner.id}",
                "event": "unlock",
            }

            for incident in resolved_incidents:
                asyncio.create_task(
                    _emit_escalation_alert(
                        {
                            "event": "recovery",
                            "incident_id": incident.id,
                            "partner_id": partner.id,
                            "order_id": incident.order_id,
                            "recovery_seconds": incident.recovery_seconds,
                            "message": "Partner restored helmet compliance before reassignment.",
                        }
                    )
                )
        else:
            message = "Helmet detected. You can continue navigation."
    else:
        if data.is_navigating:
            should_stop_navigation = True

            if partner.navigation_locked and partner.helmet_warning_count >= warning_limit:
                message = f"Helmet not detected. Navigation is locked after {warning_limit} warnings."
            else:
                warning_count = min(warning_limit, partner.helmet_warning_count + 1)
                partner.helmet_warning_count = warning_count

                navigation_locked = warning_count >= warning_limit
                if navigation_locked:
                    partner.navigation_locked = True
                    severity = ViolationSeverity.PENALTY
                    message = (
                        f"Helmet not detected. Warning {warning_count}/{warning_limit}. "
                        "Navigation is now locked."
                    )
                    partner.safety_score = max(0.0, partner.safety_score - 4.0)
                    partner.rating = max(1.0, round(partner.rating - 0.1, 2))

                    active_order = _find_active_order_for_partner(db, partner.id)
                    delay_seconds = max(30, settings.HELMET_ESCALATION_REASSIGN_DELAY_SECONDS)
                    now_utc = datetime.now(timezone.utc)
                    incident = HelmetLockIncident(
                        partner_id=partner.id,
                        order_id=active_order.id if active_order else None,
                        warning_count_at_lock=warning_count,
                        status=IncidentStatus.REASSIGN_PENDING,
                        escalated_at=now_utc,
                        reassignment_due_at=now_utc + timedelta(seconds=delay_seconds),
                        note="Helmet lock escalation triggered.",
                    )
                    db.add(incident)
                    incident_to_schedule = incident
                else:
                    severity = ViolationSeverity.WARNING
                    remaining = warning_limit - warning_count
                    message = (
                        f"Helmet not detected. Warning {warning_count}/{warning_limit}. "
                        f"{remaining} warning(s) left before lock."
                    )
                    partner.safety_score = max(0.0, partner.safety_score - 1.0)
                    partner.rating = max(1.0, round(partner.rating - 0.02, 2))

                violation = Violation(
                    partner_id=partner.id,
                    type=ViolationType.HELMET,
                    severity=severity,
                    detail=message,
                    offense_count=warning_count,
                    lat=data.lat,
                    lng=data.lng,
                )
                db.add(violation)

                if navigation_locked:
                    db.flush()
                    incident.lock_violation_id = violation.id
                    asyncio.create_task(
                        _emit_escalation_alert(
                            {
                                "event": "lock",
                                "incident_id": incident.id,
                                "partner_id": partner.id,
                                "partner_name": partner.user.name if partner.user else f"Partner #{partner.id}",
                                "order_id": active_order.id if active_order else None,
                                "warning_count": warning_count,
                                "warning_limit": warning_limit,
                                "delay_seconds": max(30, settings.HELMET_ESCALATION_REASSIGN_DELAY_SECONDS),
                                "reassignment_due_at": incident.reassignment_due_at.isoformat() if incident.reassignment_due_at else None,
                                "message": "Helmet lock triggered. Auto reassignment countdown started.",
                            }
                        )
                    )

                alert_payload = {
                    "partner_id": partner.id,
                    "partner_name": partner.user.name if partner.user else f"Partner #{partner.id}",
                    "event": "warning",
                }
        elif partner.navigation_locked:
            message = "Helmet not detected. Navigation remains locked until helmet is detected."
        else:
            message = "Helmet not detected. Wear helmet before starting navigation."

    db.commit()
    db.refresh(partner)

    if incident_to_schedule is not None:
        db.refresh(incident_to_schedule)
        _schedule_reassignment(incident_to_schedule.id)

    warning_count = partner.helmet_warning_count
    warnings_remaining = max(0, warning_limit - warning_count)

    if alert_payload is not None:
        alert_payload.update(
            {
                "warning_count": warning_count,
                "warning_limit": warning_limit,
                "warnings_remaining": warnings_remaining,
                "navigation_locked": partner.navigation_locked,
                "message": message,
                "safety_score": partner.safety_score,
                "rating": partner.rating,
            }
        )
        asyncio.create_task(_emit_helmet_alert(alert_payload))

    return HelmetMonitorStatus(
        helmet_detected=partner.helmet_detected,
        camera_active=partner.camera_active,
        warning_count=warning_count,
        warning_limit=warning_limit,
        warnings_remaining=warnings_remaining,
        navigation_locked=partner.navigation_locked,
        should_stop_navigation=should_stop_navigation,
        message=message,
        safety_score=partner.safety_score,
        rating=partner.rating,
    )


@router.get("/me/safety-history", response_model=list[ViolationOut])
def get_my_safety_history(
    limit: int = 20,
    type: ViolationType | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.DELIVERY)),
):
    partner = db.query(DeliveryPartner).filter(DeliveryPartner.user_id == current_user.id).first()
    if not partner:
        raise HTTPException(status_code=404, detail="Partner profile not found")

    q = db.query(Violation).filter(Violation.partner_id == partner.id)
    if type:
        q = q.filter(Violation.type == type)

    history = q.order_by(Violation.created_at.desc()).limit(max(1, min(limit, 100))).all()
    out: list[ViolationOut] = []
    for item in history:
        record = ViolationOut.model_validate(item)
        if partner.user:
            record.partner_name = partner.user.name
        out.append(record)
    return out


@router.get("/location/{partner_id}", response_model=list[LocationUpdateOut])
def get_location_history(
    partner_id: int,
    limit: int = 20,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return (
        db.query(LocationUpdate)
        .filter(LocationUpdate.partner_id == partner_id)
        .order_by(LocationUpdate.timestamp.desc())
        .limit(limit)
        .all()
    )


@router.get("/admin/safety-insights", response_model=SafetyInsightsOut)
def get_admin_safety_insights(
    hours: int = 24,
    db: Session = Depends(get_db),
    _: User = Depends(require_role(UserRole.ADMIN)),
):
    window_hours = max(1, min(hours, 168))
    now_utc = datetime.now(timezone.utc)
    window_start_utc = now_utc - timedelta(hours=window_hours)
    window_start = _to_naive_utc(window_start_utc)

    warning_count = (
        db.query(Violation)
        .filter(Violation.type == ViolationType.HELMET)
        .filter(Violation.severity == ViolationSeverity.WARNING)
        .filter(Violation.created_at >= window_start)
        .count()
    )
    lock_count = (
        db.query(Violation)
        .filter(Violation.type == ViolationType.HELMET)
        .filter(Violation.severity == ViolationSeverity.PENALTY)
        .filter(Violation.created_at >= window_start)
        .count()
    )

    incidents_window = (
        db.query(HelmetLockIncident)
        .filter(HelmetLockIncident.created_at >= window_start)
        .order_by(HelmetLockIncident.created_at.desc())
        .all()
    )

    resolved_incidents = [i for i in incidents_window if i.recovery_seconds is not None and i.status == IncidentStatus.RESOLVED]
    avg_recovery_seconds = round(sum(i.recovery_seconds for i in resolved_incidents) / len(resolved_incidents), 1) if resolved_incidents else 0.0

    pending_escalations = (
        db.query(HelmetLockIncident)
        .filter(HelmetLockIncident.status == IncidentStatus.REASSIGN_PENDING)
        .count()
    )

    auto_reassigned_count = len([i for i in incidents_window if i.auto_reassigned])

    total_events = warning_count + lock_count
    false_positive_rate = _safe_rate(len(resolved_incidents), lock_count)
    warning_rate = round(warning_count / window_hours, 2)
    lock_rate = _safe_rate(lock_count, total_events)

    buckets = 6
    bucket_size_hours = max(1, window_hours // buckets)
    trend: list[SafetyTrendPoint] = []
    for idx in range(buckets):
        bucket_start_utc = window_start_utc + timedelta(hours=idx * bucket_size_hours)
        bucket_end_utc = bucket_start_utc + timedelta(hours=bucket_size_hours)
        bucket_start = _to_naive_utc(bucket_start_utc)
        bucket_end = _to_naive_utc(bucket_end_utc)

        bucket_warnings = (
            db.query(Violation)
            .filter(Violation.type == ViolationType.HELMET)
            .filter(Violation.severity == ViolationSeverity.WARNING)
            .filter(Violation.created_at >= bucket_start)
            .filter(Violation.created_at < bucket_end)
            .count()
        )
        bucket_locks = (
            db.query(Violation)
            .filter(Violation.type == ViolationType.HELMET)
            .filter(Violation.severity == ViolationSeverity.PENALTY)
            .filter(Violation.created_at >= bucket_start)
            .filter(Violation.created_at < bucket_end)
            .count()
        )
        bucket_recoveries = (
            db.query(HelmetLockIncident)
            .filter(HelmetLockIncident.unlocked_at.isnot(None))
            .filter(HelmetLockIncident.unlocked_at >= bucket_start)
            .filter(HelmetLockIncident.unlocked_at < bucket_end)
            .count()
        )

        trend.append(
            SafetyTrendPoint(
                bucket=bucket_start_utc.strftime("%H:%M"),
                warnings=bucket_warnings,
                locks=bucket_locks,
                recoveries=bucket_recoveries,
            )
        )

    incident_rows = incidents_window[:12]
    recent_incidents: list[SafetyIncidentOut] = []
    for incident in incident_rows:
        partner_name = incident.partner.user.name if incident.partner and incident.partner.user else f"Partner #{incident.partner_id}"
        order_number = incident.order.order_number if incident.order else None
        recent_incidents.append(
            SafetyIncidentOut(
                id=incident.id,
                partner_id=incident.partner_id,
                partner_name=partner_name,
                order_id=incident.order_id,
                order_number=order_number,
                status=incident.status.value,
                warning_count_at_lock=incident.warning_count_at_lock,
                auto_reassigned=incident.auto_reassigned,
                created_at=incident.created_at,
                escalated_at=incident.escalated_at,
                reassignment_due_at=incident.reassignment_due_at,
                reassigned_at=incident.reassigned_at,
                unlocked_at=incident.unlocked_at,
                recovery_seconds=incident.recovery_seconds,
                note=incident.note,
            )
        )

    return SafetyInsightsOut(
        window_hours=window_hours,
        warning_count_24h=warning_count,
        lock_count_24h=lock_count,
        warning_rate_per_hour=warning_rate,
        lock_rate_percent=lock_rate,
        false_positive_rate_percent=false_positive_rate,
        avg_recovery_seconds=avg_recovery_seconds,
        pending_escalations=pending_escalations,
        auto_reassigned_count_24h=auto_reassigned_count,
        trend=trend,
        recent_incidents=recent_incidents,
    )
