<?php
declare(strict_types=1);

if (!file_exists(__DIR__ . '/config.php')) {
    http_response_code(500);
    header('Content-Type: application/json');
    echo '{"error":{"code":"internal","message":"config.php manquant : copier config.sample.php en config.php."}}';
    exit;
}
require __DIR__ . '/lib.php';
require __DIR__ . '/permissions.php';

header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');

try {
    route();
} catch (Throwable $e) {
    error_log('[alpha-logistix] ' . $e->getMessage());
    fail('internal', 'Erreur serveur.', 500);
}

function route(): void {
    $path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
    $pos = strpos($path, '/api/');
    $path = $pos === false ? '/' : substr($path, $pos + 4);
    $path = '/' . trim($path, '/');
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

    switch ("$method $path") {
        case 'POST /auth/register':            auth_register(); break;
        case 'POST /auth/login':               auth_login(); break;
        case 'GET /auth/me':                   auth_me(); break;
        case 'POST /auth/logout':              auth_logout(); break;
        case 'POST /auth/reauth':              auth_reauth(); break;
        case 'POST /auth/change-password':     auth_change_password(); break;
        case 'POST /auth/profile':             auth_profile(); break;
        case 'POST /auth/forgot':              auth_forgot(); break;
        case 'POST /auth/resend-verification': auth_resend_verification(); break;
        case 'POST /auth/google':              auth_google(); break;
        case 'GET /public-config':             json_out(['googleClientId' => (string) cfg('google_client_id', '')]); break;
        case 'GET /auth/verify':               page_verify(); break;
        case 'GET /auth/reset':                page_reset_form(); break;
        case 'POST /auth/reset':               page_reset_submit(); break;
        case 'POST /db':                       db_op(); break;
        case 'POST /public/quote':             public_quote(); break;
        case 'GET /health':                    json_out(['ok' => true]); break;
        default:                               fail('not-found', 'Route inconnue.', 404);
    }
}

// =================================================================== AUTH ===
function valid_email(string $e): bool {
    return strlen($e) <= 120 && (bool) filter_var($e, FILTER_VALIDATE_EMAIL);
}

function send_verification(array $u): void {
    $token = bin2hex(random_bytes(32));
    db()->prepare('UPDATE users SET verify_token = ? WHERE id = ?')->execute([$token, $u['id']]);
    $link = cfg('site_url') . '/api/auth/verify?token=' . $token;
    send_mail($u['email'], 'Confirmez votre adresse e-mail — Alpha Logistix',
        "Bonjour,\n\nPour activer votre accès, confirmez votre adresse e-mail :\n$link\n\n"
        . "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.\n\nAlpha Logistix Group");
}

function auth_register(): void {
    $b = body();
    $email = strtolower(trim((string) ($b['email'] ?? '')));
    $password = (string) ($b['password'] ?? '');
    if (!valid_email($email)) fail('auth/invalid-email', 'Adresse e-mail invalide.');
    if (strlen($password) < 6 || strlen($password) > 200) fail('auth/weak-password', 'Mot de passe trop faible.');
    if (!rate_limit('register:' . client_ip(), 10, 3600)) fail('auth/too-many-requests', 'Trop de tentatives.', 429);

    $st = db()->prepare('SELECT id FROM users WHERE email = ?');
    $st->execute([$email]);
    if ($st->fetch()) fail('auth/email-already-in-use', 'Adresse déjà utilisée.');

    $id = new_uid();
    db()->prepare(
        'INSERT INTO users (id, email, password_hash, email_verified, display_name, created_ms) VALUES (?, ?, ?, 0, ?, ?)'
    )->execute([$id, $email, password_hash($password, PASSWORD_DEFAULT), substr((string) ($b['displayName'] ?? ''), 0, 190), now_ms()]);

    $u = db()->query("SELECT * FROM users WHERE id = '" . $id . "'")->fetch();
    send_verification($u);
    json_out(['token' => create_session($id), 'user' => user_public($u)]);
}

