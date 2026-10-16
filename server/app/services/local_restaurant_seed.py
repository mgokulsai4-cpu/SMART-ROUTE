from app.models.food_item import FoodCategory, FoodItem
from app.models.restaurant import Restaurant


def seed_local_restaurants(db) -> None:
    curated = [
        {
            "name": "Paradise Biryani",
            "lat": 18.1132,
            "lng": 83.4122,
            "address": "RTC Complex, Vizianagaram",
            "area": "Vizianagaram Zone",
            "cuisine": "Biryani",
            "rating": "4.6",
            "source": "curated",
            "items": [
                {
                    "name": "Chicken Dum Biryani",
                    "description": "Aromatic dum biryani layered with chicken and saffron rice",
                    "price": 299,
                    "category": FoodCategory.BIRYANI,
                    "emoji": "🍗",
                    "tag": "BESTSELLER",
                    "rating": 4.7,
                    "image_url": "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=600&h=420&fit=crop",
                },
                {
                    "name": "Paneer Dum Biryani",
                    "description": "Paneer and basmati rice cooked with house biryani masala",
                    "price": 269,
                    "category": FoodCategory.BIRYANI,
                    "emoji": "🍛",
                    "tag": "VEG",
                    "rating": 4.5,
                    "image_url": "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=600&h=420&fit=crop",
                },
            ],
        },
        {
            "name": "KFC",
            "lat": 18.1095,
            "lng": 83.4008,
            "address": "Fort Road, Vizianagaram",
            "area": "Vizianagaram Zone",
            "cuisine": "Fried Chicken",
            "rating": "4.4",
            "source": "curated",
            "items": [
                {
                    "name": "Zinger Chicken Burger",
                    "description": "Crispy chicken fillet burger with spicy mayo",
                    "price": 259,
                    "category": FoodCategory.BURGERS,
                    "emoji": "🍔",
                    "tag": "HOT",
                    "rating": 4.4,
                    "image_url": "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&h=420&fit=crop",
                },
                {
                    "name": "Popcorn Chicken Rice Bowl",
                    "description": "Crunchy popcorn chicken served over seasoned rice",
                    "price": 239,
                    "category": FoodCategory.BURGERS,
                    "emoji": "🍗",
                    "tag": "CRUNCH",
                    "rating": 4.3,
                    "image_url": "https://images.unsplash.com/photo-1610057099443-fde8c4d50f91?w=600&h=420&fit=crop",
                },
            ],
        },
        {
            "name": "Pizza Hut",
            "lat": 18.1017,
            "lng": 83.3914,
            "address": "Dwarapudi, Vizianagaram",
            "area": "Vizianagaram Zone",
            "cuisine": "Pizza",
            "rating": "4.3",
            "source": "curated",
            "items": [
                {
                    "name": "Veggie Supreme Pizza",
                    "description": "Loaded pizza with capsicum, onion, olives and extra cheese",
                    "price": 329,
                    "category": FoodCategory.PIZZA,
                    "emoji": "🍕",
                    "tag": "TOP",
                    "rating": 4.4,
                    "image_url": "https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=600&h=420&fit=crop",
                },
                {
                    "name": "Chicken Tikka Pizza",
                    "description": "Spicy chicken tikka pizza with onion and bell peppers",
                    "price": 369,
                    "category": FoodCategory.PIZZA,
                    "emoji": "🍕",
                    "tag": "SPICY",
                    "rating": 4.3,
                    "image_url": "https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=600&h=420&fit=crop",
                },
            ],
        },
        {
            "name": "Domino's Pizza",
            "lat": 18.1184,
            "lng": 83.3981,
            "address": "Collector Office Road, Vizianagaram",
            "area": "Vizianagaram Zone",
            "cuisine": "Pizza",
            "rating": "4.2",
            "source": "curated",
            "items": [
                {
                    "name": "Farmhouse Pizza",
                    "description": "Classic farmhouse pizza with tomato, capsicum and onion",
                    "price": 309,
                    "category": FoodCategory.PIZZA,
                    "emoji": "🍕",
                    "tag": "CLASSIC",
                    "rating": 4.2,
                    "image_url": "https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=600&h=420&fit=crop",
                },
                {
                    "name": "Pepper Barbecue Chicken Pizza",
                    "description": "Smoky barbecue chicken pizza with mozzarella",
                    "price": 349,
                    "category": FoodCategory.PIZZA,
                    "emoji": "🍕",
                    "tag": "BBQ",
                    "rating": 4.3,
                    "image_url": "https://images.unsplash.com/photo-1594007654729-407eedc4be65?w=600&h=420&fit=crop",
                },
            ],
        },
        {
            "name": "Burger King",
            "lat": 18.1044,
            "lng": 83.4079,
            "address": "Balaji Junction, Vizianagaram",
            "area": "Vizianagaram Zone",
            "cuisine": "Burgers",
            "rating": "4.3",
            "source": "curated",
            "items": [
                {
                    "name": "Chicken Whopper",
                    "description": "Flame-grilled chicken patty burger with fresh veggies",
                    "price": 279,
                    "category": FoodCategory.BURGERS,
                    "emoji": "🍔",
                    "tag": "KING",
                    "rating": 4.3,
                    "image_url": "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&h=420&fit=crop",
                },
                {
                    "name": "Crispy Veg Burger",
                    "description": "Crunchy veg patty burger with house mayo",
                    "price": 199,
                    "category": FoodCategory.BURGERS,
                    "emoji": "🍔",
                    "tag": "VEG",
                    "rating": 4.1,
                    "image_url": "https://images.unsplash.com/photo-1550547660-d9450f859349?w=600&h=420&fit=crop",
                },
            ],
        },
        {
            "name": "Cream Stone",
            "lat": 18.0978,
            "lng": 83.3865,
            "address": "Ring Road, Vizianagaram",
            "area": "Vizianagaram Zone",
            "cuisine": "Ice Cream",
            "rating": "4.5",
            "source": "curated",
            "items": [
                {
                    "name": "Belgian Waffle Sundae",
                    "description": "Waffle and chocolate ice cream topped with nuts",
                    "price": 209,
                    "category": FoodCategory.ICE_CREAM,
                    "emoji": "🍦",
                    "tag": "PRIORITY",
                    "rating": 4.6,
                    "image_url": "https://images.unsplash.com/photo-1570197571499-166b36435e9f?w=600&h=420&fit=crop",
                },
                {
                    "name": "Mango Madness Sundae",
                    "description": "Mango ice cream layered with jelly and cream",
                    "price": 189,
                    "category": FoodCategory.ICE_CREAM,
                    "emoji": "🍨",
                    "tag": "COOL",
                    "rating": 4.4,
                    "image_url": "https://images.unsplash.com/photo-1497034825429-c343d7c6a68f?w=600&h=420&fit=crop",
                },
            ],
        },
        {
            "name": "Cafe Coffee Day",
            "lat": 18.1118,
            "lng": 83.3872,
            "address": "Pool Bagh, Vizianagaram",
            "area": "Vizianagaram Zone",
            "cuisine": "Cafe",
            "rating": "4.1",
            "source": "curated",
            "items": [
                {
                    "name": "Classic Cappuccino",
                    "description": "Hot cappuccino with a rich foam layer",
                    "price": 119,
                    "category": FoodCategory.DRINKS,
                    "emoji": "☕",
                    "tag": "HOT",
                    "rating": 4.1,
                    "image_url": "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=600&h=420&fit=crop",
                },
                {
                    "name": "Cold Coffee",
                    "description": "Creamy cold coffee with chocolate drizzle",
                    "price": 139,
                    "category": FoodCategory.DRINKS,
                    "emoji": "🥤",
                    "tag": "CHILL",
                    "rating": 4.0,
                    "image_url": "https://images.unsplash.com/photo-1464306076886-da185f6a8f14?w=600&h=420&fit=crop",
                },
            ],
        },
        {
            "name": "Mamagoto",
            "lat": 18.1061,
            "lng": 83.4173,
            "address": "Dasannapeta, Vizianagaram",
            "area": "Vizianagaram Zone",
            "cuisine": "Asian",
            "rating": "4.2",
            "source": "curated",
            "items": [
                {
                    "name": "Chilli Garlic Noodles",
                    "description": "Wok tossed noodles with garlic, chilli and veggies",
                    "price": 229,
                    "category": FoodCategory.NOODLES,
                    "emoji": "🍜",
                    "tag": "SPICY",
                    "rating": 4.2,
                    "image_url": "https://images.unsplash.com/photo-1559314809-0d1550143294?w=600&h=420&fit=crop",
                },
                {
                    "name": "Veg Hakka Noodles",
                    "description": "Classic veg hakka noodles with soy and spring onion",
                    "price": 209,
                    "category": FoodCategory.NOODLES,
                    "emoji": "🍜",
                    "tag": "VEG",
                    "rating": 4.0,
                    "image_url": "https://images.unsplash.com/photo-1617093727343-374698b1b08d?w=600&h=420&fit=crop",
                },
            ],
        },
        {
            "name": "Subway",
            "lat": 18.0994,
            "lng": 83.4019,
            "address": "Three Lanterns Junction, Vizianagaram",
            "area": "Vizianagaram Zone",
            "cuisine": "Sandwich",
            "rating": "4.0",
            "source": "curated",
            "items": [
                {
                    "name": "Veggie Delight Sub",
                    "description": "Fresh veggie sub with herbs and house sauce",
                    "price": 189,
                    "category": FoodCategory.HEALTHY,
                    "emoji": "🥗",
                    "tag": "FRESH",
                    "rating": 4.0,
                    "image_url": "https://images.unsplash.com/photo-1528736235302-52922df5c122?w=600&h=420&fit=crop",
                },
                {
                    "name": "Grilled Chicken Sub",
                    "description": "Multigrain sub with grilled chicken and veggies",
                    "price": 229,
                    "category": FoodCategory.HEALTHY,
                    "emoji": "🥪",
                    "tag": "PROTEIN",
                    "rating": 4.1,
                    "image_url": "https://images.unsplash.com/photo-1621852004158-f3bc188ace2d?w=600&h=420&fit=crop",
                },
            ],
        },
        {
            "name": "Pista House",
            "lat": 18.121,
            "lng": 83.4053,
            "address": "Ayodhya Grounds Road, Vizianagaram",
            "area": "Vizianagaram Zone",
            "cuisine": "Biryani",
            "rating": "4.2",
            "source": "curated",
            "items": [
                {
                    "name": "Mutton Haleem Bowl",
                    "description": "Slow-cooked haleem with tender mutton and ghee",
                    "price": 259,
                    "category": FoodCategory.BIRYANI,
                    "emoji": "🍲",
                    "tag": "SPECIAL",
                    "rating": 4.3,
                    "image_url": "https://images.unsplash.com/photo-1547592166-23ac45744acd?w=600&h=420&fit=crop",
                },
                {
                    "name": "Falooda",
                    "description": "Rose milk dessert drink with basil seeds and ice cream",
                    "price": 149,
                    "category": FoodCategory.DRINKS,
                    "emoji": "🥤",
                    "tag": "SWEET",
                    "rating": 4.1,
                    "image_url": "https://images.unsplash.com/photo-1625944524160-a5dd76f8bde0?w=600&h=420&fit=crop",
                },
            ],
        },
    ]

    for data in curated:
        restaurant = db.query(Restaurant).filter(Restaurant.name == data["name"]).first()
        if not restaurant:
            restaurant = Restaurant(
                name=data["name"],
                lat=data["lat"],
                lng=data["lng"],
                address=data["address"],
                area=data["area"],
                cuisine=data["cuisine"],
                rating=data["rating"],
                source=data["source"],
                menu_scraped=True,
            )
            db.add(restaurant)
            db.flush()
        else:
            restaurant.lat = data["lat"]
            restaurant.lng = data["lng"]
            restaurant.address = data["address"]
            restaurant.area = data["area"]
            restaurant.cuisine = data["cuisine"]
            restaurant.rating = data["rating"]
            restaurant.source = data["source"]
            restaurant.menu_scraped = True

        for item_data in data["items"]:
            existing = (
                db.query(FoodItem)
                .filter(FoodItem.restaurant_id == restaurant.id)
                .filter(FoodItem.name == item_data["name"])
                .first()
            )
            if existing:
                continue

            db.add(
                FoodItem(
                    name=item_data["name"],
                    description=item_data["description"],
                    price=item_data["price"],
                    category=item_data["category"],
                    emoji=item_data["emoji"],
                    tag=item_data["tag"],
                    restaurant_id=restaurant.id,
                    restaurant_name=restaurant.name,
                    restaurant_area=restaurant.area,
                    image_gradient="linear-gradient(135deg,#1a0f00,#2d1800)",
                    rating=item_data["rating"],
                    image_url=item_data["image_url"],
                )
            )
