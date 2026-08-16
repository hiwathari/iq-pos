import type { Category, Dish, Order, Reservation, RestaurantTable } from "./types";

export const categories: Category[] = [
  { id: "breakfast", name: "Breakfast", icon: "breakfast" },
  { id: "beef", name: "Beef Dishes", icon: "beef" },
  { id: "biryani", name: "Biryani", icon: "biryani" },
  { id: "chicken", name: "Chicken Dishes", icon: "chicken" },
  { id: "desserts", name: "Desserts", icon: "dessert" },
  { id: "dinner", name: "Dinner", icon: "dinner" },
  { id: "drinks", name: "Drinks", icon: "drinks" },
  { id: "fastfood", name: "Fast Foods", icon: "fastfood" },
  { id: "lunch", name: "Lunch", icon: "lunch" },
  { id: "platters", name: "Platters", icon: "platters" },
  { id: "salads", name: "Salads", icon: "salads" },
  { id: "side", name: "Side Dishes", icon: "side" },
  { id: "soups", name: "Soups", icon: "soups" },
];

const colors = [
  "#FDE8D7",
  "#DCEEE8",
  "#F6DDE3",
  "#E6E4F7",
  "#FBEAD1",
  "#DCEAF7",
  "#E7F1D8",
  "#F3E0EE",
];

let seed = 1;
function nextColor() {
  return colors[seed++ % colors.length];
}

