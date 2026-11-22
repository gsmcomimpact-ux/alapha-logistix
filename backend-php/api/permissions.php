<?php
declare(strict_types=1);

/** Root collection name: "shipments/ABC/events" -> "shipments". */
function root_of(string $coll): string {
    return explode('/', $coll)[0];
}

function sub_of(string $coll): ?string {
    $p = explode('/', $coll);
    return count($p) === 3 ? $p[2] : null;
}

function can_read(string $coll, string $id, array $data, ?array $u, bool $isList): bool {
    $root = root_of($coll);
    $sub = sub_of($coll);

    if ($root === 'publicTracking') return !$isList; // anyone who knows the code
    if (!$u) return false;
    if (is_admin($u)) {
        if ($root === 'staffUsers') return is_super_admin($u) || $id === email_key($u['email']);
        return in_array($root, ['users', 'clients', 'shipments', 'clientDocuments', 'quoteRequests', 'notifications'], true);
    }

    switch ($root) {
        case 'users':
            return $id === $u['id'];
        case 'staffUsers':
            return $u['email_verified'] && $id === email_key($u['email']);
        case 'shipments':
            if ($sub === null || $sub === 'events') {
                return is_client_of($data, $u);
            }
            if ($sub === 'documents') {
                return ($data['visibility'] ?? '') === 'client' && is_client_of($data, $u);
            }
            return false;
        case 'clientDocuments':
            return ($data['visibility'] ?? '') === 'client' && is_client_of($data, $u);
        case 'quoteRequests':
        case 'notifications':
            return is_client_of($data, $u);
    }
    return false;
}

function deny(): void {
    fail('permission-denied', 'Missing or insufficient permissions.', 403);
}

/**
 * Validates a write. $old is null for creation. $new is the full resulting document
 * (null for delete). Throws (via fail) on refusal.
 */
