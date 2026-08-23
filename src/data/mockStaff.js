/* Mock staff/auth data for the demo. No backend yet — this stands in for
   what a real auth API would later verify server-side. PINs/passwords are
   plain text here deliberately (frontend-only demo); never do this with a
   real backend. */

export const STAFF_USERS = [
  {
    role: "kitchen",
    name: "Kitchen Staff",
    pin: "1234",
    restaurantSlug: "lumiere",
  },
  {
    role: "admin",
    name: "Restaurant Admin",
    username: "admin@pro-order.com",
    password: "password",
    restaurantSlug: "lumiere",
  },
  {
    role: "cashier",
    name: "Cashier Staff",
    username: "cashier@pro-order.com",
    password: "password",
    restaurantSlug: "lumiere",
  },
];

/**
 * Look up a staff user by role + restaurant, then verify the PIN.
 * @param {string} role — e.g. "kitchen"
 * @param {string} restaurantSlug
 * @param {string} pin
 * @returns {object|null} the matching staff user, or null if PIN is wrong
 */
export function verifyStaffPin(role, restaurantSlug, pin) {
  const user = STAFF_USERS.find(
    (u) => u.role === role && u.restaurantSlug === restaurantSlug
  );
  if (!user) return null;
  return user.pin === pin ? user : null;
}

/**
 * Verify username/password credentials for one or more roles (admin/cashier
 * share this login screen — either role can sign in with their own
 * username/password).
 *
 * @param {string|string[]} roleOrRoles — e.g. "admin" or ["admin","cashier"]
 * @param {string} restaurantSlug
 * @param {string} username
 * @param {string} password
 * @returns {object|null} the matching staff user, or null if credentials are wrong
 */
export function verifyStaffCredentials(roleOrRoles, restaurantSlug, username, password) {
  const roles = Array.isArray(roleOrRoles) ? roleOrRoles : [roleOrRoles];
  const user = STAFF_USERS.find(
    (u) =>
      roles.includes(u.role) &&
      u.restaurantSlug === restaurantSlug &&
      u.username === username
  );
  if (!user) return null;
  return user.password === password ? user : null;
}
