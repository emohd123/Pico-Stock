const SUPABASE_URL = 'https://wldurkxlzkqmcfadpybd.supabase.co';
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsZHVya3hsemtxbWNmYWRweWJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5NjM3NTIsImV4cCI6MjA4ODUzOTc1Mn0.h4k1x94NEjUi-KHThqcixZnZ1PuG15NswRTFeENdUcw';

const res = await fetch(SUPABASE_URL + '/rest/v1/products?select=id,name,description,price,stock,in_stock,image&order=name.asc', {
    headers: { apikey: KEY, Authorization: 'Bearer ' + KEY }
});
const p = await res.json();

const nullStock   = p.filter(x => x.stock === null);
const htmlNames   = p.filter(x => x.name && x.name.includes('&amp;'));
const localImg    = p.filter(x => x.image && !x.image.includes('supabase') && !x.image.startsWith('http'));
const zeroPrice   = p.filter(x => x.price === 0);
const onePrice    = p.filter(x => x.price === 1);
const hasDesc     = p.filter(x => x.description && x.description.trim().length > 0);

console.log('=== ISSUES FOUND ===');

console.log('\n[1] NULL stock (' + nullStock.length + ' products):');
nullStock.forEach(x => console.log('  stock=null in_stock=' + x.in_stock + ' | ' + x.name.substring(0, 65)));

console.log('\n[2] HTML entities &amp; in name (' + htmlNames.length + ' products):');
htmlNames.forEach(x => console.log('  ' + x.name.substring(0, 75)));

console.log('\n[3] Local /products/extracted images (' + localImg.length + ' products):');
localImg.forEach(x => console.log('  ' + x.name.substring(0, 40) + ' -> ' + x.image.substring(0, 50)));

console.log('\n[4] Price = 0 (shows "On request") (' + zeroPrice.length + '):');
zeroPrice.forEach(x => console.log('  ' + x.name.substring(0, 65)));

console.log('\n[5] Price = 1 BHD placeholder (' + onePrice.length + '):');
onePrice.forEach(x => console.log('  ' + x.name.substring(0, 65)));

console.log('\n[6] Non-empty description (' + hasDesc.length + ' products):');
hasDesc.forEach(x => console.log('  desc="' + x.description + '" | ' + x.name.substring(0, 50)));

console.log('\n[7] SUMMARY: total=' + p.length + ' ok_stock=' + p.filter(x => x.stock !== null).length + ' ok_img=' + p.filter(x => x.image && x.image.includes('supabase')).length);
