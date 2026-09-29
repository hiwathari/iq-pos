// Excludes visually ambiguous characters (0/O, 1/I) since these codes get read off a printed
// card or a phone screen by hand often enough to matter.
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomSuffix(length: number) {
  let out = "";
  for (let i = 0; i < length; i++) out += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return out;
}

// The restaurant-identifying prefix of a loyalty code: its name's first 2 letters, uppercased
// (padded with "X" for a one-letter or symbol-only name).
export function loyaltyCodePrefix(restaurantName: string) {
  const letters = restaurantName.replace(/[^a-zA-Z]/g, "").toUpperCase();
  return (letters.slice(0, 2) || "XX").padEnd(2, "X");
}

// A 7-character loyalty/ordering code: 2-letter restaurant prefix + 5 random alphanumeric
// characters, e.g. "AL3F9K2".
export function generateLoyaltyCode(restaurantName: string) {
  return `${loyaltyCodePrefix(restaurantName)}${randomSuffix(5)}`;
}
