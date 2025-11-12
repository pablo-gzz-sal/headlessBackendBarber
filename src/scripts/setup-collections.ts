/**
 * Helper script to set up collections for Joey
 * Run with: yarn ts-node scripts/setup-collections.ts
 */

const axios = require('axios');
require('dotenv').config();

const API_URL = process.env.API_URL || 'http://localhost:3000';

async function setupCollections() {
  console.log('🚀 Setting up collections for Joey...\n');

  try {
    // 1. Create "Joey's Faves" Smart Collection
    console.log('📦 Creating "Joey\'s Faves" collection...');
    const joeysFaves = await axios.post(`${API_URL}/shopify/smart-collections`, {
      title: "Joey's Faves",
      body_html: '<p>Handpicked favorites by Joey himself!</p>',
      rules: [
        {
          column: 'tag',
          relation: 'equals',
          condition: 'joeys-faves'
        }
      ],
      disjunctive: false,
      sort_order: 'manual',
      published: true
    });
    console.log('✅ Joey\'s Faves created:', joeysFaves.data.id);

    // 2. Create "Sale" Smart Collection
    console.log('\n📦 Creating "Sale" collection...');
    const sale = await axios.post(`${API_URL}/shopify/smart-collections`, {
      title: 'Sale',
      body_html: '<p>Amazing deals and discounts!</p>',
      rules: [
        {
          column: 'tag',
          relation: 'equals',
          condition: 'sale'
        }
      ],
      disjunctive: false,
      sort_order: 'best-selling',
      published: true
    });
    console.log('✅ Sale collection created:', sale.data.id);

    // 3. Create "Bestsellers" Smart Collection
    console.log('\n📦 Creating "Bestsellers" collection...');
    const bestsellers = await axios.post(`${API_URL}/shopify/smart-collections`, {
      title: 'Bestsellers',
      body_html: '<p>Our most popular products!</p>',
      rules: [
        {
          column: 'tag',
          relation: 'equals',
          condition: 'bestseller'
        }
      ],
      disjunctive: false,
      sort_order: 'best-selling',
      published: true
    });
    console.log('✅ Bestsellers collection created:', bestsellers.data.id);

    console.log('\n✨ All collections created successfully!');
    console.log('\n📝 Next steps for Joey:');
    console.log('1. Go to Shopify Admin → Products');
    console.log('2. For each product, add appropriate tags:');
    console.log('   - "joeys-faves" for Joey\'s Faves');
    console.log('   - "sale" for Sale items');
    console.log('   - "bestseller" for Bestsellers');
    console.log('3. Products will automatically appear in collections!');

  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

setupCollections();