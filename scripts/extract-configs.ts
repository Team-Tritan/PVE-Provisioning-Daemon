#!/usr/bin/env bun

/**
 * Extract embedded configuration files to disk for customization
 * Usage: bun scripts/extract-configs.ts [output-directory]
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { EMBEDDED_CONFIGS } from '../src/config/embeddedConfigs';

function extractConfigs() {
  const outputDir = process.argv[2] || '.';
  const configDir = join(outputDir, 'config');
  
  try {
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }
    
    const templatesPath = join(configDir, 'templates.yaml');
    writeFileSync(templatesPath, EMBEDDED_CONFIGS.templates);
    console.log('✅ Extracted templates.yaml to:', templatesPath);
    
    if (EMBEDDED_CONFIGS.envExample) {
      const envPath = join(outputDir, '.env.example');
      writeFileSync(envPath, EMBEDDED_CONFIGS.envExample);
      console.log('✅ Extracted .env.example to:', envPath);
    }
    
    console.log('\n📝 Next steps:');
    console.log('1. Copy .env.example to .env and configure your settings');
    console.log('2. Modify config/templates.yaml as needed');
    console.log('3. Run the binary - it will use these extracted files instead of embedded ones');
    
  } catch (error) {
    console.error('❌ Failed to extract config files:', error);
    process.exit(1);
  }
}

extractConfigs();
