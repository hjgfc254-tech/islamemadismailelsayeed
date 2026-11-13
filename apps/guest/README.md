# Guest experience

Guests browse through the public Customer entry (`apps/customer/index.html`); there is no separate guest app.
The guest modules decide what a visitor without a demo identity may open **directly** (deep links). Presentation policy only — not authorization.

- `guest-policy.js` → `HSGuestPolicy.decide(route, customer, MP)`: public screens (home, sections, search, account, provider details) always open; `orders` and `tracking` need a signed-in demo customer; `tracking` also needs the request to belong to that customer.
- `guest-entry.js` → `HSGuestEntry.resolve(hash, customer, MP)`: parses with `HSCustomerRouter`, applies the policy, and for a guest returns the account sign-in plus a remembered return link (`sessionStorage` `hs_return_to`, one-shot via `consumeReturn()`).

Both load from the Customer entry after `customer-session.js` / `customer-router.js`. Tests: `tests/unit/customer-routing-session.test.js`.
