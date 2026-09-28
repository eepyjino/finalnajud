-- ============================================================
-- DriveEase - Supabase setup
-- Run in: Supabase Dashboard > SQL Editor > New query > paste > Run
-- ============================================================

create extension if not exists btree_gist;

-- ---------- PROFILES ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  role text not null default 'customer' check (role in ('customer','admin')),
  created_at timestamptz not null default now()
);

-- auto-create a profile (role = customer) for every new auth user
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''));
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- helper used by every admin policy (security definer avoids RLS recursion)
create or replace function public.is_admin() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- ---------- CARS ----------
create table if not exists public.cars (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  brand text not null check (length(trim(brand)) > 0),
  model text not null check (length(trim(model)) > 0),
  year int not null check (year between 1990 and 2100),
  price_per_day numeric(10,2) not null check (price_per_day > 0),
  transmission text not null default 'Automatic' check (transmission in ('Automatic','Manual')),
  fuel_type text not null default 'Gasoline' check (fuel_type in ('Gasoline','Diesel','Hybrid','Electric')),
  seats int not null check (seats between 1 and 20),
  description text,
  image_url text,
  image_path text,
  status text not null default 'available' check (status in ('available','reserved','maintenance','unavailable')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists cars_price_idx on public.cars(price_per_day);
create index if not exists cars_name_idx on public.cars(lower(name));
create index if not exists cars_status_idx on public.cars(status);

-- ---------- RESERVATIONS ----------
create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  car_id uuid not null references public.cars(id) on delete cascade,
  customer_id uuid references auth.users(id) on delete set null,
  customer_name text not null check (length(trim(customer_name)) >= 2),
  customer_email text not null check (customer_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$'),
  pickup_date date not null,
  return_date date not null,
  message text check (message is null or length(message) <= 500),
  status text not null default 'pending' check (status in ('pending','confirmed','completed','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint return_after_pickup check (return_date >= pickup_date),
  -- database-level protection against double booking
  constraint no_double_booking exclude using gist (
    car_id with =, daterange(pickup_date, return_date, '[]') with &&
  ) where (status in ('pending','confirmed'))
);
create index if not exists res_car_idx on public.reservations(car_id);
create index if not exists res_status_idx on public.reservations(status, created_at);

-- updated_at trigger
create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger cars_updated before update on public.cars for each row execute function public.set_updated_at();
create trigger res_updated before update on public.reservations for each row execute function public.set_updated_at();

-- customers may only see dates already booked, never other people's details
create or replace function public.get_booked_ranges(p_car uuid)
returns table (pickup_date date, return_date date)
language sql security definer stable set search_path = public as $$
  select r.pickup_date, r.return_date from public.reservations r
  where r.car_id = p_car and r.status in ('pending','confirmed') and r.return_date >= current_date;
$$;
grant execute on function public.get_booked_ranges(uuid) to anon, authenticated;

-- ---------- ROW LEVEL SECURITY ----------
alter table public.profiles enable row level security;
alter table public.cars enable row level security;
alter table public.reservations enable row level security;

-- profiles
create policy "read own profile or admin" on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy "admin updates profiles" on public.profiles for update using (public.is_admin());

-- cars: everyone reads, only admin writes
create policy "public reads cars" on public.cars for select to anon, authenticated using (true);
create policy "admin inserts cars" on public.cars for insert to authenticated with check (public.is_admin());
create policy "admin updates cars" on public.cars for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin deletes cars" on public.cars for delete to authenticated using (public.is_admin());

-- reservations: anyone can create a PENDING one for an AVAILABLE car
create policy "customers create reservations" on public.reservations for insert to anon, authenticated
  with check (
    status = 'pending'
    and (customer_id is null or customer_id = auth.uid())
    and exists (select 1 from public.cars c where c.id = car_id and c.status = 'available')
  );
create policy "read own or admin reservations" on public.reservations for select to authenticated
  using (customer_id = auth.uid() or public.is_admin());
create policy "admin updates reservations" on public.reservations for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "admin deletes reservations" on public.reservations for delete to authenticated using (public.is_admin());

-- ---------- STORAGE (bucket: car-images) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('car-images', 'car-images', true, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 2097152,
  allowed_mime_types = array['image/jpeg','image/png','image/webp'];

create policy "public reads car images" on storage.objects for select using (bucket_id = 'car-images');
create policy "admin uploads car images" on storage.objects for insert to authenticated with check (bucket_id = 'car-images' and public.is_admin());
create policy "admin updates car images" on storage.objects for update to authenticated using (bucket_id = 'car-images' and public.is_admin());
create policy "admin deletes car images" on storage.objects for delete to authenticated using (bucket_id = 'car-images' and public.is_admin());

-- ---------- SEED: your original 8 cars ----------
insert into public.cars (name, brand, model, year, price_per_day, transmission, fuel_type, seats, description) values
('Toyota Vios','Toyota','Vios',2023,3800,'Automatic','Gasoline',5,'Comfortable and practical sedan for everyday travel.'),
('Honda City','Honda','City',2023,4200,'Automatic','Gasoline',5,'Stylish, smooth, and efficient for city driving.'),
('Toyota Corolla','Toyota','Corolla',2023,4500,'Automatic','Gasoline',5,'Reliable and comfortable for long-distance trips.'),
('Mitsubishi Xpander','Mitsubishi','Xpander',2023,4800,'Automatic','Gasoline',7,'Spacious MPV designed for family and group trips.'),
('Toyota Fortuner','Toyota','Fortuner',2023,5000,'Automatic','Diesel',7,'Powerful SUV with plenty of space for passengers.'),
('Ford Everest','Ford','Everest',2023,5400,'Automatic','Diesel',7,'Premium SUV built for comfortable adventures.'),
('Hyundai Staria','Hyundai','Staria',2023,5800,'Automatic','Diesel',9,'Spacious premium van for larger groups.'),
('Ford Mustang','Ford','Mustang',2023,6500,'Automatic','Gasoline',4,'A sporty choice for drivers who want something special.');

-- ---------- MAKE YOURSELF ADMIN ----------
-- 1) Authentication > Users > Add user (email + password, tick "Auto Confirm")
-- 2) Then run (with your email):
-- update public.profiles set role = 'admin' where email = 'you@example.com';
