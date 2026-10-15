/* ================= PRICE SETTINGS (now calculated from the database) ================= */

let FLEET_MIN_PRICE = 0;
let FLEET_MAX_PRICE = 0;

// DATA STRUCTURE: ARRAY
// PURPOSE: Stores the car records retrieved from Supabase
let cars = [];
let selectedCarId = null;
let selectedDetailsCarId = null;
let dateSearch = null;
let currentCustomer = null;
let accountMode = "login";
let accountReservations = [];
let accountFilter = "all";
let accountRequestId = 0;


/* ================= CUSTOMER ACCOUNT ================= */

function openAccountDialog() {
    const dialog = document.getElementById("accountDialog");
    updateAccountDialog();
    dialog.showModal();
    if (currentCustomer) loadCustomerReservations();
}

function closeAccountDialog() {
    document.getElementById("accountDialog").close();
}

function toggleAccountMode() {
    accountMode = accountMode === "login" ? "signup" : "login";
    const registering = accountMode === "signup";
    document.getElementById("accountTitle").textContent = registering ? "Create your account" : "Sign in";
    document.getElementById("accountNameGroup").hidden = !registering;
    document.getElementById("accountName").required = registering;
    document.getElementById("accountPassword").autocomplete = registering ? "new-password" : "current-password";
    document.getElementById("accountSubmit").textContent = registering ? "Create account" : "Sign in";
    document.getElementById("accountModeToggle").textContent = registering ? "Already have an account? Sign in" : "Create an account";
    document.getElementById("accountMessage").textContent = "";
}

function updateCustomerAccount(user) {
    currentCustomer = user;
    const button = document.getElementById("accountButton");
    if (!button) return;
    button.textContent = user ? "My account" : "Sign in";
    button.setAttribute("aria-label", user ? "Open account for " + user.email : "Sign in or create an account");
    button.title = user ? user.email : "Sign in or create an account";

    const nameInput = document.getElementById("customerName");
    const emailInput = document.getElementById("customerEmail");
    if (user) {
        if (nameInput && !nameInput.value) nameInput.value = user.user_metadata.full_name || "";
        if (emailInput && !emailInput.value) emailInput.value = user.email || "";
    }
    if (document.getElementById("accountDialog").open) updateAccountDialog();
}

function updateAccountDialog() {
    const signedIn = !!currentCustomer;
    document.getElementById("accountForm").hidden = signedIn;
    document.getElementById("accountIdentity").hidden = !signedIn;
    document.getElementById("accountIdentity").textContent = signedIn ? "Signed in as " + currentCustomer.email : "";
    document.getElementById("accountDashboard").hidden = !signedIn;
    document.getElementById("accountModeToggle").hidden = signedIn;
    document.getElementById("accountSignout").hidden = !signedIn;
    document.getElementById("accountTitle").textContent = signedIn ? "Your account" : accountMode === "signup" ? "Create your account" : "Sign in";
}

function formatAccountDate(value) {
    return new Date(value + "T00:00:00").toLocaleDateString(undefined, {
        month: "short", day: "numeric", year: "numeric"
    });
}

function reservationDays(reservation) {
    return Math.round((new Date(reservation.return_date) - new Date(reservation.pickup_date)) / 86400000) + 1;
}

async function loadCustomerReservations() {
    const list = document.getElementById("accountBookings");
    const userId = currentCustomer && currentCustomer.id;
    if (!userId) return;

    const requestId = ++accountRequestId;
    list.innerHTML = '<p class="account-bookings-message">Loading your bookings...</p>';
    const { data, error } = await sb.from("reservations")
        .select("id, pickup_date, return_date, status, created_at, cars(name, price_per_day)")
        .eq("customer_id", userId)
        .order("created_at", { ascending: false });

    if (requestId !== accountRequestId || !currentCustomer || currentCustomer.id !== userId) return;
    if (error) {
        list.innerHTML = '<p class="account-bookings-message">Could not load bookings. Please try again.</p>';
        console.error(error);
        return;
    }

    accountReservations = data || [];
    renderCustomerAccount();
}

function setAccountFilter(filter, button) {
    accountFilter = filter;
    document.querySelectorAll(".account-filters button").forEach(function (item) {
        item.setAttribute("aria-pressed", String(item === button));
    });
    renderCustomerAccount();
}

