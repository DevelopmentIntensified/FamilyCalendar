-- Migration: Add passwordHash to users table
-- Date: 2024-04-07

ALTER TABLE users ADD COLUMN IF NOT EXISTS passwordHash TEXT;
