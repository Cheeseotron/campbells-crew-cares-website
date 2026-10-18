-- Reusable volunteer roles used to prefill every newly created event.
CREATE TABLE IF NOT EXISTS volunteer_role_library (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL COLLATE NOCASE,
  description TEXT NOT NULL DEFAULT '',
  default_shift TEXT NOT NULL DEFAULT '',
  default_capacity INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO volunteer_role_library (id, title, description, default_shift, default_capacity, enabled, sort_order) VALUES
  ('role-library-shopper', 'Shopper', 'Arrive on time so the team can walk you through the event flow. You will shop one-on-one with a child without their parent, help find the correct sizes, then bring the cart to the Garden Center cashier for review and checkout. Shopping is usually about 45 minutes, but please plan for flexibility. Ask an organizer if you have concerns, and choose another role if this one is not a fit.', '6:00 AM – 10:00 AM', 65, 1, 10),
  ('role-library-checkin-cart-checker', 'Check-In / Cart Checker', 'Help welcome and check in families and volunteers, then help review carts before checkout. Compare items with the child’s approved list and kindly address anything that cannot be purchased. This role is best for someone organized, calm, and comfortable having respectful but direct conversations when needed.', '7:00 AM – 10:00 AM', 8, 1, 20),
  ('role-library-checkout-assistant', 'Checkout Assistant', 'Keep the Garden Center checkout area organized and moving. Help shoppers, cart checkers, and cashiers stay coordinated; direct completed carts; and assist with bags, receipts, and the next family in line. Ask an organizer whenever a purchase or process is unclear.', '7:00 AM – 10:00 AM', 10, 1, 30),
  ('role-library-photographer', 'Photographer', 'Capture respectful, positive event moments while protecting each family’s privacy and dignity. Follow organizer direction about photos, avoid interrupting the child’s shopping experience, and check with staff before photographing sensitive or uncertain situations.', '6:00 AM – 9:30 AM', 3, 1, 40),
  ('role-library-floater', 'Floater', 'Be ready to jump in wherever the event needs an extra set of hands. You may help with greeting, directions, supplies, line flow, checkout, or another task assigned by an organizer. Please stay flexible, check in often, and ask when you are ready for your next task.', '5:30 AM – 10:00 AM', 22, 1, 50);
