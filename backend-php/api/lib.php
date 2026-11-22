<?php
declare(strict_types=1);

// ---------------------------------------------------------------- bootstrap
$CONFIG = require __DIR__ . '/config.php';

function cfg(string $key, $default = null) {
    global $CONFIG;
    return $CONFIG[$key] ?? $default;
}

function now_ms(): int {
    return (int) floor(microtime(true) * 1000);
}

function db(): PDO {
    static $pdo = null;
    if ($pdo === null) {
        $dsn = 'mysql:host=' . cfg('db_host') . ';dbname=' . cfg('db_name') . ';charset=utf8mb4';
        $pdo = new PDO($dsn, cfg('db_user'), cfg('db_pass'), [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
    }
    return $pdo;
}

// ------------------------------------------------------------------- output
function json_out($data, int $status = 200): void {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function fail(string $code, string $message, int $status = 400): void {
    json_out(['error' => ['code' => $code, 'message' => $message]], $status);
}

function body(): array {
    static $b = null;
    if ($b === null) {
        $raw = file_get_contents('php://input') ?: '';
        if (strlen($raw) > 8 * 1024 * 1024) {
            fail('invalid-argument', 'Requête trop volumineuse.', 413);
        }
        $b = json_decode($raw, true);
        if (!is_array($b)) $b = [];
    }
    return $b;
}

// ----------------------------------------------------------------- security
function client_ip(): string {
    return substr((string) ($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0'), 0, 45);
}

/** Fixed-window rate limit. Returns false when the limit is exceeded. */
function rate_limit(string $bucket, int $max, int $windowSeconds): bool {
    $bucket = substr(preg_replace('/[^a-zA-Z0-9:._@-]/', '_', $bucket), 0, 190);
    $now = now_ms();
    $win = $windowSeconds * 1000;
    $pdo = db();
    $pdo->beginTransaction();
    $st = $pdo->prepare('SELECT window_start_ms, hits FROM rate_limits WHERE bucket = ? FOR UPDATE');
    $st->execute([$bucket]);
    $row = $st->fetch();
    if (!$row || $now - (int) $row['window_start_ms'] > $win) {
        $pdo->prepare('REPLACE INTO rate_limits (bucket, window_start_ms, hits) VALUES (?, ?, 1)')->execute([$bucket, $now]);
        $pdo->commit();
        return true;
    }
    $hits = (int) $row['hits'] + 1;
    $pdo->prepare('UPDATE rate_limits SET hits = ? WHERE bucket = ?')->execute([$hits, $bucket]);
    $pdo->commit();
    return $hits <= $max;
}

function send_mail(string $to, string $subject, string $text): bool {
    $from = (string) cfg('mail_from');
    $headers = [
        'From: Alpha Logistix Group <' . $from . '>',
        'Reply-To: ' . $from,
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
    ];
    $subjectEnc = '=?UTF-8?B?' . base64_encode($subject) . '?=';
    return @mail($to, $subjectEnc, $text, implode("\r\n", $headers));
}

// --------------------------------------------------------------------- auth
function new_uid(): string {
    return substr(bin2hex(random_bytes(14)), 0, 28);
}

function user_public(array $u): array {
    return [
        'uid' => $u['id'],
        'email' => $u['email'],
        'emailVerified' => (bool) $u['email_verified'],
        'displayName' => $u['display_name'] !== '' ? $u['display_name'] : null,
    ];
}

function create_session(string $userId): string {
    $token = bin2hex(random_bytes(32));
    $exp = now_ms() + (int) cfg('session_days', 14) * 86400 * 1000;
    db()->prepare('INSERT INTO sessions (token_hash, user_id, expires_ms) VALUES (?, ?, ?)')
        ->execute([hash('sha256', $token), $userId, $exp]);
    // opportunistic cleanup
    if (random_int(1, 20) === 1) {
        db()->prepare('DELETE FROM sessions WHERE expires_ms < ?')->execute([now_ms()]);
    }
    return $token;
}

function bearer_token(): ?string {
    $h = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    if ($h === '' && function_exists('getallheaders')) {
        foreach (getallheaders() as $k => $v) {
            if (strtolower($k) === 'authorization') { $h = $v; break; }
        }
    }
    // Some shared hosts strip Authorization: the client also sends X-Auth-Token.
    if (preg_match('/^Bearer\s+([a-f0-9]{64})$/i', $h, $m)) return $m[1];
    $x = $_SERVER['HTTP_X_AUTH_TOKEN'] ?? '';
    return preg_match('/^[a-f0-9]{64}$/i', $x) ? $x : null;
}

function current_user(): ?array {
    static $cached = false;
    if ($cached !== false) return $cached;
    $cached = null;
    $token = bearer_token();
    if ($token) {
        $st = db()->prepare(
            'SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_ms > ?'
        );
        $st->execute([hash('sha256', $token), now_ms()]);
        $row = $st->fetch();
        if ($row) $cached = $row;
    }
    return $cached;
}

function require_user(): array {
    $u = current_user();
    if (!$u) fail('permission-denied', 'Authentification requise.', 401);
    return $u;
}

function email_key(string $email): string {
    return preg_replace('/[^a-z0-9]/', '_', strtolower($email));
}

function is_professional_email(string $email): bool {
    $domain = preg_quote((string) cfg('staff_email_domain'), '/');
    return (bool) preg_match('/^[^@\s]+@' . $domain . '$/i', $email);
}

function is_main_admin(?array $u): bool {
    return $u && $u['email_verified'] && strtolower($u['email']) === strtolower((string) cfg('main_admin_email'));
}

function staff_record(?array $u): ?array {
    if (!$u || !$u['email_verified'] || !is_professional_email($u['email'])) return null;
    $rec = doc_get('staffUsers', email_key($u['email']));
    return ($rec && !empty($rec['active'])) ? $rec : null;
}

function is_admin(?array $u): bool {
    return is_main_admin($u) || staff_record($u) !== null;
}

function is_super_admin(?array $u): bool {
    if (is_main_admin($u)) return true;
    $r = staff_record($u);
    return $r !== null && ($r['role'] ?? '') === 'admin';
}

function is_client_of(array $data, ?array $u): bool {
    if (!$u) return false;
    $uid = (string) ($data['clientUid'] ?? '');
    if ($uid !== '' && $uid === $u['id']) return true;
    return (bool) $u['email_verified']
        && strtolower((string) ($data['clientEmail'] ?? '')) === strtolower($u['email']);
}

// ------------------------------------------------------- document (de)coding
/** Client JSON -> stored JSON: replaces server-timestamp sentinels. */
function encode_value($v, int $now) {
    if (is_array($v)) {
        if (isset($v['__sv']) && $v['__sv'] === 'serverTimestamp') return ['__ts' => $now];
        $out = [];
        foreach ($v as $k => $x) $out[$k] = encode_value($x, $now);
        return $out;
    }
    return $v;
}

function doc_get(string $coll, string $id): ?array {
    $st = db()->prepare('SELECT data FROM docs WHERE coll = ? AND id = ?');
    $st->execute([$coll, $id]);
    $row = $st->fetch();
    if (!$row) return null;
    $d = json_decode($row['data'], true);
    return is_array($d) ? $d : null;
}

function doc_put(string $coll, string $id, array $data): void {
    $now = now_ms();
    $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    db()->prepare(
        'INSERT INTO docs (coll, id, data, created_ms, updated_ms) VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE data = VALUES(data), updated_ms = VALUES(updated_ms)'
    )->execute([$coll, $id, $json, $now, $now]);
}

function doc_delete(string $coll, string $id): void {
    db()->prepare('DELETE FROM docs WHERE coll = ? AND id = ?')->execute([$coll, $id]);
}

function coll_all(string $coll): array {
    $st = db()->prepare('SELECT id, data FROM docs WHERE coll = ?');
    $st->execute([$coll]);
    $out = [];
    foreach ($st->fetchAll() as $r) {
        $d = json_decode($r['data'], true);
        if (is_array($d)) $out[] = ['id' => $r['id'], 'data' => $d];
    }
    return $out;
}

/** Splits "a/b/c/d" into [collectionPath, docId|null]. */
function split_path(string $path): array {
    $parts = array_values(array_filter(explode('/', trim($path, '/')), fn($p) => $p !== ''));
    foreach ($parts as $p) {
        if (!preg_match('/^[a-zA-Z0-9_\-]{1,128}$/', $p)) fail('invalid-argument', 'Chemin invalide.');
    }
    $n = count($parts);
    if ($n === 0 || $n > 4) fail('invalid-argument', 'Chemin invalide.');
    if ($n % 2 === 1) return [implode('/', $parts), null];
    $id = array_pop($parts);
    return [implode('/', $parts), $id];
}

function diff_keys(array $old, array $new): array {
    $keys = array_unique(array_merge(array_keys($old), array_keys($new)));
    $out = [];
    foreach ($keys as $k) {
        if (!array_key_exists($k, $old) || !array_key_exists($k, $new) || $old[$k] != $new[$k]) $out[] = $k;
    }
    return $out;
}

function only_keys(array $changed, array $allowed): bool {
    return count(array_diff($changed, $allowed)) === 0;
}
