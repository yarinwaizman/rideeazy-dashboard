import { createClient } from "@supabase/supabase-js";

// The publishable key is public by design (it only grants what RLS allows —
// which for this project is nothing without a signed-in session). Real
// access control comes from Supabase auth + row-level security.
const SUPABASE_URL = "https://cuxsgpzkbtpurueasbxi.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_RMuds4SUGjnty7kAOeRaZQ_vX86Wb0H";

// One shared account for the whole team; the login form only asks for the
// password, this email is fixed.
export const SHARED_EMAIL = "dashboard@rideeazy.co.il";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
