#!/usr/bin/env bun

/**
 * Create a complete binary distribution package
 */

import { execSync } from 'child_process';
import { copyFileSync, existsSync } from 'fs';

function createDistribution() {
  try {
    console.log('🔧 Creating binary distribution...');
    
    // Build binary with embedded configs
    execSync('bun run build:binary', { stdio: 'inherit' });
    
    // Extract config files to dist
    execSync('bun scripts/extract-configs.ts dist/', { stdio: 'inherit' });
    
    // Copy documentation if it exists
    if (existsSync('DEPLOYMENT.md')) {
      copyFileSync('DEPLOYMENT.md', 'dist/DEPLOYMENT.md');
      console.log('✅ Copied DEPLOYMENT.md');
    }
    
    // Copy main README
    if (existsSync('README.md')) {
      copyFileSync('README.md', 'dist/README.md');
      console.log('✅ Copied README.md');
    }
    
    console.log('\n🎉 Binary distribution created in dist/');
    console.log('📦 Distribution contents:');
    console.log('   - proxmox-daemon (standalone binary)');
    console.log('   - config/templates.yaml (template configuration)');
    console.log('   - .env.example (environment variables template)');
    console.log('   - DEPLOYMENT.md (deployment instructions)');
    console.log('   - README.md (full documentation)');
    
    console.log('\n📋 Next steps:');
    console.log('1. Copy the entire dist/ directory to your target server');
    console.log('2. Follow instructions in dist/DEPLOYMENT.md');
    console.log('3. Configure .env and templates.yaml as needed');
    console.log('4. Run ./proxmox-daemon');
    
  } catch (error) {
    console.error('❌ Failed to create distribution:', error);
    process.exit(1);
  }
}

createDistribution();