function renderCustomerAccount() {
    const today = new Date().toISOString().split("T")[0];
    const activeReservations = accountReservations.filter(function (reservation) {
        return reservation.status !== "cancelled";
    });
    const upcoming = activeReservations.filter(function (reservation) {
        return reservation.return_date >= today && ["pending", "confirmed"].includes(reservation.status);
    });
    const estimatedValue = activeReservations.reduce(function (total, reservation) {
        const car = reservation.cars;
        return total + (car ? Number(car.price_per_day) * reservationDays(reservation) : 0);
    }, 0);

    document.getElementById("accountBookingCount").textContent = String(accountReservations.length);
    document.getElementById("accountUpcomingCount").textContent = String(upcoming.length);
    document.getElementById("accountRentalValue").textContent = peso(estimatedValue);

    const filtered = accountReservations.filter(function (reservation) {
        if (accountFilter === "cancelled") return reservation.status === "cancelled";
        if (accountFilter === "upcoming") return upcoming.includes(reservation);
        if (accountFilter === "past") return reservation.return_date < today || reservation.status === "completed";
        return true;
    });
    const list = document.getElementById("accountBookings");
    if (!filtered.length) {
        const emptyMessage = accountReservations.length
            ? "No bookings match this filter."
            : "No bookings yet. Choose a car from the fleet to make your first reservation.";
        list.innerHTML = '<p class="account-bookings-message">' + emptyMessage + '</p>';
        return;
    }

    list.innerHTML = filtered.map(function (reservation) {
        const car = reservation.cars;
        const carName = car ? car.name : "Car listing unavailable";
        const estimate = car ? peso(Number(car.price_per_day) * reservationDays(reservation)) : "Unavailable";
        const status = reservation.status.charAt(0).toUpperCase() + reservation.status.slice(1);
        const canCancel = reservation.status === "pending";
        return '<article class="account-booking" role="listitem">' +
            '<div class="account-booking-top"><div><h4>' + esc(carName) + '</h4>' +
            '<span>Requested ' + formatAccountDate(reservation.created_at.slice(0, 10)) + '</span></div>' +
            '<span class="account-booking-status status-' + esc(reservation.status) + '">' + esc(status) + '</span></div>' +
            '<div class="account-booking-details"><span>' + formatAccountDate(reservation.pickup_date) + ' - ' + formatAccountDate(reservation.return_date) + '</span>' +
            '<strong>' + estimate + '</strong></div>' +
            (canCancel ? '<button class="account-cancel-booking" type="button" onclick="cancelCustomerReservation(\'' + reservation.id + '\')">Cancel pending booking</button>' : '') +
            '</article>';
    }).join("");
}

async function cancelCustomerReservation(reservationId) {
    if (!confirm("Cancel this pending booking?")) return;
    const message = document.getElementById("accountMessage");
    message.textContent = "Cancelling booking...";
    const { data, error } = await sb.rpc("cancel_my_reservation", { p_reservation_id: reservationId });
    if (error) {
        message.textContent = error.message || "Could not cancel this booking.";
        return;
    }
    if (!data) {
        message.textContent = "This booking can no longer be cancelled.";
        await loadCustomerReservations();
        return;
    }
    message.textContent = "Booking cancelled.";
    await loadCustomerReservations();
}

async function submitAccountForm(event) {
    event.preventDefault();
    const email = document.getElementById("accountEmail").value.trim();
    const password = document.getElementById("accountPassword").value;
    const name = document.getElementById("accountName").value.trim();
    const message = document.getElementById("accountMessage");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
        message.textContent = "Enter a valid email address.";
        return;
    }
    if (password.length < 8) {
        message.textContent = "Password must be at least 8 characters.";
        return;
    }
    if (accountMode === "signup" && name.length < 2) {
        message.textContent = "Enter your full name.";
        return;
    }

    const submit = document.getElementById("accountSubmit");
    submit.disabled = true;
    message.textContent = "";
    try {
        if (accountMode === "signup") {
            const { data, error } = await sb.auth.signUp({
                email,
                password,
                options: {
                    data: { full_name: name },
                    emailRedirectTo: window.location.origin + window.location.pathname
                }
            });
            if (error) throw error;
            if (data.session) {
                updateCustomerAccount(data.user);
                message.textContent = "Your account is ready. You can now reserve cars.";
                loadCustomerReservations();
            } else {
                message.textContent = "Check your email to confirm your account, then sign in.";
            }
        } else {
            const { data, error } = await sb.auth.signInWithPassword({ email, password });
            if (error) throw error;
            updateCustomerAccount(data.user);
            message.textContent = "You are signed in. Your reservations will be linked to your account.";
            loadCustomerReservations();
        }
    } catch (error) {
        message.textContent = error.message || "Account request failed. Please try again.";
    } finally {
        submit.disabled = false;
    }
}

