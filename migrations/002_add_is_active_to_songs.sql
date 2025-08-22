-- Migration: Add is_active field to songs table
-- Date: 2025-01-02

USE nawe_ririmba;

-- Add is_active column to songs table
ALTER TABLE songs 
ADD COLUMN is_active BOOLEAN DEFAULT TRUE AFTER is_featured;

-- Add index for better performance when filtering active songs
CREATE INDEX idx_songs_is_active ON songs(is_active);

-- Update any existing songs to be active
UPDATE songs SET is_active = TRUE WHERE is_active IS NULL;
