#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const schemaDir = path.join(__dirname, 'schema');
const outputFile = path.join(__dirname, 'schema.prisma');

const files = fs
  .readdirSync(schemaDir)
  .filter((file) => file.endsWith('.prisma'))
  .sort((a, b) => (a === 'datasource.prisma' ? -1 : a.localeCompare(b)));

const mergedContent = files
  .map((file) => {
    const content = fs.readFileSync(path.join(schemaDir, file), 'utf8');
    return `// ========== ${file} ==========\n\n${content}`;
  })
  .join('\n');

fs.writeFileSync(outputFile, mergedContent.trim() + '\n', 'utf8');
console.log('✅ Schema files merged successfully into schema.prisma');