async function signOutCustomer() {
    const { error } = await sb.auth.signOut();
    if (error) {
        document.getElementById("accountMessage").textContent = "Sign out failed. Please try again.";
        return;
    }
    closeAccountDialog();
}


/* ================= CURRENCY ================= */

function peso(value) {
    return "₱" + Number(value).toLocaleString("en-PH");
}

function esc(text) {
    const d = document.createElement("div");
    d.textContent = text == null ? "" : String(text);
    return d.innerHTML;
}


/* ================= LOAD CARS FROM SUPABASE ================= */

async function loadCars() {
    const grid = document.getElementById("carGrid");
    const { data, error } = await sb.from("cars").select("*").order("created_at", { ascending: true });

    if (error) {
        grid.innerHTML = '<p class="loading-cars">Could not load cars. Check supabase.js settings.</p>';
        console.error(error);
        return;
    }

    cars = data;   // ARRAY of car records

    if (cars.length) {
        const prices = cars.map(function (c) { return Number(c.price_per_day); });
        FLEET_MIN_PRICE = Math.min.apply(null, prices);
        FLEET_MAX_PRICE = Math.max.apply(null, prices);
        document.getElementById("minPrice").placeholder = peso(FLEET_MIN_PRICE);
        document.getElementById("maxPrice").placeholder = peso(FLEET_MAX_PRICE);
    }

    renderCars(cars);
}


/* ================= RENDER CARS (same card design as before) ================= */

function renderCars(list) {
    const grid = document.getElementById("carGrid");
    const noCars = document.getElementById("noCars");

    grid.innerHTML = list.map(function (car, i) {
        const image = car.image_url
            ? '<img src="' + esc(car.image_url) + '" alt="' + esc(car.name) + '">'
            : '<div class="image-placeholder"><div class="placeholder-content">' +
              '<p>CAR IMAGE</p><small>No image uploaded</small></div></div>';

        const ok = car.status === "available";

        return '<div class="car-card" data-price="' + Number(car.price_per_day) + '">' +
            '<div class="car-image">' + image + '</div>' +
            '<div class="car-info">' +
            '<div class="car-name"><h3>' + esc(car.name) + '</h3><span>' + peso(car.price_per_day) + ' / day</span></div>' +
            '<p class="car-description">' + esc(car.description || "") + '</p>' +
            '<div class="car-details"><span>' + car.seats + ' Seats</span><span>' + esc(car.transmission) +
            '</span><span>' + esc(car.fuel_type) + '</span></div>' +
            '<span class="car-status ' + (ok ? "" : "not-available") + '">' + (ok ? "Available" : esc(car.status)) + '</span>' +
            '<div class="car-actions"><button class="view-details-btn" onclick="openCarDetails(\'' + car.id + '\')">View details</button>' +
            '<button class="rent-btn" ' + (ok ? "" : "disabled") + ' onclick="openReservation(\'' + car.id + '\')">' +
            (ok ? "Reserve Now" : "Not Available") + '</button></div>' +
            '</div></div>';
    }).join("");

    noCars.style.display = list.length === 0 && cars.length ? "block" : "none";
}


/* ================= CAR DETAILS ================= */

function openCarDetails(carId) {
    const car = linearSearch(cars, function (item) { return item.id === carId; })[0];
    if (!car) return;
    selectedDetailsCarId = car.id;

    document.getElementById("detailsTitle").textContent = car.name;
    document.getElementById("detailsPrice").textContent = peso(car.price_per_day) + " / day";
    document.getElementById("detailsDescription").textContent = car.description || "No additional description is available yet.";
    document.getElementById("detailsGallery").innerHTML = [
        { label: "Exterior", url: car.image_url },
        { label: "Interior", url: car.interior_image_url }
    ].map(function (photo) {
        const image = photo.url
            ? '<img src="' + esc(photo.url) + '" alt="' + esc(car.name + " " + photo.label.toLowerCase()) + '" loading="lazy">'
            : '<div class="detail-image-placeholder">' + photo.label + ' photo not uploaded</div>';
        return '<figure>' + image + '<figcaption>' + photo.label + '</figcaption></figure>';
    }).join("");

    const specs = [
        ["Brand", car.brand], ["Model", car.model], ["Year", car.year],
        ["Seats", car.seats], ["Transmission", car.transmission],
        ["Fuel type", car.fuel_type], ["Engine", car.engine || "Not provided"],
        ["Drivetrain", car.drivetrain || "Not provided"], ["Tire size", car.tire_size || "Not provided"],
        ["Availability", car.status]
    ];
    document.getElementById("detailsSpecs").innerHTML = specs.map(function (spec) {
        return "<div><dt>" + esc(spec[0]) + "</dt><dd>" + esc(spec[1]) + "</dd></div>";
    }).join("");

    const reserveButton = document.getElementById("detailsReserveButton");
    reserveButton.disabled = car.status !== "available";
    reserveButton.textContent = car.status === "available" ? "Reserve this car" : "Not available";
    document.getElementById("carDetailsDialog").showModal();
    document.body.classList.add("modal-open");
}

