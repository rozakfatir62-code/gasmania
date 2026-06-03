export default {
  async fetch(request, env, ctx) {
    // 1. Tangani CORS (Cross-Origin Resource Sharing) agar bisa diuji dari browser/Postman jika diperlukan
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    // Jika request berupa OPTIONS (preflight), langsung kembalikan status 200
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // 2. Proteksi: Hanya izinkan metode POST untuk pengiriman data IoT
    if (request.method !== "POST") {
      return new Response("Metode tidak diizinkan. Gunakan POST.", { 
        status: 405, 
        headers: corsHeaders 
      });
    }

    try {
      // 3. Ambil dan validasi data JSON dari ESP32
      const data = await request.json();
      
      // ESP32 Anda akan mengirimkan data dengan format: {"bac": 0.05}
      if (data.bac === undefined) {
        return new Response(JSON.stringify({ error: "Format data salah. Kunci 'bac' diperlukan." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // 4. Ambil Kredensial Supabase dari Environment Variables Cloudflare
      const SUPABASE_URL = env.SUPABASE_URL;
      const SUPABASE_KEY = env.SUPABASE_KEY;

      // 5. Tembak REST API Supabase untuk melakukan INSERT ke tabel 'alcohol_logs'
      // Struktur ini disesuaikan agar dibaca oleh fungsi `_handleIncomingRecord` di script.js Anda
      const supabaseResponse = await fetch(`${SUPABASE_URL}/rest/v1/alcohol_logs`, {
        method: "POST",
        headers: {
          "apikey": SUPABASE_KEY,
          "Authorization": `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json",
          "Prefer": "return=minimal" // Menghemat data karena kita tidak butuh data balikan dari database
        },
        body: JSON.stringify({
          bac_value: parseFloat(data.bac) // Dipetakan ke kolom 'bac_value' (double precision) di database Anda
        })
      });

      // Jika Supabase menolak data (misal kredensial salah atau tabel tidak ditemukan)
      if (!supabaseResponse.ok) {
        const errorText = await supabaseResponse.text();
        return new Response(`Supabase Error: ${errorText}`, { 
          status: 500, 
          headers: corsHeaders 
        });
      }

      // 6. Respon balik ke ESP32 bahwa data berhasil dijembatani
      return new Response(JSON.stringify({ success: true, message: "Data terkirim ke Supabase" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });

    } catch (error) {
      // Tangani jika terjadi crash sistem atau format JSON dari ESP32 rusak
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
  }
};
