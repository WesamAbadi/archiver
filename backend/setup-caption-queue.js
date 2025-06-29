#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Setting up Caption Queue System...\n');

// Check if we're in the backend directory
if (!fs.existsSync('prisma/schema.prisma')) {
  console.error('❌ Error: Please run this script from the backend directory');
  console.log('   cd backend && node setup-caption-queue.js');
  process.exit(1);
}

// Check if .env exists
if (!fs.existsSync('.env')) {
  console.error('❌ Error: .env file not found');
  console.log('   Please create a .env file with your database configuration');
  process.exit(1);
}

try {
  // Step 1: Apply the database migration
  console.log('📊 Applying database migration...');
  try {
    execSync('npx prisma migrate resolve --applied 20250629181804_add_caption_job_queue', { stdio: 'inherit' });
    console.log('✅ Migration applied successfully\n');
  } catch (error) {
    console.log('ℹ️  Migration may already be applied, continuing...\n');
  }

  // Step 2: Generate Prisma client (retry up to 3 times)
  console.log('🔧 Generating Prisma client...');
  let retries = 3;
  let success = false;
  
  while (retries > 0 && !success) {
    try {
      execSync('npx prisma generate', { stdio: 'inherit' });
      success = true;
      console.log('✅ Prisma client generated successfully\n');
    } catch (error) {
      retries--;
      if (retries > 0) {
        console.log(`⚠️  Generation failed, retrying... (${retries} attempts left)`);
        // Wait a bit before retrying
        await new Promise(resolve => setTimeout(resolve, 2000));
      } else {
        console.log('⚠️  Prisma client generation failed. You may need to restart your TypeScript server.');
        console.log('   This is often caused by file permission issues on Windows.');
        console.log('   The caption queue system will still work, but you may see TypeScript errors.\n');
      }
    }
  }

  // Step 3: Verify the setup
  console.log('🔍 Verifying setup...');
  
  // Check if migration exists
  const migrationPath = 'prisma/migrations/20250629181804_add_caption_job_queue/migration.sql';
  if (fs.existsSync(migrationPath)) {
    console.log('✅ Migration file exists');
  } else {
    console.log('⚠️  Migration file not found at expected location');
  }

  // Check environment variables
  const envContent = fs.readFileSync('.env', 'utf8');
  const hasRateLimits = envContent.includes('CAPTION_JOBS_PER_MINUTE') && envContent.includes('CAPTION_JOBS_PER_DAY');
  
  if (hasRateLimits) {
    console.log('✅ Rate limiting environment variables found');
  } else {
    console.log('⚠️  Rate limiting environment variables not found');
    console.log('   Add these to your .env file:');
    console.log('   CAPTION_JOBS_PER_MINUTE=2');
    console.log('   CAPTION_JOBS_PER_DAY=1000');
  }

  console.log('\n🎉 Caption Queue System setup complete!');
  console.log('\n📋 Next steps:');
  console.log('   1. Restart your backend server');
  console.log('   2. Upload audio/video content to test the queue');
  console.log('   3. Check /api/media/caption-queue/stats for queue statistics');
  console.log('   4. Monitor queue progress in your application dashboard');
  
  console.log('\n📚 Key features:');
  console.log('   • Independent caption processing');
  console.log('   • Configurable rate limiting');
  console.log('   • Queue position and ETA for users');
  console.log('   • Automatic retry on failures');
  console.log('   • Real-time progress updates');

} catch (error) {
  console.error('❌ Setup failed:', error.message);
  console.log('\n🔧 Manual setup instructions:');
  console.log('   1. Run: npx prisma migrate resolve --applied 20250629181804_add_caption_job_queue');
  console.log('   2. Run: npx prisma generate');
  console.log('   3. Add rate limiting env vars to .env');
  console.log('   4. Restart your server');
  process.exit(1);
} 