function closeCarDetails() {
    const dialog = document.getElementById("carDetailsDialog");
    if (dialog.open) dialog.close();
}

function reserveFromDetails() {
    const carId = selectedDetailsCarId;
    closeCarDetails();
    if (carId) openReservation(carId);
}


/* ================= RESERVATION ================= */

function openReservation(carId) {

    // ALGORITHM: LINEAR SEARCH - find the selected car in the cars array
    const car = linearSearch(cars, function (c) { return c.id === carId; })[0];
    if (!car || car.status !== "available") {
        alert("This car is not available for reservation.");
        return;
    }
    selectedCarId = car.id;

    const modal = document.getElementById("reservationModal");
    const form = document.getElementById("reservationForm");
    form.reset();
    if (currentCustomer) {
        document.getElementById("customerName").value = currentCustomer.user_metadata.full_name || "";
        document.getElementById("customerEmail").value = currentCustomer.email || "";
    }
    showFormError("");
    goReservationStep(1, false);

    document.getElementById("selectedCar").textContent = car.name;
    document.getElementById("selectedPrice").textContent = peso(car.price_per_day) + " / day";
    document.getElementById("selectedCarMeta").textContent = [car.year, car.seats + " seats", car.transmission].filter(Boolean).join(" · ");
    document.getElementById("summaryCarName").textContent = car.name;
    document.getElementById("summaryDailyRate").textContent = peso(car.price_per_day) + " / day";
    const carImage = document.getElementById("selectedCarImage");
    carImage.hidden = !car.image_url;
    carImage.src = car.image_url || "";
    carImage.alt = car.image_url ? car.name : "";
    const today = new Date().toISOString().split("T")[0];
    document.getElementById("pickupDate").min = today;
    document.getElementById("returnDate").min = today;
    if (dateSearch) {
        document.getElementById("pickupDate").value = dateSearch.pickup;
        document.getElementById("returnDate").value = dateSearch.returnDate;
        document.getElementById("returnDate").min = dateSearch.pickup;
    }
    updateReservationEstimate();

    modal.classList.add("show");

    document.body.classList.add("modal-open");
}


function closeReservation() {

    const modal = document.getElementById("reservationModal");

    modal.classList.remove("show");

    document.body.classList.remove("modal-open");
}

function goReservationStep(step, focusField) {
    const pickup = document.getElementById("pickupDate").value;
    const returnDate = document.getElementById("returnDate").value;
    if (step === 2) {
        if (!pickup || !returnDate) return showFormError("Choose both pick-up and return dates to continue.");
        if (returnDate < pickup) return showFormError("Return date cannot be earlier than pick-up date.");
        showFormError("");
        updateReservationEstimate();
    }

    document.querySelectorAll(".booking-step").forEach(function (section, index) {
        section.hidden = index + 1 !== step;
    });
    document.querySelectorAll(".booking-progress li").forEach(function (item, index) {
        const current = index + 1 === step;
        item.classList.toggle("current", current);
        item.classList.toggle("complete", index + 1 < step);
        if (current) item.setAttribute("aria-current", "step");
        else item.removeAttribute("aria-current");
    });

    if (focusField !== false) {
        const target = step === 1 ? "pickupDate" : step === 2 ? "customerName" : "reservationSubmit";
        document.getElementById(target).focus();
    }
}

function updateReservationEstimate() {
    const car = cars.find(function (item) { return item.id === selectedCarId; });
    const pickup = document.getElementById("pickupDate").value;
    const returnDate = document.getElementById("returnDate").value;
    if (!car || !pickup || !returnDate || returnDate < pickup) {
        document.getElementById("summaryRentalDays").textContent = "Choose dates";
        document.getElementById("reservationTotal").textContent = peso(0);
        return;
    }

    const days = Math.round((new Date(returnDate) - new Date(pickup)) / 86400000) + 1;
    document.getElementById("summaryRentalDays").textContent = days + (days === 1 ? " day" : " days");
    document.getElementById("reservationTotal").textContent = peso(days * Number(car.price_per_day));
}

