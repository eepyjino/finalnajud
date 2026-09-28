# DriveEase Car Rental (Supabase + DSA)

The original DriveEase design is unchanged. The fleet now loads from Supabase, reservations are saved to it, and a separate `admin.html` manages everything.

## Files
| File | Purpose |
|---|---|
| index.html, style.css, script.js | Customer website (your design; cards now rendered from the database) |
| admin.html, admin.css, admin.js | Admin login, cars, reservations, queue, stack, DSA guide |
| supabase.js | Configuration + Supabase client |
| dsa.js | All data structures and algorithms |
| supabase.sql | Tables, constraints, indexes, RLS, storage policies, seed cars |

## Setup (5 steps)
1. Create a project at https://supabase.com.
2. **SQL Editor > New query**, paste all of `supabase.sql`, click **Run**. This also creates the `car-images` bucket (public, 2 MB, JPG/PNG/WEBP) and adds your 8 original cars. (Manual alternative: Storage > New bucket > name `car-images` > Public.)
3. **Authentication > Users > Add user**: enter your email and password, tick *Auto Confirm User*. Then in the SQL Editor run:
   `update public.profiles set role = 'admin' where email = 'YOUR_EMAIL';`
4. **Project Settings > API**: copy *Project URL* and the *anon public* key into the top of `supabase.js`:
   `const SUPABASE_URL = "YOUR_SUPABASE_URL";` and `const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";`
   (Never use the service_role key.)
5. Open `index.html` (customers) and `admin.html` (admin). Use VS Code Live Server or any static host.

Optional: Authentication > Providers > Email: disable public sign-ups so nobody else can register.

## Data structures
| Data Structure | Purpose | Where used | Why selected |
|---|---|---|---|
| Array | Store cars/reservations from Supabase | `cars` in script.js and admin.js | Simple, fast index access |
| Queue (FIFO) | Pending reservations in order received | admin.js `reservationQueue`, `loadQueue()`, `processNextReservation()` | First come, first served |
| Stack (LIFO) | Admin action history, undo | admin.js `actionStack`, `logAction()`, `undoLastStatusChange()` | Latest action is read/undone first |
| Binary Search Tree | Cars ordered by name | admin.js `searchCars()` mode "Name prefix (BST)" | Skips branches instead of checking all cars |

## Algorithms
| Algorithm | Purpose | Where used | How it works |
|---|---|---|---|
| Linear Search | Keyword/status search, booking conflict check | script.js `filterCars()`, `submitReservation()`; admin.js `searchCars()` | Checks each item in turn |
| Binary Search | Price range / exact price | script.js `filterCars()`; admin.js price search | Sorted array; halves the range each step (`lowerBound`, `upperBound`) |
| Bubble Sort | Sort cars and reservations | admin.js `renderCars()`, `renderReservations()` | Swaps neighbours until in order |
| Selection Sort | Sort by price before binary search | script.js `filterCars()` | Picks smallest remaining item each pass |
| FIFO Queue Processing | Confirm oldest pending reservation | `processQueueFIFO()` in dsa.js | Dequeue front, handle it, repeat |

## Security
- Supabase Auth handles login; there are no hard-coded passwords.
- Admin status is the `profiles.role` value, checked by `is_admin()` inside RLS policies. Editing the page in the browser cannot bypass it.
- Anonymous visitors can read cars and create *pending* reservations for *available* cars only. They cannot read other people's reservations (they get only booked date ranges through `get_booked_ranges`).
- Storage: anyone can view images; only admins upload, replace or delete.
- Database constraints (CHECK, foreign keys, and an exclusion constraint that blocks overlapping bookings) reject bad data even if the frontend is bypassed.

## How reservations work
1. Customer clicks **Reserve Now**; the modal shows the selected car.
2. The form validates name, email, dates (not in the past, return not before pickup), and car availability.
3. Booked date ranges are fetched and checked with linear search; the database exclusion constraint is the final guard.
4. The reservation is saved as `pending` and enters the admin FIFO queue.
5. Admin confirms the next in queue (or sets any status), and each change is pushed on the action stack (undoable).

## Test checklist
1. Open index.html: same design. 2. Cars appear from Supabase. 3. Admin > Cars > Add Car with image. 4. Refresh customer site: new car shows. 5. Price filter. 6. Reserve a car. 7. Admin > Reservations shows it. 8. Edit a car: change appears on the site. 9. Delete a car: gone from fleet. 10. Not logged in, run `sb.from('cars').delete()` in the browser console: RLS deletes nothing. 11. Search. 12. Sort.

## Presentation script (beginner-friendly)
- **Purpose:** an online car rental where customers browse and reserve cars and an admin manages the fleet.
- **Database:** `cars`, `reservations`, `profiles` tables linked by IDs; images live in Storage, only their URL is in the table.
- **Customer / Admin:** customers see the original site; admins log in to add, edit, delete cars, upload images, and manage reservations.
- **Data structures:** Array holds the records; Queue serves reservations first-come-first-served; Stack remembers admin actions so the newest can be undone; BST finds cars by name quickly.
- **Algorithms:** linear search (check every item), binary search (halve a sorted list), bubble and selection sort (order items), FIFO processing (serve the queue in order).
- **CRUD:** Create (add car/reservation), Read (fleet, tables), Update (edit car, change status), Delete (car, reservation, image).
- **Validation:** required fields, email format, positive price, seats, year, image type/size, dates, double booking, both in JavaScript and in database constraints.
- **Security:** Supabase Auth plus role-based RLS, so only real admins can change data.
