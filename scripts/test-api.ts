#!/usr/bin/env bun

/**
 * Test script for API endpoints
 * Usage: bun scripts/test-api.ts <base-url> <api-token>
 */

const BASE_URL = process.argv[2] || 'http://localhost:4000';
const API_TOKEN = process.argv[3] || process.env.API_TOKEN;

if (!API_TOKEN) {
  console.error('❌ API token required. Usage: bun scripts/test-api.ts <base-url> <api-token>');
  process.exit(1);
}

async function testEndpoint(endpoint: string, options: RequestInit = {}) {
  const url = `${BASE_URL}${endpoint}`;
  
  try {
    console.log(`\n🔍 Testing: ${endpoint}`);
    
    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${API_TOKEN}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    const data = await response.json();
    
    console.log(`   Status: ${response.status} ${response.statusText}`);
    console.log(`   Success: ${data.success ? '✅' : '❌'}`);
    
    if (!data.success) {
      console.log(`   Error: ${data.error}`);
    }
    
    return { status: response.status, data };
    
  } catch (error) {
    console.log(`   Error: ❌ ${error}`);
    return null;
  }
}

async function main() {
  console.log('🧪 Testing Proxmox Daemon API');
  console.log(`🌐 Base URL: ${BASE_URL}`);
  console.log(`🔑 Using API Token: ${API_TOKEN!.substring(0, 8)}...`);
  
  console.log('\n📊 Testing public endpoints:');
  await testEndpoint('/healthcheck');
  
  console.log('\n🔐 Testing authenticated endpoints:');
  await testEndpoint('/templates');
  await testEndpoint('/vms');
  await testEndpoint('/vms/all?page=1&limit=5');
  
  console.log('\n🚫 Testing invalid authentication:');
  await fetch(`${BASE_URL}/templates`, {
    headers: {
      'Authorization': 'Bearer invalid-token',
      'Content-Type': 'application/json',
    },
  }).then(async (response) => {
    const data = await response.json();
    console.log(`   Status: ${response.status} ${response.statusText}`);
    console.log(`   Expected 403: ${response.status === 403 ? '✅' : '❌'}`);
  }).catch(error => {
    console.log(`   Error: ❌ ${error}`);
  });
  
  console.log('\n🚫 Testing missing authentication:');
  await fetch(`${BASE_URL}/templates`).then(async (response) => {
    const data = await response.json();
    console.log(`   Status: ${response.status} ${response.statusText}`);
    console.log(`   Expected 401: ${response.status === 401 ? '✅' : '❌'}`);
  }).catch(error => {
    console.log(`   Error: ❌ ${error}`);
  });
  
  console.log('\n✅ API testing completed!');
}

main().catch(console.error);