function finishReservation() {
    closeReservation();
    document.getElementById("reservationForm").reset();
    selectedCarId = null;
    goReservationStep(1, false);
}

function showFormError(msg) {
    const box = document.getElementById("formError");
    box.textContent = msg;
    box.classList.toggle("show", !!msg);
}


/* ================= PRICE FILTER + SEARCH ================= */

function filterCars() {

    const minInput = document.getElementById("minPrice");
    const maxInput = document.getElementById("maxPrice");
    const term = document.getElementById("carSearch").value.trim().toLowerCase();

    let minPrice = Number(minInput.value);
    let maxPrice = Number(maxInput.value);

    if (minInput.value !== "" && (isNaN(minPrice) || minPrice < 0)) {
        alert("Please enter a valid lowest price.");
        return;
    }
    if (maxInput.value !== "" && (isNaN(maxPrice) || maxPrice < 0)) {
        alert("Please enter a valid highest price.");
        return;
    }

    if (!minInput.value) {
        minPrice = FLEET_MIN_PRICE;
    }

    if (!maxInput.value) {
        maxPrice = FLEET_MAX_PRICE;
    }

    if (minPrice > maxPrice) {
        alert("Lowest price cannot be higher than highest price.");
        return;
    }

    // ALGORITHM: SELECTION SORT - sort cars by price (needed for binary search)
    const filteredCars = dateSearch
        ? cars.filter(function (car) { return dateSearch.carIds.includes(car.id); })
        : cars;
    const byPrice = selectionSort(filteredCars, function (a, b) { return a.price_per_day - b.price_per_day; });

    // ALGORITHM: BINARY SEARCH - find the price range without scanning every car
    let result = binarySearchRange(byPrice, minPrice, maxPrice, function (c) { return Number(c.price_per_day); });

    // ALGORITHM: LINEAR SEARCH - keyword search on name, brand, model
    if (term) {
        result = linearSearch(result, function (c) {
            return [c.name, c.brand, c.model].join(" ").toLowerCase().indexOf(term) !== -1;
        });
    }

    renderCars(result);
}


/* ================= CLEAR FILTER ================= */

function clearCarFilter() {

    document.getElementById("minPrice").value = "";

    document.getElementById("maxPrice").value = "";

    document.getElementById("carSearch").value = "";
    document.getElementById("searchPickupDate").value = "";
    document.getElementById("searchReturnDate").value = "";
    document.getElementById("rentalSearchMessage").textContent = "";
    dateSearch = null;

    renderCars(cars);
}


/* ================= HERO DATE SEARCH ================= */

async function searchFleetByDates(event) {
    event.preventDefault();
    const pickup = document.getElementById("searchPickupDate").value;
    const returnDate = document.getElementById("searchReturnDate").value;
    const message = document.getElementById("rentalSearchMessage");
    const button = event.currentTarget.querySelector("button[type='submit']");
    const today = new Date().toISOString().split("T")[0];

    if (!pickup || !returnDate) {
        message.textContent = "Choose both pick-up and return dates.";
        return;
    }
    if (pickup < today) {
        message.textContent = "Pick-up date cannot be in the past.";
        return;
    }
    if (returnDate < pickup) {
        message.textContent = "Return date must be on or after pick-up.";
        return;
    }
    if (!cars.length) {
        message.textContent = "The fleet is still loading. Please try again in a moment.";
        return;
    }

    button.disabled = true;
    button.innerHTML = '<i class="ti ti-loader-2" aria-hidden="true"></i> Checking';
    message.textContent = "Checking cars for your dates...";
    try {
        const candidates = cars.filter(function (car) { return car.status === "available"; });
        const checks = await Promise.all(candidates.map(async function (car) {
            const result = await sb.rpc("get_booked_ranges", { p_car: car.id });
            if (result.error) throw result.error;
            const conflicts = linearSearch(result.data, function (range) {
                return pickup <= range.return_date && returnDate >= range.pickup_date;
            });
            return conflicts.length ? null : car;
        }));
        const availableCars = checks.filter(Boolean);
        dateSearch = { pickup, returnDate, carIds: availableCars.map(function (car) { return car.id; }) };
        document.getElementById("noCars").textContent = "No cars are available for those dates. Try another date range.";
        message.textContent = availableCars.length
            ? availableCars.length + (availableCars.length === 1 ? " car is" : " cars are") + " available for your dates."
            : "No cars are available for those dates. Try another date range.";
        renderCars(availableCars);
        document.getElementById("fleet").scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
        dateSearch = null;
        message.textContent = "We couldn’t check those dates. Please try again.";
        console.error(error);
    } finally {
        button.disabled = false;
        button.innerHTML = '<i class="ti ti-search" aria-hidden="true"></i> Search cars';
    }
}