function auth_login(): void {
    $b = body();
    $email = strtolower(trim((string) ($b['email'] ?? '')));
    $password = (string) ($b['password'] ?? '');
    if (!valid_email($email)) fail('auth/invalid-email', 'Adresse e-mail invalide.');
    if (!rate_limit('login:' . client_ip() . ':' . $email, 10, 900)) {
        fail('auth/too-many-requests', 'Trop de tentatives.', 429);
    }
    $st = db()->prepare('SELECT * FROM users WHERE email = ?');
    $st->execute([$email]);
    $u = $st->fetch();
    // Always run a hash check to keep timing similar for unknown users.
    $hash = $u['password_hash'] ?? '$2y$10$usesomesillystringforsaltuseDummyHashxxxxxxxxxxxxxxxxxxxxxxx';
    $ok = password_verify($password, $hash);
    if (!$u || !$ok) fail('auth/invalid-credential', 'Identifiants incorrects.', 401);
    json_out(['token' => create_session($u['id']), 'user' => user_public($u)]);
}

/** GET a JSON document over HTTPS (curl, falling back to streams). */
function http_get_json(string $url, array $headers = []): ?array {
    $raw = null;
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 8,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_SSL_VERIFYPEER => true,
        ]);
        $raw = curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if ($raw === false || $code !== 200) return null;
    } else {
        $ctx = stream_context_create(['http' => ['timeout' => 8, 'header' => implode("\r\n", $headers)]]);
        $raw = @file_get_contents($url, false, $ctx);
        if ($raw === false) return null;
    }
    $d = json_decode((string) $raw, true);
    return is_array($d) ? $d : null;
}

/**
 * Sign in a client with a Google account (Google Identity Services access token).
 * The token is verified with Google and must have been issued for OUR client id.
 * Staff and the main administrator are refused here: they must use e-mail + password.
 */
function auth_google(): void {
    $clientId = (string) cfg('google_client_id', '');
    if ($clientId === '') fail('auth/operation-not-allowed', 'Connexion Google non configurée.');
    if (!rate_limit('google:' . client_ip(), 20, 900)) fail('auth/too-many-requests', 'Trop de tentatives.', 429);

    $access = (string) (body()['accessToken'] ?? '');
    if (!preg_match('/^[A-Za-z0-9._\-]{20,2048}$/', $access)) fail('auth/invalid-credential', 'Jeton Google invalide.', 401);

    $info = http_get_json((string) cfg('google_tokeninfo_url', 'https://oauth2.googleapis.com/tokeninfo') . '?access_token=' . urlencode($access));
    if (!$info) fail('auth/invalid-credential', 'Jeton Google refusé.', 401);
    $aud = (string) ($info['aud'] ?? $info['azp'] ?? '');
    $email = strtolower((string) ($info['email'] ?? ''));
    $verified = ($info['email_verified'] ?? '') === 'true' || ($info['email_verified'] ?? false) === true;
    if (!hash_equals($clientId, $aud) || !$verified || !valid_email($email)) {
        fail('auth/invalid-credential', 'Jeton Google invalide.', 401);
    }
    if (is_professional_email($email) || $email === strtolower((string) cfg('main_admin_email'))) {
        fail('auth/operation-not-allowed', 'Le personnel se connecte avec son e-mail et son mot de passe.', 403);
    }

    $name = '';
    $ui = http_get_json((string) cfg('google_userinfo_url', 'https://www.googleapis.com/oauth2/v3/userinfo'), ['Authorization: Bearer ' . $access]);
    if ($ui && !empty($ui['name'])) $name = substr((string) $ui['name'], 0, 190);

    $st = db()->prepare('SELECT * FROM users WHERE email = ?');
    $st->execute([$email]);
    $u = $st->fetch();
    if (!$u) {
        $id = new_uid();
        db()->prepare(
            'INSERT INTO users (id, email, password_hash, email_verified, display_name, created_ms) VALUES (?, ?, ?, 1, ?, ?)'
        )->execute([$id, $email, password_hash(bin2hex(random_bytes(24)), PASSWORD_DEFAULT), $name, now_ms()]);
    } else {
        $id = $u['id'];
        // Google proved ownership of this address.
        db()->prepare("UPDATE users SET email_verified = 1, display_name = IF(display_name = '', ?, display_name) WHERE id = ?")
            ->execute([$name, $id]);
    }
    $st = db()->prepare('SELECT * FROM users WHERE id = ?');
    $st->execute([$id]);
    $u = $st->fetch();
    json_out(['token' => create_session($id), 'user' => user_public($u)]);
}

