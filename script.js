/* ================= PRICE SETTINGS (now calculated from the database) ================= */

let FLEET_MIN_PRICE = 0;
let FLEET_MAX_PRICE = 0;

// DATA STRUCTURE: ARRAY
// PURPOSE: Stores the car records retrieved from Supabase
let cars = [];
let selectedCarId = null;


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
            '<button class="rent-btn" ' + (ok ? "" : "disabled") + ' onclick="openReservation(\'' + car.id + '\')">' +
            (ok ? "Reserve Now" : "Not Available") + '</button>' +
            '</div></div>';
    }).join("");

    noCars.style.display = list.length === 0 && cars.length ? "block" : "none";
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

    document.getElementById("selectedCar").textContent = car.name;
    document.getElementById("selectedPrice").textContent = peso(car.price_per_day) + " / day";
    document.getElementById("reservationPrice").textContent = peso(car.price_per_day) + " / day";
    showFormError("");

    modal.classList.add("show");

    document.body.classList.add("modal-open");
}


function closeReservation() {

    const modal = document.getElementById("reservationModal");

    modal.classList.remove("show");

    document.body.classList.remove("modal-open");
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
    const byPrice = selectionSort(cars, function (a, b) { return a.price_per_day - b.price_per_day; });

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

    renderCars(cars);
}


/* ================= PAGE EVENTS ================= */

document.addEventListener("DOMContentLoaded", function() {

    const modal = document.getElementById("reservationModal");

    const pickupDate = document.getElementById("pickupDate");

    const returnDate = document.getElementById("returnDate");

    loadCars();


    /* CLOSE MODAL WHEN CLICKING OUTSIDE */

    modal.addEventListener("click", function(event) {

        if (event.target === modal) {
            closeReservation();
        }

    });


    /* ESCAPE KEY */

    document.addEventListener("keydown", function(event) {

        if (event.key === "Escape") {
            closeReservation();
        }

    });


    /* SET MINIMUM PICKUP DATE */

    const today = new Date().toISOString().split("T")[0];

    pickupDate.min = today;

    returnDate.min = today;


    /* RETURN DATE */

    pickupDate.addEventListener("change", function() {

        returnDate.min = pickupDate.value;

        if (
            returnDate.value &&
            returnDate.value < pickupDate.value
        ) {
            returnDate.value = pickupDate.value;
        }

    });

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
        // 23P01 = database exclusion constraint (double booking)
        return showFormError(error.code === "23P01"
            ? "This car is already reserved for those dates."
            : "Reservation failed: " + error.message);
    }

    alert(
        "Reservation submitted successfully!\n\n" +
        "Customer: " + name + "\n" +
        "Vehicle: " + car.name + "\n" +
        "Pickup: " + pickup + "\n" +
        "Return: " + returnDate + "\n\n" +
        "Status: Pending confirmation"
    );


    closeReservation();

    document.querySelector("#reservationModal form").reset();
}