// Help Center content. Each item's `steps` are numbered to match the red markers drawn on its
// screenshot (public/help/<image>.webp). Screenshots use a made-up "Demo Café" with generic staff,
// dishes and card machines — no real restaurant appears in them.

export interface FaqItem {
  id: string;
  q: string;
  a: string;
  steps?: string[];
  image?: string;
  // Phone-shaped screenshots render narrower.
  portrait?: boolean;
  tip?: string;
  // Who usually does this — shown as a small badge.
  who?: "Everyone" | "Admin" | "Manager" | "Super Admin";
}

export interface FaqSection {
  id: string;
  title: string;
  intro: string;
  items: FaqItem[];
}

export const FAQ: FaqSection[] = [
  {
    id: "start",
    title: "Getting started",
    intro: "Opening the Till and finding your way around.",
    items: [
      {
        id: "till-login",
        q: "How do I open the Till on a shared tablet?",
        a: "Shared tablets open on a PIN pad, so staff don't need an email or password. Each person has their own PIN, set by the owner in Settings → Team.",
        steps: ["Type your staff PIN on the keypad — the Till opens straight away."],
        image: "till-login",
        tip: "The Kitchen Display has its own PIN screen at /kitchen-login. The same PIN works on both.",
        who: "Everyone",
      },
      {
        id: "till-overview",
        q: "What does each part of the Till screen do?",
        a: "The left side is the menu and the right side is the order you're building. The header and payment area always stay in place — only the dishes and the order list scroll.",
        steps: [
          "Switch screens: Order (menu), Online (customer orders waiting), Tickets (open orders), Tables and History.",
          "Search, then the categories — swipe sideways for more.",
          "Tap anywhere on a dish to add it. Use − and + to change the quantity.",
          "Order type: Dine in, Wait List, Take Away, Delivery, Online or Third Party.",
          "Payment: Cash or any of your card machines.",
          "Today's takings so far — cash, card and the total.",
        ],
        image: "till-overview",
        who: "Everyone",
      },
    ],
  },
  {
    id: "orders",
    title: "Taking orders",
    intro: "Dine-in, takeaway, notes and finding dishes fast.",
    items: [
      {
        id: "table-guests",
        q: "How do I start a dine-in order with a table and number of guests?",
        a: "Pick the order type first, then open the Table & guests row. It stays closed until you need it, so the order list has more room.",
        steps: [
          "Tap Dine in.",
          "Tap Table & guests, then Pick table and choose it on the floor plan.",
          "Set the number of guests with − and +.",
          "Tap Done to close the panel.",
        ],
        image: "table-guests",
        who: "Everyone",
      },
      {
        id: "take-order",
        q: "How do I add dishes and send the order to the kitchen?",
        a: "Tap dishes to add them — tap again to add another. The button at the bottom changes with the situation: Send to Kitchen when you have a kitchen screen or kitchen printer, Place Order when you don't, and Take Payment once a payment is added.",
        steps: ["Tap each dish (or its + button).", "Check the order on the right — change quantities or remove items here.", "Tap Send to Kitchen."],
        image: "take-order",
        who: "Everyone",
      },
      {
        id: "takeaway",
        q: "How do I take a takeaway or delivery order?",
        a: "Choose Take Away (or Delivery). Customer details are optional for takeaway; for delivery add the address too.",
        steps: ["Tap Take Away.", "Tap Add customer to enter a name and phone number, then Done."],
        image: "takeaway",
        who: "Everyone",
      },
      {
        id: "search",
        q: "How do I find a dish quickly?",
        a: "Tap the Search tile at the start of the category row and type any part of the dish name. Results show as you type.",
        steps: ["Type part of the name — e.g. \"burger\".", "Tap ✕ to close search and go back to the categories."],
        image: "search",
        who: "Everyone",
      },
      {
        id: "categories",
        q: "How do I browse by category and mark a dish as sold out?",
        a: "Tap a category to show only those dishes. If the kitchen runs out of something, mark it sold out so nobody can order it — including customers ordering from their phones.",
        steps: [
          "Tap a category. Swipe the row sideways to see more.",
          "A sold-out dish is greyed out and can't be added.",
          "Tap the small ⊘ button on a dish to mark it sold out (tap again when it's back).",
        ],
        image: "categories",
        tip: "The Kitchen Display's Stock button can switch dishes back on too.",
        who: "Everyone",
      },
      {
        id: "notes-custom",
        q: "How do I add a note (like \"no onions\") or something that isn't on the menu?",
        a: "Every line in the order has a note button. Notes print on kitchen tickets and show on the Kitchen Display.",
        steps: [
          "Tap the note button next to the item.",
          "Type the note — it saves as you type.",
          "Tap Custom to add an item that isn't on the menu, with its own name and price.",
        ],
        image: "notes-custom",
        who: "Everyone",
      },
    ],
  },
  {
    id: "payments",
    title: "Payments, discounts & receipts",
    intro: "Taking money, splitting bills and printing receipts.",
    items: [
      {
        id: "payment",
        q: "How do I take payment?",
        a: "Tap how the customer is paying. For cash, enter what they handed you and the Till shows the change.",
        steps: ["Tap Cash (or the card machine they're paying with).", "Enter the cash received — the change appears underneath.", "Tap Take Payment."],
        image: "payment",
        tip: "If a receipt printer is set up, the receipt prints automatically when payment is taken.",
        who: "Everyone",
      },
      {
        id: "split-payment",
        q: "How do I split a bill between cash and card?",
        a: "Tap more than one payment method. Each gets its own amount, and the Till shows what's still left to pay.",
        steps: ["Tap Cash and the card machine.", "Change the cash amount to what's being paid in cash.", "The rest goes on the card — the line at the bottom shows what's left or Fully paid."],
        image: "split-payment",
        who: "Everyone",
      },
      {
        id: "split-bill",
        q: "How do I split the bill between guests?",
        a: "Tap Split next to the total. Split equally between any number of guests (it starts at the table's guest count), or By items — tick what one guest had and take their payment, then the next. Each guest pays right there in the popup by cash or card machine; when the bill is fully paid it closes itself and the order is completed.",
        steps: [
          "Choose Split equally or By items.",
          "For an equal split, set how many guests.",
          "Tap Cash or a card machine for each guest in turn — enter the cash given to see their change.",
          "Close the popup any time; payments already taken stay on the order.",
        ],
        image: "split-bill",
        tip: "Discounts and tax are shared out in proportion, so item shares always add up to the total.",
        who: "Everyone",
      },
      {
        id: "discounts",
        q: "How do I apply a discount, coupon or loyalty card?",
        a: "Tap Offers next to the total. Find the customer's loyalty card by phone, email or card code, type a coupon code, or add an extra discount in £ or %. The Offers button turns green when something's applied.",
        steps: ["Tap Offers next to Total Payable.", "Use the loyalty search, Extra Discount or Coupon box, then Apply.", "Tap Done."],
        image: "discounts",
        tip: "Extra discounts are for managers by default — staff need the \"Till discount\" permission.",
        who: "Everyone",
      },
      {
        id: "receipt-void",
        q: "How do I print a receipt, share it, or cancel an order?",
        a: "Open the order from Tickets. The icons at the top of the order print it or show a QR code the customer can scan to view and download their receipt. Void cancels the order — you'll be asked for a reason.",
        steps: ["Print the ticket or receipt.", "Show a receipt QR code the customer can scan.", "Void (cancel) the order."],
        image: "receipt-void",
        who: "Everyone",
      },
    ],
  },
  {
    id: "managing",
    title: "Open orders & online orders",
    intro: "Finding orders, accepting customer orders and looking back.",
    items: [
      {
        id: "tickets",
        q: "Where do I find open orders and update them?",
        a: "Tickets lists every order that's still open, each with its price. Filter by type, then tap an order to load it back into the right-hand side to add items, take payment or mark it served.",
        steps: ["Tap Tickets.", "Filter: All, Dine in, Wait List, Take Away, Delivery or Served.", "Tap an order to open and edit it."],
        image: "tickets",
        who: "Everyone",
      },
      {
        id: "online-orders",
        q: "How do I accept orders from the website, a table QR code or the kiosk?",
        a: "Customer orders don't go to the kitchen until someone accepts them. The Online button turns red with a count and an alert sounds every 15 seconds until each is handled.",
        steps: [
          "Tap Online when it's red.",
          "Check the items and tap Accept — it goes to the kitchen and into Tickets.",
          "Tap Reject if it's a mistake or a prank. The order is cancelled and the table freed.",
        ],
        image: "online-orders",
        tip: "Tap the Till screen once after opening it each day — browsers only play sounds after a tap.",
        who: "Everyone",
      },
      {
        id: "history",
        q: "Where can I see past orders?",
        a: "History shows completed and cancelled orders, newest first, each with its price. Under the heading you'll see that day's number of orders and their total (voided orders are counted separately and not added in). Pick any day to look back, then tap an order to review or reprint it.",
        steps: ["Tap History.", "Use the arrows or the date box to pick a day — the day's order count and total update.", "Tap an order to review or reprint it."],
        image: "history",
        who: "Everyone",
      },
      {
        id: "sounds",
        q: "How do I change the sound volume?",
        a: "Each sound has its own volume: customer orders, new kitchen tickets and order ready. Volumes are saved on each device, so set them on every tablet.",
        steps: ["Tap the speaker button.", "Drag a slider to set that sound's volume.", "Tap Test to hear it."],
        image: "sounds",
        who: "Everyone",
      },
    ],
  },
  {
    id: "tables",
    title: "Tables & QR ordering",
    intro: "Seeing the floor, freeing tables and letting customers order from their phones.",
    items: [
      {
        id: "tables",
        q: "How do I see which tables are free, and free a table?",
        a: "The Tables view shows every table by colour, with the order and how long it's been occupied. Tap a table to open its order or start a new one.",
        steps: [
          "Colour key: Available, Reserved, On Dine.",
          "Free table — when the customers have left.",
          "Free all tables — e.g. at the end of the night.",
        ],
        image: "tables",
        tip: "If a table still has an unpaid order you'll be asked first. Freeing a table never deletes its order — it stays in Tickets.",
        who: "Everyone",
      },
      {
        id: "move-merge",
        q: "How do I move an order to another table or join two tables?",
        a: "Open the dine-in order from Tickets or Tables, then use the icons at the top of the order.",
        steps: ["Move the order to a different table.", "Merge another table into this order."],
        image: "move-merge",
        who: "Everyone",
      },
      {
        id: "manage-tables",
        q: "How do I add tables and get each table's QR code?",
        a: "Manage Tables is the floor plan for each area. Every table has its own QR button.",
        steps: [
          "Add Table — set its number, area and seats.",
          "The QR button on a table opens its code to download or print.",
          "Table QR Codes shows every table's code at once.",
          "Free all tables.",
        ],
        image: "manage-tables",
        who: "Manager",
      },
      {
        id: "qr-codes",
        q: "How do I print the QR codes for all my tables?",
        a: "Each card shows your restaurant name, the table number and the QR code. The table is locked into the code, so customers can't change it to another table.",
        steps: ["Print / Save all as PDF — one page with every table's card.", "Or download a single table's card as an image."],
        image: "qr-codes",
        tip: "Codes only work once table ordering is switched on for your restaurant. Ask your IQ POS contact if scanning says \"unavailable\".",
        who: "Manager",
      },
      {
        id: "customer-qr",
        q: "What do customers see when they scan a table's QR code?",
        a: "The menu opens straight away on their phone — no app, account or sign-in. Their table is already set.",
        steps: ["The table number is fixed.", "They tap + to add dishes.", "They tap the bar at the bottom to review and check out."],
        image: "customer-qr-menu",
        portrait: true,
        who: "Everyone",
      },
      {
        id: "customer-checkout",
        q: "What happens at checkout for a table QR order?",
        a: "Customers enter their name and an email or phone number, then place the order. It arrives on the Till's Online button for staff to accept, and they pay at the counter.",
        steps: ["Their name.", "Email or phone number — no verification code needed.", "Place Order."],
        image: "customer-qr-checkout",
        portrait: true,
        who: "Everyone",
      },
    ],
  },
  {
    id: "kitchen",
    title: "Kitchen Display",
    intro: "How the kitchen screen works.",
    items: [
      {
        id: "kitchen",
        q: "How does the Kitchen Display work?",
        a: "New orders appear as tickets, oldest first, with a timer that turns amber then red. Tick items off as they're ready; Served unlocks once everything is ticked.",
        steps: [
          "Tick each item as it's ready.",
          "Complete marks everything ready and finishes the ticket in one tap.",
          "Show one station only (e.g. Kitchen) or All.",
          "Stock lists sold-out dishes so you can switch them back on.",
        ],
        image: "kitchen",
        tip: "Use − and + in the corner to make the text bigger or smaller on large screens.",
        who: "Everyone",
      },
    ],
  },
  {
    id: "setup",
    title: "Menu, staff & settings",
    intro: "For owners and managers setting things up.",
    items: [
      {
        id: "manage-dishes",
        q: "How do I add or change dishes and categories?",
        a: "Manage Dishes lists every dish by category. Each dish has a name, price, picture or emoji, and a category that decides which printer or screen it goes to.",
        steps: ["Add a new dish.", "Add a new category.", "The ⋮ menu on a dish lets you edit or delete it."],
        image: "manage-dishes",
        tip: "A category can only be deleted once it has no dishes left — move or delete them first.",
        who: "Admin",
      },
      {
        id: "pricing",
        q: "Can a dish cost more for takeaway or delivery?",
        a: "Yes — Channel Pricing lets you set a different price for each way of ordering. Leave a box empty to use the normal price.",
        steps: ["Type the take-away price (or any other channel's) for that dish."],
        image: "pricing",
        who: "Admin",
      },
      {
        id: "coupons",
        q: "How do I create a coupon code?",
        a: "Coupons are codes staff type at the Till for a percentage or fixed amount off.",
        steps: ["New Coupon — choose % or £ off.", "Staff enter this code under Offers → Coupon on the Till."],
        image: "coupons",
        who: "Admin",
      },
      {
        id: "staff",
        q: "How do I add staff, set their PIN and choose what they can see?",
        a: "Everyone gets their own login and PIN. Staff only see the screens you allow — for example Till and Kitchen, but not Reports.",
        steps: ["Your team, with each person's PIN.", "Add Staff Account. Use Permissions on a staff member to choose their screens, or Regen PIN if they forget theirs."],
        image: "staff",
        tip: "Settings also shows your restaurant's separate, restricted Accounts login (under Accounts Login).",
        who: "Admin",
      },
      {
        id: "business-type",
        q: "What's the difference between Restaurant and Cafe mode?",
        a: "Restaurant keeps the normal flow: send to the kitchen, serve, then pay. Cafe is counter service — an order paid in full at the Till is finished straight away.",
        steps: ["Choose Restaurant or Cafe.", "Shop hours: the opening time is when a new business day starts, for reports and the daily reset."],
        image: "business-type",
        who: "Admin",
      },
      {
        id: "printers",
        q: "How do I add a printer or a kitchen screen?",
        a: "Add each kitchen printer, receipt printer and Kitchen Display screen here. Kitchen buttons and tickets only appear once one of these is added.",
        steps: [
          "Printers & Displays.",
          "Add Printer / Display — choose the station (Kitchen, Bar, Receipt…) and how it connects. For a Network or WiFi printer, type its IP address and it's ready for the Till straight away.",
        ],
        image: "printers",
        who: "Admin",
      },
      {
        id: "printer-setup",
        q: "How do I get receipts printing from the Till?",
        a: "The Till prints straight to a network or WiFi receipt printer. On a Sunmi or Android Till, install the IQ POS Till app from pos.luvder.com/get — printing is built in. If the Till runs in a web browser instead, install the small IQ print bridge on it with one command. Everything you need is under Settings → Printers → Printer setup kit.",
        steps: [
          "Choose the Till's system: Android (Termux), Windows, or Mac / Linux.",
          "Copy the install command and run it on the Till. Android: pkg install -y curl && curl -fsSL https://pos.luvder.com/downloads/install-print-bridge.sh | sh — Windows PowerShell: irm https://pos.luvder.com/downloads/install-print-bridge.ps1 | iex.",
          "Don't know the printer's IP? Run the find command — it lists every printer on the network. The test command prints a test page straight to one.",
          "Open the setup kit on the Till and tap Check this device. Then turn on Use for Till auto-print for the receipt printer and tap Test Print.",
        ],
        image: "printer-setup",
        tip: "Test Print only works on the Till itself — from a laptop it will always say it can't reach the bridge. If the printer's IP keeps changing, reserve a fixed IP for it in your router.",
        who: "Admin",
      },
      {
        id: "printer-setup-admins",
        q: "Can IQ set up our printers for us?",
        a: "Yes. Super Admins and regional admins can add and connect any of their restaurants' printers from Super Admin → Printers, without signing in to the restaurant: pick the restaurant, add the printer with its IP, turn on Till auto-print, and use the same setup kit. Regional admins only see the restaurants assigned to them.",
        who: "Super Admin",
      },
      {
        id: "card-machines",
        q: "How do I add my card machines?",
        a: "Add each card machine by name so staff can pick the right one at payment, and End Day can check each machine's total separately.",
        steps: ["Payment Terminals — add one per card machine."],
        image: "card-machines",
        who: "Admin",
      },
    ],
  },
  {
    id: "day",
    title: "End of day & reports",
    intro: "Opening float, closing the day and checking the numbers.",
    items: [
      {
        id: "dashboard",
        q: "Where can I see how today is going?",
        a: "The Dashboard shows today's sales, open orders, tables in use and cash in the till. Today's Sale counts every order placed today, including ones not paid yet. The Till header's Today figure is money actually taken.",
        steps: ["Today's figures.", "The opening cash float, once declared (Open Till).", "End Day."],
        image: "dashboard",
        who: "Manager",
      },
      {
        id: "end-day",
        q: "How do I close the day?",
        a: "At closing, count the cash and read each card machine's end-of-day total. IQ POS compares what you counted with what it recorded and creates a report you can print or save as a PDF.",
        steps: ["Count the cash in the drawer.", "Type each card machine's total from its end-of-day slip.", "Cash taken out to set aside, if any."],
        image: "end-day",
        who: "Manager",
      },
      {
        id: "end-day-close",
        q: "What happens when I tap Close Day?",
        a: "The day's report opens, showing what was taken (cash + cards, as you counted) against what IQ POS recorded, with any difference. The owner gets a notification if it doesn't balance.",
        steps: ["Close Day & Generate Report."],
        image: "end-day-close",
        who: "Manager",
      },
      {
        id: "reports",
        q: "How do I read the reports?",
        a: "Reports break sales down by day, week, channel, payment method, category and staff member.",
        steps: ["Pick a report.", "Choose the dates — Today, last 7/30/90 days or your own range.", "Print or save as PDF."],
        image: "reports",
        who: "Manager",
      },
    ],
  },
  {
    id: "help",
    title: "Troubleshooting",
    intro: "Quick fixes for common problems.",
    items: [
      {
        id: "no-sound",
        q: "The Till or Kitchen Display isn't making any sound.",
        a: "Tap the screen once after opening it — browsers block sound until the page has been tapped. Then check the speaker button's volumes and the tablet's own volume.",
      },
      {
        id: "orders-missing",
        q: "A customer says they ordered but I can't see it.",
        a: "Check the red Online button on the Till — customer orders wait there until accepted. The Till checks for new orders every 10 seconds; tap the refresh button to check now.",
      },
      {
        id: "qr-unavailable",
        q: "Scanning a table QR code says ordering is unavailable.",
        a: "Online and table QR ordering are switched off for your restaurant. Ask your IQ POS contact to turn them on. Printed codes don't change, so there's no need to reprint.",
      },
      {
        id: "forgot-pin",
        q: "A staff member forgot their PIN.",
        a: "An admin can give them a new one in Settings → Team → Regen PIN.",
      },
      {
        id: "printer",
        q: "The receipt didn't print.",
        a: "Check the printer is switched on, has paper and is on the same Wi-Fi as the Till. In Settings → Printers & Displays, make sure it's active and set as the Till's receipt printer. You can always reprint from the order's print button.",
      },
      {
        id: "end-day-difference",
        q: "End Day shows a difference between counted and expected.",
        a: "The report lists cash and each card machine separately so you can see which one is out. Common causes: a payment taken on the wrong card machine, cash paid out without being entered as an expense, or an order not marked as paid.",
      },
    ],
  },
];
