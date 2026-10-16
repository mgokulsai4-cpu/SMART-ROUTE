export interface Restaurant {
  id: number;
  name: string;
  lat: number;
  lng: number;
  address: string;
  area: string;
  cuisine: string;
  rating: string;
  source: string;
}

export const restaurants: Restaurant[] = [
  { id: 200001, name: "Paradise Biryani", lat: 18.1132, lng: 83.4122, address: "RTC Complex, Vizianagaram", area: "Vizianagaram Zone", cuisine: "biryani", rating: "4.6", source: "curated" },
  { id: 200002, name: "KFC", lat: 18.1095, lng: 83.4008, address: "Fort Road, Vizianagaram", area: "Vizianagaram Zone", cuisine: "fried_chicken", rating: "4.4", source: "curated" },
  { id: 200003, name: "Pizza Hut", lat: 18.1017, lng: 83.3914, address: "Dwarapudi, Vizianagaram", area: "Vizianagaram Zone", cuisine: "pizza", rating: "4.3", source: "curated" },
  { id: 200004, name: "Domino's Pizza", lat: 18.1184, lng: 83.3981, address: "Collector Office Road, Vizianagaram", area: "Vizianagaram Zone", cuisine: "pizza", rating: "4.2", source: "curated" },
  { id: 200005, name: "Burger King", lat: 18.1044, lng: 83.4079, address: "Balaji Junction, Vizianagaram", area: "Vizianagaram Zone", cuisine: "burgers", rating: "4.3", source: "curated" },
  { id: 200006, name: "Cream Stone", lat: 18.0978, lng: 83.3865, address: "Ring Road, Vizianagaram", area: "Vizianagaram Zone", cuisine: "ice_cream", rating: "4.5", source: "curated" },
  { id: 200007, name: "Cafe Coffee Day", lat: 18.1118, lng: 83.3872, address: "Pool Bagh, Vizianagaram", area: "Vizianagaram Zone", cuisine: "coffee_shop", rating: "4.1", source: "curated" },
  { id: 200008, name: "Mamagoto", lat: 18.1061, lng: 83.4173, address: "Dasannapeta, Vizianagaram", area: "Vizianagaram Zone", cuisine: "asian", rating: "4.2", source: "curated" },
  { id: 200009, name: "Subway", lat: 18.0994, lng: 83.4019, address: "Three Lanterns Junction, Vizianagaram", area: "Vizianagaram Zone", cuisine: "sandwich", rating: "4.0", source: "curated" },
  { id: 200010, name: "Pista House", lat: 18.1210, lng: 83.4053, address: "Ayodhya Grounds Road, Vizianagaram", area: "Vizianagaram Zone", cuisine: "biryani", rating: "4.2", source: "curated" },
];
