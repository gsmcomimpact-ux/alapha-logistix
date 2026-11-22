-- Alpha Logistix — base de données MySQL / MariaDB (iFastNet)
-- Importer ce fichier dans phpMyAdmin (onglet « Importer ») après avoir créé la base.

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `users` (
  `id` CHAR(28) CHARACTER SET ascii NOT NULL,
  `email` VARCHAR(190) CHARACTER SET ascii NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `email_verified` TINYINT(1) NOT NULL DEFAULT 0,
  `display_name` VARCHAR(190) NOT NULL DEFAULT '',
  `verify_token` CHAR(64) CHARACTER SET ascii DEFAULT NULL,
  `reset_token` CHAR(64) CHARACTER SET ascii DEFAULT NULL,
  `reset_expires` BIGINT DEFAULT NULL,
  `created_ms` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `sessions` (
  `token_hash` CHAR(64) CHARACTER SET ascii NOT NULL,
  `user_id` CHAR(28) CHARACTER SET ascii NOT NULL,
  `expires_ms` BIGINT NOT NULL,
  PRIMARY KEY (`token_hash`),
  KEY `idx_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Magasin de documents (équivalent Firestore) : une ligne = un document JSON.
CREATE TABLE IF NOT EXISTS `docs` (
  `coll` VARCHAR(160) CHARACTER SET ascii NOT NULL,
  `id` VARCHAR(128) CHARACTER SET ascii NOT NULL,
  `data` MEDIUMTEXT NOT NULL,
  `created_ms` BIGINT NOT NULL,
  `updated_ms` BIGINT NOT NULL,
  PRIMARY KEY (`coll`, `id`),
  KEY `idx_coll_updated` (`coll`, `updated_ms`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Limitation anti-abus (connexion, inscription, demandes de cotation publiques).
CREATE TABLE IF NOT EXISTS `rate_limits` (
  `bucket` VARCHAR(190) CHARACTER SET ascii NOT NULL,
  `window_start_ms` BIGINT NOT NULL,
  `hits` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`bucket`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
