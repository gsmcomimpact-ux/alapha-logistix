<?php
// Copier ce fichier en config.php et renseigner les valeurs.
// config.php ne doit JAMAIS être publié ailleurs que sur le serveur.
return [
    // --- Base de données (cPanel iFastNet > MySQL Databases) ---
    'db_host' => 'localhost',          // souvent « sqlXXX.byetcluster.com » ou « localhost » : voir le panneau iFastNet
    'db_name' => 'xxxx_alphalogistix',
    'db_user' => 'xxxx_user',
    'db_pass' => 'MOT_DE_PASSE_BASE',

    // --- Site ---
    'site_url'         => 'https://alphalogistixgroup.com',
    'mail_from'        => 'noreply@alphalogistixgroup.com',   // adresse d'expédition (boîte du domaine)
    'commercial_email' => 'commercial@alphalogistixgroup.com', // reçoit les demandes de cotation
    'notify_clients_by_email' => true,                          // e-mail au client à chaque notification de suivi

    // --- Sécurité ---
    'main_admin_email' => 'djimba.chamid@alphalogistixgroup.com',  // administrateur principal (compte propriétaire du système)
    'staff_email_domain' => 'alphalogistixgroup.com', // domaine obligatoire pour le personnel
    'setup_key' => 'CHANGER_CETTE_CLE_LONGUE_ET_ALEATOIRE', // protège setup.php (à supprimer après usage)
    'session_days' => 14,

    // --- Connexion Google des clients (facultatif) ---
    // Créer un « ID client OAuth » de type « Application Web » dans Google Cloud Console
    // (APIs et services > Identifiants), avec « Origines JavaScript autorisées » = https://alphalogistixgroup.com
    // Laisser vide pour désactiver le bouton Google.
    'google_client_id' => '',
];
