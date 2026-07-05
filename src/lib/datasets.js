import { supabase } from "./supabaseClient.js";

// All dashboard data lives in one small `datasets` table: a row per dataset
// ('ops' = the weekly/daily Excel-derived metrics, 'revenue' = the EZcount
// receipts), each holding its full payload as JSON. Readable/writable only
// by authenticated users (enforced by RLS).

export const OPS_DATASET = "ops";
export const REVENUE_DATASET = "revenue";

export async function fetchDatasets() {
  const { data, error } = await supabase.from("datasets").select("id, payload, updated_at");
  if (error) throw new Error(error.message);
  const byId = {};
  for (const row of data || []) byId[row.id] = row;
  return byId;
}

export async function saveDataset(id, payload) {
  const { error } = await supabase
    .from("datasets")
    .upsert({ id, payload, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}
