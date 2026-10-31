-- Optional tenant presentation settings. Existing profiles keep their current look.
ALTER TABLE org_profiles ADD COLUMN theme_json TEXT NOT NULL DEFAULT '{}';
