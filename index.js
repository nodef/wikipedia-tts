#!/usr/bin/env node
const isVideo = require('is-video');
const sqlite = require('sqlite');
const wiki = require('wikijs').default;
const youtube = require('@wikipedia-tts/youtube');
const english = require('@wikipedia-tts/english');
const video = require('@wikipedia-tts/video');
const path = require('path');
const cp = require('child_process');


// Global variables
const E = process.env;
const A = process.argv;
const DB = E['WIKIPEDIA_TTS_DB']||'crawl.db';


// Upload Wikipedia page TTS to Youtube.
async function wikipediaTts(out, nam, o) {
  var p = await wiki().page(nam);
  var [txt, img, description] = await Promise.all([p.content(), p.mainImage(), p.summary()]);
  var tags = nam.toLowerCase().split(/\W+/).join(',');
  var val = {title: nam, description, tags};
  var ext = path.extname(out||'output.json').toLowerCase();
  if(ext==='.json') await youtube(out, txt, img, val, o);
  else if(isVideo(out)) await video(out, txt, img, o);
  else await english(out, txt, o);
  return p;
};

// Setup crawl list.
async function setup(pth) {
  var db = await sqlite.open(pth||DB);
  var col = '"title" TEXT PRIMARY KEY, "priority" INTEGER, "references" INTEGER, "uploaded" INTEGER';
  await db.exec(`CREATE TABLE IF NOT EXISTS "pages" (${col})`);
  return db;
};

// Add a page to crawl list.
async function add(db, nam) {
  await db.run('INSERT OR IGNORE INTO "pages" VALUES (?, 1, 0, 0)', nam);
  return nam;
};

// Remove a page from crawl list.
async function remove(db, nam) {
  await db.run('DELETE FROM "pages" WHERE "title" = ?', nam);
  return nam;
};

// Update a page in crawl list.
async function update(db, nam, val) {
  var set = '"priority" = $priority, "references" = $references, "uploaded" = $uploaded';
  var row = await db.get('SELECT * FROM "pages" WHERE "title" = ?', nam);
  await db.run(`UPDATE "pages" SET ${set} WHERE "name" = $name`, Object.assign(row, val));
  return nam;
};

// Upload a page in crawl list.
async function upload(db, nam, o) {
  var pag = await wikipediaTts(null, nam, o), p = [];
  await db.run('UPDATE "pages" SET "uploaded" = 1 WHERE "title" = ?', nam);
  var lnks = await pag.links();
  await db.run('INSERT OR IGNORE INTO "pages" VALUES '+lnks.map(() => '(?, 0, 0, 0)').join(', '), lnks);
  await db.run('UPDATE "pages" SET "references" = "references" + 1 WHERE '+lnks.map(() => '"title" = ?').join(' OR '), lnks);
  return nam;
};

// Crawl a page.
async function crawl(db, o) {
  var whr = '"uploaded" = 0';
  var ord = '"priority" DESC, "references" DESC';
  var row = await db.get(`SELECT * FROM "pages" WHERE ${whr} ORDER BY ${ord} LIMIT 1`);
  return row? await upload(db, row.title, o):null;
};
module.exports = wikipediaTts;
wikipediaTts.setup = setup;
wikipediaTts.add = add;
wikipediaTts.remove = remove;
wikipediaTts.update = update;
wikipediaTts.upload = upload;
wikipediaTts.crawl = crawl;


// Main.
async function main() {
  var cmd = '', nam = '';
  var dbp = DB, out = '', priority = 0, references = 0, uploaded = 0;
  var cmds = new Set(['setup', 'add', 'remove', 'update', 'upload', 'crawl']);
  for(var i=2, I=A.length; i<I; i++) {
    if(A[i]==='--help') return cp.execSync('less README.md', {cwd: __dirname, stdio: [0, 1, 2]});
    else if(A[i]==='-d' || A[i]==='--db') dbp = A[++i];
    else if(A[i]==='-o' || A[i]==='--output') out = A[++i];
    else if(A[i]==='--priority') priority = parseInt(A[++i], 10);
    else if(A[i]==='--references') references = parseInt(A[++i], 10);
    else if(A[i]==='--uploaded') uploaded = parseInt(A[++i], 10);
    else if(!cmd) cmd = A[i];
    else if(!nam) nam = A[i];
  }
  if(!cmds.has(cmd)) return wikipediaTts(out, nam);
  var db = await setup(dbp);
  if(cmd==='setup') return;
  else if(cmd==='add') await add(db, nam);
  else if(cmd==='remove') await remove(db, nam);
  else if(cmd==='update') await update(db, nam, {priority, references, uploaded});
  else if(cmd==='upload') await upload(db, nam);
  else await crawl(db);
};
if(require.main===module) main();
