CREATE DATABASE IF NOT EXISTS astronoches CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE astronoches;
CREATE TABLE IF NOT EXISTS observing_sites (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, name VARCHAR(120) NOT NULL,
 latitude DECIMAL(9,6) NOT NULL, longitude DECIMAL(9,6) NOT NULL,
 elevation_m SMALLINT NULL, timezone VARCHAR(64) NOT NULL DEFAULT 'Europe/Madrid',
 is_default TINYINT(1) NOT NULL DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 INDEX idx_sites_default(is_default)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS user_preferences (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, preference_key VARCHAR(100) NOT NULL UNIQUE,
 preference_value TEXT NULL, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS celestial_objects (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, catalog VARCHAR(30) NOT NULL,
 catalog_id VARCHAR(40) NOT NULL, common_name VARCHAR(140) NULL, object_type VARCHAR(50) NULL,
 ra_deg DECIMAL(10,6) NULL, dec_deg DECIMAL(10,6) NULL, magnitude DECIMAL(5,2) NULL,
 season_notes TEXT NULL, UNIQUE KEY uq_catalog_object(catalog,catalog_id), INDEX idx_object_name(common_name)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS favorite_objects (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, object_id BIGINT UNSIGNED NOT NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT fk_favorite_object FOREIGN KEY(object_id) REFERENCES celestial_objects(id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS observing_sessions (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, site_id BIGINT UNSIGNED NOT NULL,
 session_start DATETIME NOT NULL, session_end DATETIME NULL, notes TEXT NULL,
 sky_quality DECIMAL(3,1) NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT fk_session_site FOREIGN KEY(site_id) REFERENCES observing_sites(id)
) ENGINE=InnoDB;
INSERT INTO observing_sites(name,latitude,longitude,elevation_m,timezone,is_default)
SELECT 'A Coruña',43.3623,-8.4115,20,'Europe/Madrid',1
WHERE NOT EXISTS(SELECT 1 FROM observing_sites);
INSERT INTO celestial_objects(catalog,catalog_id,common_name,object_type,ra_deg,dec_deg,magnitude,season_notes) VALUES
('M','31','Galaxia de Andrómeda','Galaxia',10.6847,41.2692,3.4,'Mejor en otoño; requiere cielo oscuro'),
('M','42','Nebulosa de Orión','Nebulosa',83.8221,-5.3911,4.0,'Objeto destacado del cielo invernal'),
('M','45','Las Pléyades','Cúmulo abierto',56.75,24.1167,1.6,'Gran campo; otoño e invierno'),
('M','13','Cúmulo de Hércules','Cúmulo globular',250.4235,36.4613,5.8,'Primavera y verano'),
('M','27','Nebulosa Dumbbell','Nebulosa planetaria',299.901,22.721,7.5,'Verano'),
('M','57','Nebulosa del Anillo','Nebulosa planetaria',283.396,33.029,8.8,'Verano')
ON DUPLICATE KEY UPDATE common_name=VALUES(common_name);