function check_write(string $type, string $coll, string $id, ?array $old, ?array $new, array $u): void {
    $root = root_of($coll);
    $sub = sub_of($coll);
    $admin = is_admin($u);
    $super = is_super_admin($u);
    $lowerEmail = strtolower($u['email']);

    if ($type === 'update' && $old === null) fail('not-found', 'Document introuvable.', 404);
    $changed = ($old !== null && $new !== null) ? diff_keys($old, $new) : [];

    switch ($root) {
        case 'users':
            if ($type === 'create') {
                $ok = ($id === $u['id'] || $admin)
                    && ($new['uid'] ?? '') === $id
                    && ($admin || (strtolower((string) ($new['email'] ?? '')) === $lowerEmail
                        && ($new['role'] ?? '') === 'client'
                        && ($new['accountStatus'] ?? '') === 'pending'));
                if (!$ok) deny();
                return;
            }
            if ($type === 'update') {
                $own = $id === $u['id'] && only_keys($changed, ['fullName', 'phone', 'company', 'city', 'updatedAt']);
                $adm = $admin && only_keys($changed, ['fullName', 'phone', 'company', 'city', 'accountStatus', 'updatedAt']);
                if (!$own && !$adm) deny();
                return;
            }
            if (!$admin) deny();
            return;

        case 'clients':
        case 'clientDocuments':
            if (!$admin) deny();
            return;

        case 'staffUsers':
            if (!$super) deny();
            if ($type === 'create') {
                $email = strtolower((string) ($new['email'] ?? ''));
                if (!is_professional_email($email) || $id !== email_key($email)) deny();
                if (!in_array($new['role'] ?? '', ['admin', 'operator'], true)) deny();
            }
            if ($type === 'update' && !only_keys($changed, ['fullName', 'phone', 'department', 'role', 'active', 'updatedAt'])) deny();
            return;

        case 'shipments':
            if ($sub === null || $sub === 'events') {
                if (!$admin) deny();
                return;
            }
            if ($sub === 'documents') {
                $parentId = explode('/', $coll)[1];
                if ($type === 'create') {
                    if ($admin) {
                        if (($new['uploadedBy'] ?? '') !== $u['id']) deny();
                        if (!in_array($new['uploadedByRole'] ?? '', ['admin', 'operator'], true)) deny();
                        return;
                    }
                    $parent = doc_get('shipments', $parentId);
                    if (!$parent || !is_client_of($parent, $u)) deny();
                    $ok = ($new['clientUid'] ?? '') === ($parent['clientUid'] ?? '')
                        && strtolower((string) ($new['clientEmail'] ?? '')) === strtolower((string) ($parent['clientEmail'] ?? ''))
                        && ($new['uploadedBy'] ?? '') === $u['id']
                        && in_array($new['docType'] ?? '', ['Packing list', 'Facture commerciale'], true)
                        && ($new['visibility'] ?? '') === 'client'
                        && ($new['uploadedByRole'] ?? '') === 'client';
                    if (!$ok) deny();
                    return;
                }
                if ($type === 'update') {
                    if (!$admin) deny();
                    if (!only_keys($changed, ['title', 'docType', 'referenceNumber', 'visibility', 'notes', 'updatedAt', 'clientUid', 'clientEmail'])) deny();
                    return;
                }
                // delete
                if ($admin) return;
                if ($old && ($old['uploadedBy'] ?? '') === $u['id'] && ($old['uploadedByRole'] ?? '') === 'client' && is_client_of($old, $u)) return;
                deny();
            }
            deny();
            return;

        case 'quoteRequests':
            if ($type === 'create') {
                if ($admin) return;
                $ok = ($new['clientUid'] ?? '') === $u['id']
                    && strtolower((string) ($new['clientEmail'] ?? '')) === $lowerEmail
                    && ($new['status'] ?? '') === 'En attente'
                    && ($new['estimatedAmount'] ?? '') === ''
                    && ($new['adminResponse'] ?? '') === '';
                if (!$ok) deny();
                return;
            }
            if ($type === 'update') {
                if ($admin && only_keys($changed, ['status', 'estimatedAmount', 'adminResponse', 'clientUid', 'updatedAt'])) return;
                if (is_client_of($old, $u)
                    && ($old['status'] ?? '') === 'Devis envoyé'
                    && ($new['status'] ?? '') === 'Acceptée'
                    && only_keys($changed, ['status', 'updatedAt'])) return;
                deny();
            }
            if (!$admin) deny();
            return;

        case 'notifications':
            if ($type === 'create') {
                if (!$admin) deny();
                return;
            }
            if ($type === 'update') {
                if (is_client_of($old, $u) && only_keys($changed, ['read'])) return;
                if ($admin && only_keys($changed, ['clientUid', 'clientEmail'])) return;
                deny();
            }
            if ($admin || ($old && is_client_of($old, $u))) return;
            deny();
            return;

        case 'publicTracking':
            if (!$admin) deny();
            if ($type !== 'delete' && ($new['trackingCode'] ?? '') !== $id) deny();
            if (!preg_match('/^[A-Z0-9-]{3,64}$/', $id)) deny();
            return;
    }
    deny();
}

// --------------------------------------------------------------- side effects
function after_create(string $coll, string $id, array $data): void {
    $root = root_of($coll);
    if ($root === 'quoteRequests') {
        $lines = [
            'Nouvelle demande de cotation ' . ($data['quoteCode'] ?? $id),
            '',
            'Client : ' . ($data['clientName'] ?? '') . ' <' . ($data['clientEmail'] ?? '') . '>',
            'Société : ' . ($data['company'] ?? ''),
            'Téléphone : ' . ($data['phone'] ?? ''),
            'Service : ' . ($data['transportMode'] ?? ''),
            'Départ : ' . ($data['origin'] ?? '') . '  →  Destination : ' . ($data['destination'] ?? ''),
            '',
            (string) ($data['message'] ?? ''),
            '',
            'Consulter la demande : ' . cfg('site_url') . '/administrateur',
        ];
        send_mail((string) cfg('commercial_email'), '[Cotation] ' . ($data['quoteCode'] ?? $id), implode("\n", $lines));
    } elseif ($root === 'notifications' && cfg('notify_clients_by_email', false)) {
        $to = (string) ($data['clientEmail'] ?? '');
        if (filter_var($to, FILTER_VALIDATE_EMAIL)) {
            $text = ($data['title'] ?? '') . "\n\n" . ($data['message'] ?? '')
                . "\n\nConsultez votre espace : " . cfg('site_url') . '/utilisateur';
            send_mail($to, '[Alpha Logistix] ' . ($data['title'] ?? 'Notification'), $text);
        }
    }
}
