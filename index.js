const isVideo = require('is-video');
const sqlite = require('sqlite');
const wiki = require('wikijs').default;
const youtube = require('@wikipedia-tts/youtube');
const english = require('@wikipedia-tts/english');
const video = require('@wikipedia-tts/video');
const path = require('path');


// Global variables
const E = process.env;
const DB = E['WTTS_DB']||'crawl.db';


// Upload Wikipedia page TTS to Youtube.
function wikipediaTts(out, nam, o) {
  var pag = await wiki().page(nam);
  var txt = await pag.content();
  var img = await pag.mainImage();
  var description = await pag.summary();
  var tags = nam.toLowerCase().split(/\W+/).join(',');
  var val = {title: nam, description, tags};
  var ext = path.extname(out||'a.json').toLowerCase();
  if(ext==='.json') return youtube(out, txt, img, val, o).then(() =>  pag);
  if(isVideo(out)) return video(out, txt, img, o).then(() => pag);
  return english(out, txt, o).then(() => pag);
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
  await db.exec('INSERT OR IGNORE INTO "pages" VALUES (?, 1, 0, 0)', [nam]);
  return nam;
};

// Remove a page from crawl list.
async function remove(db, nam) {
  await db.exec('DELETE FROM "pages" WHERE "title" = ?', [nam]);
  return nam;
};

// Update a page in crawl list.
async function update(db, nam, val) {
  var set = '"priority" = $priority, "references" = $references, "uploaded" = $uploaded';
  var row = await db.get('SELECT * FROM "pages" WHERE "title" = ?', [nam]);
  await db.exec(`UPDATE "pages" SET ${set} WHERE "name" = $name`, Object.assign(row, val));
  return nam;
};

// Upload a page in crawl list.
async function upload(db, nam, o) {
  var pag = await wikipediaTts(null, nam, o), p = [];
  await db.exec('UPDATE "pages" SET "uploaded" = 1 WHERE "title" = ?', [nam]);
  for(var lnk of await pag.links())
    p.push(db.exec('UPDATE "pages" SET "references" = "references" + 1 WHERE "title" = ?', [lnk]));
  await Promise.all(p);
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
wikipediaTts.uploadPage = uploadPage;
wikipediaTts.setup = setup;
wikipediaTts.add = add;
wikipediaTts.remove = remove;
wikipediaTts.update = update;
wikipediaTts.upload = upload;
wikipediaTts.crawl = crawl;
