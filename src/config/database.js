/**
 * Database Configuration
 *
 * Initializes Supabase client for database operations.
 * Uses service role key for elevated permissions (bypasses RLS).
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Validate required environment variables
const requiredEnvVars = ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
  throw new Error(
    `Missing required environment variables: ${missingEnvVars.join(', ')}\n` +
    'Please check your .env file'
  );
}

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

// Create Supabase client with service role key
// Service role bypasses Row Level Security (RLS) policies
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Test database connection
async function testConnection() {
  try {
    const { data, error } = await supabase
      .from('markets')
      .select('count', { count: 'exact', head: true });

    if (error) {
      throw error;
    }

    console.log('✓ Database connection successful');
    return true;
  } catch (error) {
    console.error('✗ Database connection failed:', error.message);
    return false;
  }
}

// Run connection test on startup
testConnection();

module.exports = {
  supabase,
  testConnection
};