/* ================= SUPPORT CHAT ================= */

function appendChatMessage(text, sender) {
    const messages = document.getElementById("supportChatMessages");
    const message = document.createElement("p");
    message.className = "chat-message " + (sender === "user" ? "user-message" : "bot-message");
    message.textContent = text;
    messages.appendChild(message);
    messages.scrollTop = messages.scrollHeight;
}

function getChatReply(question) {
    const query = question.toLowerCase().replace(/\s+/g, " ").trim();
    const matchedCar = cars.slice().sort(function (first, second) {
        return String(second.name || "").length - String(first.name || "").length;
    }).find(function (car) {
        return String(car.name || "").trim() && query.includes(String(car.name).toLowerCase());
    });
    const durationMatch = query.match(/\b(\d+)\s*(?:days?|nights?)\b/);
    const duration = durationMatch ? Number(durationMatch[1]) : 0;

    if (/\b(hi|hello|hey|good morning|good afternoon|good evening)\b/.test(query)) {
        return "Hello! Welcome to Abante Rentals. I can look up the live fleet and daily rates, estimate a multi-day rental, compare cars, or walk you through a reservation. What are you planning?";
    }

    if (/\b(compare|comparison|cheapest|cheaper|lowest|budget|affordable|price range)\b/.test(query)) {
        if (!cars.length) return "The fleet is still loading. Please try again in a moment.";
        const sortedCars = cars.slice().sort(function (first, second) {
            return Number(first.price_per_day) - Number(second.price_per_day);
        });
        return "Here is the fleet ordered by listed daily rate, lowest first:\n" + sortedCars.map(function (car) {
            return car.name + " - " + peso(car.price_per_day) + "/day, " + (car.seats || "seat count not listed") + " seats, " + (car.status === "available" ? "currently listed as available" : car.status);
        }).join("\n") + "\nRates are daily estimates. Enter your dates in the booking form to see an estimated total; the team confirms availability and the final amount.";
    }

    if (/\b(cancel|cancellation|refund|deposit|insurance|coverage|license|licence|driver age|minimum age|mileage|kilomet)\b/.test(query)) {
        return "I don't have a confirmed policy for that detail, so I don't want to guess. Please contact the rental team at 0912 345 6789 or abanterentals@email.com; they can confirm the current terms before you book.";
    }

    if (/\b(payment|pay|card|cash)\b/.test(query)) {
        return "No payment is collected online when you submit a reservation request. The request stays pending until the rental team confirms it. For accepted payment methods or payment timing, please call 0912 345 6789 or email abanterentals@email.com.";
    }

    if (/\b(book|booking|reserve|reservation)\b/.test(query)) {
        return "To request a booking:\n1. Choose a car marked available and select Reserve Now.\n2. Enter your pickup and return dates, then your name and email.\n3. Review the rental-day count and estimated total, then submit.\nYour request is sent as pending; it is not confirmed until the rental team approves it. No payment is collected online during the request.";
    }

    if (matchedCar) {
        const details = [
            matchedCar.name + " | " + peso(matchedCar.price_per_day) + " per day",
            "Fleet status: " + (matchedCar.status === "available" ? "Currently listed as available" : matchedCar.status),
            "Year: " + (matchedCar.year || "Not provided") + " | Seats: " + (matchedCar.seats || "Not provided"),
            "Engine: " + (matchedCar.engine || "Not provided"),
            "Transmission: " + (matchedCar.transmission || "Not provided") + " | Fuel: " + (matchedCar.fuel_type || "Not provided"),
            "Drivetrain: " + (matchedCar.drivetrain || "Not provided") + " | Tire size: " + (matchedCar.tire_size || "Not provided"),
            matchedCar.description || "Ask us if you need more information about this car."
        ];
        if (duration > 0 && /\b(price|cost|total|rate|rent|much|estimate|budget)\b/.test(query)) {
            details.splice(1, 0, "Estimated " + duration + "-day total: " + peso(Number(matchedCar.price_per_day) * duration) + " based on the listed daily rate. Exact dates may change the rental-day count; the booking form shows the estimate and the rental team confirms the final amount.");
        }
        details.push("For date-specific availability, choose Reserve Now and enter your pickup and return dates.");
        return details.join("\n");
    }

    if (/\b(location|address|where|visit|find us)\b/.test(query)) {
        return "Abante Rentals is at Central Philippines State University, Main Campus, San Carlos City, Negros Occidental, Philippines. Call 0912 345 6789 if you need directions before visiting.";
    }

    if (/\b(hours|open|opening|business hours|time)\b/.test(query)) {
        return "Business hours are Monday-Friday, 8 AM-6 PM, and Saturday, 9 AM-4 PM. We are closed Sunday. Messages received during business hours are typically answered within 2 hours.";
    }

    if (/\b(contact|phone|call|email|reach|talk to|human|person|agent)\b/.test(query)) {
        return "You can call us at 0912 345 6789 or email abanterentals@email.com. We typically respond within 2 hours during business hours: Monday-Friday, 8 AM-6 PM; Saturday, 9 AM-4 PM.";
    }

    if (/\b(about|who are you|your shop|your company|what do you do)\b/.test(query)) {
        return "Abante Rentals helps customers compare local vehicles and request rentals for city trips, family travel, and weekends. Each listing shows its daily rate and available vehicle details. You can submit a reservation online, then the rental team reviews and confirms it.";
    }

    if (/\b(engine|tire|tyre|drivetrain|transmission|fuel|seat|spec|price|cost|how much|fleet|cars|car|vehicle|available|availability|family|seats)\b/.test(query)) {
        if (!cars.length) return "The fleet is still loading. Please try again in a moment.";
        const availableOnly = /\b(available|availability)\b/.test(query);
        const listedCars = availableOnly ? cars.filter(function (car) { return car.status === "available"; }) : cars;
        if (!listedCars.length) return "There are no cars currently marked available. Please contact us for help.";
        return (availableOnly ? "Cars currently listed as available:" : "Here is the current fleet:") + "\n" +
            listedCars.map(function (car) {
                return car.name + " - " + peso(car.price_per_day) + "/day | " + (car.seats || "Seats not listed") + " seats | " + (car.transmission || "Transmission not listed") + " | " + (car.fuel_type || "Fuel not listed");
            }).join("\n") +
            "\nAvailability can change and is not date-specific here. Open a car's booking form to check your dates and see its full listing.";
    }

    return "I can help with live fleet details, daily rates, vehicle comparisons, booking steps, business hours, and location. Try asking 'Compare the cars', 'How much for 3 days in [car name]?', or 'How do I reserve?' For cancellation, insurance, deposits, or driver requirements, contact us at 0912 345 6789 so we can give you the confirmed policy.";
}

