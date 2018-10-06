const sqlite = require('sqlite');
const youtup = require('youtup');
const wiki = require('wikijs').default;
const english = require('@wikipedia-tts/english');
const path = require('path');


// Global variables
const E = process.env;
const DB = E['WIKIPEDIA_TTS_DB']||'crawl.db';
const OUTPUT = E['WIKIPEDIA_TTS_OUTPUT']||'./';
const YOUTUBE_AUTH = {
  email: E['YOUTUBE_EMAIL']||'',
  clientId: E['YOUTUBE_CLIENT_ID']||'',
  clientSecret: E['YOUTUBE_CLIENT_SECRET']||'',
  refreshToken: E['YOUTUBE_REFRESH_TOKEN']||''
};
const YOUTUBE_VIDEO = {
  title: E['YOUTUBE_VIDEO_TITLE']||'${title}',
  description: E['YOUTUBE_VIDEO_DESCRIPTION']||'${description}',
  tags: E['YOUTUBE_VIDEO_TAGS']||'${tags}',
  categoryId: 22
};
const YOUTUBE_RETRY = parseInt(E['YOUTUBE_RETRIES'], 10)||3;


// Get TTS audio/video of wikipedia page.
async function wikipediaTts(out, nam, o) {
  var o = o||{};
  var pag = await wiki().page(nam);
  var txt = await pag.content();
  var img = await pag.mainImage();
  await english(out, txt, img, o.english);
  return pag;
};

// Upload file to Youtube.
function youtubeUpload(val, o) {
  var o = Object.assign({retry: YOUTUBE_RETRY}, o);
  o.auth = Object.assign({}, YOUTUBE_AUTH, o.auth);
  o.video = Object.assign({}, YOUTUBE_VIDEO, o.video);
  var v = o.video;
  v.title = v.title.replace(/\${title}/g, val.title);
  v.description = v.description.replace(/\${title}/g, val.title);
  v.description = v.description.replace(/\${description}/g, val.description);
  v.tags = v.tags.replace(/\${tags}/g, val.tags).split(',');
  return new Promise((fres, frej) => {
    youtup.upload(o, fres, frej);
  });
};

// Upload page to Youtube.
async function uploadPage(nam, o) {
  var o = Object.assign({output: OUTPUT}, o);
  var pag = await wiki().page(nam);
  var [sum, img, txt] = await [pag.summary(), pag.mainImage(), pag.content()];
  var out = path.join(o.output, nam+'.mp4');
  var tags = nam.toLowerCase().split(/\W+/);
  await english(out, txt, img, o.english);
  await youtubeUpload({filepath: out, title: nam, description: sum, tags}, o.youtube);
  return pag;
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
async function upload(db, nam) {
  var pag = await uploadPage(nam), p = [];
  await db.exec('UPDATE "pages" SET "uploaded" = 1 WHERE "title" = ?', [nam]);
  for(var lnk of await pag.links())
    p.push(db.exec('UPDATE "pages" SET "references" = "references" + 1 WHERE "title" = ?', [lnk]));
  await Promise.all(p);
  return nam;
};

// Crawl a page.
async function crawl(db) {
  var whr = '"uploaded" = 0';
  var ord = '"priority" DESC, "references" DESC';
  var row = await db.get(`SELECT * FROM "pages" WHERE ${whr} ORDER BY ${ord} LIMIT 1`);
  return row? await upload(row.title):null;
};
module.exports = wikipediaTts;
