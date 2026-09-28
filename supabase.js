/* ============================================================
   SUPABASE CONFIGURATION  (replace the two placeholders below)
   Find them in Supabase: Project Settings > API
   ONLY the anon/public key goes here. NEVER the service_role key.
   ============================================================ */
const SUPABASE_URL = "https://zazgyiqritorgoubyont.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_RthzOsdkItCNPZTvWTAurQ_ubhyauPP";

const CAR_BUCKET = "car-images";

// Shared client used by script.js (customer) and admin.js (admin)
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Public URL for an image stored in the bucket
function getCarImageUrl(path) {
    return sb.storage.from(CAR_BUCKET).getPublicUrl(path).data.publicUrl;
}