function sendSupportMessage(text) {
    const question = text.trim();
    if (!question) return;
    appendChatMessage(question, "user");
    appendChatMessage(getChatReply(question), "bot");
}

function setSupportChatOpen(open) {
    const panel = document.getElementById("supportChatPanel");
    const launcher = document.getElementById("supportChatLauncher");
    panel.hidden = !open;
    launcher.setAttribute("aria-expanded", String(open));
    if (open) document.getElementById("supportChatInput").focus();
    else launcher.focus();
}

function initSupportChat() {
    const panel = document.getElementById("supportChatPanel");
    const launcher = document.getElementById("supportChatLauncher");
    const form = document.getElementById("supportChatForm");
    const input = document.getElementById("supportChatInput");

    launcher.addEventListener("click", function () { setSupportChatOpen(panel.hidden); });
    document.getElementById("supportChatClose").addEventListener("click", function () { setSupportChatOpen(false); });
    form.addEventListener("submit", function (event) {
        event.preventDefault();
        sendSupportMessage(input.value);
        input.value = "";
        input.focus();
    });
    document.querySelectorAll("[data-chat-prompt]").forEach(function (button) {
        button.addEventListener("click", function () { sendSupportMessage(button.dataset.chatPrompt); });
    });
}


/* ================= PAGE EVENTS ================= */