function auth_me(): void {
    $u = current_user();
    json_out(['user' => $u ? user_public($u) : null]);
}

function auth_logout(): void {
    $t = bearer_token();
    if ($t) db()->prepare('DELETE FROM sessions WHERE token_hash = ?')->execute([hash('sha256', $t)]);
    json_out(['ok' => true]);
}

function auth_reauth(): void {
    $u = require_user();
    if (!rate_limit('reauth:' . $u['id'], 10, 900)) fail('auth/too-many-requests', 'Trop de tentatives.', 429);
    if (!password_verify((string) (body()['password'] ?? ''), $u['password_hash'])) {
        fail('auth/invalid-credential', 'Mot de passe incorrect.', 401);
    }
    json_out(['ok' => true]);
}

function auth_change_password(): void {
    $u = require_user();
    $b = body();
    if (!rate_limit('chpw:' . $u['id'], 10, 900)) fail('auth/too-many-requests', 'Trop de tentatives.', 429);
    if (!password_verify((string) ($b['currentPassword'] ?? ''), $u['password_hash'])) {
        fail('auth/invalid-credential', 'Mot de passe actuel incorrect.', 401);
    }
    $new = (string) ($b['newPassword'] ?? '');
    if (strlen($new) < 8 || strlen($new) > 200) fail('auth/weak-password', 'Mot de passe trop faible.');
    db()->prepare('UPDATE users SET password_hash = ? WHERE id = ?')->execute([password_hash($new, PASSWORD_DEFAULT), $u['id']]);
    // Sign out every other device.
    $cur = hash('sha256', (string) bearer_token());
    db()->prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?')->execute([$u['id'], $cur]);
    json_out(['ok' => true]);
}

function auth_profile(): void {
    $u = require_user();
    $name = substr((string) (body()['displayName'] ?? ''), 0, 190);
    db()->prepare('UPDATE users SET display_name = ? WHERE id = ?')->execute([$name, $u['id']]);
    json_out(['ok' => true]);
}

function auth_forgot(): void {
    $email = strtolower(trim((string) (body()['email'] ?? '')));
    if (!valid_email($email)) fail('auth/invalid-email', 'Adresse e-mail invalide.');
    if (!rate_limit('forgot:' . client_ip(), 8, 3600)) fail('auth/too-many-requests', 'Trop de tentatives.', 429);
    $st = db()->prepare('SELECT * FROM users WHERE email = ?');
    $st->execute([$email]);
    $u = $st->fetch();
    if ($u) {
        $token = bin2hex(random_bytes(32));
        db()->prepare('UPDATE users SET reset_token = ?, reset_expires = ? WHERE id = ?')
            ->execute([$token, now_ms() + 3600 * 1000, $u['id']]);
        send_mail($email, 'Réinitialisation de votre mot de passe — Alpha Logistix',
            "Bonjour,\n\nPour choisir un nouveau mot de passe (lien valable 1 heure) :\n"
            . cfg('site_url') . '/api/auth/reset?token=' . $token
            . "\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez ce message.\n\nAlpha Logistix Group");
    }
    json_out(['ok' => true]); // same answer whether or not the account exists
}

