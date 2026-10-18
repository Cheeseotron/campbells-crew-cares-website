ALTER TABLE volunteer_profiles ADD COLUMN age_group TEXT NOT NULL DEFAULT 'adult' CHECK (age_group IN ('adult', 'minor'));
