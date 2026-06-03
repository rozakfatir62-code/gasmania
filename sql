-- 1. Membuat tabel utama untuk menyimpan data sensor gas/alkohol
CREATE TABLE IF NOT EXISTS public.alcohol_logs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    bac_value DOUBLE PRECISION NOT NULL, -- Menyimpan nilai %BAC (contoh: 0.02, 0.05)
    raw_analog_value INT,                -- Opsional: Menyimpan nilai mentah ADC dari ESP32 (0-4095)
    status TEXT                          -- Opsional: Menyimpan label status (misal: 'Aman', 'Mabuk')
);

-- 2. Menyalakan fitur Realtime khusus untuk tabel ini
-- Agar web dashboard Anda bisa menerima pembaruan instan saat ESP32 mengirim data
ALTER PUBLICATION supabase_realtime ADD TABLE public.alcohol_logs;

-- 3. Membuat Indeks (Index) pada kolom created_at
-- Ini sangat penting agar query grafik riwayat (history) di web Anda tetap cepat 
-- walaupun data sudah mencapai puluhan ribu baris.
CREATE INDEX IF NOT EXISTS idx_alcohol_logs_created_at 
ON public.alcohol_logs (created_at DESC);
