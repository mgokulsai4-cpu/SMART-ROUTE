from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.database import engine, Base, SessionLocal
from app.routers import auth, users, food_items, orders, delivery, routing, qr, safety, admin, restaurants
from app.sio_server import sio, connected_partners
import socketio as _socketio


@sio.event
async def connect(sid, environ, auth=None):
    print(f"Client connected: {sid}")
    token = auth.get("token") if auth else None
    if token:
        from app.services.auth_service import decode_access_token
        from app.models.user import User, UserRole
        from app.models.delivery_partner import DeliveryPartner
        payload = decode_access_token(token)
        if payload:
            user_id = payload.get("sub")
            if user_id:
                try:
                    db = SessionLocal()
                    user = db.query(User).filter(User.id == int(user_id)).first()
                    if user and user.role == UserRole.DELIVERY:
                        partner = db.query(DeliveryPartner).filter(DeliveryPartner.user_id == user.id).first()
                        if partner:
                            connected_partners[sid] = partner.id
                            await sio.enter_room(sid, "delivery_partners")
                            await sio.enter_room(sid, f"partner_{partner.id}")
                            print(f"Partner {partner.id} joined delivery_partners room")
                    if user and user.role == UserRole.ADMIN:
                        await sio.enter_room(sid, "admin")
                    db.close()
                except Exception:
                    pass


@sio.event
async def disconnect(sid):
    partner_id = connected_partners.pop(sid, None)
    if partner_id:
        await sio.emit("partner_offline", {"partner_id": partner_id})
    print(f"Client disconnected: {sid}")


@sio.event
async def join_partner_room(sid, data):
    partner_id = data.get("partner_id")
    if partner_id:
        connected_partners[sid] = partner_id
        await sio.enter_room(sid, f"partner_{partner_id}")


@sio.event
async def location_update(sid, data):
    partner_id = data.get("partner_id")
    lat = data.get("lat")
    lng = data.get("lng")
    speed = data.get("speed_kmh", 0)
    if partner_id is not None and lat is not None and lng is not None:
        try:
            partner_id = int(partner_id)
            lat = float(lat)
            lng = float(lng)
            speed = float(speed)
        except (TypeError, ValueError):
            return

        from app.models.order import Order, OrderStatus

        db = SessionLocal()
        try:
            order_rows = (
                db.query(Order.id)
                .filter(Order.partner_id == partner_id)
                .filter(
                    Order.status.in_(
                        [
                            OrderStatus.CONFIRMED,
                            OrderStatus.PREPARING,
                            OrderStatus.READY,
                            OrderStatus.PICKED_UP,
                            OrderStatus.IN_TRANSIT,
                        ]
                    )
                )
                .all()
            )
        finally:
            db.close()

        payload = {"partner_id": partner_id, "lat": lat, "lng": lng, "speed_kmh": speed}
        for order_id, in order_rows:
            await sio.emit("partner_location", {**payload, "order_id": order_id}, room=f"order_{order_id}")

        from app.config import settings
        if speed > settings.SPEED_LIMIT_KMH:
            alert_payload = {"partner_id": partner_id, "speed_kmh": speed, "limit": settings.SPEED_LIMIT_KMH}
            for room in (f"partner_{partner_id}", "admin"):
                try:
                    await sio.emit("speed_alert", alert_payload, room=room)
                except Exception:
                    pass


@sio.event
async def join_tracking(sid, data):
    order_id = data.get("order_id")
    if order_id:
        await sio.enter_room(sid, f"order_{order_id}")