document.addEventListener("DOMContentLoaded", function() {

    const modal = document.getElementById("reservationModal");

    const pickupDate = document.getElementById("pickupDate");

    const returnDate = document.getElementById("returnDate");

    loadCars();
    initSupportChat();
    sb.auth.getSession().then(function ({ data }) {
        updateCustomerAccount(data.session ? data.session.user : null);
    });
    sb.auth.onAuthStateChange(function (_event, session) {
        updateCustomerAccount(session ? session.user : null);
    });


    /* CLOSE MODAL WHEN CLICKING OUTSIDE */

    modal.addEventListener("click", function(event) {

        if (event.target === modal) {
            closeReservation();
        }

    });

    const detailsDialog = document.getElementById("carDetailsDialog");
    detailsDialog.addEventListener("click", function (event) {
        if (event.target === detailsDialog) closeCarDetails();
    });
    detailsDialog.addEventListener("close", function () {
        if (!modal.classList.contains("show")) document.body.classList.remove("modal-open");
    });
    const accountDialog = document.getElementById("accountDialog");
    accountDialog.addEventListener("click", function (event) {
        if (event.target === accountDialog) closeAccountDialog();
    });


    /* ESCAPE KEY */

    document.addEventListener("keydown", function(event) {

        if (event.key === "Escape") {
            closeReservation();
            if (!document.getElementById("supportChatPanel").hidden) setSupportChatOpen(false);
        }

    });


    /* SET MINIMUM PICKUP DATE */

    const today = new Date().toISOString().split("T")[0];

    pickupDate.min = today;

    returnDate.min = today;

    const searchPickup = document.getElementById("searchPickupDate");
    const searchReturn = document.getElementById("searchReturnDate");
    searchPickup.min = today;
    searchReturn.min = today;
    searchPickup.addEventListener("change", function () {
        searchReturn.min = searchPickup.value || today;
        if (searchReturn.value && searchReturn.value < searchPickup.value) searchReturn.value = searchPickup.value;
    });


    /* RETURN DATE */

    pickupDate.addEventListener("change", function() {

        returnDate.min = pickupDate.value;

        if (
            returnDate.value &&
            returnDate.value < pickupDate.value
        ) {
            returnDate.value = pickupDate.value;
        }

        updateReservationEstimate();

    });

    returnDate.addEventListener("change", updateReservationEstimate);

});


/* ================= SUBMIT RESERVATION ================= */

async function submitReservation(event) {

    event.preventDefault();

    const name = document.getElementById("customerName").value.trim();
    const email = document.getElementById("customerEmail").value.trim();
    const message = document.getElementById("customerMessage").value.trim();
    const pickup = document.getElementById("pickupDate").value;
    const returnDate = document.getElementById("returnDate").value;
    const today = new Date().toISOString().split("T")[0];
    const car = linearSearch(cars, function (c) { return c.id === selectedCarId; })[0];

    // ----- VALIDATION -----
    if (!car) return showFormError("Please select a car first.");
    if (!name || !email || !pickup || !returnDate) return showFormError("Please complete all required fields.");
    if (name.length < 2) return showFormError("Please enter your full name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return showFormError("Please enter a valid email address.");
    if (pickup < today) return showFormError("Pickup date cannot be in the past.");
    if (returnDate < pickup) return showFormError("Return date cannot be earlier than pickup date.");
    if (message.length > 500) return showFormError("Message must be 500 characters or less.");
    if (car.status !== "available") return showFormError("This car is not available.");

    showFormError("");

    const submitButton = document.getElementById("reservationSubmit");
    submitButton.disabled = true;
    try {
        // ----- CONFLICT CHECK (dates already booked for this car) -----
        const booked = await sb.rpc("get_booked_ranges", { p_car: car.id });
        if (booked.error) return showFormError("Could not check availability. Please try again.");

        // ALGORITHM: LINEAR SEARCH - look for any overlapping booking
        const clash = linearSearch(booked.data, function (r) {
            return pickup <= r.return_date && returnDate >= r.pickup_date;
        });
        if (clash.length) return showFormError("This car is already reserved for those dates. Please choose other dates.");

        const session = (await sb.auth.getSession()).data.session;
        const { error } = await sb.from("reservations").insert({
            car_id: car.id,
            customer_id: session ? session.user.id : null,
            customer_name: name,
            customer_email: email,
            pickup_date: pickup,
            return_date: returnDate,
            message: message || null
        });

        if (error) {
            return showFormError(error.code === "23P01"
                ? "This car is already reserved for those dates."
                : "Reservation failed: " + error.message);
        }

        const dateOptions = { month: "short", day: "numeric", year: "numeric" };
        document.getElementById("confirmationName").textContent = name.split(" ")[0];
        document.getElementById("confirmationCar").textContent = car.name;
        document.getElementById("confirmationDates").textContent =
            new Date(pickup + "T00:00:00").toLocaleDateString(undefined, dateOptions) + " – " +
            new Date(returnDate + "T00:00:00").toLocaleDateString(undefined, dateOptions);
        document.getElementById("confirmationEstimate").textContent = document.getElementById("reservationTotal").textContent + " estimated";
        showFormError("");
        goReservationStep(3);
    } catch (error) {
        showFormError("Reservation could not be sent. Please try again.");
    } finally {
        submitButton.disabled = false;
    }
}