function make(name: string, categoryId: string, price: number, emoji: string, description?: string): Dish {
  return {
    id: `${categoryId}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    name,
    categoryId,
    price,
    emoji,
    color: nextColor(),
    description,
  };
}

export const dishes: Dish[] = [
  // Breakfast
  make("Belgian Waffles", "breakfast", 12, "🧇"),
  make("Avocado Toast", "breakfast", 9, "🥑"),
  make("Eggs Benedict", "breakfast", 11, "🍳"),
  make("Pancake Stack", "breakfast", 8, "🥞"),
  make("Granola with Yoghurt", "breakfast", 7, "🥣"),
  make("French Omelette", "breakfast", 10, "🍳"),

  // Beef Dishes
  make("Beef Steak", "beef", 30, "🥩"),
  make("Beef Wellington", "beef", 34, "🥩"),
  make("Braised Short Ribs", "beef", 28, "🍖"),
  make("Beef Tacos", "beef", 14, "🌮"),
  make("Peppered Beef Stir Fry", "beef", 18, "🥘"),

  // Biryani
  make("Chicken Biryani", "biryani", 13, "🍛"),
  make("Mutton Biryani", "biryani", 16, "🍛"),
  make("Vegetable Biryani", "biryani", 11, "🍛"),
  make("Prawn Biryani", "biryani", 17, "🍛"),

  // Chicken Dishes
  make("Grilled Chicken Breast", "chicken", 15, "🍗"),
  make("Chicken Parmesan", "chicken", 16, "🍗"),
  make("Butter Chicken", "chicken", 15, "🍛"),
  make("Chicken Fajitas", "chicken", 14, "🌯"),
  make("Honey Glazed Wings", "chicken", 12, "🍗"),
  make("Chicken Caesar Wrap", "chicken", 10, "🌯"),

  // Desserts
  make("Cheese Syrniki Pancakes", "desserts", 8, "🥞"),
  make("Apple Stuffed Pancake", "desserts", 10, "🥞"),
  make("Terracotta Bowl", "desserts", 12, "🍮"),
  make("Croissant Dessert", "desserts", 15, "🥐"),
  make("Granola Banana & Berry", "desserts", 10, "🍓"),
  make("Vanilla Cherry Cupcake", "desserts", 8, "🧁"),
  make("Belgian Waffles Dessert", "desserts", 20, "🧇"),
  make("Granola with Yoghurt", "desserts", 15, "🥣"),
  make("Apple Stuffed Pancake II", "desserts", 8, "🥞"),
  make("Muesli Bowl", "desserts", 10, "🥣"),
  make("Waffles with Ice-cream", "desserts", 10, "🍨"),
  make("Chocolate Lava Cake", "desserts", 9, "🍫"),

  // Dinner
  make("Herb Roasted Chicken", "dinner", 19, "🍗"),
  make("Grilled Salmon Steak", "dinner", 15, "🐟"),
  make("Lamb Chops", "dinner", 26, "🍖"),
  make("Mushroom Risotto", "dinner", 16, "🍚"),
  make("Roast Beef Platter", "dinner", 24, "🥩"),

  // Drinks
  make("Fresh Orange Juice", "drinks", 5, "🍊"),
  make("Iced Latte", "drinks", 6, "☕"),
  make("Mango Smoothie", "drinks", 6, "🥭"),
  make("Sparkling Water", "drinks", 3, "🥤"),
  make("Green Tea", "drinks", 4, "🍵"),
  make("Lemon Mint Cooler", "drinks", 5, "🍹"),
  make("Cold Brew Coffee", "drinks", 6, "🧋"),
  make("Berry Milkshake", "drinks", 7, "🥤"),

  // Fast Foods
  make("Classic Cheeseburger", "fastfood", 11, "🍔"),
  make("Loaded Fries", "fastfood", 7, "🍟"),
  make("Crispy Chicken Sandwich", "fastfood", 10, "🥪"),
  make("Pepperoni Pizza Slice", "fastfood", 6, "🍕"),
  make("Onion Rings", "fastfood", 5, "🧅"),
  make("Hot Dog Combo", "fastfood", 8, "🌭"),
  make("Nachos Supreme", "fastfood", 9, "🧀"),
  make("Chicken Nuggets", "fastfood", 7, "🍗"),
  make("Fish and Chips", "fastfood", 12, "🐟"),
  make("Mozzarella Sticks", "fastfood", 6, "🧀"),

  // Lunch
  make("Grilled Salmon Steak", "lunch", 15, "🐟"),
  make("Tofu Poke Bowl", "lunch", 7, "🥗"),
  make("Pasta with Roast Beef", "lunch", 10, "🍝"),
  make("Beef Steak Lunch", "lunch", 30, "🥩"),
  make("Shrimp Rice Bowl", "lunch", 12, "🍤"),
  make("Vegetable Shrimp", "lunch", 10, "🍤"),
  make("Club Sandwich", "lunch", 9, "🥪"),
  make("Teriyaki Chicken Bowl", "lunch", 13, "🍱"),
  make("Falafel Wrap", "lunch", 8, "🌯"),
  make("Margherita Pizza", "lunch", 12, "🍕"),

  // Platters
  make("Mixed Grill Platter", "platters", 32, "🍖"),
  make("Seafood Platter", "platters", 36, "🦐"),
  make("Mezze Platter", "platters", 20, "🫓"),
  make("BBQ Combo Platter", "platters", 28, "🍖"),
  make("Sushi Platter", "platters", 24, "🍣"),
  make("Cheese & Charcuterie", "platters", 22, "🧀"),
  make("Vegetarian Platter", "platters", 18, "🥗"),

  // Salads
  make("Caesar Salad", "salads", 8, "🥗"),
  make("Greek Salad", "salads", 8, "🥗"),
  make("Quinoa Salad", "salads", 9, "🥗"),
  make("Caprese Salad", "salads", 9, "🍅"),
  make("Garden Salad", "salads", 6, "🥬"),

  // Side Dishes
  make("Garlic Mashed Potatoes", "side", 5, "🥔"),
  make("Steamed Vegetables", "side", 4, "🥦"),
  make("Buttered Corn", "side", 4, "🌽"),
  make("Garlic Bread", "side", 4, "🍞"),

  // Soups
  make("Tomato Basil Soup", "soups", 6, "🍅"),
  make("Chicken Noodle Soup", "soups", 7, "🍜"),
  make("Mushroom Soup", "soups", 6, "🍄"),
];

export function initialTables(): RestaurantTable[] {
  const t: Omit<RestaurantTable, "id">[] = [
    { number: 1, area: "Main Dining", capacity: 6, status: "on-dine", seated: 6, x: 0, y: 0, w: 1, h: 1 },
    { number: 2, area: "Main Dining", capacity: 2, status: "reserved", seated: 2, x: 1, y: 0, w: 1, h: 1 },
    { number: 3, area: "Main Dining", capacity: 2, status: "on-dine", seated: 2, x: 2, y: 0, w: 1, h: 1 },
    { number: 4, area: "Main Dining", capacity: 3, status: "reserved", seated: 3, x: 0, y: 1, w: 1, h: 1 },
    { number: 5, area: "Main Dining", capacity: 4, status: "available", seated: 0, x: 1, y: 1, w: 1, h: 1 },
    { number: 6, area: "Main Dining", capacity: 7, status: "on-dine", seated: 7, x: 2, y: 1, w: 1, h: 1 },
    { number: 7, area: "Main Dining", capacity: 10, status: "on-dine", seated: 10, x: 0, y: 2, w: 1, h: 1 },
    { number: 8, area: "Main Dining", capacity: 2, status: "reserved", seated: 2, x: 1, y: 2, w: 1, h: 1 },
    { number: 9, area: "Main Dining", capacity: 4, status: "reserved", seated: 4, x: 2, y: 2, w: 1, h: 1 },
    { number: 10, area: "Main Dining", capacity: 2, status: "reserved", seated: 2, x: 0, y: 3, w: 1, h: 1 },
    { number: 11, area: "Main Dining", capacity: 2, status: "on-dine", seated: 2, x: 1, y: 3, w: 1, h: 1 },
    { number: 12, area: "Main Dining", capacity: 8, status: "on-dine", seated: 8, x: 2, y: 3, w: 1, h: 1 },
    { number: 13, area: "Terrace", capacity: 4, status: "available", seated: 0, x: 0, y: 0, w: 1, h: 1 },
    { number: 14, area: "Terrace", capacity: 2, status: "available", seated: 0, x: 1, y: 0, w: 1, h: 1 },
    { number: 15, area: "Terrace", capacity: 6, status: "reserved", seated: 6, x: 2, y: 0, w: 1, h: 1 },
    { number: 16, area: "Terrace", capacity: 4, status: "available", seated: 0, x: 0, y: 1, w: 1, h: 1 },
    { number: 17, area: "Outdoor", capacity: 4, status: "available", seated: 0, x: 0, y: 0, w: 1, h: 1 },
    { number: 18, area: "Outdoor", capacity: 6, status: "on-dine", seated: 5, x: 1, y: 0, w: 1, h: 1 },
    { number: 19, area: "Outdoor", capacity: 2, status: "available", seated: 0, x: 2, y: 0, w: 1, h: 1 },
  ];
  return t.map((table, i) => ({ ...table, id: `table-${i + 1}` }));
}

const TODAY = "2026-08-16";
const SEED_BASE_TIME = new Date("2026-08-16T19:00:00").getTime();

export function initialReservations(): Reservation[] {
  const today = TODAY;
  return [
    { id: "r1", customerName: "Uthman ibn Hunaif", phone: "+84 678 890 000", time: "7:30 PM", date: today, tableId: "table-1", tableNumber: 1, guests: 6, status: "paid", meal: "Dinner" },
    { id: "r2", customerName: "Bashir ibn Sa'ad", phone: "+84 233 111 222", time: "6:45 PM", date: today, tableId: "table-4", tableNumber: 4, guests: 2, status: "on-dine", meal: "Dinner" },
    { id: "r3", customerName: "Ali", phone: "+84 342 556 555", time: "8:00 PM", date: today, tableId: "table-3", tableNumber: 3, guests: 2, status: "paid", meal: "Dinner" },
    { id: "r4", customerName: "Khunais ibn Hudhafa", phone: "+84 900 221 331", time: "7:15 PM", date: today, tableId: "table-6", tableNumber: 6, guests: 3, status: "on-dine", meal: "Dinner" },
    { id: "r5", customerName: "Available Now", phone: "", time: "Now", date: today, tableId: "table-5", tableNumber: 5, guests: 0, status: "available", meal: "Dinner" },
    { id: "r6", customerName: "Mus'ab ibn Umayr", phone: "+84 800 563 554", time: "8:25 PM", date: today, tableId: "table-7", tableNumber: 7, guests: 7, status: "unpaid", meal: "Dinner" },
    { id: "r7", customerName: "Shuja ibn Wahb", phone: "+84 711 320 981", time: "9:00 PM", date: today, tableId: "table-9", tableNumber: 9, guests: 4, status: "paid", meal: "Dinner" },
  ];
}

export function initialOrders(): Order[] {
  const now = SEED_BASE_TIME;
  return [
    {
      id: "o1",
      orderNumber: "F0027",
      tableId: "table-3-alt",
      tableNumber: 3,
      guests: 4,
      channel: "Dine in",
      status: "In Kitchen",
      items: [
        { dishId: "fastfood-classic-cheeseburger", name: "Classic Cheeseburger", price: 11, qty: 4 },
        { dishId: "fastfood-loaded-fries", name: "Loaded Fries", price: 7, qty: 4 },
      ],
      createdAt: now - 2 * 60 * 1000,
      createdLabel: "2 mins ago",
    },
    {
      id: "o2",
      orderNumber: "F0028",
      tableId: "table-7-alt",
      tableNumber: 7,
      guests: 2,
      channel: "Wait List",
      status: "Wait List",
      items: [
        { dishId: "lunch-tofu-poke-bowl", name: "Tofu Poke Bowl", price: 7, qty: 3 },
      ],
      createdAt: now,
      createdLabel: "Just now",
    },
    {
      id: "o3",
      orderNumber: "F0019",
      tableId: "table-9",
      tableNumber: 9,
      guests: 2,
      channel: "Dine in",
      status: "Ready",
      items: [
        { dishId: "lunch-shrimp-rice-bowl", name: "Shrimp Rice Bowl", price: 12, qty: 2 },
      ],
      createdAt: now - 25 * 60 * 1000,
      createdLabel: "25 mins ago",
    },
    {
      id: "o4",
      orderNumber: "F0030",
      tableId: "table-4",
      tableNumber: 4,
      guests: 2,
      channel: "Dine in",
      status: "In Kitchen",
      items: [
        { dishId: "lunch-pasta-with-roast-beef", name: "Pasta with Roast Beef", price: 10, qty: 2 },
        { dishId: "lunch-shrimp-rice-bowl", name: "Shrimp Rice Bowl", price: 12, qty: 2 },
        { dishId: "desserts-apple-stuffed-pancake", name: "Apple Stuffed Pancake", price: 35, qty: 1 },
        { dishId: "lunch-vegetable-shrimp", name: "Vegetable Shrimp", price: 10, qty: 1 },
      ],
      createdAt: now - 5 * 60 * 1000,
      createdLabel: "5 mins ago",
      donation: 1,
    },
  ];
}