function auth_resend_verification(): void {
    $u = require_user();
    if (!$u['email_verified'] && rate_limit('resend:' . $u['id'], 5, 3600)) send_verification($u);
    json_out(['ok' => true]);
}

// ---------------------------------------------------- server-rendered pages
function html_page(string $title, string $inner): void {
    header('Content-Type: text/html; charset=utf-8');
    header('Cache-Control: no-store');
    $site = htmlspecialchars((string) cfg('site_url'));
    echo '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
        . '<meta name="robots" content="noindex"><title>' . htmlspecialchars($title) . '</title>'
        . '<style>body{font-family:system-ui,sans-serif;background:#f1f5f9;color:#0f172a;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}'
        . '.c{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:32px;max-width:420px;width:calc(100% - 32px)}'
        . 'h1{font-size:20px;margin:0 0 12px}p{line-height:1.5;color:#475569}input{width:100%;box-sizing:border-box;padding:10px;margin:6px 0 14px;border:1px solid #cbd5e1;border-radius:8px;font-size:15px}'
        . 'button,a.b{display:inline-block;background:#ea580c;color:#fff;border:0;border-radius:8px;padding:11px 18px;font-weight:600;text-decoration:none;cursor:pointer;font-size:15px}</style></head>'
        . '<body><div class="c">' . $inner . '<p style="margin-top:20px"><a href="' . $site . '">← Retour au site</a></p></div></body></html>';
    exit;
}

function page_verify(): void {
    $token = (string) ($_GET['token'] ?? '');
    if (!preg_match('/^[a-f0-9]{64}$/', $token)) html_page('Lien invalide', '<h1>Lien invalide</h1><p>Ce lien de confirmation n\'est pas valide.</p>');
    $st = db()->prepare('UPDATE users SET email_verified = 1, verify_token = NULL WHERE verify_token = ?');
    $st->execute([$token]);
    if ($st->rowCount() === 0) html_page('Lien expiré', '<h1>Lien expiré</h1><p>Ce lien a déjà été utilisé ou n\'est plus valable. Reconnectez-vous : si votre adresse est déjà confirmée, vous pouvez vous connecter.</p>');
    html_page('Adresse confirmée', '<h1>Adresse e-mail confirmée ✓</h1><p>Votre accès est activé. Vous pouvez maintenant vous connecter.</p>');
}

function page_reset_form(): void {
    $token = (string) ($_GET['token'] ?? '');
    if (!preg_match('/^[a-f0-9]{64}$/', $token)) html_page('Lien invalide', '<h1>Lien invalide</h1>');
    html_page('Nouveau mot de passe',
        '<h1>Nouveau mot de passe</h1><form method="post" action="">'
        . '<input type="hidden" name="token" value="' . htmlspecialchars($token) . '">'
        . '<label>Nouveau mot de passe (8 caractères minimum)<input type="password" name="password" minlength="8" required autocomplete="new-password"></label>'
        . '<label>Confirmer<input type="password" name="confirm" minlength="8" required autocomplete="new-password"></label>'
        . '<button type="submit">Enregistrer</button></form>');
}

