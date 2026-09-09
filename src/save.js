// ============ SAVE/LOAD (Supabase) ============
// Pakai project Supabase yang sama kayak versi dunia-datar (anon key sama), tapi TABEL BEDA
// ("planet_players", bukan "players") - biar save dunia-datar & save planet nggak numpuk/rusak
// satu sama lain kalau dibuka di browser yang sama. ID pemain juga disimpan di localStorage
// key yang beda ('wildlands_planet_player_id').
//
// Kalau tabelnya belum ada di project Supabase-mu, jalanin dulu SQL ini di SQL Editor Supabase:
//
//   create table if not exists planet_players (
//     player_id text primary key,
//     dir_x double precision, dir_y double precision, dir_z double precision,
//     altitude double precision default 0,
//     time_of_day double precision default 8,
//     player_hp double precision default 100,
//     drones_killed integer default 0,
//     boss_defeated boolean default false,
//     updated_at timestamptz default now()
//   );
//   alter table planet_players enable row level security;
//   create policy "planet anon rw" on planet_players for all using (true) with check (true);
//
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mlsibwihfzehqcdawrdh.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1sc2lid2loZnplaHFjZGF3cmRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgxMTcwNTEsImV4cCI6MjEwMzY5MzA1MX0.faKWNZqTLE6nEH6nPw0L4uFepTy6ZvqrZDy2BaHcWxs';

let supabase;
try { supabase = createClient(supabaseUrl, supabaseKey); } catch (e) { supabase = null; }

export let playerId = localStorage.getItem('wildlands_planet_player_id');
if (!playerId) {
    playerId = 'planet_' + Math.random().toString(36).substring(2, 11);
    try { localStorage.setItem('wildlands_planet_player_id', playerId); } catch (e) {}
}

export async function savePlanetGame(state) {
    if (!supabase) return false;
    try {
        const { error } = await supabase.from('planet_players').upsert({
            player_id: playerId,
            dir_x: state.dir.x, dir_y: state.dir.y, dir_z: state.dir.z,
            altitude: state.altitude,
            time_of_day: state.timeOfDay,
            player_hp: state.playerHp,
            drones_killed: state.dronesKilled,
            boss_defeated: state.bossDefeated,
        }, { onConflict: 'player_id' });
        return !error;
    } catch (e) { return false; }
}

export async function loadPlanetGame() {
    if (!supabase) return null;
    try {
        const { data, error } = await supabase.from('planet_players').select('*').eq('player_id', playerId).single();
        if (data && !error) return data;
    } catch (e) {}
    return null;
}
