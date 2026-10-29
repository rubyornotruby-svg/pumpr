/* =====================================================================
   PUMPR · configuration
   ---------------------------------------------------------------------
   Tant que supabaseUrl et supabaseAnonKey sont vides, le site tourne en
   MODE DÉMO : les comptes, les accès et l'admin sont simulés dans le
   navigateur. Ce n'est PAS sécurisé et sert uniquement à tester le parcours.

   Pour passer en vrai mode (comptes protégés) : voir README.md, partie
   « Brancher Supabase », puis colle ici les deux valeurs.
   ===================================================================== */
window.PUMPR_CONFIG = {
  supabaseUrl: "",       // ex. "https://abcdefgh.supabase.co"
  supabaseAnonKey: ""    // clé « anon public » (Project Settings → API)
};
