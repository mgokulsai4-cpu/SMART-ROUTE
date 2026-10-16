import math
from itertools import permutations
from dataclasses import dataclass


@dataclass
class StopInfo:
    order_id: int
    order_number: str
    food_name: str
    food_emoji: str
    priority: int
    priority_reason: str | None
    stop_type: str
    lat: float | None
    lng: float | None
    distance_km: float = 0


def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    c = 2 * math.asin(math.sqrt(a))
    return R * c


def optimize_route(
    orders: list[StopInfo],
    start_lat: float,
    start_lng: float,
) -> list[StopInfo]:
    if not orders:
        return []

    loc_known = [stop for stop in orders if stop.lat is not None and stop.lng is not None]
    loc_unknown = [stop for stop in orders if stop.lat is None or stop.lng is None]

    if not loc_known:
        for stop in loc_unknown:
            stop.distance_km = 0
        return sorted(loc_unknown, key=lambda stop: (stop.priority, stop.order_id))

    best_route: tuple[StopInfo, ...] | None = None
    best_key: tuple[tuple[int, ...], float, tuple[int, ...]] | None = None

    for candidate in permutations(loc_known):
        total_km = 0.0
        current_lat, current_lng = start_lat, start_lng

        for stop in candidate:
            total_km += haversine(current_lat, current_lng, stop.lat, stop.lng)
            current_lat, current_lng = stop.lat, stop.lng

        candidate_key = (
            tuple(stop.priority for stop in candidate),
            total_km,
            tuple(stop.order_id for stop in candidate),
        )

        if best_key is None or candidate_key < best_key:
            best_key = candidate_key
            best_route = candidate

    route = list(best_route) if best_route is not None else []

    current_lat, current_lng = start_lat, start_lng
    for stop in route:
        stop.distance_km = round(haversine(current_lat, current_lng, stop.lat, stop.lng), 1)
        current_lat, current_lng = stop.lat, stop.lng

    if loc_unknown:
        trailing = sorted(loc_unknown, key=lambda stop: (stop.priority, stop.order_id))
        for stop in trailing:
            stop.distance_km = 0
        route.extend(trailing)

    return route


def estimate_route_time(total_distance_km: float, avg_speed_kmh: float = 30) -> int:
    return max(15, int((total_distance_km / avg_speed_kmh) * 60 + 10))
