-- Food drives and food bag events are tracked as a separate conservative total.
ALTER TABLE public_impact ADD COLUMN people_fed_minimum INTEGER NOT NULL DEFAULT 0;