@sio.event
async def order_status_update(sid, data):
    order_id = data.get("order_id")
    status = data.get("status")
    if order_id and status:
        await sio.emit("order_update", data, room=f"order_{order_id}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        db.execute(text("PRAGMA foreign_keys=off"))
        try:
            db.execute(text("ALTER TABLE food_items ADD COLUMN restaurant_id INTEGER REFERENCES restaurants(id)"))
        except Exception:
            pass
        try:
            db.execute(text("ALTER TABLE restaurants ADD COLUMN menu_scraped BOOLEAN DEFAULT 0"))
        except Exception:
            pass
        try:
            db.execute(text("ALTER TABLE food_items ADD COLUMN rating FLOAT"))
        except Exception:
            pass
        try:
            db.execute(text("ALTER TABLE food_items ADD COLUMN image_url TEXT"))
        except Exception:
            pass
        try:
            db.execute(text("ALTER TABLE delivery_partners ADD COLUMN helmet_warning_count INTEGER DEFAULT 0"))
        except Exception:
            pass
        try:
            db.execute(text("ALTER TABLE delivery_partners ADD COLUMN navigation_locked BOOLEAN DEFAULT 0"))
        except Exception:
            pass
        try:
            db.execute(text("CREATE TABLE helmet_lock_incidents (id INTEGER PRIMARY KEY, partner_id INTEGER NOT NULL, order_id INTEGER, lock_violation_id INTEGER, warning_count_at_lock INTEGER DEFAULT 5, status VARCHAR(32) DEFAULT 'reassign_pending', auto_reassigned BOOLEAN DEFAULT 0, escalated_at DATETIME, reassignment_due_at DATETIME, reassigned_at DATETIME, unlocked_at DATETIME, recovery_seconds INTEGER, note TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(partner_id) REFERENCES delivery_partners(id), FOREIGN KEY(order_id) REFERENCES orders(id), FOREIGN KEY(lock_violation_id) REFERENCES violations(id))"))
        except Exception:
            pass
        db.commit()
    finally:
        db.close()

    db = SessionLocal()
    from app.models.user import User, UserRole
    from app.services.auth_service import hash_password

    if not db.query(User).filter(User.email == "admin@oye.in").first():
        admin = User(email="admin@oye.in", name="Admin", hashed_password=hash_password("admin1234"), role=UserRole.ADMIN, avatar_initial="A")
        db.add(admin)
    if not db.query(User).filter(User.email == "demo@oye.in").first():
        customer = User(email="demo@oye.in", name="Ricky", hashed_password=hash_password("demo1234"), role=UserRole.CUSTOMER, avatar_initial="R")
        db.add(customer)
    if not db.query(User).filter(User.email == "arjun@oye.in").first():
        delivery = User(email="arjun@oye.in", name="Arjun Kumar", hashed_password=hash_password("demo1234"), role=UserRole.DELIVERY, avatar_initial="A")
        db.add(delivery)
        db.flush()
        from app.models.delivery_partner import DeliveryPartner, PartnerStatus
        partner = DeliveryPartner(user_id=delivery.id, status=PartnerStatus.ONLINE, safety_score=98.0, rating=4.8, total_deliveries=1240)
        db.add(partner)

    from app.models.food_item import FoodItem, FoodCategory
    if db.query(FoodItem).count() == 0:
        foods = [
            FoodItem(name="Chicken Biryani", description="Fragrant basmati rice with tender chicken, slow-cooked with spices", price=280, category=FoodCategory.BIRYANI, emoji="🍗", tag="BESTSELLER", restaurant_name="Paradise", restaurant_area="Vizianagaram Zone", image_gradient="linear-gradient(135deg,#1a0f00,#2d1800)", rating=4.5, image_url="https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=600&h=420&fit=crop"),
            FoodItem(name="Belgian Waffle Sundae", description="3 scoops of Belgian chocolate ice cream, waffle, caramel drizzle", price=195, category=FoodCategory.ICE_CREAM, emoji="🍦", tag="⚡ PRIORITY", is_priority=True, priority_reason="Melts in 20min — deliver first", restaurant_name="Cream Stone", restaurant_area="Vizianagaram Zone", image_gradient="linear-gradient(135deg,#001a1a,#002828)", rating=4.6, image_url="https://images.unsplash.com/photo-1570197571499-166b36435e9f?w=600&h=420&fit=crop"),
            FoodItem(name="Double Pepperoni", description="Stone-baked, double layer mozzarella, spicy pepperoni, basil", price=420, category=FoodCategory.PIZZA, emoji="🍕", tag="NEW", restaurant_name="Pizza Hut", restaurant_area="Vizianagaram Zone", image_gradient="linear-gradient(135deg,#1a0000,#2d0000)", rating=4.2, image_url="https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=600&h=420&fit=crop"),
            FoodItem(name="Quinoa Power Bowl", description="Grilled veggies, quinoa, tahini dressing, pomegranate seeds", price=310, category=FoodCategory.HEALTHY, emoji="🥗", tag="HEALTHY", restaurant_name="Nectar Kitchen & Bar", restaurant_area="Vizianagaram Zone", image_gradient="linear-gradient(135deg,#0d1a00,#1a2d00)", rating=4.3, image_url="https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=600&h=420&fit=crop"),
            FoodItem(name="Smash Burger", description="Double smashed patty, ghost pepper sauce, pickled jalapenos", price=340, category=FoodCategory.BURGERS, emoji="🍔", tag="SPICY 🌶️", restaurant_name="Burger King", restaurant_area="Vizianagaram Zone", image_gradient="linear-gradient(135deg,#1a0a00,#2d1500)", rating=4.4, image_url="https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&h=420&fit=crop"),
            FoodItem(name="Pad Thai Noodles", description="Rice noodles, tofu, bean sprouts, peanuts, tamarind sauce", price=220, category=FoodCategory.NOODLES, emoji="🍜", tag="VEG", restaurant_name="Mamagoto", restaurant_area="Vizianagaram Zone", image_gradient="linear-gradient(135deg,#001500,#002400)", rating=4.1, image_url="https://images.unsplash.com/photo-1559314809-0d1550143294?w=600&h=420&fit=crop"),
        ]
        db.add_all(foods)

    from app.services.local_restaurant_seed import seed_local_restaurants
    seed_local_restaurants(db)

    from app.models.restaurant import Restaurant
    import math
    AREA_CENTER_LAT = 18.1086
    AREA_CENTER_LNG = 83.4020
    AREA_RADIUS_KM = 10
    EARTH_RADIUS_M = 6371000

    def in_zone(lat: float, lng: float) -> bool:
        d_lat = math.radians(lat - AREA_CENTER_LAT)
        d_lng = math.radians(lng - AREA_CENTER_LNG)
        a = math.sin(d_lat/2)**2 + math.cos(math.radians(AREA_CENTER_LAT)) * math.cos(math.radians(lat)) * math.sin(d_lng/2)**2
        return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(a)) <= AREA_RADIUS_KM * 1000

    def normalize_text(value: str) -> str:
        chars = [ch.lower() if ch.isalnum() else " " for ch in value]
        return " ".join("".join(chars).split())

    server_root = Path(__file__).resolve().parents[1]
    repo_root = server_root.parent
    csv_candidates = [repo_root / "restaurants_cleaned.csv", server_root / "restaurants_cleaned.csv"]
    csv_path = next((path for path in csv_candidates if path.exists()), csv_candidates[0])
    if db.query(Restaurant).count() == 0:
        try:
            import csv as csv_lib
            with open(csv_path, newline='', encoding='utf-8') as f:
                reader = csv_lib.DictReader(f)
                for row in reader:
                    try:
                        lat = float(row['lat'])
                        lng = float(row['lng'])
                        if not in_zone(lat, lng):
                            continue
                        existing = db.query(Restaurant).filter(Restaurant.name == row['name'], Restaurant.lat == lat, Restaurant.lng == lng).first()
                        if not existing:
                            r = Restaurant(
                                name=row['name'],
                                lat=lat,
                                lng=lng,
                                address=row.get('address', ''),
                                area=row.get('area', ''),
                                cuisine=row.get('cuisine', ''),
                                rating=row.get('rating', ''),
                                source=row.get('source', ''),
                                menu_scraped=False,
                            )
                            db.add(r)
                    except (ValueError, KeyError):
                        continue
            print(f"[Startup] Loaded restaurants from CSV (zone filtered)")
        except Exception as e:
            print(f"[Startup] Could not load restaurants from CSV: {e}")

    restaurants = db.query(Restaurant).all()
    if restaurants:
        unlinked_food_items = db.query(FoodItem).filter(FoodItem.restaurant_id == None).all()
        for item in unlinked_food_items:
            if not item.restaurant_name:
                continue

            item_name = normalize_text(item.restaurant_name)
            best_match = None
            best_score = -1

            for restaurant in restaurants:
                restaurant_name = normalize_text(restaurant.name)
                score = 0

                if restaurant_name == item_name:
                    score += 100
                elif item_name and (item_name in restaurant_name or restaurant_name in item_name):
                    score += 60

                overlap = len(set(item_name.split()) & set(restaurant_name.split()))
                score += overlap * 10

                if item.category and restaurant.cuisine and item.category.value in restaurant.cuisine.lower():
                    score += 5

                if score > best_score:
                    best_score = score
                    best_match = restaurant

            if best_match and best_score >= 20:
                item.restaurant_id = best_match.id
                item.restaurant_name = best_match.name
                if not item.restaurant_area and best_match.area:
                    item.restaurant_area = best_match.area

    db.commit()
    db.close()
    yield


app = FastAPI(
    title="Smart Route API",
    description="Intelligent Delivery Platform with Smart Routing, Safety Monitoring, and QR Privacy",
    version="2.4.1",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(food_items.router)
app.include_router(orders.router)
app.include_router(delivery.router)
app.include_router(routing.router)
app.include_router(qr.router)
app.include_router(safety.router)
app.include_router(admin.router)
app.include_router(restaurants.router)


@app.get("/")
def root():
    return {
        "app": "Smart Route API",
        "version": "2.4.1",
        "docs": "/docs",
    }


@app.get("/health")
def health():
    return {"status": "healthy", "timestamp": datetime.now(timezone.utc).isoformat()}


socket_app = _socketio.ASGIApp(sio, app)
