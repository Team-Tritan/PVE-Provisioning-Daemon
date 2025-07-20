#!/usr/bin/env bun

/**
 * Generate secure API tokens for the Proxmox Daemon
 * Usage: bun scripts/generate-token.ts [length]
 */

import { generateAPIToken } from '../src/middleware/auth';

function main() {
  const args = process.argv.slice(2);
  const length = args[0] ? parseInt(args[0], 10) : 32;

  if (length < 16) {
    console.error('❌ Token length must be at least 16 characters');
    process.exit(1);
  }

  if (length > 128) {
    console.error('❌ Token length cannot exceed 128 characters');
    process.exit(1);
  }

  const token = generateAPIToken(length);
  
  console.log('\n🔐 Generated API Token:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`\n${token}\n`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('\n📝 Add this to your .env file:');
  console.log(`API_TOKEN=${token}`);
  console.log('\n🔒 Keep this token secure and never share it publicly!');
  console.log('💡 You can also add multiple tokens using API_TOKENS=token1,token2,token3\n');
}

main();