function page_reset_submit(): void {
    $token = (string) ($_POST['token'] ?? '');
    $pw = (string) ($_POST['password'] ?? '');
    if (!preg_match('/^[a-f0-9]{64}$/', $token)) html_page('Lien invalide', '<h1>Lien invalide</h1>');
    if (strlen($pw) < 8 || $pw !== (string) ($_POST['confirm'] ?? '')) {
        html_page('Erreur', '<h1>Mot de passe refusé</h1><p>8 caractères minimum, et les deux saisies doivent être identiques. Utilisez le lien reçu par e-mail pour réessayer.</p>');
    }
    $st = db()->prepare('SELECT id FROM users WHERE reset_token = ? AND reset_expires > ?');
    $st->execute([$token, now_ms()]);
    $row = $st->fetch();
    if (!$row) html_page('Lien expiré', '<h1>Lien expiré</h1><p>Refaites une demande « Mot de passe oublié ».</p>');
    db()->prepare('UPDATE users SET password_hash = ?, reset_token = NULL, reset_expires = NULL, email_verified = 1 WHERE id = ?')
        ->execute([password_hash($pw, PASSWORD_DEFAULT), $row['id']]);
    db()->prepare('DELETE FROM sessions WHERE user_id = ?')->execute([$row['id']]);
    html_page('Mot de passe modifié', '<h1>Mot de passe modifié ✓</h1><p>Vous pouvez maintenant vous connecter avec votre nouveau mot de passe.</p>');
}

// ================================================================= DB API ===
function norm_cmp($v) {
    if (is_array($v) && isset($v['__ts'])) return (int) $v['__ts'];
    return $v;
}

function match_where(array $data, array $w): bool {
    [$field, $op, $val] = [$w[0] ?? '', $w[1] ?? '==', $w[2] ?? null];
    $actual = norm_cmp($data[$field] ?? null);
    $val = norm_cmp($val);
    switch ($op) {
        case '==': return $actual == $val && (is_null($actual) === is_null($val));
        case '!=': return $actual != $val;
        case '<':  return $actual !== null && $actual < $val;
        case '<=': return $actual !== null && $actual <= $val;
        case '>':  return $actual !== null && $actual > $val;
        case '>=': return $actual !== null && $actual >= $val;
        case 'in': return is_array($val) && in_array($actual, $val, false);
        case 'array-contains': return is_array($actual) && in_array($val, $actual, false);
    }
    return false;
}

function db_op(): void {
    $b = body();
    $u = current_user();
    $op = (string) ($b['op'] ?? '');

    if ($op === 'get') {
        [$coll, $id] = split_path((string) ($b['path'] ?? ''));
        if ($id === null) fail('invalid-argument', 'Chemin de document attendu.');
        $data = doc_get($coll, $id);
        if ($data === null) {
            // Same answer as for a document the caller may not see only when reads are allowed at all.
            if (root_of($coll) === 'publicTracking' || $u) json_out(['exists' => false]);
            deny();
        }
        if (!can_read($coll, $id, $data, $u, false)) deny();
        json_out(['exists' => true, 'id' => $id, 'data' => $data]);
    }

    if ($op === 'list') {
        [$coll, $id] = split_path((string) ($b['path'] ?? ''));
        if ($id !== null) fail('invalid-argument', 'Chemin de collection attendu.');
        if (!$u) deny();
        $wheres = is_array($b['where'] ?? null) ? $b['where'] : [];
        $orders = is_array($b['orderBy'] ?? null) ? $b['orderBy'] : [];
        $limit = isset($b['limit']) ? max(1, min(2000, (int) $b['limit'])) : 2000;

        $rows = [];
        foreach (coll_all($coll) as $r) {
            if (!can_read($coll, $r['id'], $r['data'], $u, true)) continue;
            $ok = true;
            foreach ($wheres as $w) {
                if (!is_array($w) || !match_where($r['data'], $w)) { $ok = false; break; }
            }
            if ($ok) $rows[] = $r;
        }
        if ($orders) {
            usort($rows, function ($a, $b2) use ($orders) {
                foreach ($orders as $o) {
                    $f = (string) ($o[0] ?? '');
                    $dir = (($o[1] ?? 'asc') === 'desc') ? -1 : 1;
                    $x = norm_cmp($a['data'][$f] ?? null);
                    $y = norm_cmp($b2['data'][$f] ?? null);
                    if ($x == $y) continue;
                    return ($x < $y ? -1 : 1) * $dir;
                }
                return 0;
            });
        }
        json_out(['docs' => array_slice($rows, 0, $limit)]);
    }

    if ($op === 'write') {
        $u = require_user();
        $writes = $b['writes'] ?? [];
        if (!is_array($writes) || count($writes) === 0 || count($writes) > 500) fail('invalid-argument', 'Lot invalide.');
        $now = now_ms();
        $created = [];
        $pdo = db();
        $pdo->beginTransaction();
        try {
            foreach ($writes as $w) {
                $type = (string) ($w['type'] ?? '');
                [$coll, $id] = split_path((string) ($w['path'] ?? ''));
                if ($id === null) fail('invalid-argument', 'Chemin de document attendu.');
                $old = doc_get($coll, $id);

                if ($type === 'delete') {
                    check_write('delete', $coll, $id, $old, null, $u);
                    doc_delete($coll, $id);
                    continue;
                }
                $patch = encode_value(is_array($w['data'] ?? null) ? $w['data'] : [], $now);
                if ($type === 'update') {
                    $new = array_merge($old ?? [], $patch);
                    check_write('update', $coll, $id, $old, $new, $u);
                } elseif ($type === 'set') {
                    $new = $patch;
                    check_write($old === null ? 'create' : 'update', $coll, $id, $old, $new, $u);
                } else {
                    fail('invalid-argument', 'Type d\'écriture inconnu.');
                }
                if (strlen(json_encode($new)) > 1500000) fail('invalid-argument', 'Document trop volumineux.');
                doc_put($coll, $id, $new);
                if ($old === null) $created[] = [$coll, $id, $new];
            }
            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $e;
        }
        foreach ($created as [$c, $i, $d]) after_create($c, $i, $d);
        json_out(['ok' => true]);
    }

    fail('invalid-argument', 'Opération inconnue.');
}

