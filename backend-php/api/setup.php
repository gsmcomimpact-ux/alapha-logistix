<?php
// Création de l'administrateur principal. À SUPPRIMER du serveur après usage.
declare(strict_types=1);
require __DIR__ . '/lib.php';

function describe_setup_error(Throwable $e): string {
    $m = $e->getMessage();
    return preg_replace('/(password|pass)=\S+/i', '$1=***', $m);
}

header('Content-Type: text/html; charset=utf-8');
header('X-Robots-Tag: noindex');
$msg = '';

/** Runs schema.sql (same content as database.sql) statement by statement. */
function install_tables(): string {
    $file = __DIR__ . '/schema.sql';
    if (!is_file($file)) return 'Fichier schema.sql introuvable dans le dossier api/ : importez database.sql avec phpMyAdmin.';
    $sql = preg_replace('/^\s*--.*$/m', '', (string) file_get_contents($file));
    $n = 0;
    foreach (array_filter(array_map('trim', explode(';', $sql))) as $stmt) {
        db()->exec($stmt);
        $n++;
    }
    return 'Tables créées (' . $n . ' instructions exécutées).';
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['action'] ?? '') === 'tables') {
    if (!hash_equals((string) cfg('setup_key'), (string) ($_POST['key'] ?? '')) || cfg('setup_key') === 'CHANGER_CETTE_CLE_LONGUE_ET_ALEATOIRE') {
        $msg = 'Clé d\'installation incorrecte.';
    } else {
        try {
            $msg = htmlspecialchars(install_tables());
        } catch (Throwable $e) {
            $msg = 'Échec de la création des tables : ' . htmlspecialchars(describe_setup_error($e));
        }
    }
} elseif ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $key = (string) ($_POST['key'] ?? '');
    $pw = (string) ($_POST['password'] ?? '');
    $email = strtolower((string) cfg('main_admin_email'));
    if (!hash_equals((string) cfg('setup_key'), $key) || cfg('setup_key') === 'CHANGER_CETTE_CLE_LONGUE_ET_ALEATOIRE') {
        $msg = 'Clé d\'installation incorrecte.';
    } elseif (strlen($pw) < 8) {
        $msg = 'Mot de passe : 8 caractères minimum.';
    } else {
        $hash = password_hash($pw, PASSWORD_DEFAULT);
        $st = db()->prepare('SELECT id FROM users WHERE email = ?');
        $st->execute([$email]);
        if ($row = $st->fetch()) {
            db()->prepare('UPDATE users SET password_hash = ?, email_verified = 1 WHERE id = ?')->execute([$hash, $row['id']]);
            $msg = 'Mot de passe de l\'administrateur mis à jour.';
        } else {
            db()->prepare('INSERT INTO users (id, email, password_hash, email_verified, display_name, created_ms) VALUES (?, ?, ?, 1, ?, ?)')
                ->execute([new_uid(), $email, $hash, 'Administrateur', now_ms()]);
            $msg = 'Administrateur créé : ' . htmlspecialchars($email) . '.';
        }
        $msg .= ' <strong>Supprimez maintenant le fichier api/setup.php du serveur.</strong>';
    }
}
?><!doctype html><meta charset="utf-8"><title>Installation</title>
<body style="font-family:system-ui;max-width:420px;margin:40px auto">
<h1>Créer l'administrateur principal</h1>
<p>Compte : <b><?= htmlspecialchars((string) cfg('main_admin_email')) ?></b></p>
<?php if ($msg) echo '<p style="padding:10px;background:#f1f5f9;border-radius:8px">' . $msg . '</p>'; ?>
<h2 style="font-size:16px">Étape A — Créer les tables</h2>
<form method="post">
  <input type="hidden" name="action" value="tables">
  <p><label>Clé d'installation<br><input type="password" name="key" required style="width:100%"></label></p>
  <button>Créer les tables (si ce n'est pas déjà fait avec phpMyAdmin)</button>
</form>
<h2 style="font-size:16px;margin-top:28px">Étape B — Créer l'administrateur</h2>
<form method="post">
  <p><label>Clé d'installation (config.php → setup_key)<br><input type="password" name="key" required style="width:100%"></label></p>
  <p><label>Mot de passe administrateur (8+ caractères)<br><input type="password" name="password" minlength="8" required style="width:100%"></label></p>
  <button>Créer / réinitialiser</button>
</form>
</body>
