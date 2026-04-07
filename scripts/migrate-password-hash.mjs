import postgres from 'postgres';
import { readFileSync } from 'fs';

function getEnvValue(envPath, key) {
    const content = readFileSync(envPath, 'utf-8');
    const line = content.split('\n').find(l => l.startsWith(key + '='));
    if (!line) return null;
    return line.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '');
}

const databaseUrl = getEnvValue('.env', 'DATABASE_URL');
if (!databaseUrl) {
    console.error('DATABASE_URL not found in .env');
    process.exit(1);
}

async function runMigration() {
    console.log('Connecting to database...');
    const sql = postgres(databaseUrl);
    
    console.log('Adding passwordHash column to users table...');
    
    try {
        await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS passwordHash TEXT`;
        console.log('✓ Successfully added passwordHash column');
    } catch (error) {
        console.error('Error adding column:', error.message);
        process.exit(1);
    } finally {
        await sql.end();
    }
}

runMigration();