// ============================================================ PUBLIC QUOTE ===
function public_quote(): void {
    $b = body();
    if (!empty($b['website'])) json_out(['quoteCode' => 'COT-' . date('Y') . '-0000']); // honeypot
    if (!rate_limit('pubquote:' . client_ip(), 5, 3600)) fail('resource-exhausted', 'Trop de demandes. Réessayez plus tard.', 429);

    $name = trim(substr((string) ($b['fullName'] ?? ''), 0, 120));
    $email = strtolower(trim((string) ($b['email'] ?? '')));
    $message = trim(substr((string) ($b['message'] ?? ''), 0, 1000));
    $mode = (string) ($b['transportMode'] ?? '');
    $modes = ['Fret maritime', 'Fret aérien', 'Corridor routier', 'Dédouanement & Entreposage'];
    if (strlen($name) < 2 || !valid_email($email) || strlen($message) < 10 || !in_array($mode, $modes, true)) {
        fail('invalid-argument', 'Champs invalides.');
    }
    $id = 'quote-' . now_ms() . '-' . substr(bin2hex(random_bytes(3)), 0, 4);
    $code = 'COT-' . date('Y') . '-' . random_int(1000, 9999);
    $now = now_ms();
    $data = [
        'id' => $id,
        'quoteCode' => $code,
        'clientUid' => '',
        'clientEmail' => $email,
        'clientName' => $name,
        'company' => substr((string) ($b['company'] ?? ''), 0, 120),
        'phone' => substr((string) ($b['phone'] ?? ''), 0, 30),
        'transportMode' => $mode,
        'origin' => substr((string) ($b['origin'] ?? ''), 0, 120),
        'destination' => substr((string) ($b['destination'] ?? ''), 0, 120),
        'message' => $message,
        'status' => 'En attente',
        'estimatedAmount' => '',
        'adminResponse' => '',
        'createdBy' => 'public',
        'createdAt' => ['__ts' => $now],
        'updatedAt' => ['__ts' => $now],
    ];
    doc_put('quoteRequests', $id, $data);
    after_create('quoteRequests', $id, $data);
    json_out(['quoteCode' => $code]);
}
